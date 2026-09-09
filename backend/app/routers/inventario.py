"""
Módulo Inventario - asociado al proceso IN (Inventario) del Mapa SGC.

Control de acceso:
  * Captura y consulta (cualquier tecnico autenticado): get_current_user.
    Igual que en viaticos, un tecnico registra sus propios movimientos sin
    necesitar un permiso especial.
  * Supervision (editar/eliminar items, gestionar planillas): require_seccion("IN", "admin").
  * Reportes consolidados: require_seccion("IN", "lector").
"""

import re
from datetime import datetime
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.cloudinary import eliminar_archivo_cloudinary, upload_foto_inventario
from app.core.security import get_current_pilar_admin, get_current_user, require_seccion
from app.database import get_db
from app.models.inventario import (
    NIVELES_ENTIDAD,
    TIPO_EMPRESA_GLOBAL,
    TIPOS_MOVIMIENTO_SALIDA,
    InventarioCliente,
    InventarioEmpresa,
    InventarioItem,
    InventarioMovimiento,
    InventarioPlanilla,
    InventarioTraspaso,
    InventarioUsuarioAsignado,
)
from app.models.usuario import Usuario
from app.schemas.inventario import (
    AccesoInventarioResponse,
    AccesoInventarioSet,
    ClienteResponse,
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
    TraspasoCreate,
    TraspasoResolucion,
    TraspasoResponse,
    UsuarioAccesosInventario,
)
from app.schemas.inventario import EmpresaResponse
from app.services.auditoria import registrar_auditoria
from app.services.inventario_duplicados import buscar_duplicados

router = APIRouter(prefix="/inventario", tags=["Inventario (IN)"])

CurrentUser = Annotated[Usuario, Depends(get_current_user)]
AdminIN = Annotated[Usuario, Depends(require_seccion("IN", "admin"))]
LectorIN = Annotated[Usuario, Depends(require_seccion("IN", "lector"))]
PilarAdmin = Annotated[Usuario, Depends(get_current_pilar_admin)]
DB = Annotated[Session, Depends(get_db)]

PLANILLAS_INICIALES = ["MANTENIMIENTO", "RTC"]

# Estructura organizacional real de la empresa. Global es la única caja que se
# subdivide en tarjetas; las dos uniones temporales llevan inventario directo.
EMPRESA_GLOBAL_NOMBRE = "Global Security Bank SAS"
EMPRESAS_INICIALES = [
    (EMPRESA_GLOBAL_NOMBRE, TIPO_EMPRESA_GLOBAL, 1),
    ("Unión Temporal Mantenimiento 2024 GSB_SDSS", "union_temporal", 2),
    ("Unión Temporal RTC", "union_temporal", 3),
]
CLIENTES_GLOBAL_INICIALES = ["Zeus", "Oberon", "Securitas", "Electronic Servis Securitas"]


def seed_estructura_inventario(db: Session) -> None:
    """Siembra empresas y tarjetas, y adopta bajo Global las planillas antiguas.

    Idempotente: se ejecuta en cada arranque, como el resto de los seeds. Las
    planillas que ya existían (MANTENIMIENTO, RTC, ...) son categorías internas
    de Global y quedan con cliente_id = NULL: no se reasignan a ninguna tarjeta
    ni a las uniones temporales del mismo nombre.
    """
    try:
        for nombre, tipo, orden in EMPRESAS_INICIALES:
            existente = db.scalar(
                select(InventarioEmpresa).where(InventarioEmpresa.nombre == nombre)
            )
            if not existente:
                db.add(InventarioEmpresa(nombre=nombre, tipo=tipo, orden=orden))
        db.flush()

        empresa_global = db.scalar(
            select(InventarioEmpresa).where(InventarioEmpresa.nombre == EMPRESA_GLOBAL_NOMBRE)
        )
        if empresa_global:
            for i, nombre in enumerate(CLIENTES_GLOBAL_INICIALES, start=1):
                existente = db.scalar(
                    select(InventarioCliente).where(
                        InventarioCliente.empresa_id == empresa_global.id,
                        InventarioCliente.nombre == nombre,
                    )
                )
                if not existente:
                    db.add(
                        InventarioCliente(
                            empresa_id=empresa_global.id, nombre=nombre, orden=i
                        )
                    )

            huerfanas = db.scalars(
                select(InventarioPlanilla).where(InventarioPlanilla.empresa_id.is_(None))
            ).all()
            for planilla in huerfanas:
                planilla.empresa_id = empresa_global.id
                planilla.cliente_id = None
            if huerfanas:
                print(
                    f"[STARTUP] {len(huerfanas)} planilla(s) de inventario adoptadas por "
                    f"'{EMPRESA_GLOBAL_NOMBRE}'."
                )

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[STARTUP] Advertencia al sembrar la estructura de inventario: {e}")


def seed_planillas_inventario_si_vacio(db: Session) -> None:
    """Crea las planillas base la primera vez. Idempotente.

    Se ejecuta después de seed_estructura_inventario para que las planillas
    nazcan ya colgadas de Global.
    """
    try:
        ya_hay = db.scalar(select(func.count(InventarioPlanilla.id)))
        if ya_hay:
            return
        empresa_global = db.scalar(
            select(InventarioEmpresa).where(InventarioEmpresa.nombre == EMPRESA_GLOBAL_NOMBRE)
        )
        for nombre in PLANILLAS_INICIALES:
            db.add(
                InventarioPlanilla(
                    nombre=nombre,
                    empresa_id=empresa_global.id if empresa_global else None,
                    cliente_id=None,
                )
            )
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
        empresa_id=item.planilla.empresa_id if item.planilla else None,
        empresa_nombre=(
            item.planilla.empresa.nombre if item.planilla and item.planilla.empresa else None
        ),
        cliente_id=item.planilla.cliente_id if item.planilla else None,
        cliente_nombre=(
            item.planilla.cliente.nombre if item.planilla and item.planilla.cliente else None
        ),
        stock_actual=item.stock_actual,
        foto_referencia_url=item.foto_referencia_url,
        creado_en=item.creado_en,
        actualizado_en=item.actualizado_en,
    )


def _a_movimiento_response(
    mov: InventarioMovimiento,
    usuario_nombre: Optional[str] = None,
    traspaso_contraparte: Optional[str] = None,
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
        traspaso_id=mov.traspaso_id,
        traspaso_contraparte=traspaso_contraparte,
    )


def _items_vivos_stmt():
    return (
        select(InventarioItem)
        .options(
            selectinload(InventarioItem.planilla).selectinload(InventarioPlanilla.empresa),
            selectinload(InventarioItem.planilla).selectinload(InventarioPlanilla.cliente),
        )
        .where(InventarioItem.eliminado_en.is_(None))
    )


# -----------------------------------------------------------------------------
# SCOPE ORGANIZACIONAL (empresa / tarjeta)
# -----------------------------------------------------------------------------
# El scope vive únicamente en la planilla; los ítems lo heredan. Todos los
# listados aceptan empresa_id/cliente_id y filtran por ahí, así que un ítem de
# Zeus nunca aparece en el inventario de Oberon.
#
# NOTA DE PERMISOS: por ahora el gateo sigue siendo el plano de accesos_procesos
# ("IN": admin/lector) más superadmin y Master, que ven y operan todas las
# entidades. La pertenencia de un usuario a una empresa/tarjeta todavía no
# existe en el modelo Usuario y está pendiente de definición.
Scope = tuple[InventarioEmpresa, Optional[InventarioCliente]]


def _resolver_scope(
    db: Session, empresa_id: int, cliente_id: Optional[int]
) -> Scope:
    """Valida el par (empresa, tarjeta) y devuelve las entidades resueltas."""
    empresa = db.get(InventarioEmpresa, empresa_id)
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="La empresa indicada no existe."
        )

    if cliente_id is None:
        return empresa, None

    if empresa.tipo != TIPO_EMPRESA_GLOBAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{empresa.nombre}' maneja su inventario directamente y no tiene tarjetas. "
                "No indiques una tarjeta para esta empresa."
            ),
        )

    cliente = db.get(InventarioCliente, cliente_id)
    if not cliente or cliente.empresa_id != empresa.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La tarjeta indicada no existe o no pertenece a esa empresa.",
        )
    return empresa, cliente


def _filtros_scope(empresa_id: Optional[int], cliente_id: Optional[int]) -> list:
    """Condiciones sobre InventarioPlanilla para acotar una consulta a una entidad.

    Sin empresa_id no filtra nada: es la vista consolidada que solo alcanzan
    superadmin, Master y los lectores del proceso IN.
    """
    filtros = []
    if empresa_id is not None:
        filtros.append(InventarioPlanilla.empresa_id == empresa_id)
        # cliente_id None es un filtro real ("inventario directo de la caja"),
        # no la ausencia de filtro: por eso se compara explícitamente con NULL.
        if cliente_id is None:
            filtros.append(InventarioPlanilla.cliente_id.is_(None))
        else:
            filtros.append(InventarioPlanilla.cliente_id == cliente_id)
    return filtros


def _tiene_acceso_total(usuario: Usuario) -> bool:
    """superadmin y la cuenta Master ven y operan todas las entidades."""
    correo = (usuario.correo or "").strip().lower()
    return usuario.rol == "superadmin" or correo == "pilaradmin@gsbank.com"


def _asignaciones_de(db: Session, usuario: Usuario) -> list[InventarioUsuarioAsignado]:
    """Asignaciones del usuario, memorizadas por petición.

    El resultado se guarda en la instancia porque un mismo endpoint consulta el
    nivel varias veces (validar el scope, y luego marcar cada entidad).
    """
    cache = usuario.__dict__.get("_asignaciones_inventario")
    if cache is None:
        cache = db.scalars(
            select(InventarioUsuarioAsignado).where(
                InventarioUsuarioAsignado.usuario_id == usuario.id
            )
        ).all()
        usuario.__dict__["_asignaciones_inventario"] = cache
    return cache


def _nivel_en_entidad(
    db: Session, usuario: Usuario, empresa_id: Optional[int], cliente_id: Optional[int]
) -> str:
    """Nivel del usuario sobre una entidad: 'ninguno', 'lector' o 'admin'.

    Un usuario SIN ninguna asignación conserva el acceso plano anterior (el que
    le dé accesos_procesos['IN']): así activar esta tabla no deja fuera de un
    día para otro a quien ya trabajaba en el módulo. En cuanto se le asigna al
    menos una entidad, queda restringido a las suyas.
    """
    if _tiene_acceso_total(usuario):
        return "admin"

    asignaciones = _asignaciones_de(db, usuario)
    if not asignaciones:
        accesos = usuario.__dict__.get("_accesos_procesos") or {}
        return accesos.get("IN", "lector")

    if empresa_id is None:
        # Sin entidad concreta no hay vista consolidada para un usuario acotado.
        return "ninguno"

    for a in asignaciones:
        if a.empresa_id == empresa_id and a.cliente_id == cliente_id:
            return a.nivel
    return "ninguno"


def _exigir_entidad(
    db: Session,
    usuario: Usuario,
    empresa_id: Optional[int],
    cliente_id: Optional[int],
    nivel_minimo: str = "lector",
) -> None:
    """403 si el usuario no alcanza `nivel_minimo` sobre esa entidad."""
    if empresa_id is None and not _tiene_acceso_total(usuario):
        # La vista sin entidad es el consolidado de TODO el inventario.
        if _asignaciones_de(db, usuario):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Solo puedes consultar el inventario de las entidades que tienes "
                    "asignadas. Indica una empresa."
                ),
            )
        return

    nivel = _nivel_en_entidad(db, usuario, empresa_id, cliente_id)
    if NIVELES_ENTIDAD.get(nivel, 0) < NIVELES_ENTIDAD[nivel_minimo]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"No tienes acceso de {nivel_minimo} al inventario de esta entidad. "
                "Solicítalo a la Administradora Master."
            ),
        )


def _exigir_entidad_de_item(
    db: Session, usuario: Usuario, item: InventarioItem, nivel_minimo: str = "lector"
) -> None:
    """Misma comprobación, tomando la entidad de la planilla del ítem."""
    _exigir_entidad(
        db,
        usuario,
        item.planilla.empresa_id if item.planilla else None,
        item.planilla.cliente_id if item.planilla else None,
        nivel_minimo,
    )


def _etiqueta_entidad(
    empresa: Optional[InventarioEmpresa], cliente: Optional[InventarioCliente]
) -> str:
    if not empresa:
        return "entidad desconocida"
    return f"{empresa.nombre} · {cliente.nombre}" if cliente else empresa.nombre


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


def _verificar_codigo_disponible(
    db: Session,
    codigo: Optional[str],
    empresa_id: Optional[int],
    cliente_id: Optional[int],
    excluir_id: Optional[int] = None,
) -> None:
    """El código identifica al ítem dentro de su entidad.

    La unicidad es por entidad y no global a propósito: un traspaso crea en el
    destino un ítem con el mismo código que el de origen, que es justamente lo
    que permite reconocerlo como "el mismo elemento" en la otra caja.
    """
    if not codigo:
        return
    filtros = [
        func.upper(InventarioItem.codigo) == codigo.strip().upper(),
        InventarioItem.eliminado_en.is_(None),
        *_filtros_scope(empresa_id, cliente_id),
    ]
    if excluir_id:
        filtros.append(InventarioItem.id != excluir_id)

    existente = db.scalar(
        select(InventarioItem)
        .join(InventarioPlanilla, InventarioPlanilla.id == InventarioItem.planilla_id)
        .where(*filtros)
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El código '{codigo}' ya está asignado a '{existente.descripcion}' en esta entidad. "
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
def _a_planilla_response(
    planilla: InventarioPlanilla, total_items: int = 0, total_unidades: int = 0
) -> PlanillaResponse:
    return PlanillaResponse(
        id=planilla.id,
        nombre=planilla.nombre,
        descripcion=planilla.descripcion,
        activa=planilla.activa,
        creado_en=planilla.creado_en,
        empresa_id=planilla.empresa_id,
        empresa_nombre=planilla.empresa.nombre if planilla.empresa else None,
        cliente_id=planilla.cliente_id,
        cliente_nombre=planilla.cliente.nombre if planilla.cliente else None,
        total_items=total_items,
        total_unidades=total_unidades,
    )


@router.get("/planillas", response_model=List[PlanillaResponse])
def listar_planillas(
    db: DB,
    current_user: CurrentUser,
    incluir_inactivas: bool = Query(False),
    empresa_id: Optional[int] = Query(None, description="Acota a una empresa de la jerarquía"),
    cliente_id: Optional[int] = Query(
        None, description="Acota a una tarjeta de Global; omitir = inventario directo de la caja"
    ),
):
    _exigir_entidad(db, current_user, empresa_id, cliente_id)

    stmt = (
        select(InventarioPlanilla)
        .options(
            selectinload(InventarioPlanilla.empresa),
            selectinload(InventarioPlanilla.cliente),
        )
        .where(*_filtros_scope(empresa_id, cliente_id))
        .order_by(InventarioPlanilla.nombre)
    )
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
        _a_planilla_response(p, *conteos.get(p.id, (0, 0)))
        for p in planillas
    ]


@router.post("/planillas", response_model=PlanillaResponse, status_code=status.HTTP_201_CREATED)
def crear_planilla(datos: PlanillaCreate, db: DB, current_user: AdminIN):
    empresa, cliente = _resolver_scope(db, datos.empresa_id, datos.cliente_id)
    _exigir_entidad(db, current_user, empresa.id, cliente.id if cliente else None, "admin")

    # El nombre solo tiene que ser único dentro de la entidad: dos tarjetas
    # pueden tener cada una su planilla "GENERAL".
    existente = db.scalar(
        select(InventarioPlanilla).where(
            InventarioPlanilla.nombre == datos.nombre,
            *_filtros_scope(empresa.id, cliente.id if cliente else None),
        )
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Ya existe una planilla llamada '{datos.nombre}' en "
                f"{_etiqueta_entidad(empresa, cliente)}."
            ),
        )

    planilla = InventarioPlanilla(
        nombre=datos.nombre,
        descripcion=datos.descripcion,
        empresa_id=empresa.id,
        cliente_id=cliente.id if cliente else None,
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
        detalle=(
            f"Creó la planilla de inventario '{planilla.nombre}' (id={planilla.id}) en "
            f"{_etiqueta_entidad(empresa, cliente)}."
        ),
        resultado="exitoso",
    )

    return _a_planilla_response(planilla)


@router.put("/planillas/{planilla_id}", response_model=PlanillaResponse)
def actualizar_planilla(planilla_id: int, datos: PlanillaUpdate, db: DB, current_user: AdminIN):
    planilla = db.get(InventarioPlanilla, planilla_id)
    if not planilla:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planilla no encontrada.")

    _exigir_entidad(db, current_user, planilla.empresa_id, planilla.cliente_id, "admin")

    if datos.nombre and datos.nombre != planilla.nombre:
        duplicada = db.scalar(
            select(InventarioPlanilla).where(
                InventarioPlanilla.nombre == datos.nombre,
                *_filtros_scope(planilla.empresa_id, planilla.cliente_id),
            )
        )
        if duplicada:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Ya existe una planilla llamada '{datos.nombre}' en "
                    f"{_etiqueta_entidad(planilla.empresa, planilla.cliente)}."
                ),
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
    return _a_planilla_response(planilla, total_items, total_unidades)


# -----------------------------------------------------------------------------
# ÍTEMS
# -----------------------------------------------------------------------------
@router.get("/items", response_model=ItemListResponse)
def listar_items(
    db: DB,
    current_user: CurrentUser,
    q: Optional[str] = Query(None, description="Busca en descripción, código y marca"),
    planilla_id: Optional[int] = Query(None),
    empresa_id: Optional[int] = Query(None, description="Acota a una empresa de la jerarquía"),
    cliente_id: Optional[int] = Query(
        None, description="Acota a una tarjeta de Global; omitir = inventario directo de la caja"
    ),
    solo_con_stock: bool = Query(False),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    _exigir_entidad(db, current_user, empresa_id, cliente_id)

    filtros = [InventarioItem.eliminado_en.is_(None), *_filtros_scope(empresa_id, cliente_id)]
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

    total = (
        db.scalar(
            select(func.count(InventarioItem.id))
            .join(InventarioPlanilla, InventarioPlanilla.id == InventarioItem.planilla_id)
            .where(*filtros)
        )
        or 0
    )
    items = db.scalars(
        _items_vivos_stmt()
        .join(InventarioPlanilla, InventarioPlanilla.id == InventarioItem.planilla_id)
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
    empresa_id: Optional[int] = Query(None, description="Acota a una empresa de la jerarquía"),
    cliente_id: Optional[int] = Query(
        None, description="Acota a una tarjeta de Global; omitir = inventario directo de la caja"
    ),
):
    """Advierte, antes de crear, si el ítem ya existe con otra redacción.

    Solo mira dentro de la misma entidad: que Zeus tenga el elemento no es un
    duplicado cuando se está capturando en Oberon.
    """
    _exigir_entidad(db, current_user, empresa_id, cliente_id)

    stmt = (
        _items_vivos_stmt()
        .join(InventarioPlanilla, InventarioPlanilla.id == InventarioItem.planilla_id)
        .where(*_filtros_scope(empresa_id, cliente_id))
    )
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

    _exigir_entidad(db, current_user, planilla.empresa_id, planilla.cliente_id)
    _verificar_codigo_disponible(db, datos.codigo, planilla.empresa_id, planilla.cliente_id)

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
            f"en la planilla '{planilla.nombre}' de {_etiqueta_entidad(planilla.empresa, planilla.cliente)} "
            f"con stock inicial {item.stock_actual}."
        ),
        resultado="exitoso",
    )

    return _a_item_response(item)


@router.put("/items/{item_id}", response_model=ItemResponse)
def actualizar_item(item_id: int, datos: ItemUpdate, db: DB, current_user: AdminIN):
    item = _obtener_item_o_404(db, item_id)
    _exigir_entidad_de_item(db, current_user, item, "admin")

    if datos.planilla_id and datos.planilla_id != item.planilla_id:
        destino = db.get(InventarioPlanilla, datos.planilla_id)
        if not destino or not destino.activa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La planilla de destino no existe o está inactiva.",
            )
        # Cambiar de planilla es reclasificar, no mover de entidad: sacar un ítem
        # de su empresa/tarjeta por aquí sería un traspaso encubierto, sin kardex
        # y sin trazabilidad. Para eso está POST /inventario/traspasos.
        if (
            destino.empresa_id != item.planilla.empresa_id
            or destino.cliente_id != item.planilla.cliente_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "No puedes mover un ítem a una planilla de otra entidad desde aquí. "
                    "Usa un traspaso para que el movimiento quede registrado en el kardex "
                    "de origen y de destino."
                ),
            )

    if "codigo" in datos.model_fields_set and datos.codigo != item.codigo:
        _verificar_codigo_disponible(
            db,
            datos.codigo,
            item.planilla.empresa_id,
            item.planilla.cliente_id,
            excluir_id=item.id,
        )

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
def eliminar_item(item_id: int, db: DB, current_user: AdminIN):
    """Soft-delete: el ítem deja de listarse pero su kardex se conserva."""
    item = _obtener_item_o_404(db, item_id)
    _exigir_entidad_de_item(db, current_user, item, "admin")
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
    _exigir_entidad_de_item(db, current_user, item)
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
    _exigir_entidad_de_item(db, current_user, item)
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


def _contrapartes_traspaso(db: Session, movimientos, item_id: int) -> dict[int, str]:
    """Etiqueta "vino de / fue a [entidad]" para los movimientos de traspaso.

    Se calcula desde el punto de vista del ítem cuyo kardex se está leyendo: el
    mismo traspaso se lee como salida en origen y como entrada en destino.
    """
    ids = {m.traspaso_id for m in movimientos if m.traspaso_id}
    if not ids:
        return {}

    traspasos = db.scalars(
        select(InventarioTraspaso)
        .options(
            selectinload(InventarioTraspaso.empresa_origen),
            selectinload(InventarioTraspaso.cliente_origen),
            selectinload(InventarioTraspaso.empresa_destino),
            selectinload(InventarioTraspaso.cliente_destino),
        )
        .where(InventarioTraspaso.id.in_(ids))
    ).all()
    por_id = {t.id: t for t in traspasos}

    etiquetas: dict[int, str] = {}
    for mov in movimientos:
        traspaso = por_id.get(mov.traspaso_id) if mov.traspaso_id else None
        if not traspaso:
            continue
        origen = _etiqueta_entidad(traspaso.empresa_origen, traspaso.cliente_origen)
        destino = _etiqueta_entidad(traspaso.empresa_destino, traspaso.cliente_destino)
        if traspaso.item_origen_id == item_id:
            etiquetas[mov.id] = (
                f"Devuelto por rechazo de {destino}"
                if traspaso.estado == "rechazado" and mov.tipo not in TIPOS_MOVIMIENTO_SALIDA
                else f"Fue a {destino}"
            )
        else:
            etiquetas[mov.id] = f"Vino de {origen}"
    return etiquetas


@router.get("/items/{item_id}/kardex", response_model=KardexResponse)
def obtener_kardex(item_id: int, db: DB, current_user: CurrentUser):
    item = _obtener_item_o_404(db, item_id)
    _exigir_entidad_de_item(db, current_user, item)

    filas = db.execute(
        select(InventarioMovimiento, Usuario.nombre)
        .join(Usuario, Usuario.id == InventarioMovimiento.usuario_id)
        .where(InventarioMovimiento.item_id == item_id)
        .order_by(InventarioMovimiento.fecha.desc(), InventarioMovimiento.id.desc())
    ).all()

    contrapartes = _contrapartes_traspaso(db, [mov for mov, _ in filas], item_id)

    return KardexResponse(
        item=_a_item_response(item),
        movimientos=[
            _a_movimiento_response(mov, nombre, contrapartes.get(mov.id))
            for mov, nombre in filas
        ],
    )


# -----------------------------------------------------------------------------
# REPORTE CONSOLIDADO (panel de supervisión CI)
# -----------------------------------------------------------------------------
@router.get("/reportes/global", response_model=ReporteGlobalResponse)
def reporte_global(
    db: DB,
    current_user: LectorIN,
    empresa_id: Optional[int] = Query(None, description="Acota a una empresa de la jerarquía"),
    cliente_id: Optional[int] = Query(
        None, description="Acota a una tarjeta de Global; omitir = inventario directo de la caja"
    ),
):
    """Consolidado. Sin empresa_id devuelve el total de todas las entidades.

    La vista sin entidad queda reservada a quien tiene acceso total: un usuario
    asignado a Zeus no puede pedir el consolidado de toda la empresa.
    """
    _exigir_entidad(db, current_user, empresa_id, cliente_id)
    filtros_scope = _filtros_scope(empresa_id, cliente_id)

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
        .where(*filtros_scope)
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

    stmt_movimientos = select(func.count(InventarioMovimiento.id))
    if filtros_scope:
        stmt_movimientos = (
            stmt_movimientos.join(
                InventarioItem, InventarioItem.id == InventarioMovimiento.item_id
            )
            .join(InventarioPlanilla, InventarioPlanilla.id == InventarioItem.planilla_id)
            .where(*filtros_scope)
        )
    total_movimientos = db.scalar(stmt_movimientos) or 0

    return ReporteGlobalResponse(
        total_items=sum(p.total_items for p in por_planilla),
        total_unidades=sum(p.total_unidades for p in por_planilla),
        items_en_cero=sum(p.items_en_cero for p in por_planilla),
        total_movimientos=total_movimientos,
        por_planilla=por_planilla,
    )



# -----------------------------------------------------------------------------
# JERARQUÍA EMPRESARIAL
# -----------------------------------------------------------------------------
# Global Security Bank SAS se subdivide en tarjetas (Zeus, Oberon, Securitas,
# Electronic Servis Securitas), cada una con inventario propio e independiente.
# Las dos uniones temporales llevan su inventario directo a nivel de empresa.
def _totales_por_scope(db: Session) -> dict[tuple[Optional[int], Optional[int]], tuple[int, int]]:
    """Ítems y unidades agrupados por (empresa_id, cliente_id), en una consulta."""
    filas = db.execute(
        select(
            InventarioPlanilla.empresa_id,
            InventarioPlanilla.cliente_id,
            func.count(InventarioItem.id),
            func.coalesce(func.sum(InventarioItem.stock_actual), 0),
        )
        .select_from(InventarioPlanilla)
        .outerjoin(
            InventarioItem,
            (InventarioItem.planilla_id == InventarioPlanilla.id)
            & (InventarioItem.eliminado_en.is_(None)),
        )
        .group_by(InventarioPlanilla.empresa_id, InventarioPlanilla.cliente_id)
    ).all()
    return {(e, c): (int(n), int(u)) for e, c, n, u in filas}


@router.get("/empresas", response_model=List[EmpresaResponse])
def listar_empresas(db: DB, current_user: CurrentUser):
    """Primer nivel de navegación del módulo, con sus tarjetas ya anidadas."""
    empresas = db.scalars(
        select(InventarioEmpresa)
        .options(selectinload(InventarioEmpresa.clientes))
        .order_by(InventarioEmpresa.orden, InventarioEmpresa.nombre)
    ).all()
    totales = _totales_por_scope(db)

    respuesta = []
    for empresa in empresas:
        clientes = []
        if empresa.tipo == TIPO_EMPRESA_GLOBAL:
            for cliente in empresa.clientes:
                n_items, unidades = totales.get((empresa.id, cliente.id), (0, 0))
                nivel_cliente = _nivel_en_entidad(db, current_user, empresa.id, cliente.id)
                clientes.append(
                    ClienteResponse(
                        id=cliente.id,
                        empresa_id=cliente.empresa_id,
                        nombre=cliente.nombre,
                        orden=cliente.orden,
                        total_items=n_items,
                        total_unidades=unidades,
                        nivel=nivel_cliente,
                        accesible=nivel_cliente != "ninguno",
                    )
                )

        # Total de la caja: lo suyo directo (cliente_id NULL) más lo de sus tarjetas.
        directo = totales.get((empresa.id, None), (0, 0))
        nivel_directo = _nivel_en_entidad(db, current_user, empresa.id, None)
        # Global es "entrable" si el usuario alcanza alguna de sus tarjetas,
        # aunque no tenga nada sobre su inventario general.
        accesible = nivel_directo != "ninguno" or any(c.accesible for c in clientes)
        respuesta.append(
            EmpresaResponse(
                id=empresa.id,
                nombre=empresa.nombre,
                tipo=empresa.tipo,
                orden=empresa.orden,
                clientes=clientes,
                total_items=directo[0] + sum(c.total_items for c in clientes),
                total_unidades=directo[1] + sum(c.total_unidades for c in clientes),
                total_items_directo=directo[0],
                total_unidades_directo=directo[1],
                nivel=nivel_directo,
                accesible=accesible,
            )
        )
    return respuesta


@router.get("/empresas/{empresa_id}/clientes", response_model=List[ClienteResponse])
def listar_clientes(empresa_id: int, db: DB, current_user: CurrentUser):
    """Tarjetas de una empresa. Las uniones temporales devuelven lista vacía."""
    empresa = db.get(InventarioEmpresa, empresa_id)
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="La empresa indicada no existe."
        )
    if empresa.tipo != TIPO_EMPRESA_GLOBAL:
        return []

    totales = _totales_por_scope(db)
    clientes = db.scalars(
        select(InventarioCliente)
        .where(InventarioCliente.empresa_id == empresa.id)
        .order_by(InventarioCliente.orden, InventarioCliente.nombre)
    ).all()

    respuesta = []
    for c in clientes:
        nivel = _nivel_en_entidad(db, current_user, empresa.id, c.id)
        respuesta.append(
            ClienteResponse(
                id=c.id,
                empresa_id=c.empresa_id,
                nombre=c.nombre,
                orden=c.orden,
                total_items=totales.get((empresa.id, c.id), (0, 0))[0],
                total_unidades=totales.get((empresa.id, c.id), (0, 0))[1],
                nivel=nivel,
                accesible=nivel != "ninguno",
            )
        )
    return respuesta


# -----------------------------------------------------------------------------
# TRASPASOS ENTRE ENTIDADES
# -----------------------------------------------------------------------------
# Un traspaso mueve stock real de una entidad a otra. El descuento en origen se
# aplica al crear la solicitud, no al aprobarla: si se dejara "reservado", un
# traspaso olvidado mostraría en origen unidades que físicamente ya salieron.
# Si el destino rechaza, el descuento se revierte con un movimiento de reverso.
def _a_traspaso_response(traspaso: InventarioTraspaso) -> TraspasoResponse:
    item = traspaso.item_origen
    return TraspasoResponse(
        id=traspaso.id,
        estado=traspaso.estado,
        cantidad=traspaso.cantidad,
        item_origen_id=traspaso.item_origen_id,
        item_destino_id=traspaso.item_destino_id,
        item_descripcion=item.descripcion if item else None,
        item_codigo=item.codigo if item else None,
        empresa_origen_id=traspaso.empresa_origen_id,
        empresa_origen_nombre=traspaso.empresa_origen.nombre if traspaso.empresa_origen else None,
        cliente_origen_id=traspaso.cliente_origen_id,
        cliente_origen_nombre=traspaso.cliente_origen.nombre if traspaso.cliente_origen else None,
        empresa_destino_id=traspaso.empresa_destino_id,
        empresa_destino_nombre=(
            traspaso.empresa_destino.nombre if traspaso.empresa_destino else None
        ),
        cliente_destino_id=traspaso.cliente_destino_id,
        cliente_destino_nombre=(
            traspaso.cliente_destino.nombre if traspaso.cliente_destino else None
        ),
        solicitado_por_id=traspaso.solicitado_por_id,
        fecha_solicitud=traspaso.fecha_solicitud,
        aprobado_por_id=traspaso.aprobado_por_id,
        fecha_completado=traspaso.fecha_completado,
        notas=traspaso.notas,
    )


def _traspasos_stmt():
    return select(InventarioTraspaso).options(
        selectinload(InventarioTraspaso.item_origen),
        selectinload(InventarioTraspaso.empresa_origen),
        selectinload(InventarioTraspaso.cliente_origen),
        selectinload(InventarioTraspaso.empresa_destino),
        selectinload(InventarioTraspaso.cliente_destino),
    )


def _nombres_usuarios(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    filas = db.execute(select(Usuario.id, Usuario.nombre).where(Usuario.id.in_(ids))).all()
    return {uid: nombre for uid, nombre in filas}


def _planilla_destino_para(
    db: Session, item_origen: InventarioItem, empresa_id: int, cliente_id: Optional[int]
) -> InventarioPlanilla:
    """Planilla del destino donde debe aterrizar el ítem traspasado.

    Se conserva el nombre de la planilla de origen para que la clasificación
    (MANTENIMIENTO, RTC, ...) siga significando lo mismo del otro lado; si esa
    planilla no existe todavía en el destino, se crea.
    """
    nombre = item_origen.planilla.nombre
    planilla = db.scalar(
        select(InventarioPlanilla).where(
            InventarioPlanilla.nombre == nombre,
            *_filtros_scope(empresa_id, cliente_id),
        )
    )
    if planilla:
        if not planilla.activa:
            planilla.activa = True
        return planilla

    planilla = InventarioPlanilla(
        nombre=nombre,
        empresa_id=empresa_id,
        cliente_id=cliente_id,
        descripcion="Creada automáticamente al recibir un traspaso.",
    )
    db.add(planilla)
    db.flush()
    return planilla


@router.post("/traspasos", response_model=TraspasoResponse, status_code=status.HTTP_201_CREATED)
def crear_traspaso(datos: TraspasoCreate, db: DB, current_user: AdminIN):
    """Solicita el traspaso y descuenta de inmediato el stock del origen."""
    item = _obtener_item_o_404(db, datos.item_origen_id)
    if not item.planilla or item.planilla.empresa_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El ítem no está asignado a ninguna entidad; no se puede traspasar.",
        )

    # Enviar es una decisión del origen: basta con ser administrador allí. La
    # recepción la aprueba después un administrador del destino.
    _exigir_entidad_de_item(db, current_user, item, "admin")

    empresa_destino, cliente_destino = _resolver_scope(
        db, datos.empresa_destino_id, datos.cliente_destino_id
    )
    cliente_destino_id = cliente_destino.id if cliente_destino else None

    if (
        item.planilla.empresa_id == empresa_destino.id
        and item.planilla.cliente_id == cliente_destino_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El origen y el destino del traspaso son la misma entidad.",
        )

    traspaso = InventarioTraspaso(
        item_origen_id=item.id,
        empresa_origen_id=item.planilla.empresa_id,
        cliente_origen_id=item.planilla.cliente_id,
        empresa_destino_id=empresa_destino.id,
        cliente_destino_id=cliente_destino_id,
        cantidad=datos.cantidad,
        estado="pendiente",
        solicitado_por_id=current_user.id,
        notas=datos.notas,
    )
    db.add(traspaso)
    db.flush()

    etiqueta_destino = _etiqueta_entidad(empresa_destino, cliente_destino)
    etiqueta_origen = _etiqueta_entidad(item.planilla.empresa, item.planilla.cliente)
    # _aplicar_movimiento valida el stock y aborta con 400 si no alcanza.
    movimiento = _aplicar_movimiento(
        db,
        item,
        tipo="traspaso_salida",
        cantidad=datos.cantidad,
        usuario=current_user,
        observacion=f"Traspaso #{traspaso.id} hacia {etiqueta_destino}.",
    )
    movimiento.traspaso_id = traspaso.id

    db.commit()
    db.refresh(traspaso)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_CREAR_TRASPASO",
        detalle=(
            f"Solicitó el traspaso #{traspaso.id} de {datos.cantidad} und. de "
            f"'{item.descripcion}' desde {etiqueta_origen} hacia {etiqueta_destino}."
        ),
        resultado="exitoso",
    )

    return _a_traspaso_response(traspaso)


@router.get("/traspasos", response_model=List[TraspasoResponse])
def listar_traspasos(
    db: DB,
    current_user: CurrentUser,
    empresa_id: Optional[int] = Query(None, description="Entidad implicada (origen o destino)"),
    cliente_id: Optional[int] = Query(None, description="Tarjeta implicada (origen o destino)"),
    estado: Optional[str] = Query(None, description="pendiente | completado | rechazado"),
    limit: int = Query(100, ge=1, le=500),
):
    """Traspasos de una entidad, tanto los que envía como los que recibe."""
    _exigir_entidad(db, current_user, empresa_id, cliente_id)

    stmt = _traspasos_stmt()

    if empresa_id is not None:
        como_origen = InventarioTraspaso.empresa_origen_id == empresa_id
        como_destino = InventarioTraspaso.empresa_destino_id == empresa_id
        if cliente_id is None:
            como_origen = como_origen & InventarioTraspaso.cliente_origen_id.is_(None)
            como_destino = como_destino & InventarioTraspaso.cliente_destino_id.is_(None)
        else:
            como_origen = como_origen & (InventarioTraspaso.cliente_origen_id == cliente_id)
            como_destino = como_destino & (InventarioTraspaso.cliente_destino_id == cliente_id)
        stmt = stmt.where(or_(como_origen, como_destino))

    if estado:
        stmt = stmt.where(InventarioTraspaso.estado == estado)

    traspasos = db.scalars(
        # id como desempate: varios traspasos pueden compartir el segundo.
        stmt.order_by(
            InventarioTraspaso.fecha_solicitud.desc(), InventarioTraspaso.id.desc()
        ).limit(limit)
    ).all()

    nombres = _nombres_usuarios(
        db,
        [t.solicitado_por_id for t in traspasos] + [t.aprobado_por_id for t in traspasos],
    )
    respuestas = []
    for t in traspasos:
        respuesta = _a_traspaso_response(t)
        respuesta.solicitado_por_nombre = nombres.get(t.solicitado_por_id)
        respuesta.aprobado_por_nombre = nombres.get(t.aprobado_por_id)
        respuestas.append(respuesta)
    return respuestas


def _obtener_traspaso_pendiente(db: Session, traspaso_id: int) -> InventarioTraspaso:
    traspaso = db.scalar(_traspasos_stmt().where(InventarioTraspaso.id == traspaso_id))
    if not traspaso:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="El traspaso no existe."
        )
    if traspaso.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El traspaso #{traspaso.id} ya está {traspaso.estado}.",
        )
    return traspaso


@router.put("/traspasos/{traspaso_id}/aprobar", response_model=TraspasoResponse)
def aprobar_traspaso(
    traspaso_id: int, db: DB, current_user: AdminIN, datos: Optional[TraspasoResolucion] = None
):
    """Confirma la recepción en destino y genera la entrada correspondiente."""
    traspaso = _obtener_traspaso_pendiente(db, traspaso_id)
    # Decide quien recibe: el origen ya descontó su stock al solicitarlo.
    _exigir_entidad(
        db, current_user, traspaso.empresa_destino_id, traspaso.cliente_destino_id, "admin"
    )
    item_origen = db.scalar(
        _items_vivos_stmt().where(InventarioItem.id == traspaso.item_origen_id)
    )
    if not item_origen:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El ítem de origen del traspaso ya no está disponible.",
        )

    etiqueta_origen = _etiqueta_entidad(traspaso.empresa_origen, traspaso.cliente_origen)

    # Si el destino ya tiene el mismo código, se suma sobre ese ítem; si no, se
    # crea uno nuevo copiando la ficha del origen.
    item_destino = None
    if item_origen.codigo:
        item_destino = db.scalar(
            _items_vivos_stmt()
            .join(InventarioPlanilla, InventarioPlanilla.id == InventarioItem.planilla_id)
            .where(
                func.upper(InventarioItem.codigo) == item_origen.codigo.strip().upper(),
                *_filtros_scope(traspaso.empresa_destino_id, traspaso.cliente_destino_id),
            )
        )

    if item_destino:
        tipo_entrada = "traspaso_entrada"
    else:
        planilla_destino = _planilla_destino_para(
            db, item_origen, traspaso.empresa_destino_id, traspaso.cliente_destino_id
        )
        item_destino = InventarioItem(
            codigo=item_origen.codigo,
            descripcion=item_origen.descripcion,
            marca=item_origen.marca,
            planilla_id=planilla_destino.id,
            stock_actual=0,
            foto_referencia_url=item_origen.foto_referencia_url,
            creado_por_id=current_user.id,
        )
        db.add(item_destino)
        db.flush()
        # El ítem nace con el traspaso: su primer movimiento es el ajuste inicial
        # que lo trae, no una entrada sobre un stock previo.
        tipo_entrada = "ajuste_inicial"

    movimiento = _aplicar_movimiento(
        db,
        item_destino,
        tipo=tipo_entrada,
        cantidad=traspaso.cantidad,
        usuario=current_user,
        observacion=f"Traspaso #{traspaso.id} recibido desde {etiqueta_origen}.",
    )
    movimiento.traspaso_id = traspaso.id

    traspaso.item_destino_id = item_destino.id
    traspaso.estado = "completado"
    traspaso.aprobado_por_id = current_user.id
    traspaso.fecha_completado = datetime.now()
    if datos and datos.notas:
        traspaso.notas = datos.notas

    etiqueta_destino = _etiqueta_entidad(traspaso.empresa_destino, traspaso.cliente_destino)
    descripcion_item = item_origen.descripcion
    item_destino_id = item_destino.id

    db.commit()
    db.refresh(traspaso)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_APROBAR_TRASPASO",
        detalle=(
            f"Aprobó el traspaso #{traspaso.id}: {traspaso.cantidad} und. de "
            f"'{descripcion_item}' recibidas en {etiqueta_destino} "
            f"(ítem destino id={item_destino_id})."
        ),
        resultado="exitoso",
    )

    return _a_traspaso_response(traspaso)


@router.put("/traspasos/{traspaso_id}/rechazar", response_model=TraspasoResponse)
def rechazar_traspaso(
    traspaso_id: int, db: DB, current_user: AdminIN, datos: Optional[TraspasoResolucion] = None
):
    """Rechaza la recepción y devuelve al origen las unidades ya descontadas."""
    traspaso = _obtener_traspaso_pendiente(db, traspaso_id)
    _exigir_entidad(
        db, current_user, traspaso.empresa_destino_id, traspaso.cliente_destino_id, "admin"
    )
    item_origen = db.scalar(
        _items_vivos_stmt().where(InventarioItem.id == traspaso.item_origen_id)
    )
    if not item_origen:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El ítem de origen ya no existe, así que el reverso no se puede aplicar. "
                "Registra el ingreso manualmente."
            ),
        )

    etiqueta_destino = _etiqueta_entidad(traspaso.empresa_destino, traspaso.cliente_destino)
    etiqueta_origen = _etiqueta_entidad(traspaso.empresa_origen, traspaso.cliente_origen)

    # Reverso del descuento aplicado al crear el traspaso. Se registra como
    # devolución para que el kardex diga qué pasó, con traspaso_id apuntando al
    # traspaso rechazado.
    movimiento = _aplicar_movimiento(
        db,
        item_origen,
        tipo="devolucion",
        cantidad=traspaso.cantidad,
        usuario=current_user,
        observacion=f"Reverso del traspaso #{traspaso.id}: {etiqueta_destino} lo rechazó.",
    )
    movimiento.traspaso_id = traspaso.id

    traspaso.estado = "rechazado"
    traspaso.aprobado_por_id = current_user.id
    traspaso.fecha_completado = datetime.now()
    if datos and datos.notas:
        traspaso.notas = datos.notas

    descripcion_item = item_origen.descripcion

    db.commit()
    db.refresh(traspaso)

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=None,
        accion="INVENTARIO_RECHAZAR_TRASPASO",
        detalle=(
            f"Rechazó el traspaso #{traspaso.id}; se devolvieron {traspaso.cantidad} und. de "
            f"'{descripcion_item}' a {etiqueta_origen}."
        ),
        resultado="exitoso",
    )

    return _a_traspaso_response(traspaso)


# -----------------------------------------------------------------------------
# ACCESOS POR ENTIDAD DE INVENTARIO
# -----------------------------------------------------------------------------
# Quién ve y opera cada empresa/tarjeta. Lo gestiona la cuenta Master, igual que
# los "Accesos por Proceso" del Mapa SGC, pero es una tabla aparte
# (inventario_usuarios_asignados) y no toca el mapa ni sus permisos.
#
# Regla de convivencia: mientras un usuario no tenga NINGUNA asignación conserva
# el acceso plano anterior (el que le dé accesos_procesos['IN']); en cuanto se le
# asigna una entidad queda restringido a las suyas. Así activar esta pantalla no
# deja fuera a nadie de un día para otro.
def _a_acceso_response(acceso: InventarioUsuarioAsignado) -> AccesoInventarioResponse:
    return AccesoInventarioResponse(
        usuario_id=acceso.usuario_id,
        empresa_id=acceso.empresa_id,
        empresa_nombre=acceso.empresa.nombre if acceso.empresa else None,
        cliente_id=acceso.cliente_id,
        cliente_nombre=acceso.cliente.nombre if acceso.cliente else None,
        nivel=acceso.nivel,
    )


@router.get("/accesos", response_model=List[UsuarioAccesosInventario])
def listar_accesos_inventario(
    db: DB,
    current_user: PilarAdmin,
    usuario_id: Optional[int] = Query(None, description="Limita el listado a un usuario"),
):
    """Usuarios activos con las entidades de inventario que tienen asignadas."""
    stmt = select(Usuario).where(Usuario.activo.is_(True)).order_by(Usuario.nombre)
    if usuario_id:
        stmt = stmt.where(Usuario.id == usuario_id)
    usuarios = db.scalars(stmt).all()

    accesos = db.scalars(
        select(InventarioUsuarioAsignado).options(
            selectinload(InventarioUsuarioAsignado.empresa),
            selectinload(InventarioUsuarioAsignado.cliente),
        )
    ).all()
    por_usuario: dict[int, list[AccesoInventarioResponse]] = {}
    for a in accesos:
        # Las filas en 'ninguno' se devuelven igual: la pantalla necesita ver que
        # el usuario está en modo acotado aunque esa entidad esté sin acceso.
        por_usuario.setdefault(a.usuario_id, []).append(_a_acceso_response(a))

    return [
        UsuarioAccesosInventario(
            usuario_id=u.id,
            nombre=u.nombre,
            correo=u.correo,
            rol=u.rol,
            acceso_total=_tiene_acceso_total(u),
            accesos=por_usuario.get(u.id, []),
        )
        for u in usuarios
    ]


@router.put("/accesos", response_model=List[AccesoInventarioResponse])
def establecer_acceso_inventario(datos: AccesoInventarioSet, db: DB, current_user: PilarAdmin):
    """Fija el nivel de un usuario sobre una entidad. 'ninguno' quita el acceso.

    Devuelve los accesos que le quedan al usuario, para que la pantalla se
    refresque con una sola llamada.
    """
    usuario = db.get(Usuario, datos.usuario_id)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="El usuario indicado no existe."
        )

    empresa, cliente = _resolver_scope(db, datos.empresa_id, datos.cliente_id)
    cliente_id = cliente.id if cliente else None
    etiqueta = _etiqueta_entidad(empresa, cliente)

    existente = db.scalar(
        select(InventarioUsuarioAsignado).where(
            InventarioUsuarioAsignado.usuario_id == usuario.id,
            InventarioUsuarioAsignado.empresa_id == empresa.id,
            InventarioUsuarioAsignado.cliente_id.is_(None)
            if cliente_id is None
            else InventarioUsuarioAsignado.cliente_id == cliente_id,
        )
    )

    # 'ninguno' se GUARDA, no se borra: la fila es lo que mantiene al usuario en
    # el modo acotado. Si se borrara su última fila volvería al acceso plano de
    # antes, que es justo lo contrario de lo que pide quien le quita una entidad.
    if existente:
        existente.nivel = datos.nivel
    else:
        db.add(
            InventarioUsuarioAsignado(
                usuario_id=usuario.id,
                empresa_id=empresa.id,
                cliente_id=cliente_id,
                nivel=datos.nivel,
            )
        )

    if datos.nivel == "ninguno":
        detalle = f"Retiró el acceso de '{usuario.nombre}' al inventario de {etiqueta}."
    else:
        detalle = (
            f"Dejó a '{usuario.nombre}' con nivel {datos.nivel} sobre el inventario de {etiqueta}."
        )

    db.commit()

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=usuario,
        accion="INVENTARIO_ACCESO_ENTIDAD",
        detalle=detalle,
        resultado="exitoso",
    )

    restantes = db.scalars(
        select(InventarioUsuarioAsignado)
        .options(
            selectinload(InventarioUsuarioAsignado.empresa),
            selectinload(InventarioUsuarioAsignado.cliente),
        )
        .where(InventarioUsuarioAsignado.usuario_id == usuario.id)
    ).all()
    return [_a_acceso_response(a) for a in restantes]
