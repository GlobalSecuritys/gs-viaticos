from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator


class UsuarioBase(BaseModel):
    nombre: str
    correo: EmailStr
    codigo_empleado: str | None = None


class UsuarioCreate(UsuarioBase):
    password: str

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

class UsuarioCreateAdmin(UsuarioCreate):
    """Creación de usuarios desde el panel de Administración.
    Solo permite crear 'tecnico' o 'administrador' (guardado internamente como 'superadmin').
    El rol intermedio 'admin' ha sido eliminado del sistema.
    """

    rol: str

    @field_validator("rol")
    @classmethod
    def validar_rol_creacion(cls, v: str) -> str:
        v = v.strip().lower()
        if v in ("administrador", "admin", "superadmin"):
            return "superadmin"
        if v == "tecnico":
            return "tecnico"
        raise ValueError("El rol debe ser 'tecnico' o 'administrador'")


class UsuarioLogin(BaseModel):
    correo: EmailStr
    password: str


class UsuarioResponse(UsuarioBase):
    id: int
    rol: str
    activo: bool
    acceso_viaticos: bool = False
    es_admin_calidad: bool = False
    acceso_mapa: bool = False
    rol_mapa: str = "lector"
    accesos_procesos: dict[str, str] = {}
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _extract_accesos_virtuales(cls, values):
        """
        El campo accesos_procesos no es una columna de la tabla 'usuarios'.
        get_current_user lo setea como atributo instancia virtual (_accesos_procesos)
        en el objeto Usuario de SQLAlchemy antes de que Pydantic serialice.
        Este validador lo transfiere al campo público del schema.
        """
        # Cuando viene desde ORM (object con __dict__), extraer el atributo privado
        if hasattr(values, "__dict__"):
            obj_dict = vars(values)
            priv_accesos = obj_dict.get("_accesos_procesos")
            if priv_accesos is not None:
                # Convertir a dict mutable para que Pydantic pueda asignarlo
                values.__dict__["accesos_procesos"] = dict(priv_accesos)
        return values


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
        if v in ("administrador", "admin", "superadmin"):
            return "superadmin"
        if v == "tecnico":
            return "tecnico"
        raise ValueError("El rol debe ser 'administrador' o 'tecnico'")


class UsuarioEstadoUpdate(BaseModel):
    """Activar/desactivar un usuario. Mismo patrón que UsuarioRolUpdate:
    un solo campo, validado, para PUT /admin/usuarios/{id}/estado."""

    activo: bool


class UsuarioAccesoViaticosUpdate(BaseModel):
    """Otorgar/quitar acceso a viáticos. Exclusivo para admin@gsbank.com."""

    acceso_viaticos: bool


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