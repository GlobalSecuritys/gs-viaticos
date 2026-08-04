from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_admin
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import AdminBootstrap, UsuarioResponse, UsuarioRolUpdate

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
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Usuario).where(Usuario.id == id)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    usuario.rol = datos.rol
    db.commit()
    db.refresh(usuario)
    return usuario