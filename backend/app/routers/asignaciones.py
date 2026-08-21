from typing import Annotated, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_admin, get_current_user
from app.database import get_db
from app.models.asignacion import Asignacion
from app.models.usuario import Usuario
from app.models.viatico import Viatico
from app.schemas.asignacion import (
    AsignacionCreate,
    AsignacionResponse,
    AsignacionUpdate,
)
from app.schemas.cuenta_cobro_asignacion import CuentaCobroAsignacionResponse
from app.services.cuenta_cobro_asignacion import guardar_cuenta_cobro_asignacion
from app.services.excel_export import generar_excel_viaticos_asignacion

router = APIRouter(prefix="/admin/asignaciones", tags=["Asignaciones"])

# Router separado (sin prefijo /admin) para que el propio técnico consulte
# ÚNICAMENTE su asignación activa. No reemplaza ni modifica el router admin
# de arriba; usa get_current_user (no get_current_admin) y solo permite
# lectura de la asignación del usuario autenticado.
router_tecnico = APIRouter(prefix="/asignaciones", tags=["Asignaciones"])


from decimal import Decimal

def _a_response(a: Asignacion) -> AsignacionResponse:
    """Arma el AsignacionResponse resolviendo tecnico_nombre/creado_por_nombre
    a partir de las relaciones ya cargadas, además de calcular las métricas
    financieras de la asignación (anticipo, gastado, saldo restante y estado)."""
    viaticos_vinculados = a.viaticos if hasattr(a, "viaticos") and a.viaticos else []
    total_gastado = (
        sum(v.valor for v in viaticos_vinculados if v.estado != "rechazado")
        if viaticos_vinculados
        else Decimal("0.00")
    )
    anticipo = a.monto_anticipo if a.monto_anticipo is not None else Decimal("0.00")
    saldo_restante = max(Decimal("0.00"), anticipo - total_gastado)
    saldo_favor_tecnico = max(Decimal("0.00"), total_gastado - anticipo)
    cant_items = len(viaticos_vinculados)

    if cant_items == 0:
        estado_legalizacion = "sin_gastos"
    elif total_gastado > anticipo and anticipo > 0:
        estado_legalizacion = "excedido"
    elif total_gastado == anticipo and cant_items > 0:
        estado_legalizacion = "legalizado"
    else:
        estado_legalizacion = "en_curso"

    cuenta_cobro_resp = None
    if hasattr(a, "cuenta_cobro") and a.cuenta_cobro:
        cuenta_cobro_resp = CuentaCobroAsignacionResponse.model_validate(a.cuenta_cobro)

    return AsignacionResponse(
        id=a.id,
        tecnico_id=a.tecnico_id,
        tecnico_nombre=a.tecnico.nombre,
        creado_por_id=a.creado_por_id,
        creado_por_nombre=a.creado_por.nombre,
        tipo=a.tipo,
        cliente=a.cliente,
        empresa=a.empresa,
        ciudad=a.ciudad,
        fecha_inicio=a.fecha_inicio,
        fecha_fin=a.fecha_fin,
        observaciones=a.observaciones,
        monto_anticipo=anticipo,
        total_gastado=total_gastado,
        saldo_restante=saldo_restante,
        saldo_favor_tecnico=saldo_favor_tecnico,
        cantidad_viaticos=cant_items,
        estado_legalizacion=estado_legalizacion,
        estado=a.estado,
        cuenta_cobro=cuenta_cobro_resp,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _obtener_o_404(id: int, db: Session) -> Asignacion:
    stmt = (
        select(Asignacion)
        .options(
            joinedload(Asignacion.tecnico),
            joinedload(Asignacion.creado_por),
            joinedload(Asignacion.viaticos),
            joinedload(Asignacion.cuenta_cobro),
        )
        .where(Asignacion.id == id)
    )
    asignacion = db.scalar(stmt)
    if not asignacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asignación no encontrada",
        )
    return asignacion


@router.get("", response_model=List[AsignacionResponse])
def listar_asignaciones(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    stmt = (
        select(Asignacion)
        .options(
            joinedload(Asignacion.tecnico),
            joinedload(Asignacion.creado_por),
            joinedload(Asignacion.viaticos),
            joinedload(Asignacion.cuenta_cobro),
        )
        .order_by(Asignacion.fecha_inicio.desc())
    )
    asignaciones = db.execute(stmt).unique().scalars().all()
    return [_a_response(a) for a in asignaciones]


@router.get("/{id}", response_model=AsignacionResponse)
def obtener_asignacion(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    asignacion = _obtener_o_404(id, db)
    return _a_response(asignacion)


@router.get("/{id}/exportar")
def exportar_viaticos_asignacion(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Exporta a Excel (.xlsx) todos los viáticos vinculados a una asignación específica,
    incluyendo el encabezado contextual y el resumen de anticipo/gastado/saldo.
    """
    from fastapi import HTTPException
    import traceback

    asignacion = _obtener_o_404(id, db)

    stmt = (
        select(Viatico)
        .options(joinedload(Viatico.evidencias))
        .where(Viatico.asignacion_id == id)
        .order_by(Viatico.fecha.asc(), Viatico.id.asc())
    )
    viaticos = db.execute(stmt).unique().scalars().all()

    try:
        excel_stream = generar_excel_viaticos_asignacion(
            asignacion=asignacion,
            viaticos=viaticos,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error generando Excel: {exc}\n{traceback.format_exc()}")

    filename = f"asignacion_{id}_viaticos.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.post("", response_model=AsignacionResponse, status_code=status.HTTP_201_CREATED)
def crear_asignacion(
    datos: AsignacionCreate,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    tecnico = db.scalar(select(Usuario).where(Usuario.id == datos.tecnico_id))
    if not tecnico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Técnico no encontrado",
        )
    if tecnico.rol != "tecnico":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario seleccionado no tiene rol de técnico",
        )

    asignacion = Asignacion(
        tecnico_id=datos.tecnico_id,
        creado_por_id=current_admin.id,
        tipo=datos.tipo,
        cliente=datos.cliente,
        empresa=datos.empresa,
        ciudad=datos.ciudad,
        fecha_inicio=datos.fecha_inicio,
        fecha_fin=datos.fecha_fin,
        observaciones=datos.observaciones,
        monto_anticipo=datos.monto_anticipo,
        estado="pendiente",
    )
    db.add(asignacion)
    db.commit()
    db.refresh(asignacion)

    asignacion = _obtener_o_404(asignacion.id, db)
    return _a_response(asignacion)


@router.put("/{id}", response_model=AsignacionResponse)
def actualizar_asignacion(
    id: int,
    datos: AsignacionUpdate,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    asignacion = _obtener_o_404(id, db)

    if asignacion.estado in ("finalizada", "cancelada"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede editar una asignación finalizada o cancelada",
        )

    datos_dict = datos.model_dump(exclude_unset=True)

    if "tecnico_id" in datos_dict:
        nuevo_tecnico = db.scalar(
            select(Usuario).where(Usuario.id == datos_dict["tecnico_id"])
        )
        if not nuevo_tecnico:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Técnico no encontrado",
            )
        if nuevo_tecnico.rol != "tecnico":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El usuario seleccionado no tiene rol de técnico",
            )

    for campo, valor in datos_dict.items():
        setattr(asignacion, campo, valor)

    db.commit()
    asignacion = _obtener_o_404(id, db)
    return _a_response(asignacion)


@router.put("/{id}/finalizar", response_model=AsignacionResponse)
def finalizar_asignacion(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    asignacion = _obtener_o_404(id, db)

    if asignacion.estado in ("finalizada", "cancelada"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Esta asignación ya está {asignacion.estado}",
        )

    asignacion.estado = "finalizada"
    db.commit()
    asignacion = _obtener_o_404(id, db)
    return _a_response(asignacion)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_asignacion(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    asignacion = _obtener_o_404(id, db)

    es_superadmin = current_admin.rol == "superadmin"
    # Regla de permisos ya definida por el frontend (DetalleAsignacion.jsx,
    # `puedeEliminar`): SuperAdmin puede eliminar cualquiera; Admin solo
    # puede eliminar asignaciones que sigan en estado 'pendiente'.
    if not es_superadmin and asignacion.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Solo un SuperAdmin puede eliminar asignaciones que ya no "
                "estén pendientes"
            ),
        )

    db.delete(asignacion)
    db.commit()
    return None


# --- Endpoint de solo lectura para el técnico -------------------------------

@router_tecnico.get("/activas", response_model=List[AsignacionResponse])
def listar_mis_asignaciones_activas(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Devuelve TODAS las asignaciones activas del técnico autenticado (puede ser
    una, varias o ninguna). 'Activa' = estado pendiente o en_curso, SIN
    restricción de fechas.
    """
    stmt = (
        select(Asignacion)
        .options(
            joinedload(Asignacion.tecnico),
            joinedload(Asignacion.creado_por),
            joinedload(Asignacion.viaticos),
            joinedload(Asignacion.cuenta_cobro),
        )
        .where(
            Asignacion.tecnico_id == current_user.id,
            Asignacion.estado.in_(("pendiente", "en_curso")),
        )
        .order_by(Asignacion.fecha_inicio.asc())
    )
    asignaciones = db.execute(stmt).unique().scalars().all()
    return [_a_response(a) for a in asignaciones]


@router_tecnico.post(
    "/{id}/cuenta-cobro",
    response_model=CuentaCobroAsignacionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def subir_cuenta_cobro_tecnico(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(description="Archivo de cuenta de cobro (PDF o Imagen)")],
):
    """
    Permite al técnico subir el documento/archivo digital de cuenta de cobro
    vinculado a una asignación específica.
    """
    return await guardar_cuenta_cobro_asignacion(
        db=db,
        asignacion_id=id,
        current_user=current_user,
        file=file,
    )