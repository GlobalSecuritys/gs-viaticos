from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class FalenciaResponse(BaseModel):
    """Aviso de solo lectura: un ítem calificado 1 o 2 por el jefe."""

    evaluacion_id: int
    usuario_id: int
    trabajador: str
    plantilla: str
    item_numero: str
    item_texto: str
    calificacion: int
    fecha: Optional[datetime] = None
    clave_modulo: str
    modulo_disponible: bool
    estado_modulo: str  # "Sin módulo" | "Módulo disponible"


class ModuloResumen(BaseModel):
    clave: str
    titulo: str


class MiFormacionResponse(BaseModel):
    falencias: list[FalenciaResponse]
    modulos: list[ModuloResumen]


class ModuloResponse(BaseModel):
    clave: str
    contenido: dict[str, Any]


class EstudianteResumen(BaseModel):
    id: int
    nombre: str
    correo: str
    grupo: str  # "administrativos" | "tecnicos"
    total_falencias: int
    peor_calificacion: Optional[int] = None
    total_archivos: int


class ArchivoEstudianteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_original: str
    descripcion: Optional[str] = None
    extension: str
    tipo_mime: str
    tamano_bytes: int
    subido_por_nombre: str
    subido_en: datetime


class FichaEstudianteResponse(EstudianteResumen):
    falencias: list[FalenciaResponse]
    archivos: list[ArchivoEstudianteResponse]


class EnlaceDescargaResponse(BaseModel):
    url: str
    expira_en: datetime
