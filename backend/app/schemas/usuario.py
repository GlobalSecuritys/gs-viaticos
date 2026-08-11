from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class UsuarioBase(BaseModel):
    nombre: str
    correo: EmailStr
    codigo_empleado: str | None = None


class UsuarioCreate(UsuarioBase):
    password: str

    @field_validator("codigo_empleado")
    @classmethod
    def validar_codigo_empleado(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit():
            raise ValueError("El código de empleado debe contener solo números")
        if not (6 <= len(v) <= 15):
            raise ValueError("El código de empleado debe tener entre 6 y 15 dígitos")
        return v

class UsuarioCreateAdmin(UsuarioCreate):
    """Creación de usuarios desde el panel de Super Admin.

    Reutiliza nombre/correo/codigo_empleado/password de UsuarioCreate (mismo
    validador de codigo_empleado, heredado). Solo agrega 'rol', restringido a
    'tecnico' o 'admin' — NO permite crear 'superadmin' mediante este schema.
    """

    rol: str

    @field_validator("rol")
    @classmethod
    def validar_rol_creacion(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("tecnico", "admin"):
            raise ValueError("El rol debe ser 'tecnico' o 'admin'")
        return v


class UsuarioLogin(BaseModel):
    correo: EmailStr
    password: str


class UsuarioResponse(UsuarioBase):
    id: int
    rol: str
    activo: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    correo: str | None = None


class AdminBootstrap(BaseModel):
    correo: EmailStr
    master_key: str


class UsuarioRolUpdate(BaseModel):
    rol: str

    @field_validator("rol")
    @classmethod
    def validar_rol(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("superadmin", "admin", "tecnico"):
            raise ValueError("El rol debe ser 'superadmin', 'admin' o 'tecnico'")
        return v


class UsuarioEstadoUpdate(BaseModel):
    """Activar/desactivar un usuario. Mismo patrón que UsuarioRolUpdate:
    un solo campo, validado, para PUT /admin/usuarios/{id}/estado."""

    activo: bool


class UsuarioInfoUpdate(BaseModel):
    """Editar nombre/correo/código de empleado desde el panel de admin.
    Reutiliza la misma validación de codigo_empleado que UsuarioCreate,
    pero lo permite None (no todos los usuarios lo tienen cargado)."""

    nombre: str
    correo: EmailStr
    codigo_empleado: str | None = None

    @field_validator("nombre")
    @classmethod
    def validar_nombre(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede estar vacío")
        return v

    @field_validator("codigo_empleado")
    @classmethod
    def validar_codigo_empleado(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        v = v.strip()
        if not v.isdigit():
            raise ValueError("El código de empleado debe contener solo números")
        if not (6 <= len(v) <= 15):
            raise ValueError("El código de empleado debe tener entre 6 y 15 dígitos")
        return v