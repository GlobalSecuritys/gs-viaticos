from datetime import datetime, timedelta
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
    AsignacionExtenderFecha,
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


def calcular_limite_subida_asignacion(a: Asignacion) -> dict:
    """
    Calcula los límites de cierre y período de gracia de 24 horas para la subida de viáticos.
    Regla:
    Si la asignación se cierra (ej: hoy 2 sep a las 12pm), el técnico tiene 24 horas (hasta 3 sep 12pm)
    para terminar de subir o corregir sus viáticos.
    """
    ahora = datetime.utcnow()
    estado = (a.estado or "").lower()

    if estado == "cancelada":
        return {
            "cerrada_en": a.cerrada_en,
            "limite_subida_viaticos": a.cerrada_en or a.updated_at,
            "puede_subir_viaticos": False,
            "en_periodo_gracia": False,
            "horas_restantes_cierre": 0.0,
            "tiempo_restante_str": "Asignación cancelada",
        }

    # Caso 1: Asignación marcada como finalizada por el admin
    if estado == "finalizada":
        fecha_cierre = a.cerrada_en or a.updated_at
        if not fecha_cierre:
            fecha_cierre = datetime.combine(a.fecha_fin, datetime.min.time()) + timedelta(hours=23, minutes=59)

        limite = fecha_cierre + timedelta(hours=24)
        delta = limite - ahora
        segundos_restantes = delta.total_seconds()

        if segundos_restantes > 0:
            horas = int(segundos_restantes // 3600)
            minutos = int((segundos_restantes % 3600) // 60)
            tiempo_str = f"{horas}h {minutos}m" if horas > 0 else f"{minutos} min"
            return {
                "cerrada_en": fecha_cierre,
                "limite_subida_viaticos": limite,
                "puede_subir_viaticos": True,
                "en_periodo_gracia": True,
                "horas_restantes_cierre": round(segundos_restantes / 3600.0, 2),
                "tiempo_restante_str": tiempo_str,
            }
        else:
            return {
                "cerrada_en": fecha_cierre,
                "limite_subida_viaticos": limite,
                "puede_subir_viaticos": False,
                "en_periodo_gracia": False,
                "horas_restantes_cierre": 0.0,
                "tiempo_restante_str": "Plazo vencido (24h de gracia terminadas)",
            }

    # Caso 2: Asignación pendiente o en curso
    # El fin de asignación oficial es el final del día de fecha_fin
    fin_oficial = datetime.combine(a.fecha_fin, datetime.min.time()) + timedelta(hours=23, minutes=59, seconds=59)
    limite = fin_oficial + timedelta(hours=24)
    delta = limite - ahora
    segundos_restantes = delta.total_seconds()

    if ahora > fin_oficial and segundos_restantes > 0:
        horas = int(segundos_restantes // 3600)
        minutos = int((segundos_restantes % 3600) // 60)
        return {
            "cerrada_en": a.cerrada_en,
            "limite_subida_viaticos": limite,
            "puede_subir_viaticos": True,
            "en_periodo_gracia": True,
            "horas_restantes_cierre": round(segundos_restantes / 3600.0, 2),
            "tiempo_restante_str": f"{horas}h {minutos}m",
        }

    if segundos_restantes <= 0:
        return {
            "cerrada_en": a.cerrada_en,
            "limite_subida_viaticos": limite,
            "puede_subir_viaticos": False,
            "en_periodo_gracia": False,
            "horas_restantes_cierre": 0.0,
            "tiempo_restante_str": "Plazo finalizado",
        }

    # Período normal vigente
    delta_fin = fin_oficial - ahora
    horas_fin = delta_fin.total_seconds() / 3600.0
    tiempo_str = f"Cierra hoy ({int(horas_fin)}h)" if horas_fin <= 24 else "Vigente"
    return {
        "cerrada_en": a.cerrada_en,
        "limite_subida_viaticos": limite,
        "puede_subir_viaticos": True,
        "en_periodo_gracia": False,
        "horas_restantes_cierre": round(segundos_restantes / 3600.0, 2),
        "tiempo_restante_str": tiempo_str,
    }


def _a_response(a: Asignacion) -> AsignacionResponse:
    """Arma el AsignacionResponse resolviendo tecnico_nombre/creado_por_nombre
    a partir de las relaciones ya cargadas, además de calcular las métricas
    financieras de la asignación y las ventanas de gracia de 24h para viáticos."""
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

    info_gracia = calcular_limite_subida_asignacion(a)

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
        cerrada_en=info_gracia["cerrada_en"],
        limite_subida_viaticos=info_gracia["limite_subida_viaticos"],
        puede_subir_viaticos=info_gracia["puede_subir_viaticos"],
        en_periodo_gracia=info_gracia["en_periodo_gracia"],
        horas_restantes_cierre=info_gracia["horas_restantes_cierre"],
        tiempo_restante_str=info_gracia["tiempo_restante_str"],
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def purgar_asignaciones_eliminadas(db: Session) -> None:
    """Elimina definitivamente de la base de datos todas las asignaciones
    que fueron borradas (eliminado_en) hace más de 24 horas."""
    try:
        limite = datetime.utcnow() - timedelta(hours=24)
        stmt = select(Asignacion).where(
            Asignacion.eliminado_en.is_not(None),
            Asignacion.eliminado_en <= limite,
        )
        vencidas = db.scalars(stmt).all()
        for asig in vencidas:
            db.delete(asig)
        if vencidas:
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Advertencia al purgar asignaciones vencidas: {e}")


def _obtener_o_404(id: int, db: Session) -> Asignacion:
    purgar_asignaciones_eliminadas(db)
    stmt = (
        select(Asignacion)
        .options(
            joinedload(Asignacion.tecnico),
            joinedload(Asignacion.creado_por),
            joinedload(Asignacion.viaticos),
            joinedload(Asignacion.cuenta_cobro),
        )
        .where(Asignacion.id == id, Asignacion.eliminado_en.is_(None))
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
    purgar_asignaciones_eliminadas(db)
    stmt = (
        select(Asignacion)
        .options(
            joinedload(Asignacion.tecnico),
            joinedload(Asignacion.creado_por),
            joinedload(Asignacion.viaticos),
            joinedload(Asignacion.cuenta_cobro),
        )
        .where(Asignacion.eliminado_en.is_(None))
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
    asignacion.cerrada_en = datetime.utcnow()
    db.commit()
    asignacion = _obtener_o_404(id, db)
    return _a_response(asignacion)


@router.patch("/{id}/extender-fecha", response_model=AsignacionResponse)
def extender_fecha_asignacion(
    id: int,
    datos: AsignacionExtenderFecha,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Extiende (o ajusta) la fecha de fin de una asignación existente.
    Útil para que el técnico pueda volver a subir viáticos dentro del
    nuevo rango una vez que el administrador amplíe el período.
    No modifica el estado ni ningún otro campo de la asignación.
    """
    from datetime import date as _date

    asignacion = _obtener_o_404(id, db)

    if datos.fecha_fin < asignacion.fecha_inicio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva fecha de fin no puede ser anterior a la fecha de inicio de la asignación.",
        )

    asignacion.fecha_fin = datos.fecha_fin
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
    asignacion.eliminado_en = datetime.utcnow()
    db.commit()
    return None


# --- Endpoint de solo lectura para el técnico -------------------------------

@router_tecnico.get("/activas", response_model=List[AsignacionResponse])
def listar_mis_asignaciones_activas(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Devuelve TODAS las asignaciones activas del técnico autenticado (pendiente o en_curso),
    más aquellas asignaciones finalizadas cuyo período de gracia de 24 horas aún está vigente.
    """
    purgar_asignaciones_eliminadas(db)
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
            Asignacion.eliminado_en.is_(None),
        )
        .order_by(Asignacion.fecha_inicio.asc())
    )
    todas = db.execute(stmt).unique().scalars().all()
    activas = []
    for a in todas:
        info_gracia = calcular_limite_subida_asignacion(a)
        # Incluir si está pendiente/en_curso o si es finalizada pero con gracia de 24h activa
        if a.estado in ("pendiente", "en_curso") or (a.estado == "finalizada" and info_gracia["puede_subir_viaticos"]):
            activas.append(_a_response(a))
    return activas


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