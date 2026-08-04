from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class UsuarioBase(BaseModel):
    nombre: str
    correo: EmailStr
    codigo_empleado: str


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
        if v not in ("admin", "tecnico"):
            raise ValueError("El rol debe ser 'admin' o 'tecnico'")
        return v