from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_admin
from app.database import get_db
from app.models.asignacion import Asignacion
from app.models.usuario import Usuario
from app.schemas.asignacion import (
    AsignacionCreate,
    AsignacionResponse,
    AsignacionUpdate,
)

router = APIRouter(prefix="/admin/asignaciones", tags=["Asignaciones"])


def _a_response(a: Asignacion) -> AsignacionResponse:
    """Arma el AsignacionResponse resolviendo tecnico_nombre/creado_por_nombre
    a partir de las relaciones ya cargadas (mismo patrón que ViaticoAdminResponse
    en admin.py resuelve nombre/correo)."""
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
        estado=a.estado,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _obtener_o_404(id: int, db: Session) -> Asignacion:
    stmt = (
        select(Asignacion)
        .options(
            joinedload(Asignacion.tecnico),
            joinedload(Asignacion.creado_por),
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