"""
Módulo Inventario — asociado al proceso CI (Compras e Inventario) del Mapa SGC.

Control de acceso:
  * Captura y consulta (cualquier técnico autenticado): get_current_user.
    Igual que en viáticos, un técnico registra sus propios movimientos sin
    necesitar un permiso especial.
  * Supervisión (editar/eliminar ítems, gestionar planillas): require_seccion("CI", "admin").
  * Reportes consolidados: require_seccion("CI", "lector").
"""

import re
from datetime import datetime
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.cloudinary import eliminar_archivo_cloudinary, upload_foto_inventario
from app.core.security import get_current_user, require_seccion
from app.database import get_db
from app.models.inventario import (
    TIPOS_MOVIMIENTO_SALIDA,
    InventarioItem,
    InventarioMovimiento,
    InventarioPlanilla,
)
from app.models.usuario import Usuario
from app.schemas.inventario import (
    CodigoSugeridoResponse,
    DuplicadoMatch,
    DuplicadosResponse,
    ItemCreate,
    ItemListResponse,
    ItemResponse,
    ItemUpdate,
    KardexResponse,
    MovimientoCreate,
    MovimientoResponse,
    PlanillaCreate,
    PlanillaResponse,
    PlanillaResumen,
    PlanillaUpdate,
    ReporteGlobalResponse,
)
from app.services.auditoria import registrar_auditoria
from app.services.inventario_duplicados import buscar_duplicados

router = APIRouter(prefix="/inventario", tags=["Inventario (CI)"])

CurrentUser = Annotated[Usuario, Depends(get_current_user)]
AdminCI = Annotated[Usuario, Depends(require_seccion("CI", "admin"))]
LectorCI = Annotated[Usuario, Depends(require_seccion("CI", "lector"))]
DB = Annotated[Session, Depends(get_db)]

PLANILLAS_INICIALES = ["MANTENIMIENTO", "RTC"]


def seed_planillas_inventario_si_vacio(db: Session) -> None:
    """Crea las planillas base la primera vez. Idempotente."""
    try:
        ya_hay = db.scalar(select(func.count(InventarioPlanilla.id)))
        if ya_hay:
            return
        for nombre in PLANILLAS_INICIALES:
            db.add(InventarioPlanilla(nombre=nombre))
        db.commit()
        print(f"[STARTUP] Planillas de inventario sembradas: {', '.join(PLANILLAS_INICIALES)}")
    except Exception as e:
        db.rollback()
        print(f"[STARTUP] Advertencia al sembrar planillas de inventario: {e}")


# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------
def _a_item_response(item: InventarioItem) -> ItemResponse:
    return ItemResponse(
        id=item.id,
        codigo=item.codigo,
        descripcion=item.descripcion,
        marca=item.marca,
        planilla_id=item.planilla_id,
        planilla_nombre=item.planilla.nombre if item.planilla else None,
        stock_actual=item.stock_actual,
        foto_referencia_url=item.foto_referencia_url,
        creado_en=item.creado_en,
        actualizado_en=item.actualizado_en,
    )


def _a_movimiento_response(
    mov: InventarioMovimiento, usuario_nombre: Optional[str] = None
) -> MovimientoResponse:
    return MovimientoResponse(
        id=mov.id,
        item_id=mov.item_id,
        tipo=mov.tipo,
        cantidad=mov.cantidad,
        usuario_id=mov.usuario_id,
        usuario_nombre=usuario_nombre,
        observacion=mov.observacion,
        origen=mov.origen,
        stock_resultante=mov.stock_resultante,
        fecha=mov.fecha,
    )


def _items_vivos_stmt():
    return (
        select(InventarioItem)
        .options(selectinload(InventarioItem.planilla))
        .where(InventarioItem.eliminado_en.is_(None))
    )


def _obtener_item_o_404(db: Session, item_id: int) -> InventarioItem:
    item = db.scalar(_items_vivos_stmt().where(InventarioItem.id == item_id))
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El ítem de inventario no existe o fue eliminado.",
        )
    return item


def _conteo_planilla(db: Session, planilla_id: int) -> tuple[int, int]:
    fila = db.execute(
        select(
            func.count(InventarioItem.id),
            func.coalesce(func.sum(InventarioItem.stock_actual), 0),
        ).where(
            InventarioItem.planilla_id == planilla_id,
            InventarioItem.eliminado_en.is_(None),
        )
    ).one()
    return int(fila[0]), int(fila[1])


# Código interno correlativo: INV-{AÑO}-{SECUENCIAL de 4 dígitos}.
# Convive con el código de fábrica que el técnico escribe a mano; ambos viven en
# la misma columna `codigo` y se validan igual (único entre los ítems vigentes).
PREFIJO_CODIGO = "INV"
_RE_CODIGO_INTERNO = re.compile(r"^INV-(\d{4})-(\d+)$")


def _siguiente_codigo_interno(db: Session, anio: Optional[int] = None) -> tuple[str, int, int]:
    """Devuelve (codigo, anio, secuencial) para el siguiente ítem del año.

    Recorre también los ítems eliminados: un consecutivo no se reutiliza, para
    que el código siga identificando de forma única lo que alguna vez existió.
    """
    anio = anio or datetime.now().year
    codigos = db.scalars(
        select(InventarioItem.codigo).where(
            InventarioItem.codigo.like(f"{PREFIJO_CODIGO}-{anio}-%")
        )
    ).all()

    ultimo = 0
    for codigo in codigos:
        match = _RE_CODIGO_INTERNO.match((codigo or "").strip().upper())
        if match and int(match.group(1)) == anio:
            ultimo = max(ultimo, int(match.group(2)))

    secuencial = ultimo + 1
    return f"{PREFIJO_CODIGO}-{anio}-{secuencial:04d}", anio, secuencial


def _verificar_codigo_disponible(db: Session, codigo: Optional[str], excluir_id: Optional[int] = None) -> None:
    """El código identifica al ítem, así que no puede repetirse entre los vigentes."""
    if not codigo:
        return
    filtros = [
        func.upper(InventarioItem.codigo) == codigo.strip().upper(),
        InventarioItem.eliminado_en.is_(None),
    ]
    if excluir_id:
        filtros.append(InventarioItem.id != excluir_id)

    existente = db.scalar(select(InventarioItem).where(*filtros))
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El código '{codigo}' ya está asignado a '{existente.descripcion}'. "
                "Genera uno nuevo o registra el movimiento sobre el ítem existente."
            ),
        )


def _aplicar_movimiento(
    db: Session,
    item: InventarioItem,
    tipo: str,
    cantidad: int,
    usuario: Usuario,
    observacion: Optional[str],
    origen: str = "manual",
) -> InventarioMovimiento:
    """Actualiza el stock del ítem y registra el movimiento en el kardex.
    No hace commit: eso queda a cargo del endpoint que lo llama."""
    delta = -cantidad if tipo in TIPOS_MOVIMIENTO_SALIDA else cantidad
    nuevo_stock = item.stock_actual + delta

    if nuevo_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No hay stock suficiente de '{item.descripcion}'. "
                f"Disponible: {item.stock_actual}, solicitado: {cantidad}."
            ),
        )

    item.stock_actual = nuevo_stock
    movimiento = InventarioMovimiento(
        item_id=item.id,
        tipo=tipo,
        cantidad=cantidad,
        usuario_id=usuario.id,
        observacion=observacion,
        origen=origen,
        stock_resultante=nuevo_stock,
    )
    db.add(movimiento)
    return movimiento


# -----------------------------------------------------------------------------
# PLANILLAS
# -----------------------------------------------------------------------------
@router.get("/planillas", response_model=List[PlanillaResponse])
def listar_planillas(
    db: DB,
    current_user: CurrentUser,
    incluir_inactivas: bool = Query(False),
):
    stmt = select(InventarioPlanilla).order_by(InventarioPlanilla.nombre)
    if not incluir_inactivas:
        stmt = stmt.where(InventarioPlanilla.activa.is_(True))
    planillas = db.scalars(stmt).all()

    # Conteos agregados en una sola consulta, no un COUNT por planilla.
    filas = db.execute(
        select(
            InventarioItem.planilla_id,
            func.count(InventarioItem.id),
            func.coalesce(func.sum(InventarioItem.stock_actual), 0),
        )
        .where(InventarioItem.eliminado_en.is_(None))
        .group_by(InventarioItem.planilla_id)
    ).all()
    conteos = {pid: (int(n_items), int(unidades)) for pid, n_items, unidades in filas}

    return [
        PlanillaResponse(
            id=p.id,
            nombre=p.nombre,
            descripcion=p.descripcion,
            activa=p.activa,
            creado_en=p.creado_en,
            total_items=conteos.get(p.id, (0, 0))[0],
            total_unidades=conteos.get(p.id, (0, 0))[1],
        )
        for p in planillas
    ]


@router.post("/planillas", response_model=PlanillaResponse, status_code=status.HTTP_201_CREATED)
def crear_planilla(datos: PlanillaCreate, db: DB, current_user: AdminCI):
    existente = db.scalar(
        select(InventarioPlanilla).where(InventarioPlanilla.nombre == datos.nombre)
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una planilla llamada '{datos.nombre}'.",
        )

    planilla = InventarioPlanilla(
        nombre=datos.nombre,
        descripcion=datos.descripcion,
        creado_por_id=current_user.id,
    )
    db.add(planilla)
    db.commit()
    db.refresh(planilla)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_CREAR_PLANILLA",
        detalle=f"Creó la planilla de inventario '{planilla.nombre}' (id={planilla.id}).",
        resultado="exitoso",
    )

    return PlanillaResponse(
        id=planilla.id,
        nombre=planilla.nombre,
        descripcion=planilla.descripcion,
        activa=planilla.activa,
        creado_en=planilla.creado_en,
        total_items=0,
        total_unidades=0,
    )


@router.put("/planillas/{planilla_id}", response_model=PlanillaResponse)
def actualizar_planilla(planilla_id: int, datos: PlanillaUpdate, db: DB, current_user: AdminCI):
    planilla = db.get(InventarioPlanilla, planilla_id)
    if not planilla:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planilla no encontrada.")

    if datos.nombre and datos.nombre != planilla.nombre:
        duplicada = db.scalar(
            select(InventarioPlanilla).where(InventarioPlanilla.nombre == datos.nombre)
        )
        if duplicada:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe una planilla llamada '{datos.nombre}'.",
            )

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(planilla, campo, valor)

    db.commit()
    db.refresh(planilla)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_EDITAR_PLANILLA",
        detalle=f"Actualizó la planilla de inventario '{planilla.nombre}' (id={planilla.id}).",
        resultado="exitoso",
    )

    total_items, total_unidades = _conteo_planilla(db, planilla.id)
    return PlanillaResponse(
        id=planilla.id,
        nombre=planilla.nombre,
        descripcion=planilla.descripcion,
        activa=planilla.activa,
        creado_en=planilla.creado_en,
        total_items=total_items,
        total_unidades=total_unidades,
    )


# -----------------------------------------------------------------------------
# ÍTEMS
# -----------------------------------------------------------------------------
@router.get("/items", response_model=ItemListResponse)
def listar_items(
    db: DB,
    current_user: CurrentUser,
    q: Optional[str] = Query(None, description="Busca en descripción, código y marca"),
    planilla_id: Optional[int] = Query(None),
    solo_con_stock: bool = Query(False),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    filtros = [InventarioItem.eliminado_en.is_(None)]
    if planilla_id:
        filtros.append(InventarioItem.planilla_id == planilla_id)
    if solo_con_stock:
        filtros.append(InventarioItem.stock_actual > 0)
    if q:
        patron = f"%{q.strip().upper()}%"
        filtros.append(
            or_(
                func.upper(InventarioItem.descripcion).like(patron),
                func.upper(func.coalesce(InventarioItem.codigo, "")).like(patron),
                func.upper(InventarioItem.marca).like(patron),
            )
        )

    total = db.scalar(select(func.count(InventarioItem.id)).where(*filtros)) or 0
    items = db.scalars(
        _items_vivos_stmt()
        .where(*filtros)
        .order_by(InventarioItem.descripcion)
        .limit(limit)
        .offset(offset)
    ).all()

    return ItemListResponse(total=total, items=[_a_item_response(i) for i in items])


@router.get("/duplicados", response_model=DuplicadosResponse)
def revisar_duplicados(
    db: DB,
    current_user: CurrentUser,
    descripcion: str = Query(..., min_length=1),
    codigo: Optional[str] = Query(None),
    marca: Optional[str] = Query(None),
    planilla_id: Optional[int] = Query(None, description="Limita la búsqueda a una planilla"),
):
    """Advierte, antes de crear, si el ítem ya existe con otra redacción."""
    stmt = _items_vivos_stmt()
    if planilla_id:
        stmt = stmt.where(InventarioItem.planilla_id == planilla_id)
    existentes = db.scalars(stmt).all()

    tipo, matches = buscar_duplicados(codigo, descripcion, marca, existentes)
    return DuplicadosResponse(
        tipo=tipo,
        matches=[
            DuplicadoMatch(item=_a_item_response(item), score=round(score, 3))
            for score, item in matches
        ],
    )


@router.get("/siguiente-codigo", response_model=CodigoSugeridoResponse)
def siguiente_codigo(db: DB, current_user: CurrentUser):
    """Sugiere el próximo código interno (INV-AAAA-NNNN).

    Es una sugerencia, no una reserva: si dos personas abren el formulario a la
    vez reciben el mismo número y la segunda en guardar recibe un 409, momento
    en el que el formulario pide un código nuevo.
    """
    codigo, anio, secuencial = _siguiente_codigo_interno(db)
    return CodigoSugeridoResponse(codigo=codigo, anio=anio, secuencial=secuencial)


@router.post("/items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def crear_item(datos: ItemCreate, db: DB, current_user: CurrentUser):
    planilla = db.get(InventarioPlanilla, datos.planilla_id)
    if not planilla or not planilla.activa:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La planilla indicada no existe o está inactiva.",
        )

    _verificar_codigo_disponible(db, datos.codigo)

    item = InventarioItem(
        codigo=datos.codigo,
        descripcion=datos.descripcion,
        marca=datos.marca or "GENERICA",
        planilla_id=datos.planilla_id,
        stock_actual=0,
        creado_por_id=current_user.id,
    )
    db.add(item)
    db.flush()  # necesitamos item.id para el movimiento inicial

    if datos.cantidad_inicial > 0:
        _aplicar_movimiento(
            db,
            item,
            tipo="ajuste_inicial",
            cantidad=datos.cantidad_inicial,
            usuario=current_user,
            observacion=datos.observacion or "Carga inicial del ítem.",
        )

    db.commit()
    db.refresh(item)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_CREAR_ITEM",
        detalle=(
            f"Creó el ítem '{item.descripcion}' (id={item.id}, código={item.codigo or 'N/A'}) "
            f"en la planilla '{planilla.nombre}' con stock inicial {item.stock_actual}."
        ),
        resultado="exitoso",
    )

    return _a_item_response(item)


@router.put("/items/{item_id}", response_model=ItemResponse)
def actualizar_item(item_id: int, datos: ItemUpdate, db: DB, current_user: AdminCI):
    item = _obtener_item_o_404(db, item_id)

    if datos.planilla_id and datos.planilla_id != item.planilla_id:
        destino = db.get(InventarioPlanilla, datos.planilla_id)
        if not destino or not destino.activa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La planilla de destino no existe o está inactiva.",
            )

    if "codigo" in datos.model_fields_set and datos.codigo != item.codigo:
        _verificar_codigo_disponible(db, datos.codigo, excluir_id=item.id)

    cambios = datos.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(item, campo, valor)

    db.commit()
    db.refresh(item)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_EDITAR_ITEM",
        detalle=(
            f"Editó el ítem de inventario id={item.id} ('{item.descripcion}'). "
            f"Campos modificados: {', '.join(cambios.keys()) or 'ninguno'}."
        ),
        resultado="exitoso",
    )

    return _a_item_response(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_item(item_id: int, db: DB, current_user: AdminCI):
    """Soft-delete: el ítem deja de listarse pero su kardex se conserva."""
    item = _obtener_item_o_404(db, item_id)
    descripcion = item.descripcion
    item.eliminado_en = datetime.now()
    db.commit()

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_ELIMINAR_ITEM",
        detalle=f"Eliminó (soft-delete) el ítem de inventario id={item_id} ('{descripcion}').",
        resultado="exitoso",
    )
    return None


@router.post("/items/{item_id}/foto", response_model=ItemResponse)
async def subir_foto_item(item_id: int, db: DB, current_user: CurrentUser, file: UploadFile):
    """Adjunta o reemplaza la foto de referencia del ítem."""
    item = _obtener_item_o_404(db, item_id)
    public_id_anterior = item.foto_public_id

    resultado = await upload_foto_inventario(file)
    item.foto_referencia_url = resultado.secure_url
    item.foto_public_id = resultado.public_id
    db.commit()
    db.refresh(item)

    if public_id_anterior:
        await eliminar_archivo_cloudinary(public_id_anterior)

    return _a_item_response(item)


# -----------------------------------------------------------------------------
# MOVIMIENTOS / KARDEX
# -----------------------------------------------------------------------------
@router.post(
    "/items/{item_id}/movimientos",
    response_model=MovimientoResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_movimiento(
    item_id: int, datos: MovimientoCreate, db: DB, current_user: CurrentUser
):
    item = _obtener_item_o_404(db, item_id)
    movimiento = _aplicar_movimiento(
        db,
        item,
        tipo=datos.tipo,
        cantidad=datos.cantidad,
        usuario=current_user,
        observacion=datos.observacion,
    )
    db.commit()
    db.refresh(movimiento)

    return _a_movimiento_response(movimiento, usuario_nombre=current_user.nombre)


@router.get("/items/{item_id}/kardex", response_model=KardexResponse)
def obtener_kardex(item_id: int, db: DB, current_user: CurrentUser):
    item = _obtener_item_o_404(db, item_id)

    filas = db.execute(
        select(InventarioMovimiento, Usuario.nombre)
        .join(Usuario, Usuario.id == InventarioMovimiento.usuario_id)
        .where(InventarioMovimiento.item_id == item_id)
        .order_by(InventarioMovimiento.fecha.desc(), InventarioMovimiento.id.desc())
    ).all()

    return KardexResponse(
        item=_a_item_response(item),
        movimientos=[_a_movimiento_response(mov, nombre) for mov, nombre in filas],
    )


# -----------------------------------------------------------------------------
# REPORTE CONSOLIDADO (panel de supervisión CI)
# -----------------------------------------------------------------------------
@router.get("/reportes/global", response_model=ReporteGlobalResponse)
def reporte_global(db: DB, current_user: LectorCI):
    filas = db.execute(
        select(
            InventarioPlanilla.id,
            InventarioPlanilla.nombre,
            func.count(InventarioItem.id),
            func.coalesce(func.sum(InventarioItem.stock_actual), 0),
            func.coalesce(func.sum(case((InventarioItem.stock_actual == 0, 1), else_=0)), 0),
        )
        .select_from(InventarioPlanilla)
        .outerjoin(
            InventarioItem,
            (InventarioItem.planilla_id == InventarioPlanilla.id)
            & (InventarioItem.eliminado_en.is_(None)),
        )
        .group_by(InventarioPlanilla.id, InventarioPlanilla.nombre)
        .order_by(InventarioPlanilla.nombre)
    ).all()

    por_planilla = [
        PlanillaResumen(
            planilla_id=pid,
            planilla_nombre=nombre,
            total_items=int(n_items),
            total_unidades=int(unidades),
            items_en_cero=int(en_cero),
        )
        for pid, nombre, n_items, unidades, en_cero in filas
    ]

    total_movimientos = db.scalar(select(func.count(InventarioMovimiento.id))) or 0

    return ReporteGlobalResponse(
        total_items=sum(p.total_items for p in por_planilla),
        total_unidades=sum(p.total_unidades for p in por_planilla),
        items_en_cero=sum(p.items_en_cero for p in por_planilla),
        total_movimientos=total_movimientos,
        por_planilla=por_planilla,
    )
