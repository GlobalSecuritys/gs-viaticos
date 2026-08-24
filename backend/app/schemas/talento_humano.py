from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class EmpleadoPerfilBase(BaseModel):
    cedula: Optional[str] = None
    telefono: Optional[str] = None
    telefono_alternativo: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    estado_civil: Optional[str] = None
    cargo: Optional[str] = None
    area: Optional[str] = None
    tipo_contrato: Optional[str] = None
    fecha_ingreso: Optional[date] = None
    estado_laboral: str = "activo"
    jefe_inmediato: Optional[str] = None
    contacto_emergencia_nombre: Optional[str] = None
    contacto_emergencia_parentesco: Optional[str] = None
    contacto_emergencia_telefono: Optional[str] = None
    contacto_emergencia_telefono_alt: Optional[str] = None
    dias_vacaciones_disponibles: int = 12
    dias_vacaciones_tomados: int = 3
    dias_vacaciones_programados: int = 0


class EmpleadoPerfilUpdate(BaseModel):
    nombre: Optional[str] = None
    correo: Optional[EmailStr] = None
    codigo_empleado: Optional[str] = None
    cedula: Optional[str] = None
    telefono: Optional[str] = None
    telefono_alternativo: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    estado_civil: Optional[str] = None
    cargo: Optional[str] = None
    area: Optional[str] = None
    tipo_contrato: Optional[str] = None
    fecha_ingreso: Optional[date] = None
    estado_laboral: Optional[str] = None
    jefe_inmediato: Optional[str] = None
    salario: Optional[Decimal] = None
    contacto_emergencia_nombre: Optional[str] = None
    contacto_emergencia_parentesco: Optional[str] = None
    contacto_emergencia_telefono: Optional[str] = None
    contacto_emergencia_telefono_alt: Optional[str] = None
    observaciones: Optional[str] = None
    dias_vacaciones_disponibles: Optional[int] = None
    dias_vacaciones_tomados: Optional[int] = None
    dias_vacaciones_programados: Optional[int] = None


class EmpleadoEstadoUpdate(BaseModel):
    estado_laboral: str

    @field_validator("estado_laboral")
    @classmethod
    def validar_estado(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("activo", "inactivo", "en_capacitacion"):
            raise ValueError("El estado debe ser 'activo', 'inactivo' o 'en_capacitacion'")
        return v


class EmpleadoPerfilAdminResponse(EmpleadoPerfilBase):
    id: int
    usuario_id: int
    salario: Optional[Decimal] = None
    observaciones: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by_id: Optional[int] = None
    updated_by_nombre: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class EmpleadoPerfilTecnicoResponse(EmpleadoPerfilBase):
    """Ficha segura para técnicos: SIN SALARIO ni campos administrativos confidenciales."""
    id: int
    usuario_id: int
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EmpleadoDocumentoResponse(BaseModel):
    id: int
    usuario_id: int
    tipo_documento: str
    nombre_documento: str
    url_archivo: Optional[str] = None
    estado: str
    fecha_carga: Optional[datetime] = None
    cargado_por_nombre: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmpleadoDocumentoCreate(BaseModel):
    tipo_documento: str
    nombre_documento: str


class EmpleadoHistorialResponse(BaseModel):
    id: int
    usuario_id: int
    actor_id: int
    actor_nombre: str
    actor_rol: str
    campo_modificado: str
    valor_anterior: Optional[str] = None
    valor_nuevo: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmpleadoSolicitudCreate(BaseModel):
    tipo: str  # 'actualizacion_datos', 'certificado_laboral', 'novedad', 'permiso', 'vacaciones'
    asunto: str
    mensaje: str


class EmpleadoSolicitudRespuesta(BaseModel):
    estado: str  # 'pendiente', 'en_revision', 'aprobado', 'rechazado', 'completado'
    respuesta_admin: str


class EmpleadoSolicitudResponse(BaseModel):
    id: int
    usuario_id: int
    tipo: str
    asunto: str
    mensaje: str
    estado: str
    respuesta_admin: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EmpleadoListItemResponse(BaseModel):
    id: int  # usuario_id
    nombre: str
    correo: str
    codigo_empleado: Optional[str] = None
    rol: str
    activo: bool
    cedula: Optional[str] = None
    cargo: Optional[str] = None
    area: Optional[str] = None
    estado_laboral: str = "activo"
    fecha_ingreso: Optional[date] = None
    jefe_inmediato: Optional[str] = None
    documentos_cargados: int = 0
    documentos_totales: int = 0

    model_config = ConfigDict(from_attributes=True)


class EmpleadoCompletoAdminResponse(BaseModel):
    id: int  # usuario_id
    nombre: str
    correo: str
    codigo_empleado: Optional[str] = None
    rol: str
    activo: bool
    perfil: Optional[EmpleadoPerfilAdminResponse] = None
    documentos: List[EmpleadoDocumentoResponse] = []
    historial: List[EmpleadoHistorialResponse] = []

    model_config = ConfigDict(from_attributes=True)


class EmpleadoCompletoTecnicoResponse(BaseModel):
    id: int  # usuario_id
    nombre: str
    correo: str
    codigo_empleado: Optional[str] = None
    rol: str
    activo: bool
    perfil: Optional[EmpleadoPerfilTecnicoResponse] = None
    documentos: List[EmpleadoDocumentoResponse] = []
    solicitudes: List[EmpleadoSolicitudResponse] = []

    model_config = ConfigDict(from_attributes=True)


class EmpleadoCreateAdmin(BaseModel):
    nombre: str
    correo: EmailStr
    password: Optional[str] = "GSB2026*"
    codigo_empleado: Optional[str] = None
    cedula: Optional[str] = None
    cargo: Optional[str] = "Técnico Instalador"
    area: Optional[str] = "Instalaciones"
    tipo_contrato: Optional[str] = "Término indefinido"
    fecha_ingreso: Optional[date] = None
    estado_laboral: str = "activo"
    jefe_inmediato: Optional[str] = "Carlos Ramírez"
    salario: Optional[Decimal] = None
    telefono: Optional[str] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    contacto_emergencia_nombre: Optional[str] = None
    contacto_emergencia_parentesco: Optional[str] = None
    contacto_emergencia_telefono: Optional[str] = None
    observaciones: Optional[str] = None
