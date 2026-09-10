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
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database import get_db
from app.models.asignacion import Asignacion
from app.models.usuario import Usuario
from app.models.viatico import Viatico
from app.schemas.dashboard import (
    ResumenGastosFila,
    ResumenGastosResponse,
    TecnicoAsignacionResumen,
    TecnicoDashboardResponse,
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
    else:
        stmt = stmt.where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)
    return Decimal(db.scalar(stmt) or 0)


@router.get("/viaticos-resumen", response_model=ResumenGastosResponse)
def resumen_gastos(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    periodo: str = "mes",
):
    """
    Fuente ÚNICA del "total gastado" del panel.

    Agrega en SQL el gasto por técnico dentro del periodo solicitado
    (`hoy` / `semana` / `mes` / `historico`) y devuelve además el total
    histórico, de modo que un solo cálculo alimenta todos los indicadores
    de la pantalla.
    """
    if periodo not in PERIODOS_VALIDOS:
        periodo = "mes"

    desde, hasta = _rango_periodo(periodo)

    stmt = (
        select(
            Viatico.usuario_id,
            Usuario.nombre,
            func.coalesce(func.sum(Viatico.valor), 0).label("total"),
            func.count(Viatico.id).label("cantidad"),
        )
        .join(Usuario, Usuario.id == Viatico.usuario_id)
        .where(Viatico.estado != ESTADO_NO_COMPUTA_GASTO)
        .group_by(Viatico.usuario_id, Usuario.nombre)
        .order_by(func.coalesce(func.sum(Viatico.valor), 0).desc())
    )
    if desde is not None:
        stmt = stmt.where(Viatico.fecha >= desde, Viatico.fecha <= hasta)

    filas = [
        ResumenGastosFila(
            usuario_id=r.usuario_id,
            nombre=r.nombre or f"Usuario #{r.usuario_id}",
            total=Decimal(r.total or 0),
            cantidad=r.cantidad or 0,
        )
        for r in db.execute(stmt).all()
    ]

    total_periodo = sum((f.total for f in filas), Decimal("0"))
    total_historico = total_periodo if periodo == "historico" else _total_gasto(db)

    return ResumenGastosResponse(
        periodo=periodo,
        fecha_desde=desde,
        fecha_hasta=hasta,
        total=total_periodo,
        total_historico=total_historico,
        total_rechazado=_total_gasto(db, solo_rechazados=True),
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
