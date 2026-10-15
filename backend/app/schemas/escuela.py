from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


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
