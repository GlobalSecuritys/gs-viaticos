"""
Módulo Inventario (proceso IN del Mapa SGC).

La app es la única fuente de verdad: stock (ítems), despachos a técnicos y
préstamos se gestionan aquí. No existe ningún flujo de carga de Excel.

Permisos:
  * Técnicos: sin acceso al módulo.
  * Consulta: require_seccion("IN", "lector").
  * Crear / editar / eliminar: require_seccion("IN", "admin").

Stock: cada despacho consume `cantidad` unidades del ítem. Crear un despacho
descuenta, eliminarlo devuelve, y cambiar su cantidad ajusta la diferencia.
Los despachos migrados ya estaban descontados en el Excel (la unidad salió de
INVENTARIO GENERAL), así que siguen la misma regla al editarse o eliminarse.
"""

from datetime import date
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user, require_seccion
from app.database import get_db
from app.models.asignacion import Asignacion
from app.models.inventario import (
    EstadoDespacho,
    EstadoEntrega,
    InventarioDespacho,
    InventarioItem,
    InventarioPrestamo,
    InventarioTecnicoItem,
    UnionTemporal,
)
from app.models.usuario import Usuario
from app.schemas.inventario import (
    AsignacionOpcion,
    DespachoCreate,
    DespachoEstadoUpdate,
    DespachoListResponse,
    DespachoResponse,
    DespachoUpdate,
    EstadoDespachoLiteral,
    InventarioTecnicoItemCreate,
    InventarioTecnicoItemResponse,
    InventarioTecnicoItemUpdate,
    ItemCreate,
    ItemListResponse,
    ItemResponse,
    ItemUpdate,
    PrestamoCreate,
    PrestamoResponse,
    PrestamoUpdate,
    ResumenInventario,
    ResumenResponse,
    TecnicoInventarioResumen,
    TecnicoOpcion,
    UnionTemporalLiteral,
)

ESTADOS_ASIGNACION_ACTIVOS = ("pendiente", "en_curso")


def require_no_tecnico(current_user: Annotated[Usuario, Depends(get_current_user)]) -> Usuario:
    if current_user.rol == "tecnico":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Los técnicos no tienen acceso al módulo de inventario.",
        )
    return current_user


router = APIRouter(
    prefix="/inventario",
    tags=["Inventario (IN)"],
    dependencies=[Depends(require_no_tecnico)],
)

AdminIN = Annotated[Usuario, Depends(require_seccion("IN", "admin"))]
LectorIN = Annotated[Usuario, Depends(require_seccion("IN", "lector"))]
DB = Annotated[Session, Depends(get_db)]


# -----------------------------------------------------------------------------
# Utilidades
# -----------------------------------------------------------------------------
def etiqueta_asignacion(a: Asignacion) -> str:
    lugar = " · ".join(p.strip() for p in (a.empresa or "", a.ciudad or "") if p and p.strip())
    ot = f" · OT {a.orden_trabajo}" if a.orden_trabajo else ""
    rango = (
        a.fecha_inicio.isoformat()
        if a.fecha_inicio == a.fecha_fin
        else f"{a.fecha_inicio.isoformat()} → {a.fecha_fin.isoformat()}"
    )
    return f"#{a.id} · {a.cliente.strip()} · {lugar} · {rango}{ot}"


def _a_despacho_response(d: InventarioDespacho) -> DespachoResponse:
    return DespachoResponse(
        id=d.id,
        item_id=d.item_id,
        item_descripcion=d.item.descripcion if d.item else None,
        item_codigo_barras=d.item.codigo_barras if d.item else None,
        item_serial_gsb=d.item.serial_gsb if d.item else None,
        tecnico_id=d.tecnico_id,
        tecnico_nombre=d.tecnico.nombre if d.tecnico else None,
        tecnico_nombre_origen=d.tecnico_nombre_origen,
        asignacion_id=d.asignacion_id,
        asignacion_etiqueta=etiqueta_asignacion(d.asignacion) if d.asignacion else None,
        union_temporal=d.union_temporal.value,
        estado=d.estado.value,
        cantidad=d.cantidad,
        oficina_destino=d.oficina_destino,
        oficina_instalada=d.oficina_instalada,
        fecha_despacho=d.fecha_despacho,
        fecha_instalacion=d.fecha_instalacion,
        numero_orden=d.numero_orden,
        observacion=d.observacion,
        nota_migracion=d.nota_migracion,
        migrado=d.clave_migracion is not None,
        creado_en=d.creado_en,
        actualizado_en=d.actualizado_en,
    )


def _a_prestamo_response(p: InventarioPrestamo) -> PrestamoResponse:
    return PrestamoResponse(
        id=p.id,
        union_temporal=p.union_temporal.value,
        descripcion=p.descripcion,
        cantidad=p.cantidad,
        item_id=p.item_id,
        migrado=p.clave_migracion is not None,
        creado_en=p.creado_en,
        actualizado_en=p.actualizado_en,
    )


def _obtener_item(db: Session, item_id: int) -> InventarioItem:
    item = db.get(InventarioItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Ítem de inventario no encontrado.")
    return item


def _obtener_despacho(db: Session, despacho_id: int) -> InventarioDespacho:
    despacho = db.scalar(
        select(InventarioDespacho)
        .where(InventarioDespacho.id == despacho_id)
        .options(
            selectinload(InventarioDespacho.item),
            selectinload(InventarioDespacho.tecnico),
            selectinload(InventarioDespacho.asignacion),
        )
    )
    if despacho is None:
        raise HTTPException(status_code=404, detail="Despacho no encontrado.")
    return despacho


def _validar_tecnico(db: Session, tecnico_id: int) -> Usuario:
    tecnico = db.get(Usuario, tecnico_id)
    if tecnico is None or (tecnico.rol != "tecnico" and not tecnico.solo_inventario):
        raise HTTPException(status_code=422, detail="El técnico seleccionado no existe.")
    return tecnico


def _validar_asignacion(db: Session, asignacion_id: int, tecnico_id: Optional[int]) -> Asignacion:
    asignacion = db.get(Asignacion, asignacion_id)
    if asignacion is None or asignacion.eliminado_en is not None:
        raise HTTPException(status_code=422, detail="La asignación seleccionada no existe.")
    if asignacion.tecnico_id != tecnico_id:
        raise HTTPException(
            status_code=422,
            detail="La asignación seleccionada no pertenece al técnico del despacho.",
        )
    return asignacion


def _ajustar_stock(item: InventarioItem, delta_consumo: int) -> None:
    """Aplica al stock el consumo `delta_consumo` (positivo descuenta)."""
    nuevo = item.cantidad_stock - delta_consumo
    if nuevo < 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Stock insuficiente de '{item.descripcion}': hay {item.cantidad_stock} "
                f"unidad(es) y se necesitan {delta_consumo}."
            ),
        )
    item.cantidad_stock = nuevo


def _conflicto_identidad(db: Session, err: Exception) -> None:
    db.rollback()
    if "uq_inventario_items_identidad" in str(err):
        raise HTTPException(
            status_code=409,
            detail="Ya existe un ítem con la misma unión temporal, código, descripción y seriales.",
        )
    raise err


# -----------------------------------------------------------------------------
# ÍTEMS (stock — equivalente a INVENTARIO GENERAL)
# -----------------------------------------------------------------------------
@router.get("/items", response_model=ItemListResponse)
def listar_items(
    db: DB,
    current_user: LectorIN,
    union_temporal: Optional[UnionTemporalLiteral] = None,
    q: Optional[str] = Query(default=None, max_length=100),
    solo_con_stock: bool = False,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    filtros = []
    if union_temporal:
        filtros.append(InventarioItem.union_temporal == UnionTemporal(union_temporal))
    if fecha_inicio:
        filtros.append(InventarioItem.fecha_compra >= fecha_inicio)
    if fecha_fin:
        filtros.append(InventarioItem.fecha_compra <= fecha_fin)
    if isinstance(q, str) and q.strip():
        patron = f"%{q.strip()}%"
        filtros.append(
            or_(
                InventarioItem.descripcion.ilike(patron),
                InventarioItem.codigo_barras.ilike(patron),
                InventarioItem.serial_gsb.ilike(patron),
                InventarioItem.id_equipo.ilike(patron),
                InventarioItem.factura.ilike(patron),
                InventarioItem.no_sds.ilike(patron),
                InventarioItem.numero_articulo.ilike(patron),
            )
        )
    if solo_con_stock:
        filtros.append(InventarioItem.cantidad_stock > 0)

    total, unidades = db.execute(
        select(func.count(), func.coalesce(func.sum(InventarioItem.cantidad_stock), 0)).where(*filtros)
    ).one()

    conteo_despachos = (
        select(InventarioDespacho.item_id, func.count().label("n"))
        .group_by(InventarioDespacho.item_id)
        .subquery()
    )
    filas = db.execute(
        select(InventarioItem, func.coalesce(conteo_despachos.c.n, 0))
        .outerjoin(conteo_despachos, conteo_despachos.c.item_id == InventarioItem.id)
        .where(*filtros)
        .order_by(InventarioItem.descripcion, InventarioItem.serial_gsb, InventarioItem.id)
        .limit(limit)
        .offset(offset)
    ).all()

    items = []
    for item, n in filas:
        resp = ItemResponse.model_validate(item)
        resp.total_despachos = n
        items.append(resp)
    return ItemListResponse(total=total, total_unidades=unidades, items=items)


@router.post("/items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def crear_item(datos: ItemCreate, db: DB, current_user: AdminIN):
    valores = datos.model_dump()
    valores["union_temporal"] = UnionTemporal(datos.union_temporal)
    item = InventarioItem(**valores)
    db.add(item)
    try:
        db.commit()
    except Exception as err:  # noqa: BLE001
        _conflicto_identidad(db, err)
    db.refresh(item)
    return ItemResponse.model_validate(item)


@router.put("/items/{item_id}", response_model=ItemResponse)
def actualizar_item(item_id: int, datos: ItemUpdate, db: DB, current_user: AdminIN):
    item = _obtener_item(db, item_id)
    cambios = datos.model_dump(exclude_unset=True)
    if "union_temporal" in cambios:
        nueva = UnionTemporal(cambios["union_temporal"])
        if nueva != item.union_temporal and item.despachos:
            raise HTTPException(
                status_code=409,
                detail="No se puede cambiar la unión temporal de un ítem que ya tiene despachos.",
            )
        cambios["union_temporal"] = nueva
    for campo in ("descripcion", "cantidad_stock"):
        if campo in cambios and cambios[campo] is None:
            del cambios[campo]
    for campo, valor in cambios.items():
        setattr(item, campo, valor)
    try:
        db.commit()
    except Exception as err:  # noqa: BLE001
        _conflicto_identidad(db, err)
    db.refresh(item)
    resp = ItemResponse.model_validate(item)
    resp.total_despachos = len(item.despachos)
    return resp


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_item(item_id: int, db: DB, current_user: AdminIN):
    item = _obtener_item(db, item_id)
    if item.despachos:
        raise HTTPException(
            status_code=409,
            detail=f"El ítem tiene {len(item.despachos)} despacho(s) registrados; elimínelos primero.",
        )
    db.query(InventarioPrestamo).filter(InventarioPrestamo.item_id == item.id).update(
        {InventarioPrestamo.item_id: None}
    )
    db.delete(item)
    db.commit()


# -----------------------------------------------------------------------------
# DESPACHOS (equivalente a SALIDAS)
# -----------------------------------------------------------------------------
@router.get("/despachos", response_model=DespachoListResponse)
def listar_despachos(
    db: DB,
    current_user: LectorIN,
    union_temporal: Optional[UnionTemporalLiteral] = None,
    tecnico_id: Optional[int] = None,
    sin_tecnico: bool = False,
    estado: Optional[EstadoDespachoLiteral] = None,
    oficina: Optional[str] = Query(default=None, max_length=120),
    item_id: Optional[int] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    tipo_fecha: str = Query(default="despacho", pattern="^(despacho|instalacion)$"),
    q: Optional[str] = Query(default=None, max_length=100),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    filtros = []
    if union_temporal:
        filtros.append(InventarioDespacho.union_temporal == UnionTemporal(union_temporal))
    if fecha_inicio:
        col_f = InventarioDespacho.fecha_instalacion if tipo_fecha == "instalacion" else InventarioDespacho.fecha_despacho
        filtros.append(col_f >= fecha_inicio)
    if fecha_fin:
        col_f = InventarioDespacho.fecha_instalacion if tipo_fecha == "instalacion" else InventarioDespacho.fecha_despacho
        filtros.append(col_f <= fecha_fin)
    if tecnico_id:
        filtros.append(InventarioDespacho.tecnico_id == tecnico_id)
    elif sin_tecnico:
        filtros.append(InventarioDespacho.tecnico_id.is_(None))
    if oficina and oficina.strip():
        patron = f"%{oficina.strip()}%"
        filtros.append(
            or_(
                InventarioDespacho.oficina_destino.ilike(patron),
                InventarioDespacho.oficina_instalada.ilike(patron),
            )
        )
    if item_id:
        filtros.append(InventarioDespacho.item_id == item_id)
    if isinstance(q, str) and q.strip():
        patron = f"%{q.strip()}%"
        filtros.append(
            or_(
                InventarioItem.descripcion.ilike(patron),
                InventarioItem.codigo_barras.ilike(patron),
                InventarioItem.serial_gsb.ilike(patron),
                InventarioDespacho.numero_orden.ilike(patron),
                InventarioDespacho.tecnico_nombre_origen.ilike(patron),
            )
        )

    base = select(InventarioDespacho).join(InventarioItem, InventarioItem.id == InventarioDespacho.item_id)

    # El conteo por estado ignora el filtro de estado: así los chips de la UI
    # muestran cuántos hay de cada uno dentro de los demás filtros.
    por_estado = {e.value: 0 for e in EstadoDespacho}
    for est, n in db.execute(
        base.with_only_columns(InventarioDespacho.estado, func.count())
        .where(*filtros)
        .group_by(InventarioDespacho.estado)
    ).all():
        por_estado[est.value] = n

    if estado:
        filtros.append(InventarioDespacho.estado == EstadoDespacho(estado))

    total = db.scalar(base.with_only_columns(func.count()).where(*filtros)) or 0
    despachos = db.scalars(
        base.where(*filtros)
        .options(
            selectinload(InventarioDespacho.item),
            selectinload(InventarioDespacho.tecnico),
            selectinload(InventarioDespacho.asignacion),
        )
        .order_by(
            InventarioDespacho.fecha_despacho.desc().nulls_last(),
            InventarioDespacho.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    ).all()
    return DespachoListResponse(
        total=total,
        por_estado=por_estado,
        despachos=[_a_despacho_response(d) for d in despachos],
    )


@router.post("/despachos", response_model=DespachoResponse, status_code=status.HTTP_201_CREATED)
def crear_despacho(datos: DespachoCreate, db: DB, current_user: AdminIN):
    item = _obtener_item(db, datos.item_id)
    _validar_tecnico(db, datos.tecnico_id)
    if datos.asignacion_id is not None:
        _validar_asignacion(db, datos.asignacion_id, datos.tecnico_id)
    _ajustar_stock(item, datos.cantidad)

    valores = datos.model_dump()
    valores["estado"] = EstadoDespacho(datos.estado)
    despacho = InventarioDespacho(
        **valores,
        union_temporal=item.union_temporal,
        creado_por_id=current_user.id,
    )
    db.add(despacho)
    db.commit()
    return _a_despacho_response(_obtener_despacho(db, despacho.id))


@router.put("/despachos/{despacho_id}", response_model=DespachoResponse)
def actualizar_despacho(despacho_id: int, datos: DespachoUpdate, db: DB, current_user: AdminIN):
    despacho = _obtener_despacho(db, despacho_id)
    cambios = datos.model_dump(exclude_unset=True)

    for campo in ("tecnico_id", "cantidad", "estado"):
        if campo in cambios and cambios[campo] is None:
            del cambios[campo]

    tecnico_final = cambios.get("tecnico_id", despacho.tecnico_id)
    if "tecnico_id" in cambios and cambios["tecnico_id"] != despacho.tecnico_id:
        _validar_tecnico(db, cambios["tecnico_id"])
        # La asignación era de otro técnico: se suelta salvo que venga una nueva.
        if "asignacion_id" not in cambios:
            cambios["asignacion_id"] = None
    if cambios.get("asignacion_id") is not None:
        _validar_asignacion(db, cambios["asignacion_id"], tecnico_final)

    if "cantidad" in cambios and cambios["cantidad"] != despacho.cantidad:
        _ajustar_stock(despacho.item, cambios["cantidad"] - despacho.cantidad)
    if "estado" in cambios:
        cambios["estado"] = EstadoDespacho(cambios["estado"])

    for campo, valor in cambios.items():
        setattr(despacho, campo, valor)
    db.commit()
    return _a_despacho_response(_obtener_despacho(db, despacho_id))


@router.patch("/despachos/{despacho_id}/estado", response_model=DespachoResponse)
def cambiar_estado_despacho(
    despacho_id: int, datos: DespachoEstadoUpdate, db: DB, current_user: AdminIN
):
    despacho = _obtener_despacho(db, despacho_id)
    despacho.estado = EstadoDespacho(datos.estado)
    if datos.fecha_instalacion is not None:
        despacho.fecha_instalacion = datos.fecha_instalacion
    db.commit()
    return _a_despacho_response(_obtener_despacho(db, despacho_id))


@router.delete("/despachos/{despacho_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_despacho(despacho_id: int, db: DB, current_user: AdminIN):
    despacho = _obtener_despacho(db, despacho_id)
    _ajustar_stock(despacho.item, -despacho.cantidad)
    db.delete(despacho)
    db.commit()


# -----------------------------------------------------------------------------
# PRÉSTAMOS
# -----------------------------------------------------------------------------
@router.get("/prestamos", response_model=List[PrestamoResponse])
def listar_prestamos(
    db: DB,
    current_user: LectorIN,
    union_temporal: Optional[UnionTemporalLiteral] = None,
    q: Optional[str] = Query(default=None, max_length=100),
):
    stmt = select(InventarioPrestamo)
    if union_temporal:
        stmt = stmt.where(InventarioPrestamo.union_temporal == UnionTemporal(union_temporal))
    if q and q.strip():
        stmt = stmt.where(InventarioPrestamo.descripcion.ilike(f"%{q.strip()}%"))
    stmt = stmt.order_by(InventarioPrestamo.union_temporal, InventarioPrestamo.descripcion)
    return [_a_prestamo_response(p) for p in db.scalars(stmt).all()]


def _validar_item_prestamo(db: Session, item_id: Optional[int], union_temporal: UnionTemporal) -> None:
    if item_id is None:
        return
    item = _obtener_item(db, item_id)
    if item.union_temporal != union_temporal:
        raise HTTPException(
            status_code=422,
            detail="El ítem vinculado pertenece a otra unión temporal.",
        )


@router.post("/prestamos", response_model=PrestamoResponse, status_code=status.HTTP_201_CREATED)
def crear_prestamo(datos: PrestamoCreate, db: DB, current_user: AdminIN):
    ut = UnionTemporal(datos.union_temporal)
    _validar_item_prestamo(db, datos.item_id, ut)
    prestamo = InventarioPrestamo(
        union_temporal=ut,
        descripcion=datos.descripcion,
        cantidad=datos.cantidad,
        item_id=datos.item_id,
    )
    db.add(prestamo)
    db.commit()
    db.refresh(prestamo)
    return _a_prestamo_response(prestamo)


@router.put("/prestamos/{prestamo_id}", response_model=PrestamoResponse)
def actualizar_prestamo(prestamo_id: int, datos: PrestamoUpdate, db: DB, current_user: AdminIN):
    prestamo = db.get(InventarioPrestamo, prestamo_id)
    if prestamo is None:
        raise HTTPException(status_code=404, detail="Préstamo no encontrado.")
    cambios = datos.model_dump(exclude_unset=True)
    if cambios.get("union_temporal"):
        cambios["union_temporal"] = UnionTemporal(cambios["union_temporal"])
    else:
        cambios.pop("union_temporal", None)
    for campo in ("descripcion", "cantidad"):
        if campo in cambios and cambios[campo] is None:
            del cambios[campo]
    _validar_item_prestamo(
        db,
        cambios.get("item_id", prestamo.item_id),
        cambios.get("union_temporal", prestamo.union_temporal),
    )
    for campo, valor in cambios.items():
        setattr(prestamo, campo, valor)
    db.commit()
    db.refresh(prestamo)
    return _a_prestamo_response(prestamo)


@router.delete("/prestamos/{prestamo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_prestamo(prestamo_id: int, db: DB, current_user: AdminIN):
    prestamo = db.get(InventarioPrestamo, prestamo_id)
    if prestamo is None:
        raise HTTPException(status_code=404, detail="Préstamo no encontrado.")
    db.delete(prestamo)
    db.commit()


# -----------------------------------------------------------------------------
# RESUMEN (tarjetas de entrada del módulo)
# -----------------------------------------------------------------------------
NOMBRES_UNION = {
    UnionTemporal.RTC: "Unión Temporal RTC",
    UnionTemporal.MANTENIMIENTO: "Unión Temporal Mantenimiento GSB_SDSS",
    UnionTemporal.PROYECTO_ZEUS: "Proyecto Zeus",
}

# Estados que piden atención de alguien (los que no están instalados ni son
# suministro de oficina).
ESTADOS_PENDIENTES = {
    EstadoDespacho.pendiente_instalacion,
    EstadoDespacho.alerta_seguimiento,
    EstadoDespacho.danado,
}


# Entidades de RTC que son corporativas (no personas). Se excluyen del conteo
# de técnicos en el resumen global para que los KPIs reflejen solo personas.
_NOMBRES_CORPORATIVOS = frozenset([
    "GLOBAL SECURITY BANK",
    "BANCO AGRARIO",
    "SDS SMART DEVELOPMENT SYSTEMS CORP",
])


@router.get("/resumen", response_model=ResumenResponse)
def resumen(db: DB, current_user: LectorIN):
    # ── Items en stock por unión temporal ─────────────────────────────────────
    items = {
        ut: (n, unidades)
        for ut, n, unidades in db.execute(
            select(
                InventarioItem.union_temporal,
                func.count(),
                func.coalesce(func.sum(InventarioItem.cantidad_stock), 0),
            ).group_by(InventarioItem.union_temporal)
        ).all()
    }

    # ── Préstamos ─────────────────────────────────────────────────────────────
    prestamos = dict(
        db.execute(
            select(InventarioPrestamo.union_temporal, func.count()).group_by(
                InventarioPrestamo.union_temporal
            )
        ).all()
    )

    # ── Ítems en poder de técnicos ────────────────────────────────────────────
    items_tecnicos = dict(
        db.execute(
            select(InventarioTecnicoItem.union_temporal, func.count()).group_by(
                InventarioTecnicoItem.union_temporal
            )
        ).all()
    )

    # ── Despachos por unión / estado (solo RTC y Mantenimiento los tienen) ────
    despachos: dict[UnionTemporal, dict[str, int]] = {}
    for ut, estado, n in db.execute(
        select(
            InventarioDespacho.union_temporal,
            InventarioDespacho.estado,
            func.count(),
        ).group_by(InventarioDespacho.union_temporal, InventarioDespacho.estado)
    ).all():
        despachos.setdefault(ut, {})[estado.value] = n

    # ── Estado de entrega de Zeus (completamente separado de EstadoDespacho) ──
    zeus_por_entrega: dict[str, int] = {}
    for estado_e, n in db.execute(
        select(
            InventarioItem.estado_entrega,
            func.count(),
        )
        .where(InventarioItem.union_temporal == UnionTemporal.PROYECTO_ZEUS)
        .group_by(InventarioItem.estado_entrega)
    ).all():
        clave_e = estado_e.value if estado_e else "sin_estado"
        zeus_por_entrega[clave_e] = n

    # ── Técnicos-persona por unión temporal (excluye entidades corporativas) ──
    # Los IDs corporativos solo aplican a RTC; se los excluimos de cualquier
    # conteo global para que las cifras representen personas reales.
    todos_tecnicos = db.scalars(
        select(Usuario).where(Usuario.rol == "tecnico")
    ).all()
    ids_corporativos: set[int] = {
        t.id for t in todos_tecnicos if t.nombre.upper() in _NOMBRES_CORPORATIVOS
    }

    # Técnicos por unión temporal (conteo de filas en InventarioTecnicoItem)
    # excluyendo los IDs corporativos.
    tecnicos_por_ut: dict[UnionTemporal, int] = {}
    for ut, tecnico_id, n in db.execute(
        select(
            InventarioTecnicoItem.union_temporal,
            InventarioTecnicoItem.tecnico_id,
            func.count(),
        ).group_by(
            InventarioTecnicoItem.union_temporal,
            InventarioTecnicoItem.tecnico_id,
        )
    ).all():
        if tecnico_id not in ids_corporativos:
            tecnicos_por_ut[ut] = tecnicos_por_ut.get(ut, 0) + 1

    def armar(
        clave: str,
        nombre: str,
        uts: list[UnionTemporal],
        ut_propia: UnionTemporal | None = None,
    ) -> ResumenInventario:
        por_estado = {e.value: 0 for e in EstadoDespacho}
        for ut in uts:
            for estado, n in despachos.get(ut, {}).items():
                por_estado[estado] += n

        # Campos Zeus: solo si el scope incluye PROYECTO_ZEUS
        incluye_zeus = UnionTemporal.PROYECTO_ZEUS in uts
        return ResumenInventario(
            clave=clave,
            union_temporal=ut_propia.value if ut_propia else None,
            nombre=nombre,
            total_items=sum(items.get(ut, (0, 0))[0] for ut in uts),
            total_unidades=sum(items.get(ut, (0, 0))[1] for ut in uts),
            total_despachos=sum(por_estado.values()),
            total_prestamos=sum(prestamos.get(ut, 0) for ut in uts),
            total_items_tecnicos=sum(items_tecnicos.get(ut, 0) for ut in uts),
            total_tecnicos=sum(tecnicos_por_ut.get(ut, 0) for ut in uts),
            por_estado=por_estado,
            pendientes=sum(por_estado[e.value] for e in ESTADOS_PENDIENTES),
            zeus_en_stock=zeus_por_entrega.get(EstadoEntrega.en_stock.value, 0) if incluye_zeus else 0,
            zeus_en_transito=zeus_por_entrega.get(EstadoEntrega.en_transito.value, 0) if incluye_zeus else 0,
            zeus_en_proceso=zeus_por_entrega.get(EstadoEntrega.en_proceso.value, 0) if incluye_zeus else 0,
            zeus_sin_estado=zeus_por_entrega.get("sin_estado", 0) if incluye_zeus else 0,
        )

    return ResumenResponse(
        uniones=[armar(ut.value, NOMBRES_UNION[ut], [ut], ut) for ut in UnionTemporal],
        **{"global": armar("GLOBAL", "Inventario global", list(UnionTemporal))},
    )


# -----------------------------------------------------------------------------
# LECTURA DE TÉCNICOS Y ASIGNACIONES (formulario de despacho)
# -----------------------------------------------------------------------------
@router.get("/tecnicos", response_model=List[TecnicoOpcion])
def listar_tecnicos(db: DB, current_user: LectorIN):
    """Devuelve técnicos con rol='tecnico' (incluye los solo_inventario).
    Ordenados por nombre. Se incluyen activos e inactivos para no perder
    referencias históricas en despachos migrados.
    """
    return db.scalars(
        select(Usuario).where(Usuario.rol == "tecnico").order_by(Usuario.nombre)
    ).all()


@router.get("/tecnicos/{tecnico_id}/asignaciones", response_model=List[AsignacionOpcion])
def listar_asignaciones_tecnico(
    tecnico_id: int,
    db: DB,
    current_user: LectorIN,
    incluir_id: Optional[int] = Query(
        default=None, description="Asignación ya vinculada, se incluye aunque no esté activa."
    ),
):
    condicion = Asignacion.estado.in_(ESTADOS_ASIGNACION_ACTIVOS)
    if incluir_id:
        condicion = or_(condicion, Asignacion.id == incluir_id)
    asignaciones = db.scalars(
        select(Asignacion)
        .where(
            Asignacion.tecnico_id == tecnico_id,
            Asignacion.eliminado_en.is_(None),
            condicion,
        )
        .order_by(Asignacion.fecha_inicio.desc())
    ).all()
    return [
        AsignacionOpcion(
            id=a.id,
            etiqueta=etiqueta_asignacion(a),
            estado=a.estado,
            fecha_inicio=a.fecha_inicio,
            fecha_fin=a.fecha_fin,
        )
        for a in asignaciones
    ]


# -----------------------------------------------------------------------------
# INVENTARIO EN PODER DE TÉCNICOS (Hojas individuales de técnicos)
# -----------------------------------------------------------------------------
@router.get("/tecnicos-resumen", response_model=List[TecnicoInventarioResumen])
def listar_resumen_tecnicos_inventario(
    db: DB,
    current_user: LectorIN,
    union_temporal: Optional[UnionTemporalLiteral] = None,
):
    """Devuelve el resumen de inventario en poder de cada técnico.
    Agrupa por técnico con conteo de ítems y unidades.
    Técnicos con inventario aparecen primero.
    """
    tecnicos = db.scalars(
        select(Usuario).where(Usuario.rol == "tecnico").order_by(Usuario.nombre)
    ).all()

    filtros = []
    if union_temporal:
        filtros.append(InventarioTecnicoItem.union_temporal == UnionTemporal(union_temporal))

    stats_stmt = (
        select(
            InventarioTecnicoItem.tecnico_id,
            func.count(InventarioTecnicoItem.id).label("total_items"),
            func.coalesce(func.sum(InventarioTecnicoItem.cantidad), 0).label("total_unidades"),
        )
        .where(*filtros)
        .group_by(InventarioTecnicoItem.tecnico_id)
    )
    conteos = {row.tecnico_id: (row.total_items, row.total_unidades) for row in db.execute(stats_stmt).all()}

    res = []
    for t in tecnicos:
        tot_items, tot_unidades = conteos.get(t.id, (0, 0))
        res.append(
            TecnicoInventarioResumen(
                tecnico_id=t.id,
                tecnico_nombre=t.nombre,
                activo=t.activo,
                solo_inventario=t.solo_inventario,
                total_items=tot_items,
                total_unidades=tot_unidades,
            )
        )

    res.sort(key=lambda x: (-x.total_items, x.tecnico_nombre.lower()))
    return res


@router.get("/tecnicos/{tecnico_id}/items", response_model=List[InventarioTecnicoItemResponse])
def listar_items_tecnico(
    tecnico_id: int,
    db: DB,
    current_user: LectorIN,
    union_temporal: Optional[UnionTemporalLiteral] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    tipo_fecha: str = Query(default="despacho", pattern="^(despacho|compra|instalacion)$"),
    q: Optional[str] = Query(default=None, max_length=100),
):
    """Devuelve los ítems de inventario asignados a un técnico (su hoja de inventario)."""
    filtros = [InventarioTecnicoItem.tecnico_id == tecnico_id]
    if union_temporal:
        filtros.append(InventarioTecnicoItem.union_temporal == UnionTemporal(union_temporal))
    tipo_fecha_str = tipo_fecha if isinstance(tipo_fecha, str) else "despacho"
    if fecha_inicio:
        col_t = (
            InventarioTecnicoItem.fecha_compra
            if tipo_fecha_str == "compra"
            else InventarioTecnicoItem.fecha_instalacion
            if tipo_fecha_str == "instalacion"
            else InventarioTecnicoItem.fecha_despacho
        )
        filtros.append(col_t >= fecha_inicio)
    if fecha_fin:
        col_t = (
            InventarioTecnicoItem.fecha_compra
            if tipo_fecha_str == "compra"
            else InventarioTecnicoItem.fecha_instalacion
            if tipo_fecha_str == "instalacion"
            else InventarioTecnicoItem.fecha_despacho
        )
        filtros.append(col_t <= fecha_fin)
    if isinstance(q, str) and q.strip():
        patron = f"%{q.strip()}%"
        filtros.append(
            or_(
                InventarioTecnicoItem.descripcion.ilike(patron),
                InventarioTecnicoItem.codigo_barras.ilike(patron),
                InventarioTecnicoItem.serial_gsb.ilike(patron),
                InventarioTecnicoItem.id_equipo.ilike(patron),
                InventarioTecnicoItem.oficina.ilike(patron),
                InventarioTecnicoItem.numero_orden.ilike(patron),
                InventarioTecnicoItem.oficina_instalada.ilike(patron),
                InventarioTecnicoItem.factura.ilike(patron),
                InventarioTecnicoItem.observacion.ilike(patron),
            )
        )

    stmt = select(InventarioTecnicoItem).where(*filtros).order_by(InventarioTecnicoItem.id.asc())
    return db.scalars(stmt).all()


@router.post("/tecnicos/{tecnico_id}/items", response_model=InventarioTecnicoItemResponse, status_code=status.HTTP_201_CREATED)
def crear_item_tecnico(
    tecnico_id: int,
    datos: InventarioTecnicoItemCreate,
    db: DB,
    current_user: AdminIN,
):
    """Registra un nuevo ítem asignado al inventario del técnico."""
    tecnico = _validar_tecnico(db, tecnico_id)
    item = InventarioTecnicoItem(
        union_temporal=UnionTemporal(datos.union_temporal),
        tecnico_id=tecnico.id,
        tecnico_nombre=tecnico.nombre,
        descripcion=datos.descripcion.strip(),
        cantidad=datos.cantidad,
        codigo_barras=datos.codigo_barras.strip() if datos.codigo_barras else None,
        serial_gsb=datos.serial_gsb.strip() if datos.serial_gsb else None,
        id_equipo=datos.id_equipo.strip() if datos.id_equipo else None,
        factura=datos.factura.strip() if datos.factura else None,
        fecha_compra=datos.fecha_compra,
        oficina=datos.oficina.strip() if datos.oficina else None,
        concatenado=datos.concatenado.strip() if datos.concatenado else None,
        fecha_despacho=datos.fecha_despacho,
        observacion=datos.observacion.strip() if datos.observacion else None,
        numero_orden=datos.numero_orden.strip() if datos.numero_orden else None,
        oficina_instalada=datos.oficina_instalada.strip() if datos.oficina_instalada else None,
        fecha_instalacion=datos.fecha_instalacion,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/tecnicos/items/{item_id}", response_model=InventarioTecnicoItemResponse)
def actualizar_item_tecnico(
    item_id: int,
    datos: InventarioTecnicoItemUpdate,
    db: DB,
    current_user: AdminIN,
):
    """Actualiza los datos de un ítem en inventario de técnico."""
    item = db.get(InventarioTecnicoItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="El ítem no existe.")

    campos = datos.model_dump(exclude_unset=True)
    for k, v in campos.items():
        if isinstance(v, str):
            v = v.strip() or None
        setattr(item, k, v)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/tecnicos/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_item_tecnico(
    item_id: int,
    db: DB,
    current_user: AdminIN,
):
    """Elimina un ítem del inventario del técnico."""
    item = db.get(InventarioTecnicoItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="El ítem no existe.")
    db.delete(item)
    db.commit()
