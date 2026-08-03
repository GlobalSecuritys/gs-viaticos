from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr


class UsuarioBase(BaseModel):
    nombre: str
    correo: EmailStr


class UsuarioCreate(UsuarioBase):
    password: str


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
