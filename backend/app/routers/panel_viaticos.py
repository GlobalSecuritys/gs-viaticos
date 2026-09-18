"""
Agregados del panel de administración de Viáticos.

Estos endpoints existen para que el panel deje de recorrer en el navegador la
respuesta completa de `GET /admin/viaticos` (que trae cada viático con su
usuario, evidencias, asignación y cuenta de cobro) solo para sumar totales y
armar el listado de técnicos. Aquí todo se agrega en SQL.

`GET /admin/viaticos` y `GET /admin/usuarios` NO se tocan: los siguen usando
Auditoría, PerfilEmpleado, AdminViaticos, Asignaciones y NotificationBell.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
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


def _rango_periodo(periodo: str) -> tuple[Optional[date], Optional[date]]:
    """Límites [desde, hasta] inclusivos del periodo. `historico` no filtra."""
    hoy = date.today()
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
        tg_l = (tg or "").lower()
        val_d = Decimal(val or 0)
        if "hospedaj" in tg_l or "hotel" in tg_l:
            tot_conceptos["hospedaje"] += val_d
        elif "transport" in tg_l or "pasaj" in tg_l or "peaj" in tg_l:
            tot_conceptos["transporte"] += val_d
        elif "aliment" in tg_l or "comida" in tg_l or "restauran" in tg_l:
            tot_conceptos["alimentacion"] += val_d
        elif "escalera" in tg_l:
            tot_conceptos["alquiler_escalera"] += val_d
        elif "material" in tg_l:
            tot_conceptos["materiales"] += val_d
        else:
            tot_conceptos["otros"] += val_d

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
