"""
auth.py — Router de autenticación y recuperación de contraseña.

Endpoints:
  POST /auth/registro              — Crear usuario nuevo
  POST /auth/login                 — Iniciar sesión (OAuth2 password flow)
  GET  /auth/me                    — Datos del usuario autenticado
  POST /auth/solicitar-reset       — Solicitar código OTP de 6 dígitos
  POST /auth/verificar-codigo      — Verificar que el código es válido
  POST /auth/cambiar-password      — Cambiar la contraseña con el código verificado
"""

import random
import string
import threading
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import Token, UsuarioCreate, UsuarioResponse
from app.utils.email_reset import enviar_codigo_reset

router = APIRouter(prefix="/auth", tags=["Autenticación"])


# ─────────────────────────────────────────────────────────────────────────────
# Almacén en memoria para los códigos OTP de recuperación
# Clave   → correo normalizado del solicitante
# Valor   → { "codigo": "123456", "expires_at": float(epoch), "verificado": bool }
# ─────────────────────────────────────────────────────────────────────────────
_reset_store: dict[str, dict] = {}
_store_lock = threading.Lock()

OTP_TTL_SECONDS = 600  # 10 minutos
OTP_VERIFICADO_TTL_SECONDS = 300  # 5 min adicionales para completar el cambio


def _generar_codigo() -> str:
    """Genera un código numérico de 6 dígitos."""
    return "".join(random.choices(string.digits, k=6))


def _limpiar_expirados() -> None:
    """Elimina entradas vencidas del store (housekeeping básico)."""
    now = time.time()
    with _store_lock:
        vencidos = [k for k, v in _reset_store.items() if v["expires_at"] < now]
        for k in vencidos:
            del _reset_store[k]


# ─────────────────────────────────────────────────────────────────────────────
# Schemas de solicitud/respuesta para el flujo de reset
# ─────────────────────────────────────────────────────────────────────────────

class SolicitarResetIn(BaseModel):
    correo_o_usuario: str  # acepta correo electrónico o código de empleado


class VerificarCodigoIn(BaseModel):
    correo: str   # correo normalizado del solicitante (devuelto en paso 1)
    codigo: str   # 6 dígitos


class CambiarPasswordIn(BaseModel):
    correo: str         # correo normalizado del solicitante
    codigo: str         # el mismo código verificado
    nueva_password: str


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints originales
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# PASO 1 — Solicitar código OTP
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/solicitar-reset")
def solicitar_reset(
    body: SolicitarResetIn,
    db: Annotated[Session, Depends(get_db)]
):
    """
    Busca el usuario por correo o código de empleado (solo admin/superadmin).
    Si existe, genera un código OTP de 6 dígitos y lo envía al buzón fijo
    (RESET_EMAIL_DESTINO). La respuesta siempre devuelve HTTP 200 para no
    revelar si el usuario existe o no.
    """
    _limpiar_expirados()

    termino = body.correo_o_usuario.strip().lower()

    # Buscar por correo o por código de empleado
    stmt = select(Usuario).where(
        (func.lower(Usuario.correo) == termino) |
        (func.lower(func.coalesce(Usuario.codigo_empleado, "")) == termino)
    )
    usuario = db.scalar(stmt)

    # Solo admin y superadmin pueden usar este flujo
    if usuario and usuario.rol in ("admin", "superadmin") and usuario.activo:
        codigo = _generar_codigo()
        correo_norm = usuario.correo.strip().lower()

        with _store_lock:
            _reset_store[correo_norm] = {
                "codigo": codigo,
                "expires_at": time.time() + OTP_TTL_SECONDS,
                "verificado": False,
            }

        # Enviar correo (si falla, igual respondemos OK para no revelar info)
        enviar_codigo_reset(correo_norm, codigo)

    # Respuesta genérica para no exponer si el usuario existe
    return {
        "ok": True,
        "mensaje": (
            "Si la cuenta existe y tiene permisos de administrador, "
            "recibirás el código en el buzón autorizado."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# PASO 2 — Verificar el código OTP
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/verificar-codigo")
def verificar_codigo(
    body: VerificarCodigoIn,
    db: Annotated[Session, Depends(get_db)]
):
    """
    Valida el código OTP. Si es correcto, lo marca como 'verificado'
    y extiende el TTL 5 minutos adicionales para que el usuario complete
    el cambio de contraseña. Acepta correo o código de empleado.
    """
    _limpiar_expirados()

    termino = body.correo.strip().lower()
    stmt = select(Usuario).where(
        (func.lower(Usuario.correo) == termino) |
        (func.lower(func.coalesce(Usuario.codigo_empleado, "")) == termino)
    )
    usuario = db.scalar(stmt)
    correo_norm = usuario.correo.strip().lower() if usuario else termino

    with _store_lock:
        entrada = _reset_store.get(correo_norm)

        if not entrada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código ha expirado o no existe. Solicita uno nuevo."
            )

        if time.time() > entrada["expires_at"]:
            del _reset_store[correo_norm]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código ha expirado. Solicita uno nuevo."
            )

        if entrada["codigo"] != body.codigo.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Código incorrecto. Verifica e intenta de nuevo."
            )

        # Marcar como verificado y extender TTL
        entrada["verificado"] = True
        entrada["expires_at"] = time.time() + OTP_VERIFICADO_TTL_SECONDS

    return {"ok": True, "mensaje": "Código verificado correctamente."}


# ─────────────────────────────────────────────────────────────────────────────
# PASO 3 — Cambiar la contraseña
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/cambiar-password")
def cambiar_password(
    body: CambiarPasswordIn,
    db: Annotated[Session, Depends(get_db)]
):
    """
    Cambia la contraseña del usuario. Requiere que el código OTP haya sido
    verificado en el paso anterior y que aún no haya expirado.
    Acepta correo o código de empleado.
    """
    _limpiar_expirados()

    if len(body.nueva_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La nueva contraseña debe tener al menos 8 caracteres."
        )

    termino = body.correo.strip().lower()
    stmt = select(Usuario).where(
        (func.lower(Usuario.correo) == termino) |
        (func.lower(func.coalesce(Usuario.codigo_empleado, "")) == termino)
    )
    usuario = db.scalar(stmt)

    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado."
        )

    correo_norm = usuario.correo.strip().lower()

    with _store_lock:
        entrada = _reset_store.get(correo_norm)

        if not entrada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código ha expirado o no existe. Solicita uno nuevo."
            )

        if time.time() > entrada["expires_at"]:
            del _reset_store[correo_norm]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La sesión de recuperación ha expirado. Inicia el proceso de nuevo."
            )

        if not entrada.get("verificado"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código no ha sido verificado."
            )

        if entrada["codigo"] != body.codigo.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Código incorrecto."
            )

    # Actualizar contraseña en base de datos
    usuario.password_hash = hash_password(body.nueva_password)
    db.commit()

    # Limpiar el código del store
    with _store_lock:
        _reset_store.pop(correo_norm, None)

    return {"ok": True, "mensaje": "Contraseña actualizada correctamente. Ya puedes iniciar sesión."}
