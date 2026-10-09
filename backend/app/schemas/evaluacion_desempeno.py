from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ItemCalificacion(BaseModel):
    calificacion: int = Field(..., ge=1, le=4, description="Calificación en escala de 1 a 4")
    observacion: Optional[str] = Field(default="", description="Observación opcional")


class AutoevaluacionSubmit(BaseModel):
    plantilla: Optional[str] = Field(default="directivos", description="Identificador de la plantilla (directivos, contable)")
    cargo: Optional[str] = None
    fecha: Optional[date] = None
    autoevaluacion: dict[str, ItemCalificacion] = Field(
        ..., description="Diccionario con número de ítem (ej: '1.1') y calificación"
    )
    compromisos: Optional[list[str]] = Field(
        default=None, description="Lista de compromisos generados"
    )


class EvaluacionSubmit(BaseModel):
    plantilla: Optional[str] = Field(default="directivos", description="Identificador de la plantilla (directivos, contable)")
    usuario_evaluado_id: Optional[int] = Field(default=None, description="ID del usuario evaluado")
    nombre_evaluador: str = Field(..., min_length=2, description="Nombre del evaluador / jefe")
    evaluacion: dict[str, ItemCalificacion] = Field(
        ..., description="Diccionario con número de ítem (ej: '1.1') y calificación"
    )
    compromisos: Optional[list[str]] = Field(
        default=None, description="Lista de compromisos generados"
    )


class EvaluacionDesempenoResponse(BaseModel):
    id: int
    usuario_evaluado_id: int
    plantilla: str
    cargo: str
    fecha: date
    nombre_evaluador: Optional[str] = None
    autoevaluacion: Optional[dict] = None
    evaluacion: Optional[dict] = None
    compromisos: Optional[list] = None
    estado: str
    autoevaluacion_enviada_por_id: Optional[int] = None
    autoevaluacion_enviada_en: Optional[datetime] = None
    evaluacion_enviada_por_id: Optional[int] = None
    evaluacion_enviada_en: Optional[datetime] = None
    creado_en: datetime
    actualizado_en: datetime

    model_config = ConfigDict(from_attributes=True)
