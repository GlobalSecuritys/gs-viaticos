from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.cloudinary import upload_evidencia_viatico
from app.core.security import get_current_user
from app.database import get_db
from app.models.asignacion import Asignacion
from app.models.evidencia_viatico import EvidenciaViatico
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.models.viatico import Viatico
from app.routers.asignaciones import calcular_limite_subida_asignacion
from app.schemas.viatico import (
    AsignacionResumenViatico,
    EvidenciaResponse,
    ViaticoCreate,
    ViaticoResponse,
    ViaticoUpdate,
)

router = APIRouter(prefix="/viaticos", tags=["Viáticos"])

MIN_EVIDENCIAS = 1
MAX_EVIDENCIAS = 5


def _adjuntar_resumen_asignacion(v: Viatico) -> None:
    if v.asignacion:
        v_asig = v.asignacion.viaticos or []
        tot_gastado = sum(item.valor for item in v_asig if item.estado != "rechazado")
        anticipo = v.asignacion.monto_anticipo or Decimal("0.00")
        saldo = max(Decimal("0.00"), anticipo - tot_gastado)
        saldo_favor_tec = max(Decimal("0.00"), tot_gastado - anticipo)
        v.asignacion_resumen = AsignacionResumenViatico(
            id=v.asignacion.id,
            cliente=v.asignacion.cliente,
            empresa=v.asignacion.empresa,
            tipo=v.asignacion.tipo,
            ciudad=v.asignacion.ciudad,
            monto_anticipo=anticipo,
            total_gastado=tot_gastado,
            saldo_restante=saldo,
            saldo_favor_tecnico=saldo_favor_tec,
            estado=v.asignacion.estado,
        )


# --- Endpoints de viáticos --------------------------------------------------

@router.post("", response_model=ViaticoResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ViaticoResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def crear_viatico(
    viatico_in: ViaticoCreate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    if viatico_in.asignacion_id:
        asig = db.scalar(select(Asignacion).where(Asignacion.id == viatico_in.asignacion_id))
        if not asig:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La asignación especificada no existe."
            )
        if asig.tecnico_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La asignación especificada no pertenece al usuario actual."
            )

        # Validación con ventana de gracia de 24 horas tras el cierre
        info_limite = calcular_limite_subida_asignacion(asig)
        if not info_limite["puede_subir_viaticos"]:
            limite_dt = info_limite.get("limite_subida_viaticos")
            limite_str = limite_dt.strftime("%d/%m/%Y a las %I:%M %p") if limite_dt else "el plazo asignado"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Esta asignación se encuentra cerrada y el plazo de gracia de 24 horas "
                    f"para cargar viáticos finalizó el {limite_str}."
                ),
            )

    nuevo_viatico = Viatico(
        usuario_id=current_user.id,
        asignacion_id=viatico_in.asignacion_id,
        fecha=viatico_in.fecha,
        cliente=viatico_in.cliente,
        ciudad=viatico_in.ciudad,
        ot=viatico_in.ot,
        tipo_gasto=viatico_in.tipo_gasto,
        valor=viatico_in.valor,
        descripcion=viatico_in.descripcion,
        tipo_identificacion=viatico_in.tipo_identificacion or "cedula",
        nit_identificacion=viatico_in.nit_identificacion,
        estado="pendiente"
    )
    db.add(nuevo_viatico)
    db.commit()
    db.refresh(nuevo_viatico)
    return nuevo_viatico


@router.get("", response_model=List[ViaticoResponse])
@router.get("/", response_model=List[ViaticoResponse], include_in_schema=False)
def listar_viaticos(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.evidencias),
            joinedload(Viatico.asignacion).joinedload(Asignacion.viaticos),
            joinedload(Viatico.cuenta_cobro),
        )
        .where(Viatico.usuario_id == current_user.id)
        .order_by(Viatico.created_at.desc())
    )
    viaticos = db.execute(stmt).unique().scalars().all()
    for v in viaticos:
        _adjuntar_resumen_asignacion(v)
    return viaticos


@router.get("/{id}", response_model=ViaticoResponse)
def obtener_viatico(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.evidencias),
            joinedload(Viatico.asignacion).joinedload(Asignacion.viaticos),
            joinedload(Viatico.cuenta_cobro),
        )
        .where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    )
    viatico = db.execute(stmt).unique().scalar_one_or_none()
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado"
        )
    _adjuntar_resumen_asignacion(viatico)
    return viatico


@router.put("/{id}", response_model=ViaticoResponse)
def actualizar_viatico(
    id: int,
    viatico_in: ViaticoUpdate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.evidencias),
            joinedload(Viatico.asignacion).joinedload(Asignacion.viaticos),
            joinedload(Viatico.cuenta_cobro),
        )
        .where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    )
    viatico = db.execute(stmt).unique().scalar_one_or_none()
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado"
        )

    if viatico.estado not in ("pendiente", "rechazado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden editar viáticos en estado pendiente o rechazado"
        )

    if viatico.asignacion_id and viatico.asignacion:
        info_limite = calcular_limite_subida_asignacion(viatico.asignacion)
        if not info_limite["puede_subir_viaticos"]:
            limite_dt = info_limite.get("limite_subida_viaticos")
            limite_str = limite_dt.strftime("%d/%m/%Y a las %I:%M %p") if limite_dt else "el plazo límite"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No se puede editar este viático: el plazo de gracia de 24 horas tras el cierre de la asignación finalizó el {limite_str}.",
            )

    update_data = viatico_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(viatico, field, value)

    # Si el viático estaba rechazado, al re-enviarlo vuelve a pendiente
    if viatico.estado == "rechazado":
        viatico.estado = "pendiente"
        viatico.comentario_admin = None

    db.commit()
    db.refresh(viatico)
    _adjuntar_resumen_asignacion(viatico)
    return viatico


@router.delete("/{id}", status_code=status.HTTP_200_OK)
def eliminar_viatico(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .options(joinedload(Viatico.asignacion))
        .where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    )
    viatico = db.execute(stmt).unique().scalar_one_or_none()
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado"
        )

    if viatico.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden eliminar viáticos en estado pendiente"
        )

    if viatico.asignacion_id and viatico.asignacion:
        info_limite = calcular_limite_subida_asignacion(viatico.asignacion)
        if not info_limite["puede_subir_viaticos"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede eliminar un viático cuya asignación está cerrada y con período de gracia de 24 horas expirado.",
            )

    notif = Notificacion(
        tecnico_nombre=current_user.nombre,
        valor=viatico.valor,
        ciudad=viatico.ciudad,
    )
    db.add(notif)

    db.delete(viatico)
    db.commit()

    return {"detail": "Viático eliminado correctamente"}


# --- Endpoints de evidencias para el técnico (Cloudinary) -------------------

@router.post(
    "/{id}/evidencias",
    response_model=List[EvidenciaResponse],
    status_code=status.HTTP_201_CREATED,
)
async def subir_evidencias_viatico(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    files: Annotated[List[UploadFile], File(description="Entre 1 y 5 fotografías")],
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.asignacion),
            joinedload(Viatico.evidencias),
        )
        .where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    )
    viatico = db.execute(stmt).unique().scalar_one_or_none()
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado",
        )

    if viatico.estado not in ("pendiente", "rechazado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden adjuntar evidencias a viáticos en estado pendiente o rechazado",
        )

    if viatico.asignacion_id and viatico.asignacion:
        info_limite = calcular_limite_subida_asignacion(viatico.asignacion)
        if not info_limite["puede_subir_viaticos"]:
            limite_dt = info_limite.get("limite_subida_viaticos")
            limite_str = limite_dt.strftime("%d/%m/%Y a las %I:%M %p") if limite_dt else "el plazo asignado"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No se pueden adjuntar evidencias: el período de gracia de 24 horas de la asignación finalizó el {limite_str}.",
            )

    evidencias_existentes = len(viatico.evidencias)
    if not files or len(files) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes seleccionar al menos una fotografía para subir.",
        )

    if evidencias_existentes + len(files) > MAX_EVIDENCIAS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El viático puede tener hasta {MAX_EVIDENCIAS} fotografías en total. "
                f"Actualmente tiene {evidencias_existentes} y se intentaron agregar {len(files)}."
            ),
        )

    nuevas_evidencias: List[EvidenciaViatico] = []
    for file in files:
        upload_result = await upload_evidencia_viatico(file)
        nuevas_evidencias.append(
            EvidenciaViatico(
                viatico_id=viatico.id,
                secure_url=upload_result.secure_url,
                public_id=upload_result.public_id,
                origen="tecnico",
            )
        )

    db.add_all(nuevas_evidencias)
    db.commit()
    for evidencia in nuevas_evidencias:
        db.refresh(evidencia)

    return nuevas_evidencias


@router.delete(
    "/{id}/evidencias/{evidencia_id}",
    status_code=status.HTTP_200_OK,
)
def eliminar_evidencia_tecnico(
    id: int,
    evidencia_id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Permite al técnico eliminar una fotografía de evidencia de su propio viático,
    siempre y cuando el viático esté en estado pendiente o rechazado y su asignación
    (si tiene) no esté finalizada o cancelada.
    """
    stmt = (
        select(Viatico)
        .options(joinedload(Viatico.asignacion))
        .where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    )
    viatico = db.execute(stmt).unique().scalar_one_or_none()
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado",
        )

    if viatico.estado not in ("pendiente", "rechazado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden eliminar evidencias de viáticos en estado pendiente o rechazado",
        )

    if viatico.asignacion_id and viatico.asignacion:
        info_limite = calcular_limite_subida_asignacion(viatico.asignacion)
        if not info_limite["puede_subir_viaticos"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pueden eliminar evidencias de un viático cuya asignación está cerrada y con período de gracia de 24 horas expirado.",
            )

    stmt_ev = select(EvidenciaViatico).where(
        EvidenciaViatico.id == evidencia_id,
        EvidenciaViatico.viatico_id == id,
    )
    evidencia = db.scalar(stmt_ev)
    if not evidencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidencia no encontrada para este viático",
        )

    db.delete(evidencia)
    db.commit()

    return {"detail": "Evidencia eliminada correctamente"}