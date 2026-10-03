"""
Módulo Inventario (proceso IN del Mapa SGC).

Cada planilla representa un inventario independiente.
El kardex (inventario_movimientos) es la única fuente de verdad:
  * El stock actual y la cantidad total de cada ítem se calculan y sincronizan desde sus movimientos.
  * Todas las consultas (ítems, kardex, códigos sugeridos, duplicados, reportes) filtran por planilla_id.
  * No se permite stock negativo en ninguna salida; el cálculo se realiza en transacción atómica.
"""

import re
from datetime import datetime
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import case, distinct, func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.core.cloudinary import eliminar_archivo_cloudinary, upload_foto_inventario
from app.core.security import get_current_user, require_seccion
from app.database import get_db
from app.models.inventario import (
    TIPOS_MOVIMIENTO_ENTRADA,
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
from app.models.inventario_salida import InventarioSalidaRegistro
from app.schemas.inventario_nuevo import (
    BusquedaResultadoResponse,
    ExcelContenidoResponse,
    SalidaRegistroCreate,
    SalidaRegistroResponse,
)
from app.services.auditoria import registrar_auditoria
from app.services.inventario_duplicados import buscar_duplicados
from app.services.inventario_excel import (
    buscar_en_excel,
    obtener_datos_inventario_excel,
)

router = APIRouter(prefix="/inventario", tags=["Inventario (IN)"])

LectorIN = Annotated[Usuario, Depends(require_seccion("IN", "lector"))]
AdminIN = Annotated[Usuario, Depends(require_seccion("IN", "admin"))]
CurrentUser = LectorIN
DB = Annotated[Session, Depends(get_db)]

PREFIJO_CODIGO = "INV"
_RE_CODIGO_INTERNO = re.compile(r"^INV-(\d{4})-(\d+)$")


# -----------------------------------------------------------------------------
# HELPERS DE STOCK Y KARDEX
# -----------------------------------------------------------------------------
def _calcular_stock_kardex(db: Session, item_id: int) -> int:
    """Calcula la cantidad total real a partir de todas las entradas y salidas del kardex."""
    val = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (InventarioMovimiento.tipo.in_(TIPOS_MOVIMIENTO_ENTRADA), InventarioMovimiento.cantidad),
                        (InventarioMovimiento.tipo.in_(TIPOS_MOVIMIENTO_SALIDA), -InventarioMovimiento.cantidad),
                        else_=0,
                    )
                ),
                0,
            )
        ).where(InventarioMovimiento.item_id == item_id)
    )
    return int(val or 0)


def _a_item_response(item: InventarioItem, stock_calculado: Optional[int] = None) -> ItemResponse:
    stock_real = stock_calculado if stock_calculado is not None else item.stock_actual
    return ItemResponse(
        id=item.id,
        codigo=item.codigo,
        descripcion=item.descripcion,
        marca=item.marca,
        planilla_id=item.planilla_id,
        planilla_nombre=item.planilla.nombre if item.planilla else None,
        stock_actual=stock_real,
        cantidad_total=stock_real,
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


def _obtener_item_o_404(db: Session, item_id: int, for_update: bool = False) -> InventarioItem:
    stmt = _items_vivos_stmt().where(InventarioItem.id == item_id)
    if for_update:
        stmt = stmt.with_for_update()
    item = db.scalar(stmt)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El ítem de inventario no existe o fue eliminado.",
        )
    return item


def _conteo_planilla(db: Session, planilla_id: int) -> tuple[int, int]:
    """Retorna (total_items, total_unidades) para una planilla calculando desde el kardex."""
    total_items = db.scalar(
        select(func.count(InventarioItem.id)).where(
            InventarioItem.planilla_id == planilla_id,
            InventarioItem.eliminado_en.is_(None),
        )
    ) or 0

    total_unidades = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (InventarioMovimiento.tipo.in_(TIPOS_MOVIMIENTO_ENTRADA), InventarioMovimiento.cantidad),
                        (InventarioMovimiento.tipo.in_(TIPOS_MOVIMIENTO_SALIDA), -InventarioMovimiento.cantidad),
                        else_=0,
                    )
                ),
                0,
            )
        )
        .select_from(InventarioItem)
        .join(InventarioMovimiento, InventarioMovimiento.item_id == InventarioItem.id)
        .where(
            InventarioItem.planilla_id == planilla_id,
            InventarioItem.eliminado_en.is_(None),
        )
    ) or 0

    # Fallback si no hay movimientos pero hay stock_actual
    if total_unidades == 0 and total_items > 0:
        total_unidades = db.scalar(
            select(func.coalesce(func.sum(InventarioItem.stock_actual), 0)).where(
                InventarioItem.planilla_id == planilla_id,
                InventarioItem.eliminado_en.is_(None),
            )
        ) or 0

    # Suma condicional legacy si la planilla tiene mapeo
    ut_legacy = db.scalar(
        text("SELECT union_temporal FROM inventario_mapeo_legacy WHERE planilla_id = :pid"),
        {"pid": planilla_id},
    )
    if ut_legacy:
        legacy_stats = db.execute(
            text("""
                SELECT 
                    COUNT(id) AS cant_items,
                    COALESCE(SUM(cantidad_stock), 0) AS cant_unidades
                FROM inventario_legacy_items_v2
                WHERE union_temporal::text = :ut
            """),
            {"ut": ut_legacy},
        ).one()
        total_items += int(legacy_stats.cant_items or 0)
        total_unidades += int(legacy_stats.cant_unidades or 0)

    return int(total_items), int(total_unidades)


def _siguiente_codigo_interno(db: Session, planilla_id: Optional[int] = None, anio: Optional[int] = None) -> tuple[str, int, int]:
    anio = anio or datetime.now().year
    stmt = select(InventarioItem.codigo).where(
        InventarioItem.codigo.like(f"{PREFIJO_CODIGO}-{anio}-%")
    )
    if planilla_id:
        stmt = stmt.where(InventarioItem.planilla_id == planilla_id)

    codigos = db.scalars(stmt).all()
    ultimo = 0
    for codigo in codigos:
        match = _RE_CODIGO_INTERNO.match((codigo or "").strip().upper())
        if match and int(match.group(1)) == anio:
            ultimo = max(ultimo, int(match.group(2)))

    secuencial = ultimo + 1
    return f"{PREFIJO_CODIGO}-{anio}-{secuencial:04d}", anio, secuencial


def _verificar_codigo_disponible(
    db: Session, codigo: Optional[str], planilla_id: int, excluir_id: Optional[int] = None
) -> None:
    if not codigo:
        return
    filtros = [
        func.upper(InventarioItem.codigo) == codigo.strip().upper(),
        InventarioItem.planilla_id == planilla_id,
        InventarioItem.eliminado_en.is_(None),
    ]
    if excluir_id:
        filtros.append(InventarioItem.id != excluir_id)

    existente = db.scalar(select(InventarioItem).where(*filtros))
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El código '{codigo}' ya está asignado a '{existente.descripcion}' en esta planilla. "
                "Genera uno nuevo o registra el movimiento sobre el ítem existente."
            ),
        )


def _aplicar_movimiento_atomico(
    db: Session,
    item: InventarioItem,
    tipo: str,
    cantidad: int,
    usuario: Usuario,
    observacion: Optional[str],
    origen: str = "manual",
) -> InventarioMovimiento:
    """
    Calcula el stock actual del kardex, valida que no quede negativo y registra
    el movimiento actualizando item.stock_actual en la misma transacción.
    """
    # Kardex como única fuente de verdad
    stock_actual_kardex = _calcular_stock_kardex(db, item.id)
    delta = -cantidad if tipo in TIPOS_MOVIMIENTO_SALIDA else cantidad
    nuevo_stock = stock_actual_kardex + delta

    if nuevo_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No hay stock suficiente de '{item.descripcion}'. "
                f"Disponible: {stock_actual_kardex}, solicitado para salida: {cantidad}."
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
    current_user: LectorIN,
    incluir_inactivas: bool = Query(False),
):
    """Devuelve las planillas ordenadas (1. RTC - Comware, 2. RTC - American Global 2026, etc.)."""
    inc_inactivas = incluir_inactivas if isinstance(incluir_inactivas, bool) else False
    stmt = select(InventarioPlanilla).order_by(InventarioPlanilla.orden, InventarioPlanilla.id)
    if not inc_inactivas:
        stmt = stmt.where(InventarioPlanilla.activa.is_(True))
    planillas = db.scalars(stmt).all()

    # Conteos calculados desde el kardex para cada planilla
    resultado = []
    for p in planillas:
        n_items, unidades = _conteo_planilla(db, p.id)
        resultado.append(
            PlanillaResponse(
                id=p.id,
                nombre=p.nombre,
                descripcion=p.descripcion,
                orden=p.orden,
                activa=p.activa,
                creado_en=p.creado_en,
                total_items=n_items,
                total_unidades=unidades,
            )
        )
    return resultado


@router.post("/planillas", response_model=PlanillaResponse, status_code=status.HTTP_201_CREATED)
def crear_planilla(datos: PlanillaCreate, db: DB, current_user: AdminIN):
    existente = db.scalar(
        select(InventarioPlanilla).where(func.upper(InventarioPlanilla.nombre) == datos.nombre.upper())
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una planilla llamada '{datos.nombre}'.",
        )

    planilla = InventarioPlanilla(
        nombre=datos.nombre,
        descripcion=datos.descripcion,
        orden=datos.orden or 1,
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
        orden=planilla.orden,
        activa=planilla.activa,
        creado_en=planilla.creado_en,
        total_items=0,
        total_unidades=0,
    )


@router.put("/planillas/{planilla_id}", response_model=PlanillaResponse)
def actualizar_planilla(planilla_id: int, datos: PlanillaUpdate, db: DB, current_user: AdminIN):
    planilla = db.get(InventarioPlanilla, planilla_id)
    if not planilla:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planilla no encontrada.")

    if datos.nombre and datos.nombre.upper() != planilla.nombre.upper():
        duplicada = db.scalar(
            select(InventarioPlanilla).where(
                func.upper(InventarioPlanilla.nombre) == datos.nombre.upper(),
                InventarioPlanilla.id != planilla_id,
            )
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
        orden=planilla.orden,
        activa=planilla.activa,
        creado_en=planilla.creado_en,
        total_items=total_items,
        total_unidades=total_unidades,
    )


# -----------------------------------------------------------------------------
# ÍTEMS (ESTRICTAMENTE INDEPENDIENTES POR PLANILLA)
# -----------------------------------------------------------------------------
@router.get("/items", response_model=ItemListResponse)
def listar_items(
    db: DB,
    current_user: LectorIN,
    planilla_id: int = Query(..., description="ID de la planilla requerida"),
    q: Optional[str] = Query(None, description="Busca en descripción, código y marca"),
    solo_con_stock: bool = Query(False),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Lista ítems de la planilla indicada con su stock real calculado desde el kardex."""
    # Subconsulta para calcular stock exacto desde el kardex por ítem
    subq_kardex = (
        select(
            InventarioMovimiento.item_id,
            func.coalesce(
                func.sum(
                    case(
                        (InventarioMovimiento.tipo.in_(TIPOS_MOVIMIENTO_ENTRADA), InventarioMovimiento.cantidad),
                        (InventarioMovimiento.tipo.in_(TIPOS_MOVIMIENTO_SALIDA), -InventarioMovimiento.cantidad),
                        else_=0,
                    )
                ),
                0,
            ).label("kardex_stock"),
        )
        .group_by(InventarioMovimiento.item_id)
        .subquery()
    )

    q_str = q if isinstance(q, str) and q.strip() else None
    solo_stock = solo_con_stock if isinstance(solo_con_stock, bool) else False
    lim = limit if isinstance(limit, int) else 200
    off = offset if isinstance(offset, int) else 0

    filtros = [
        InventarioItem.eliminado_en.is_(None),
        InventarioItem.planilla_id == planilla_id,
    ]

    if solo_stock:
        filtros.append(
            func.coalesce(subq_kardex.c.kardex_stock, InventarioItem.stock_actual) > 0
        )

    if q_str:
        patron = f"%{q_str.strip().upper()}%"
        filtros.append(
            or_(
                func.upper(InventarioItem.descripcion).like(patron),
                func.upper(func.coalesce(InventarioItem.codigo, "")).like(patron),
                func.upper(InventarioItem.marca).like(patron),
            )
        )

    # Conteo total y unidades de la planilla
    total_filtro = db.scalar(
        select(func.count(InventarioItem.id))
        .outerjoin(subq_kardex, subq_kardex.c.item_id == InventarioItem.id)
        .where(*filtros)
    ) or 0

    _, total_unidades_planilla = _conteo_planilla(db, planilla_id)

    # Consulta paginada con stock de kardex
    query_items = (
        select(
            InventarioItem,
            func.coalesce(subq_kardex.c.kardex_stock, InventarioItem.stock_actual).label("stock_real"),
        )
        .options(selectinload(InventarioItem.planilla))
        .outerjoin(subq_kardex, subq_kardex.c.item_id == InventarioItem.id)
        .where(*filtros)
        .order_by(InventarioItem.descripcion)
        .limit(lim)
        .offset(off)
    )
    filas = db.execute(query_items).all()

    items_resp = [_a_item_response(it, int(stock_r)) for it, stock_r in filas]
    return ItemListResponse(
        total=total_filtro,
        total_unidades=total_unidades_planilla,
        items=items_resp,
    )


@router.get("/duplicados", response_model=DuplicadosResponse)
def revisar_duplicados(
    db: DB,
    current_user: LectorIN,
    planilla_id: int = Query(..., description="Planilla donde se evalúa el ítem"),
    descripcion: str = Query(..., min_length=1),
    codigo: Optional[str] = Query(None),
    marca: Optional[str] = Query(None),
):
    """Advierte si el ítem ya existe dentro de la misma planilla."""
    stmt = _items_vivos_stmt().where(InventarioItem.planilla_id == planilla_id)
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
def siguiente_codigo(
    db: DB,
    current_user: LectorIN,
    planilla_id: Optional[int] = Query(None, description="Planilla a la que pertenece el código"),
):
    """Sugiere el próximo código interno disponible dentro de la planilla indicada."""
    p_id = planilla_id if isinstance(planilla_id, int) else None
    codigo, anio, secuencial = _siguiente_codigo_interno(db, planilla_id=p_id)
    return CodigoSugeridoResponse(codigo=codigo, anio=anio, secuencial=secuencial, planilla_id=p_id)


@router.post("/items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def crear_item(datos: ItemCreate, db: DB, current_user: CurrentUser):
    planilla = db.get(InventarioPlanilla, datos.planilla_id)
    if not planilla or not planilla.activa:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La planilla indicada no existe o está inactiva.",
        )

    _verificar_codigo_disponible(db, datos.codigo, planilla_id=datos.planilla_id)

    item = InventarioItem(
        codigo=datos.codigo,
        descripcion=datos.descripcion,
        marca=datos.marca or "GENERICA",
        planilla_id=datos.planilla_id,
        stock_actual=0,
        creado_por_id=current_user.id,
    )
    db.add(item)
    db.flush()

    if datos.cantidad_inicial > 0:
        _aplicar_movimiento_atomico(
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
def actualizar_item(item_id: int, datos: ItemUpdate, db: DB, current_user: AdminIN):
    item = _obtener_item_o_404(db, item_id)

    destino_planilla_id = datos.planilla_id or item.planilla_id
    if datos.planilla_id and datos.planilla_id != item.planilla_id:
        destino = db.get(InventarioPlanilla, datos.planilla_id)
        if not destino or not destino.activa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La planilla de destino no existe o está inactiva.",
            )

    if "codigo" in datos.model_fields_set and datos.codigo != item.codigo:
        _verificar_codigo_disponible(db, datos.codigo, planilla_id=destino_planilla_id, excluir_id=item.id)

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

    stock_kardex = _calcular_stock_kardex(db, item.id)
    return _a_item_response(item, stock_kardex)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_item(item_id: int, db: DB, current_user: AdminIN):
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

    stock_kardex = _calcular_stock_kardex(db, item.id)
    return _a_item_response(item, stock_kardex)


# -----------------------------------------------------------------------------
# MOVIMIENTOS / KARDEX (CONECTADO Y ATÓMICO)
# -----------------------------------------------------------------------------
@router.post(
    "/items/{item_id}/movimientos",
    response_model=MovimientoResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_movimiento(
    item_id: int, datos: MovimientoCreate, db: DB, current_user: CurrentUser
):
    """
    Registra una entrada o salida en el kardex y actualiza el stock del ítem
    en una sola transacción atómica con bloqueo select for update.
    """
    item = _obtener_item_o_404(db, item_id, for_update=True)
    movimiento = _aplicar_movimiento_atomico(
        db,
        item,
        tipo=datos.tipo,
        cantidad=datos.cantidad,
        usuario=current_user,
        observacion=datos.observacion,
    )
    db.commit()
    db.refresh(movimiento)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_MOVIMIENTO",
        detalle=(
            f"Registró {datos.tipo} de {datos.cantidad} unidades en '{item.descripcion}' "
            f"(Planilla: {item.planilla.nombre if item.planilla else item.planilla_id}). "
            f"Stock resultante: {movimiento.stock_resultante}."
        ),
        resultado="exitoso",
    )

    return _a_movimiento_response(movimiento, usuario_nombre=current_user.nombre)


@router.get("/items/{item_id}/kardex", response_model=KardexResponse)
def obtener_kardex(item_id: int, db: DB, current_user: LectorIN):
    item = _obtener_item_o_404(db, item_id)
    stock_kardex = _calcular_stock_kardex(db, item.id)

    filas = db.execute(
        select(InventarioMovimiento, Usuario.nombre)
        .join(Usuario, Usuario.id == InventarioMovimiento.usuario_id)
        .where(InventarioMovimiento.item_id == item_id)
        .order_by(InventarioMovimiento.fecha.desc(), InventarioMovimiento.id.desc())
    ).all()

    return KardexResponse(
        item=_a_item_response(item, stock_kardex),
        movimientos=[_a_movimiento_response(mov, nombre) for mov, nombre in filas],
    )


# -----------------------------------------------------------------------------
# REPORTE INDEPENDIENTE POR PLANILLA / GLOBAL
# -----------------------------------------------------------------------------
@router.get("/reportes/global", response_model=ReporteGlobalResponse)
def reporte_global(
    db: DB,
    current_user: LectorIN,
    planilla_id: Optional[int] = Query(None, description="Filtra reporte por planilla específica"),
):
    """
    Reporte consolidado que desglosa cada planilla con su total real de unidades
    e ítems, o filtra exclusivamente por la planilla indicada sin mezclar datos.
    """
    stmt_planillas = select(InventarioPlanilla).where(InventarioPlanilla.activa.is_(True)).order_by(InventarioPlanilla.orden, InventarioPlanilla.id)
    if planilla_id:
        stmt_planillas = stmt_planillas.where(InventarioPlanilla.id == planilla_id)

    planillas = db.scalars(stmt_planillas).all()
    por_planilla: List[PlanillaResumen] = []

    for p in planillas:
        n_items, unidades = _conteo_planilla(db, p.id)
        # Ítems en cero en esta planilla
        en_cero = db.scalar(
            select(func.count(InventarioItem.id)).where(
                InventarioItem.planilla_id == p.id,
                InventarioItem.eliminado_en.is_(None),
                InventarioItem.stock_actual == 0,
            )
        ) or 0

        por_planilla.append(
            PlanillaResumen(
                planilla_id=p.id,
                planilla_nombre=p.nombre,
                orden=p.orden,
                total_items=n_items,
                total_unidades=unidades,
                items_en_cero=en_cero,
            )
        )

    # Conteo de movimientos
    stmt_movs = select(func.count(InventarioMovimiento.id))
    if planilla_id:
        stmt_movs = (
            stmt_movs.select_from(InventarioMovimiento)
            .join(InventarioItem, InventarioItem.id == InventarioMovimiento.item_id)
            .where(InventarioItem.planilla_id == planilla_id)
        )
    total_movimientos = db.scalar(stmt_movs) or 0

    return ReporteGlobalResponse(
        total_items=sum(p.total_items for p in por_planilla),
        total_unidades=sum(p.total_unidades for p in por_planilla),
        items_en_cero=sum(p.items_en_cero for p in por_planilla),
        total_movimientos=total_movimientos,
        por_planilla=por_planilla,
    )


# -----------------------------------------------------------------------------
# VISOR Y BÚSQUEDA EXCEL (DESDE backend/data/migracion_inventario/)
# -----------------------------------------------------------------------------
@router.get("/excel", response_model=ExcelContenidoResponse)
def leer_excel_inventario(
    current_user: LectorIN,
    db: DB,
    hoja: Optional[str] = Query(None, description="Nombre de la hoja a consultar"),
    limit: int = Query(1500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    planilla_id: Optional[int] = Query(None, description="ID de la planilla activa"),
    planilla_nombre: Optional[str] = Query(None, description="Nombre de la planilla activa"),
    archivo: Optional[str] = Query(None, description="Nombre de archivo específico"),
    forzar: bool = Query(False, description="Forzar recarga en memoria"),
):
    """Retorna las hojas y filas del archivo Excel correspondiente a la planilla desde backend/data/migracion_inventario/."""
    nombre_pl = planilla_nombre
    if planilla_id and not nombre_pl:
        pl = db.get(InventarioPlanilla, planilla_id)
        if pl:
            nombre_pl = pl.nombre

    datos = obtener_datos_inventario_excel(
        planilla_id=planilla_id,
        planilla_nombre=nombre_pl,
        archivo=archivo,
        hoja=hoja,
        limit=limit,
        offset=offset,
        forzar_recarga=forzar,
    )
    return datos


@router.get("/buscar", response_model=BusquedaResultadoResponse)
def buscar_en_excel_endpoint(
    current_user: LectorIN,
    db: DB,
    hoja: Optional[str] = Query(None),
    serial: Optional[str] = Query(None),
    oficina: Optional[str] = Query(None),
    tecnico: Optional[str] = Query(None),
    fecha: Optional[str] = Query(None),
    planilla_id: Optional[int] = Query(None),
    planilla_nombre: Optional[str] = Query(None),
    archivo: Optional[str] = Query(None),
):
    """Busca en el archivo Excel de la planilla activa por serial, oficina, técnico o fecha."""
    nombre_pl = planilla_nombre
    if planilla_id and not nombre_pl:
        pl = db.get(InventarioPlanilla, planilla_id)
        if pl:
            nombre_pl = pl.nombre

    return buscar_en_excel(
        hoja=hoja,
        serial=serial,
        oficina=oficina,
        tecnico=tecnico,
        fecha=fecha,
        planilla_id=planilla_id,
        planilla_nombre=nombre_pl,
        archivo=archivo,
    )


@router.post("/salidas", response_model=SalidaRegistroResponse, status_code=status.HTTP_201_CREATED)
def guardar_salida_registro(
    datos: SalidaRegistroCreate,
    db: DB,
    current_user: CurrentUser,
):
    """Guarda un registro de salida de inventario."""
    registro = InventarioSalidaRegistro(
        serial=datos.serial,
        oficina=datos.oficina,
        tecnico=datos.tecnico,
        fecha_busqueda=datos.fecha_busqueda,
        orden=datos.orden,
        oficina_instalada=datos.oficina_instalada,
        fecha=datos.fecha,
        observaciones=datos.observaciones,
        creado_por_id=current_user.id,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_REGISTRO_SALIDA",
        detalle=f"Registró salida orden '{registro.orden}' hacia '{registro.oficina_instalada}' (Serial: {registro.serial or 'N/A'}).",
        resultado="exitoso",
    )
    return registro


@router.get("/salidas", response_model=List[SalidaRegistroResponse])
def listar_salidas_registradas(
    db: DB,
    current_user: LectorIN,
    limit: int = Query(100, ge=1, le=500),
):
    """Lista las salidas de inventario registradas recientemente."""
    stmt = (
        select(InventarioSalidaRegistro)
        .order_by(InventarioSalidaRegistro.id.desc())
        .limit(limit)
    )
    return db.scalars(stmt).all()