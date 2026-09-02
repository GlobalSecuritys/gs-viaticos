from datetime import datetime, timedelta, timezone
from typing import Annotated
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)]
) -> Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales de acceso",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        correo: str | None = payload.get("sub")
        if correo is None:
            raise credentials_exception
        token_data = TokenData(correo=correo)
    except JWTError:
        raise credentials_exception

    stmt = select(Usuario).where(Usuario.correo == token_data.correo)
    usuario = db.scalar(stmt)

    if usuario is None:
        raise credentials_exception
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario inactivo"
        )
    return usuario

def get_current_admin(
    current_user: Annotated[Usuario, Depends(get_current_user)]
) -> Usuario:
    if current_user.rol not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador para esta acción"
        )
    return current_user

def get_current_superadmin(
    current_user: Annotated[Usuario, Depends(get_current_user)]
) -> Usuario:
    if current_user.rol != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de superadministrador para esta acción"
        )
    return current_user

def get_current_master_admin(
    current_user: Annotated[Usuario, Depends(get_current_user)]
) -> Usuario:
    """Valida que el usuario sea exclusivamente 'admin@gsbank.com' (case-insensitive)."""
    if (current_user.correo or "").strip().lower() != "admin@gsbank.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido exclusivamente al administrador principal (admin@gsbank.com)"
        )
    return current_user

def verificar_autoridad_sobre_usuario(
    current_admin: Usuario,
    usuario_objetivo: Usuario,
) -> None:
    """Blindaje ADMIN -> SUPER ADMIN.

    Se usa como chequeo adicional DENTRO de endpoints que ya requieren
    get_current_admin (que acepta admin o superadmin), para bloquear que un
    ADMIN NORMAL ejecute una acción administrativa sobre un usuario cuyo rol
    sea 'superadmin'. Un Super Admin nunca es restringido por esta función.
    """
    if current_admin.rol == "admin" and usuario_objetivo.rol == "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Un administrador no puede realizar acciones administrativas sobre un Super Administrador"
        )

def get_current_admin_calidad(
    current_user: Annotated[Usuario, Depends(get_current_user)]
) -> Usuario:
    """Valida que el usuario tenga privilegios de administración en Calidad de Procesos (PilarAdmin o Superadmin o flag es_admin_calidad)."""
    correo = (current_user.correo or "").strip().lower()
    es_admin_calidad = getattr(current_user, "es_admin_calidad", False)
    if not (es_admin_calidad or correo == "pilaradmin@gsbank.com" or current_user.rol == "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido al Administrador de Calidad de Procesos (PilarAdmin@gsbank.com)"
        )
    return current_user