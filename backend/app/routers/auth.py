from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
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

    stmt_codigo = select(Usuario).where(Usuario.codigo_empleado == usuario_in.codigo_empleado)
    codigo_existente = db.scalar(stmt_codigo)
    if codigo_existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El código de empleado ya se encuentra registrado."
        )

    nuevo_usuario = Usuario(
        nombre=usuario_in.nombre,
        correo=usuario_in.correo,
        codigo_empleado=usuario_in.codigo_empleado,
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
    correo_limpio = form_data.username.strip().lower()
    stmt = select(Usuario).where(func.lower(Usuario.correo) == correo_limpio)
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

    access_token = create_access_token(data={
        "sub": usuario.correo,
        "rol": usuario.rol,
        "id": usuario.id,
        "nombre": usuario.nombre,
        "codigo_empleado": usuario.codigo_empleado,
        "acceso_viaticos": usuario.acceso_viaticos,
        "es_admin_calidad": getattr(usuario, "es_admin_calidad", False),
    })
    return Token(access_token=access_token, token_type="bearer")


from app.core.security import get_current_user
from typing import Annotated as Ann

@router.get("/me", response_model=UsuarioResponse)
def obtener_usuario_actual(
    current_user: Ann[Usuario, Depends(get_current_user)]
):
    """Devuelve los datos del usuario autenticado actualmente (a partir del JWT)."""
    return current_user
