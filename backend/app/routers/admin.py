from app.core.security import get_current_superadmin
from app.routers import viaticos
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.viatico import Viatico
from app.schemas.viatico import ViaticoResponse, ViaticoAdminResponse 
from typing import List
from sqlalchemy.orm import Session, joinedload
from app.core.config import settings
from app.core.security import get_current_admin
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import AdminBootstrap, UsuarioResponse, UsuarioRolUpdate
from app.core.security import get_current_admin

router = APIRouter(prefix="/admin", tags=["Administración"])


@router.post("/bootstrap", response_model=UsuarioResponse)
def bootstrap_admin(
    datos: AdminBootstrap,
    db: Annotated[Session, Depends(get_db)]
):
    if datos.master_key != settings.MASTER_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clave maestra incorrecta"
        )

    stmt = select(Usuario).where(Usuario.correo == datos.correo)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    usuario.rol = "admin"
    db.commit()
    db.refresh(usuario)
    return usuario


@router.put("/usuarios/{id}/rol", response_model=UsuarioResponse)
def cambiar_rol_usuario(
    id: int,
    datos: UsuarioRolUpdate,
    current_superadmin: Annotated[Usuario, Depends(get_current_superadmin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Usuario).where(Usuario.id == id)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if usuario.id == current_superadmin.id and datos.rol != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes quitarte el rol de superadministrador."
        )
    
    usuario.rol = datos.rol
    db.commit()
    db.refresh(usuario)
    return usuario

@router.get("/viaticos", response_model=List[ViaticoAdminResponse])
def listar_todos_los_viaticos(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.usuario),
            joinedload(Viatico.evidencias),
        )
        .order_by(
            (Viatico.estado == "pendiente").desc(),
            Viatico.created_at.desc()
        )
    )

    viaticos = db.execute(stmt).unique().scalars().all()

    resultado = []
    for v in viaticos:
        resultado.append(
            ViaticoAdminResponse(
                id=v.id,
                fecha=v.fecha,
                cliente=v.cliente,
                ciudad=v.ciudad,
                ot=v.ot,
                tipo_gasto=v.tipo_gasto,
                valor=v.valor,
                descripcion=v.descripcion,
                usuario_id=v.usuario_id,
                estado=v.estado,
                created_at=v.created_at,
                updated_at=v.updated_at,
                evidencias=v.evidencias,
                codigo_empleado=v.usuario.codigo_empleado,
                nombre=v.usuario.nombre,
                correo=v.usuario.correo,
            )
        )

    return resultado


@router.put("/viaticos/{id}/aprobar", response_model=ViaticoResponse)
def aprobar_viatico(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Viatico).where(Viatico.id == id)
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viático no encontrado")

    if viatico.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Este viático ya fue procesado (estado actual: {viatico.estado})"
        )

    viatico.estado = "aprobado"
    db.commit()
    db.refresh(viatico)
    return viatico


@router.put("/viaticos/{id}/rechazar", response_model=ViaticoResponse)
def rechazar_viatico(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Viatico).where(Viatico.id == id)
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viático no encontrado")

    if viatico.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Este viático ya fue procesado (estado actual: {viatico.estado})"
        )

    viatico.estado = "rechazado"
    db.commit()
    db.refresh(viatico)
    return viatico

@router.get("/usuarios", response_model=List[UsuarioResponse])
def listar_usuarios(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Usuario).order_by(Usuario.id.asc())
    usuarios = db.scalars(stmt).all()
    return usuarios