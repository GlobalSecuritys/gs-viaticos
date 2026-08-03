from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import Token, UsuarioCreate, UsuarioResponse

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/registro", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def registrar_usuario(
    usuario_in: UsuarioCreate,
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Usuario).where(Usuario.correo == usuario_in.correo)
    usuario_existente = db.scalar(stmt)
    if usuario_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo electrónico ya se encuentra registrado"
        )

    nuevo_usuario = Usuario(
        nombre=usuario_in.nombre,
        correo=usuario_in.correo,
        password_hash=hash_password(usuario_in.password),
        rol="tecnico",
        activo=True
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario


@router.post("/login", response_model=Token)
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Usuario).where(Usuario.correo == form_data.username)
    usuario = db.scalar(stmt)

    if not usuario or not verify_password(form_data.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario se encuentra inactivo"
        )

    access_token = create_access_token(data={"sub": usuario.correo, "rol": usuario.rol, "id": usuario.id})
    return Token(access_token=access_token, token_type="bearer")

