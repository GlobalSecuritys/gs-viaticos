"""
Agregados del panel de administración de Viáticos.

Estos endpoints existen para que el panel deje de recorrer en el navegador la
respuesta completa de `GET /admin/viaticos` (que trae cada viático con su
usuario, evidencias, asignación y cuenta de cobro) solo para sumar totales y
armar el listado de técnicos. Aquí todo se agrega en SQL.

`GET /admin/viaticos` y `GET /admin/usuarios` NO se tocan: los siguen usando
Auditoría, PerfilEmpleado, AdminViaticos y Asignaciones.
"""

from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, desc, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.security import get_current_admin, get_current_superadmin
from app.database import get_db
from app.models.asignacion import Asignacion
from app.models.estadistica_asignacion_archivada import EstadisticaAsignacionArchivada
from app.models.usuario import Usuario
from app.models.viatico import Viatico
from app.schemas.dashboard import (
    DistribucionConceptos,
    ResumenGastosFila,
    ResumenGastosResponse,
    TecnicoAsignacionResumen,
    TecnicoDashboardResponse,
    TecnicoIndicadorItem,
    TecnicosIndicadoresResponse,
)

router = APIRouter(prefix="/admin", tags=["Panel Viáticos"])

# Un viático rechazado no es gasto real: se excluye del total, igual que en
# asignaciones._a_response y en el SUMIF del Excel de legalización.
ESTADO_NO_COMPUTA_GASTO = "rechazado"

PERIODOS_VALIDOS = ("hoy", "semana", "mes", "historico")


from zoneinfo import ZoneInfo
COT = ZoneInfo("America/Bogota")


def _rango_periodo(periodo: str) -> tuple[Optional[date], Optional[date]]:
    """Límites [desde, hasta] inclusivos del periodo según hora legal de Colombia. `historico` no filtra."""
    hoy = datetime.now(COT).date()
    if periodo == "hoy":
        return hoy, hoy
    if periodo == "semana":
        inicio = hoy - timedelta(days=hoy.weekday())  # lunes
        return inicio, inicio + timedelta(days=6)
    if periodo == "mes":
        inicio = hoy.replace(day=1)
        fin = (inicio + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return inicio, fin
    return None, None


def _clasificar_concepto(tipo_gasto: Optional[str]) -> str:
    """Agrupa un tipo_gasto libre en los conceptos de las columnas archivadas."""
    tg_l = (tipo_gasto or "").lower()
    if "hospedaj" in tg_l or "hotel" in tg_l:
        return "hospedaje"
    if "transport" in tg_l or "pasaj" in tg_l or "peaj" in tg_l:
        return "transporte"
    if "aliment" in tg_l or "comida" in tg_l or "restauran" in tg_l:
        return "alimentacion"
    if "escalera" in tg_l:
        return "alquiler_escalera"
    if "material" in tg_l:
        return "materiales"
    # plan_datos_moviles no tiene columna propia en estadísticas archivadas → "otros"
    if tg_l == "plan_datos_moviles":
        return "otros"
    return "otros"


def _total_gasto(db: Session, *, solo_rechazados: bool = False) -> Decimal:
    stmt = select(func.coalesce(func.sum(Viatico.valor), 0))
    if solo_rechazados:
        stmt = stmt.where(Viatico.estado == ESTADO_NO_COMPUTA_GASTO)
        return Decimal(db.scalar(stmt) or 0)
    else:
        stmt = stmt.where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)
        total_vivo = Decimal(db.scalar(stmt) or 0)
        stmt_arch = select(func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_gastado), 0))
        total_arch = Decimal(db.scalar(stmt_arch) or 0)
        return total_vivo + total_arch


@router.get("/viaticos-resumen", response_model=ResumenGastosResponse)
def resumen_gastos(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    periodo: str = "mes",
):
    """
    Fuente ÚNICA del "total gastado" del panel.

    Agrega en SQL el gasto por técnico dentro del periodo solicitado
    (`hoy` / `semana` / `mes` / `historico`) sumando los datos en vivo más
    los agregados históricos de asignaciones finalizadas eliminadas.
    Devuelve además el total histórico y la distribución por conceptos consolidada.
    """
    if periodo not in PERIODOS_VALIDOS:
        periodo = "mes"

    desde, hasta = _rango_periodo(periodo)

    # 1. Agregado en vivo de Viáticos
    stmt_vivo = (
        select(
            Viatico.usuario_id,
            Usuario.nombre,
            func.coalesce(func.sum(Viatico.valor), 0).label("total"),
            func.count(Viatico.id).label("cantidad"),
        )
        .join(Usuario, Usuario.id == Viatico.usuario_id)
        .where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)
        .group_by(Viatico.usuario_id, Usuario.nombre)
    )
    if desde is not None:
        stmt_vivo = stmt_vivo.where(Viatico.fecha >= desde, Viatico.fecha <= hasta)

    filas_map: dict[int, dict] = {}
    for r in db.execute(stmt_vivo).all():
        filas_map[r.usuario_id] = {
            "usuario_id": r.usuario_id,
            "nombre": r.nombre or f"Usuario #{r.usuario_id}",
            "total": Decimal(r.total or 0),
            "cantidad": int(r.cantidad or 0),
        }

    # 2. Agregado de asignaciones archivadas
    stmt_arch = (
        select(
            EstadisticaAsignacionArchivada.tecnico_id,
            Usuario.nombre,
            func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_gastado), 0).label("total"),
            func.coalesce(func.sum(EstadisticaAsignacionArchivada.cantidad_viaticos), 0).label("cantidad"),
        )
        .join(Usuario, Usuario.id == EstadisticaAsignacionArchivada.tecnico_id)
        .group_by(EstadisticaAsignacionArchivada.tecnico_id, Usuario.nombre)
    )
    if desde is not None:
        stmt_arch = stmt_arch.where(
            or_(
                and_(EstadisticaAsignacionArchivada.fecha_inicio >= desde, EstadisticaAsignacionArchivada.fecha_inicio <= hasta),
                and_(EstadisticaAsignacionArchivada.fecha_fin >= desde, EstadisticaAsignacionArchivada.fecha_fin <= hasta),
            )
        )

    for r in db.execute(stmt_arch).all():
        if r.tecnico_id in filas_map:
            filas_map[r.tecnico_id]["total"] += Decimal(r.total or 0)
            filas_map[r.tecnico_id]["cantidad"] += int(r.cantidad or 0)
        else:
            filas_map[r.tecnico_id] = {
                "usuario_id": r.tecnico_id,
                "nombre": r.nombre or f"Usuario #{r.tecnico_id}",
                "total": Decimal(r.total or 0),
                "cantidad": int(r.cantidad or 0),
            }

    filas = [
        ResumenGastosFila(
            usuario_id=f["usuario_id"],
            nombre=f["nombre"],
            total=f["total"],
            cantidad=f["cantidad"],
        )
        for f in sorted(filas_map.values(), key=lambda x: x["total"], reverse=True)
    ]

    total_periodo = sum((f.total for f in filas), Decimal("0"))
    total_historico = total_periodo if periodo == "historico" else _total_gasto(db)

    # Cantidad total de viáticos registrados en el sistema (vivo + archivado)
    cant_vivos = db.scalar(select(func.count(Viatico.id)).where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)) or 0
    cant_arch = db.scalar(select(func.coalesce(func.sum(EstadisticaAsignacionArchivada.cantidad_viaticos), 0))) or 0
    total_viaticos_registrados = int(cant_vivos + cant_arch)

    # Distribución consolidada por conceptos (en vivo + archivados)
    stmt_conc_vivos = (
        select(Viatico.tipo_gasto, func.coalesce(func.sum(Viatico.valor), 0))
        .where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)
    )
    if desde is not None:
        stmt_conc_vivos = stmt_conc_vivos.where(Viatico.fecha >= desde, Viatico.fecha <= hasta)
    stmt_conc_vivos = stmt_conc_vivos.group_by(Viatico.tipo_gasto)

    conceptos_vivos = dict(db.execute(stmt_conc_vivos).all())
    tot_conceptos = {
        "hospedaje": Decimal("0.00"),
        "transporte": Decimal("0.00"),
        "alimentacion": Decimal("0.00"),
        "materiales": Decimal("0.00"),
        "alquiler_escalera": Decimal("0.00"),
        "otros": Decimal("0.00"),
    }
    for tg, val in conceptos_vivos.items():
        tot_conceptos[_clasificar_concepto(tg)] += Decimal(val or 0)

    stmt_conc_arch = select(
        func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_hospedaje), 0),
        func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_transporte), 0),
        func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_alimentacion), 0),
        func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_materiales), 0),
        func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_alquiler_escalera), 0),
        func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_otros), 0),
    )
    if desde is not None:
        stmt_conc_arch = stmt_conc_arch.where(
            or_(
                and_(EstadisticaAsignacionArchivada.fecha_inicio >= desde, EstadisticaAsignacionArchivada.fecha_inicio <= hasta),
                and_(EstadisticaAsignacionArchivada.fecha_fin >= desde, EstadisticaAsignacionArchivada.fecha_fin <= hasta),
            )
        )
    arch_conceptos = db.execute(stmt_conc_arch).one_or_none()

    if arch_conceptos:
        tot_conceptos["hospedaje"] += Decimal(arch_conceptos[0] or 0)
        tot_conceptos["transporte"] += Decimal(arch_conceptos[1] or 0)
        tot_conceptos["alimentacion"] += Decimal(arch_conceptos[2] or 0)
        tot_conceptos["materiales"] += Decimal(arch_conceptos[3] or 0)
        tot_conceptos["alquiler_escalera"] += Decimal(arch_conceptos[4] or 0)
        tot_conceptos["otros"] += Decimal(arch_conceptos[5] or 0)

    dist_conceptos = DistribucionConceptos(
        hospedaje=tot_conceptos["hospedaje"],
        transporte=tot_conceptos["transporte"],
        alimentacion=tot_conceptos["alimentacion"],
        materiales=tot_conceptos["materiales"],
        alquiler_escalera=tot_conceptos["alquiler_escalera"],
        otros=tot_conceptos["otros"],
    )

    return ResumenGastosResponse(
        periodo=periodo,
        fecha_desde=desde,
        fecha_hasta=hasta,
        total=total_periodo,
        total_historico=total_historico,
        total_rechazado=_total_gasto(db, solo_rechazados=True),
        total_viaticos_registrados=total_viaticos_registrados,
        distribucion_conceptos=dist_conceptos,
        filas=filas,
    )


@router.get("/tecnicos", response_model=List[TecnicoDashboardResponse])
def listar_tecnicos_dashboard(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    q: Optional[str] = None,
    limit: int = 60,
    offset: int = 0,
):
    """
    Listado de técnicos del panel, YA filtrado y agregado en el servidor.

    El panel no lo consume en la carga inicial: solo al buscar (`q`) o cuando
    el administrador pide expandir el listado completo. Excluye a los
    superadmin (incluido el propio administrador conectado), igual que hacía
    el filtro que corría en el navegador.
    """
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    stmt = select(Usuario).where(
        Usuario.id != current_admin.id,
        Usuario.rol != "superadmin",
    )

    if q and q.strip():
        patron = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Usuario.nombre.ilike(patron),
                Usuario.codigo_empleado.ilike(patron),
                Usuario.correo.ilike(patron),
            )
        )

    usuarios = db.scalars(
        stmt.order_by(Usuario.nombre.asc()).limit(limit).offset(offset)
    ).all()
    if not usuarios:
        return []

    ids = [u.id for u in usuarios]

    # Agregado de viáticos por técnico (misma regla de gasto que el resumen)
    agregados = {
        r.usuario_id: (r.cantidad or 0, Decimal(r.total or 0))
        for r in db.execute(
            select(
                Viatico.usuario_id,
                func.count(Viatico.id).label("cantidad"),
                func.coalesce(func.sum(Viatico.valor), 0).label("total"),
            )
            .where(
                Viatico.usuario_id.in_(ids),
                Viatico.estado != ESTADO_NO_COMPUTA_GASTO,
            )
            .group_by(Viatico.usuario_id)
        ).all()
    }

    # Sumar agregados archivados para cada técnico
    agregados_arch = {
        r.tecnico_id: (int(r.cantidad or 0), Decimal(r.total or 0))
        for r in db.execute(
            select(
                EstadisticaAsignacionArchivada.tecnico_id,
                func.coalesce(func.sum(EstadisticaAsignacionArchivada.cantidad_viaticos), 0).label("cantidad"),
                func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_gastado), 0).label("total"),
            )
            .where(EstadisticaAsignacionArchivada.tecnico_id.in_(ids))
            .group_by(EstadisticaAsignacionArchivada.tecnico_id)
        ).all()
    }
    for tid, (c_arch, t_arch) in agregados_arch.items():
        c_act, t_act = agregados.get(tid, (0, Decimal("0.00")))
        agregados[tid] = (c_act + c_arch, t_act + t_arch)

    asignaciones = db.scalars(
        select(Asignacion)
        .where(
            Asignacion.tecnico_id.in_(ids),
            Asignacion.eliminado_en.is_(None),
        )
        .order_by(Asignacion.fecha_inicio.asc())
    ).all()

    gasto_por_asignacion: dict[int, Decimal] = {}
    if asignaciones:
        gasto_por_asignacion = {
            r.asignacion_id: Decimal(r.total or 0)
            for r in db.execute(
                select(
                    Viatico.asignacion_id,
                    func.coalesce(func.sum(Viatico.valor), 0).label("total"),
                )
                .where(
                    Viatico.asignacion_id.in_([a.id for a in asignaciones]),
                    Viatico.estado != ESTADO_NO_COMPUTA_GASTO,
                )
                .group_by(Viatico.asignacion_id)
            ).all()
        }

    por_tecnico: dict[int, List[TecnicoAsignacionResumen]] = {i: [] for i in ids}
    for a in asignaciones:
        por_tecnico[a.tecnico_id].append(
            TecnicoAsignacionResumen(
                id=a.id,
                cliente=a.cliente,
                empresa=a.empresa,
                ciudad=a.ciudad,
                tipo=a.tipo,
                estado=a.estado,
                fecha_inicio=a.fecha_inicio,
                fecha_fin=a.fecha_fin,
                monto_anticipo=a.monto_anticipo or Decimal("0.00"),
                total_gastado=gasto_por_asignacion.get(a.id, Decimal("0.00")),
            )
        )

    respuesta: List[TecnicoDashboardResponse] = []
    for u in usuarios:
        cantidad, total = agregados.get(u.id, (0, Decimal("0.00")))
        asigs = por_tecnico.get(u.id, [])
        # "Activa" = pendiente o en_curso, la de fecha_inicio más próxima
        # (misma regla que utils/asignaciones.obtenerAsignacionActivaDeTecnico).
        activa = next((a for a in asigs if a.estado in ("pendiente", "en_curso")), None)
        respuesta.append(
            TecnicoDashboardResponse(
                id=u.id,
                nombre=u.nombre,
                correo=u.correo,
                codigo_empleado=u.codigo_empleado,
                rol=u.rol,
                activo=bool(u.activo),
                cantidad_viaticos=cantidad,
                total_gastado=total,
                asignacion_activa=activa,
                asignaciones=asigs,
            )
        )
    return respuesta


@router.get("/tecnicos-gastos-totales")
def listar_tecnicos_gastos_totales(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Listado de todos los técnicos registrados con la cantidad de dinero gastado
    (vivo + archivado).
    """
    sub = (
        select(
            Viatico.usuario_id,
            func.coalesce(func.sum(Viatico.valor), 0).label("total"),
        )
        .where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)
        .group_by(Viatico.usuario_id)
        .subquery()
    )
    sub_arch = (
        select(
            EstadisticaAsignacionArchivada.tecnico_id,
            func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_gastado), 0).label("total"),
        )
        .group_by(EstadisticaAsignacionArchivada.tecnico_id)
        .subquery()
    )

    stmt = (
        select(
            Usuario.id,
            Usuario.nombre,
            Usuario.codigo_empleado,
            Usuario.correo,
            (func.coalesce(sub.c.total, 0) + func.coalesce(sub_arch.c.total, 0)).label("total_gastado"),
        )
        .outerjoin(sub, sub.c.usuario_id == Usuario.id)
        .outerjoin(sub_arch, sub_arch.c.tecnico_id == Usuario.id)
        .where(
            Usuario.rol == "tecnico",
            Usuario.activo.is_(True),
        )
        .order_by(desc("total_gastado"), Usuario.nombre.asc())
    )

    return [
        {
            "id": r.id,
            "nombre": r.nombre,
            "codigo_empleado": r.codigo_empleado,
            "correo": r.correo,
            "total_gastado": float(r.total_gastado or 0),
        }
        for r in db.execute(stmt).all()
    ]


@router.get("/tecnicos-indicadores", response_model=TecnicosIndicadoresResponse)
def tecnicos_indicadores(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Métricas indicativas de técnicos destacados (vivo + archivado):
    - Mayor cantidad de viáticos registrados
    - Mayor número de asignaciones
    - Mayor valor total de viáticos / gasto gestionado
    """
    sub_v_cant = (
        select(
            Viatico.usuario_id,
            func.count(Viatico.id).label("cant"),
            func.coalesce(func.sum(Viatico.valor), 0).label("monto"),
        )
        .where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)
        .group_by(Viatico.usuario_id)
        .subquery()
    )
    sub_a_cant = (
        select(
            EstadisticaAsignacionArchivada.tecnico_id,
            func.coalesce(func.sum(EstadisticaAsignacionArchivada.cantidad_viaticos), 0).label("cant"),
            func.coalesce(func.sum(EstadisticaAsignacionArchivada.total_gastado), 0).label("monto"),
        )
        .group_by(EstadisticaAsignacionArchivada.tecnico_id)
        .subquery()
    )

    # 1. Top viáticos subidos
    stmt_viaticos = (
        select(
            Usuario.id,
            Usuario.nombre,
            Usuario.codigo_empleado,
            (func.coalesce(sub_v_cant.c.cant, 0) + func.coalesce(sub_a_cant.c.cant, 0)).label("cant"),
            (func.coalesce(sub_v_cant.c.monto, 0) + func.coalesce(sub_a_cant.c.monto, 0)).label("monto"),
        )
        .outerjoin(sub_v_cant, sub_v_cant.c.usuario_id == Usuario.id)
        .outerjoin(sub_a_cant, sub_a_cant.c.tecnico_id == Usuario.id)
        .where(
            Usuario.rol == "tecnico",
            Usuario.activo.is_(True),
        )
        .order_by(desc("cant"))
        .limit(5)
    )
    top_viaticos = [
        TecnicoIndicadorItem(
            id=r.id,
            nombre=r.nombre,
            codigo_empleado=r.codigo_empleado,
            metrica_principal=r.cant or 0,
            metrica_secundaria=Decimal(r.monto or 0),
        )
        for r in db.execute(stmt_viaticos).all()
    ]

    # 2. Top asignaciones (vivas + archivadas)
    sub_asig_v = (
        select(
            Asignacion.tecnico_id,
            func.count(Asignacion.id).label("cant"),
        )
        .where(Asignacion.eliminado_en.is_(None))
        .group_by(Asignacion.tecnico_id)
        .subquery()
    )
    sub_asig_a = (
        select(
            EstadisticaAsignacionArchivada.tecnico_id,
            func.count(EstadisticaAsignacionArchivada.id).label("cant"),
        )
        .group_by(EstadisticaAsignacionArchivada.tecnico_id)
        .subquery()
    )
    stmt_asig = (
        select(
            Usuario.id,
            Usuario.nombre,
            Usuario.codigo_empleado,
            (func.coalesce(sub_asig_v.c.cant, 0) + func.coalesce(sub_asig_a.c.cant, 0)).label("cant"),
        )
        .outerjoin(sub_asig_v, sub_asig_v.c.tecnico_id == Usuario.id)
        .outerjoin(sub_asig_a, sub_asig_a.c.tecnico_id == Usuario.id)
        .where(
            Usuario.rol == "tecnico",
            Usuario.activo.is_(True),
        )
        .order_by(desc("cant"))
        .limit(5)
    )
    top_asig = [
        TecnicoIndicadorItem(
            id=r.id,
            nombre=r.nombre,
            codigo_empleado=r.codigo_empleado,
            metrica_principal=r.cant or 0,
        )
        for r in db.execute(stmt_asig).all()
    ]

    # 3. Top mayor gasto
    stmt_gasto = (
        select(
            Usuario.id,
            Usuario.nombre,
            Usuario.codigo_empleado,
            (func.coalesce(sub_v_cant.c.monto, 0) + func.coalesce(sub_a_cant.c.monto, 0)).label("monto"),
            (func.coalesce(sub_v_cant.c.cant, 0) + func.coalesce(sub_a_cant.c.cant, 0)).label("cant"),
        )
        .outerjoin(sub_v_cant, sub_v_cant.c.usuario_id == Usuario.id)
        .outerjoin(sub_a_cant, sub_a_cant.c.tecnico_id == Usuario.id)
        .where(
            Usuario.rol == "tecnico",
            Usuario.activo.is_(True),
        )
        .order_by(desc("monto"))
        .limit(5)
    )
    top_gasto = [
        TecnicoIndicadorItem(
            id=r.id,
            nombre=r.nombre,
            codigo_empleado=r.codigo_empleado,
            metrica_principal=Decimal(r.monto or 0),
            metrica_secundaria=r.cant or 0,
        )
        for r in db.execute(stmt_gasto).all()
    ]

    return TecnicosIndicadoresResponse(
        mas_viaticos=top_viaticos,
        mas_asignaciones=top_asig,
        mayor_gasto=top_gasto,
    )


# ── Dashboard de viáticos (solo superadmin) ──────────────────────────────────
# Una apertura = 2 consultas agregadas. El archivo se lee desde resumen_mensual
# (nunca se expande desglose_viaticos) y el mes sale siempre de la fecha del gasto.

# Desde este despliegue el archivado guarda el estado de cada viático.
FECHA_INICIO_ESTADO_ARCHIVO = date(2026, 10, 9)

CONCEPTOS = ("hospedaje", "transporte", "alimentacion", "materiales", "alquiler_escalera", "otros")

_SQL_DASH_VIVO = text("""
    SELECT to_char(v.fecha, 'YYYY-MM') AS mes,
           v.estado, v.tipo_gasto, v.usuario_id, u.nombre, v.ciudad,
           GROUPING(v.tipo_gasto, v.usuario_id, v.ciudad) AS g,
           min(v.fecha) AS primera_fecha,
           count(*) AS cantidad,
           coalesce(sum(v.valor), 0) AS monto
    FROM viaticos v
    JOIN usuarios u ON u.id = v.usuario_id
    GROUP BY GROUPING SETS (
        (to_char(v.fecha, 'YYYY-MM'), v.estado),
        (to_char(v.fecha, 'YYYY-MM'), v.estado, v.tipo_gasto),
        (to_char(v.fecha, 'YYYY-MM'), v.estado, v.usuario_id, u.nombre),
        (to_char(v.fecha, 'YYYY-MM'), v.estado, v.ciudad)
    )
""")

# Conceptos del archivo: solo existen por carpeta; se reparten entre los meses
# de la carpeta en proporción a su gasto (f = gasto_mes / total_gastado).
_SQL_DASH_ARCHIVO = text("""
    SELECT m.key AS mes, e.tecnico_id, u.nombre, e.ciudad,
           coalesce((e.resumen_mensual->>'estado_conocido')::boolean, false) AS estado_conocido,
           sum(x.g) AS gasto,
           sum(x.r) AS rechazado,
           sum(x.cr) AS cant_rechazados,
           sum(e.total_hospedaje * y.f) AS hospedaje,
           sum(e.total_transporte * y.f) AS transporte,
           sum(e.total_alimentacion * y.f) AS alimentacion,
           sum(e.total_materiales * y.f) AS materiales,
           sum(e.total_alquiler_escalera * y.f) AS alquiler_escalera,
           sum(e.total_otros * y.f) AS otros
    FROM estadisticas_asignaciones_archivadas e
    JOIN usuarios u ON u.id = e.tecnico_id
    LEFT JOIN LATERAL json_each(e.resumen_mensual->'meses') m ON true
    CROSS JOIN LATERAL (
        SELECT CASE WHEN m.key IS NULL THEN e.total_gastado
                    ELSE (m.value->>'gasto')::numeric END AS g,
               coalesce((m.value->>'rechazado')::numeric, 0) AS r,
               coalesce((m.value->>'cant_rechazados')::int, 0) AS cr
    ) x
    CROSS JOIN LATERAL (
        SELECT CASE WHEN e.total_gastado > 0 THEN x.g / e.total_gastado ELSE 0 END AS f
    ) y
    GROUP BY m.key, e.tecnico_id, u.nombre, e.ciudad, 5
""")


def _sumar(destino: dict, clave, monto: float, cantidad: int = 0) -> None:
    item = destino.setdefault(clave, {"monto": 0.0, "cantidad": 0})
    item["monto"] += monto
    item["cantidad"] += cantidad


def _mes_siguiente(mes: str) -> str:
    y, m = int(mes[:4]), int(mes[5:])
    return f"{y + (m == 12)}-{(m % 12) + 1:02d}"


def _mes_anterior(mes: str) -> str:
    y, m = int(mes[:4]), int(mes[5:])
    return f"{y - (m == 1)}-{12 if m == 1 else m - 1:02d}"


def _dias_mes(mes: str) -> int:
    return monthrange(int(mes[:4]), int(mes[5:]))[1]


def _proyeccion(gasto_mes: dict, hoy: date, primer_dia: Optional[date]) -> Optional[dict]:
    """
    Ritmo diario de cada mes (gasto del mes / días con datos) + tendencia.
    Se usa el ritmo diario por mes porque el archivo solo tiene granularidad
    mensual: un ritmo semanal exacto solo existiría para los datos en vivo.
    Central = 60 % ritmo del mes en curso + 40 % ritmo del mes anterior;
    banda = el menor y el mayor de esos dos ritmos, con un ancho mínimo de
    ±15 % (confianza baja) o ±10 % (media) para no aparentar precisión.
    """
    mes_actual = hoy.strftime("%Y-%m")
    mes_prev = _mes_anterior(mes_actual)

    dias_trans = hoy.day
    gasto_actual = gasto_mes.get(mes_actual, 0.0)
    ritmo_actual = gasto_actual / dias_trans

    ritmo_prev = None
    if gasto_mes.get(mes_prev, 0.0) > 0:
        dias_prev = _dias_mes(mes_prev)
        if primer_dia and primer_dia.strftime("%Y-%m") == mes_prev:
            dias_prev = dias_prev - primer_dia.day + 1  # el primer mes empieza a mitad
        ritmo_prev = gasto_mes[mes_prev] / dias_prev

    ritmos = [r for r in (ritmo_actual, ritmo_prev) if r]
    if not ritmos:
        return None

    dias_historia = (hoy - primer_dia).days + 1 if primer_dia else 0
    confianza = "baja" if dias_historia < 90 else "media"
    margen = 0.15 if confianza == "baja" else 0.10

    if ritmo_actual and ritmo_prev:
        central = 0.6 * ritmo_actual + 0.4 * ritmo_prev
        tendencia_pct = (ritmo_actual - ritmo_prev) / ritmo_prev * 100
    else:
        # Un solo mes con datos: banda fija de ±25 %
        central = ritmos[0]
        margen = 0.25
        tendencia_pct = None
    bajo = min(min(ritmos), central * (1 - margen))
    alto = max(max(ritmos), central * (1 + margen))

    dias_mes = _dias_mes(mes_actual)
    restantes = dias_mes - dias_trans
    mes_sig = _mes_siguiente(mes_actual)
    dias_sig = _dias_mes(mes_sig)

    semanas = []
    for i in range(8):
        inicio = hoy + timedelta(days=1 + 7 * i)
        semanas.append({
            "desde": inicio.isoformat(),
            "hasta": (inicio + timedelta(days=6)).isoformat(),
            "central": round(central * 7, 2),
            "minimo": round(bajo * 7, 2),
            "maximo": round(alto * 7, 2),
        })

    return {
        "ritmo_diario_actual": round(ritmo_actual, 2),
        "ritmo_diario_mes_anterior": round(ritmo_prev, 2) if ritmo_prev else None,
        "ritmo_diario_central": round(central, 2),
        "tendencia_pct": round(tendencia_pct, 1) if tendencia_pct is not None else None,
        "dias_transcurridos": dias_trans,
        "dias_mes": dias_mes,
        "cierre_mes": {
            "mes": mes_actual,
            "central": round(gasto_actual + central * restantes, 2),
            "minimo": round(gasto_actual + bajo * restantes, 2),
            "maximo": round(gasto_actual + alto * restantes, 2),
        },
        "mes_siguiente": {
            "mes": mes_sig,
            "central": round(central * dias_sig, 2),
            "minimo": round(bajo * dias_sig, 2),
            "maximo": round(alto * dias_sig, 2),
        },
        "semanas": semanas,
        "dias_historia": dias_historia,
        "confianza": confianza,
        "margen_minimo_pct": round(margen * 100),
    }


@router.get("/dashboard-viaticos")
def dashboard_viaticos(
    current_superadmin: Annotated[Usuario, Depends(get_current_superadmin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Payload completo del dashboard de viáticos (vivo + archivado) desde el día
    cero. Solo lectura, 2 consultas agregadas. Gasto = no rechazado; los
    rechazados van aparte y nunca se suman al gasto.
    """
    hoy = datetime.now(COT).date()
    meses: dict[str, dict] = {}

    def mes_de(clave: str) -> dict:
        return meses.setdefault(clave, {
            "gasto": 0.0, "gasto_vivo": 0.0, "gasto_archivo": 0.0,
            "gasto_archivo_estado_desconocido": 0.0,
            "rechazado": 0.0, "cant_rechazados": 0,
            "conceptos": {c: 0.0 for c in CONCEPTOS},
            "tecnicos": {}, "ciudades": {}, "estados": {},
        })

    pendientes = {"cantidad": 0, "monto": 0.0}
    primer_dia_vivo: Optional[date] = None

    # 1. Vivo: un solo viaje a la BD con GROUPING SETS.
    # g = GROUPING(tipo_gasto, usuario_id, ciudad): 7 = (mes, estado),
    # 3 = por concepto, 5 = por técnico, 6 = por ciudad.
    for r in db.execute(_SQL_DASH_VIVO).mappings():
        m = mes_de(r["mes"])
        monto = float(r["monto"] or 0)
        cant = int(r["cantidad"] or 0)
        rechazado = r["estado"] == ESTADO_NO_COMPUTA_GASTO
        g = r["g"]
        if g == 7:
            _sumar(m["estados"], r["estado"], monto, cant)
            if rechazado:
                m["rechazado"] += monto
                m["cant_rechazados"] += cant
            else:
                m["gasto"] += monto
                m["gasto_vivo"] += monto
            if r["estado"] == "pendiente":
                pendientes["cantidad"] += cant
                pendientes["monto"] += monto
            if primer_dia_vivo is None or r["primera_fecha"] < primer_dia_vivo:
                primer_dia_vivo = r["primera_fecha"]
        elif rechazado:
            continue
        elif g == 3:
            m["conceptos"][_clasificar_concepto(r["tipo_gasto"])] += monto
        elif g == 5:
            _sumar(m["tecnicos"], (r["usuario_id"], r["nombre"]), monto, cant)
        elif g == 6:
            _sumar(m["ciudades"], (r["ciudad"] or "Sin ciudad").strip().upper(), monto, cant)

    # 2. Archivo: resumen_mensual + columnas de totales
    sin_mes = {"gasto": 0.0, "filas": 0}
    for r in db.execute(_SQL_DASH_ARCHIVO).mappings():
        gasto = float(r["gasto"] or 0)
        if r["mes"] is None:
            # Sin resumen_mensual (o sin viáticos): no hay mes asignable.
            if gasto:
                sin_mes["gasto"] += gasto
                sin_mes["filas"] += 1
            continue
        m = mes_de(r["mes"])
        m["gasto"] += gasto
        m["gasto_archivo"] += gasto
        if r["estado_conocido"]:
            _sumar(m["estados"], "archivado_no_rechazado", gasto)
            if r["rechazado"]:
                rech, cant_rech = float(r["rechazado"]), int(r["cant_rechazados"] or 0)
                m["rechazado"] += rech
                m["cant_rechazados"] += cant_rech
                _sumar(m["estados"], ESTADO_NO_COMPUTA_GASTO, rech, cant_rech)
        else:
            m["gasto_archivo_estado_desconocido"] += gasto
            _sumar(m["estados"], "archivado_estado_desconocido", gasto)
        for c in CONCEPTOS:
            m["conceptos"][c] += float(r[c] or 0)
        _sumar(m["tecnicos"], (r["tecnico_id"], r["nombre"]), gasto)
        _sumar(m["ciudades"], (r["ciudad"] or "Sin ciudad").strip().upper(), gasto)

    # Serie continua desde el primer mes con datos hasta el mes en curso
    mes_actual = hoy.strftime("%Y-%m")
    serie = []
    if meses:
        k, ultimo = min(meses), max(max(meses), mes_actual)
        while k <= ultimo:
            m = mes_de(k)
            serie.append({
                "mes": k,
                "gasto": round(m["gasto"], 2),
                "gasto_vivo": round(m["gasto_vivo"], 2),
                "gasto_archivo": round(m["gasto_archivo"], 2),
                "gasto_archivo_estado_desconocido": round(m["gasto_archivo_estado_desconocido"], 2),
                "rechazado": round(m["rechazado"], 2),
                "cant_rechazados": m["cant_rechazados"],
                "conceptos": {c: round(v, 2) for c, v in m["conceptos"].items()},
                "tecnicos": [
                    {"id": tid, "nombre": nombre or f"Usuario #{tid}", "monto": round(v["monto"], 2)}
                    for (tid, nombre), v in m["tecnicos"].items()
                ],
                "ciudades": [{"ciudad": c, "monto": round(v["monto"], 2)} for c, v in m["ciudades"].items()],
                "estados": {e: {"monto": round(v["monto"], 2), "cantidad": v["cantidad"]} for e, v in m["estados"].items()},
            })
            k = _mes_siguiente(k)

    # Primer día documentado: el archivo solo guarda el mes; si el primer mes
    # tiene gasto archivado se toma el día 1 de ese mes (aproximado).
    primer_dia = None
    if serie:
        primer = serie[0]
        if primer_dia_vivo and primer_dia_vivo.strftime("%Y-%m") == primer["mes"] and not primer["gasto_archivo"]:
            primer_dia = primer_dia_vivo
        else:
            primer_dia = date(int(primer["mes"][:4]), int(primer["mes"][5:]), 1)

    gasto_por_mes = {s["mes"]: s["gasto"] for s in serie}
    return {
        "generado_en": datetime.now(COT).isoformat(),
        "hoy": hoy.isoformat(),
        "mes_actual": mes_actual,
        "primer_dia_aproximado": primer_dia.isoformat() if primer_dia else None,
        "meses": serie,
        "total_gasto": round(sum(gasto_por_mes.values()) + sin_mes["gasto"], 2),
        "total_rechazado": round(sum(s["rechazado"] for s in serie), 2),
        "cant_rechazados": sum(s["cant_rechazados"] for s in serie),
        "pendientes": {"cantidad": pendientes["cantidad"], "monto": round(pendientes["monto"], 2)},
        "sin_mes": {"gasto": round(sin_mes["gasto"], 2), "filas": sin_mes["filas"]},
        "gasto_archivo_estado_desconocido": round(sum(s["gasto_archivo_estado_desconocido"] for s in serie), 2),
        "fecha_inicio_estado_archivo": FECHA_INICIO_ESTADO_ARCHIVO.isoformat(),
        "proyeccion": _proyeccion(gasto_por_mes, hoy, primer_dia),
    }
