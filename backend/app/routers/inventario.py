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

from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user, require_seccion
from app.database import get_db
from app.models.asignacion import Asignacion
from app.models.inventario import (
    EstadoDespacho,
    InventarioDespacho,
    InventarioItem,
    InventarioPrestamo,
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
    ItemCreate,
    ItemListResponse,
    ItemResponse,
    ItemUpdate,
    PrestamoCreate,
    PrestamoResponse,
    PrestamoUpdate,
    ResumenInventario,
    ResumenResponse,
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
    if tecnico is None or tecnico.rol != "tecnico":
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
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    filtros = []
    if union_temporal:
        filtros.append(InventarioItem.union_temporal == UnionTemporal(union_temporal))
    if q and q.strip():
        patron = f"%{q.strip()}%"
        filtros.append(
            or_(
                InventarioItem.descripcion.ilike(patron),
                InventarioItem.codigo_barras.ilike(patron),
                InventarioItem.serial_gsb.ilike(patron),
                InventarioItem.id_equipo.ilike(patron),
                InventarioItem.factura.ilike(patron),
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
    q: Optional[str] = Query(default=None, max_length=100),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    filtros = []
    if union_temporal:
        filtros.append(InventarioDespacho.union_temporal == UnionTemporal(union_temporal))
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
    if q and q.strip():
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
}

# Estados que piden atención de alguien (los que no están instalados ni son
# suministro de oficina).
ESTADOS_PENDIENTES = {
    EstadoDespacho.pendiente_instalacion,
    EstadoDespacho.alerta_seguimiento,
    EstadoDespacho.danado,
}


@router.get("/resumen", response_model=ResumenResponse)
def resumen(db: DB, current_user: LectorIN):
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
    prestamos = dict(
        db.execute(
            select(InventarioPrestamo.union_temporal, func.count()).group_by(
                InventarioPrestamo.union_temporal
            )
        ).all()
    )
    despachos: dict[UnionTemporal, dict[str, int]] = {}
    for ut, estado, n in db.execute(
        select(InventarioDespacho.union_temporal, InventarioDespacho.estado, func.count()).group_by(
            InventarioDespacho.union_temporal, InventarioDespacho.estado
        )
    ).all():
        despachos.setdefault(ut, {})[estado.value] = n

    def armar(clave: str, nombre: str, uts: list[UnionTemporal], ut_propia=None) -> ResumenInventario:
        por_estado = {e.value: 0 for e in EstadoDespacho}
        for ut in uts:
            for estado, n in despachos.get(ut, {}).items():
                por_estado[estado] += n
        return ResumenInventario(
            clave=clave,
            union_temporal=ut_propia.value if ut_propia else None,
            nombre=nombre,
            total_items=sum(items.get(ut, (0, 0))[0] for ut in uts),
            total_unidades=sum(items.get(ut, (0, 0))[1] for ut in uts),
            total_despachos=sum(por_estado.values()),
            total_prestamos=sum(prestamos.get(ut, 0) for ut in uts),
            por_estado=por_estado,
            pendientes=sum(por_estado[e.value] for e in ESTADOS_PENDIENTES),
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
