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
    termino = form_data.username.strip().lower()

    # Buscar por correo, código de empleado o nombre
    stmt = select(Usuario).where(
        (func.lower(Usuario.correo) == termino) |
        (func.lower(func.coalesce(Usuario.codigo_empleado, "")) == termino) |
        (func.lower(Usuario.nombre) == termino)
    )
    usuario = db.scalar(stmt)

    # Soporte para ingresar con tecnicoplantagsb@gsbsecurity.com o alias administrativos
    if not usuario and termino in (
        "tecnicoplantagsb@gsbsecurity.com",
        "tecnicoplantagsb",
        "admin",
        "admin@gsbank.com",
        "admin gsb",
    ):
        usuario = db.scalar(select(Usuario).where(Usuario.id == 4))

    print(f"[LOGIN] Intento con '{termino}' -> Usuario asignado: {getattr(usuario, 'correo', None)} (id={getattr(usuario, 'id', None)})")
    pwd_ok = verify_password(form_data.password, usuario.password_hash) if usuario else False
    print(f"[LOGIN] Resultado validación contraseña: {pwd_ok}")

    if not usuario or not pwd_ok:
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

    correo_clean = (usuario.correo or "").strip().lower()
    es_pilar = correo_clean == "pilaradmin@gsbank.com"
    access_token = create_access_token(data={
        "sub": usuario.correo,
        "rol": usuario.rol,
        "id": usuario.id,
        "nombre": usuario.nombre,
        "codigo_empleado": usuario.codigo_empleado,
        "acceso_viaticos": usuario.acceso_viaticos,
        "es_admin_calidad": True if es_pilar else getattr(usuario, "es_admin_calidad", False),
        "acceso_mapa": True if es_pilar else getattr(usuario, "acceso_mapa", False),
        "rol_mapa": "editor" if es_pilar else getattr(usuario, "rol_mapa", "lector"),
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
# PASO 1 — Solicitar código OTP (el código llega a tecnicoplantagsb@gsbsecurity.com)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/solicitar-reset")
def solicitar_reset(
    body: SolicitarResetIn,
    db: Annotated[Session, Depends(get_db)]
):
    """
    Busca la cuenta específica que el usuario desea restablecer.
    Genera el código OTP de 6 dígitos y lo envía a la casilla central
    tecnicoplantagsb@gsbsecurity.com indicando de qué cuenta es la solicitud.
    """
    _limpiar_expirados()

    termino = (body.correo_o_usuario or "").strip().lower()
    if not termino:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Por favor ingresa tu correo electrónico o código de empleado."
        )

    print(f"[AUTH RESET] Solicitud de reset recibida para término: '{termino}'")

    # Buscar la cuenta por correo, código de empleado o nombre
    stmt = select(Usuario).where(
        (func.lower(Usuario.correo) == termino) |
        (func.lower(func.coalesce(Usuario.codigo_empleado, "")) == termino) |
        (func.lower(Usuario.nombre) == termino)
    )
    usuario = db.scalar(stmt)

    if not usuario or not usuario.activo:
        print(f"[AUTH RESET] ❌ No se encontró usuario activo para '{termino}'")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontró ninguna cuenta activa con el correo o usuario '{termino}'. Verifica los datos ingresados."
        )

    correo_norm = usuario.correo.strip().lower()
    codigo = _generar_codigo()
    now = time.time()

    with _store_lock:
        data = {
            "codigo": codigo,
            "expires_at": now + OTP_TTL_SECONDS,
            "verificado": False,
            "usuario_id": usuario.id,
            "usuario_correo": usuario.correo,
            "usuario_nombre": usuario.nombre,
        }
        _reset_store[correo_norm] = data
        if termino != correo_norm:
            _reset_store[termino] = data

    print(f"[AUTH RESET] Código {codigo} generado para usuario {usuario.nombre} ({usuario.correo}, id={usuario.id})")

    # Enviar correo al buzón fijo tecnicoplantagsb@gsbsecurity.com
    enviar_codigo_reset(f"{usuario.nombre} ({usuario.correo})", codigo)

    return {
        "ok": True,
        "correo_cuenta": usuario.correo,
        "nombre_cuenta": usuario.nombre,
        "mensaje": f"Se ha enviado el código de verificación al buzón autorizado tecnicoplantagsb@gsbsecurity.com para la cuenta de {usuario.nombre}."
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
    Valida el código OTP para la cuenta específica. Si es correcto, lo marca
    como 'verificado' y extiende el TTL 5 minutos adicionales.
    """
    _limpiar_expirados()

    termino = (body.correo or "").strip().lower()

    with _store_lock:
        entrada = _reset_store.get(termino)

        if not entrada:
            # Buscar por si se indexó con otro término
            for k, v in _reset_store.items():
                if termino in (k, v.get("usuario_correo", "").lower()):
                    entrada = v
                    break

        if not entrada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código ha expirado o no existe para esta cuenta. Solicita uno nuevo."
            )

        if time.time() > entrada["expires_at"]:
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
    Cambia la contraseña EXCLUSIVAMENTE de la cuenta del usuario que solicitó
    el restablecimiento.
    """
    _limpiar_expirados()

    if len(body.nueva_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La nueva contraseña debe tener al menos 8 caracteres."
        )

    termino = (body.correo or "").strip().lower()

    with _store_lock:
        entrada = _reset_store.get(termino)

        if not entrada:
            for k, v in _reset_store.items():
                if termino in (k, v.get("usuario_correo", "").lower()):
                    entrada = v
                    break

        if not entrada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La sesión de recuperación ha expirado o no existe. Inicia el proceso de nuevo."
            )

        if time.time() > entrada["expires_at"]:
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

        target_uid = entrada["usuario_id"]

    usuario = db.get(Usuario, target_uid)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado en la base de datos."
        )

    # Actualizar contraseña EXCLUSIVAMENTE para este usuario
    usuario.password_hash = hash_password(body.nueva_password)
    db.commit()

    print(f"[AUTH RESET] ✅ Contraseña actualizada con éxito para {usuario.nombre} ({usuario.correo}, id={usuario.id})")

    # Limpiar el código del store
    with _store_lock:
        _reset_store.pop(usuario.correo.strip().lower(), None)
        _reset_store.pop(termino, None)

    return {
        "ok": True,
        "mensaje": f"Contraseña actualizada correctamente para {usuario.nombre}. Ya puedes iniciar sesión con tu nueva contraseña."
    }
