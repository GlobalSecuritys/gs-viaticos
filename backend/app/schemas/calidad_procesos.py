from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ResponsableUsuarioSimple(BaseModel):
    id: int
    nombre: str
    correo: str
    codigo_empleado: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ProcesoCalidadResponsableCreate(BaseModel):
    usuario_id: int
    rol_en_proceso: str = Field(default="Responsable", max_length=100)


class ProcesoCalidadResponsableResponse(BaseModel):
    id: int
    proceso_id: int
    usuario_id: int
    rol_en_proceso: str
    asignado_por: Optional[int] = None
    created_at: datetime
    usuario: Optional[ResponsableUsuarioSimple] = None

    model_config = ConfigDict(from_attributes=True)


class ProcesoCalidadDocumentoUpdate(BaseModel):
    nombre_documento: Optional[str] = None
    descripcion: Optional[str] = None
    categoria_documento: Optional[str] = None
    version: Optional[str] = None


class ProcesoCalidadDocumentoResponse(BaseModel):
    id: int
    proceso_id: int
    nombre_documento: str
    descripcion: Optional[str] = None
    categoria_documento: str
    cloudinary_public_id: str
    cloudinary_secure_url: str
    version: str
    subido_por: Optional[int] = None
    created_at: datetime
    usuario_subio: Optional[ResponsableUsuarioSimple] = None

    model_config = ConfigDict(from_attributes=True)


class ProcesoCalidadBase(BaseModel):
    nombre: str
    codigo: str
    categoria: str
    descripcion: Optional[str] = None
    color_hex: str = "#D4AF37"
    orden: int = 0


class ProcesoCalidadCreate(ProcesoCalidadBase):
    pass


class ProcesoCalidadUpdate(BaseModel):
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    categoria: Optional[str] = None
    descripcion: Optional[str] = None
    color_hex: Optional[str] = None
    orden: Optional[int] = None


class ProcesoCalidadListResponse(ProcesoCalidadBase):
    id: int
    created_at: datetime
    updated_at: datetime
    total_documentos: int = 0
    responsables: List[ProcesoCalidadResponsableResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ProcesoCalidadDetailResponse(ProcesoCalidadBase):
    id: int
    created_at: datetime
    updated_at: datetime
    responsables: List[ProcesoCalidadResponsableResponse] = []
    documentos: List[ProcesoCalidadDocumentoResponse] = []

    model_config = ConfigDict(from_attributes=True)
