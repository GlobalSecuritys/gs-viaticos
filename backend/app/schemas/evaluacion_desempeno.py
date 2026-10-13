from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ItemCalificacion(BaseModel):
    calificacion: int = Field(..., ge=1, le=4, description="Calificación en escala de 1 a 4")
    observacion: Optional[str] = Field(default="", description="Observación opcional")


class AutoevaluacionSubmit(BaseModel):
    plantilla: Optional[str] = Field(default="directivos", description="Identificador de la plantilla (directivos, contable, operaciones)")
    cargo: Optional[str] = None
    fecha: Optional[date] = None
    autoevaluacion: dict[str, ItemCalificacion] = Field(
        ..., description="Diccionario con número de ítem (ej: '1.1') y calificación"
    )


class EvaluacionSubmit(BaseModel):
    plantilla: Optional[str] = Field(default="directivos", description="Identificador de la plantilla (directivos, contable, operaciones)")
    usuario_evaluado_id: Optional[int] = Field(default=None, description="ID del usuario evaluado")
    nombre_evaluador: str = Field(..., min_length=2, description="Nombre del evaluador / jefe")
    evaluacion: dict[str, ItemCalificacion] = Field(
        ..., description="Diccionario con número de ítem (ej: '1.1') y calificación"
    )


class CompromisosUpdate(BaseModel):
    compromisos: list[str] = Field(..., description="Lista de exactamente 8 compromisos")
    version: int = Field(..., ge=1, description="Versión cargada para control de concurrencia optimista")

    @field_validator("compromisos")
    @classmethod
    def validar_compromisos(cls, v: list[str]) -> list[str]:
        if len(v) != 8:
            raise ValueError("La lista de compromisos debe tener exactamente 8 elementos.")
        limpios = []
        for idx, c in enumerate(v):
            txt = str(c or "").strip()
            if len(txt) > 500:
                raise ValueError(f"El compromiso #{idx + 1} no puede superar los 500 caracteres.")
            limpios.append(txt)
        return limpios


class CompromisosResponse(BaseModel):
    id: int
    evaluacion_id: int
    compromisos: list[str]
    estado: str
    nombre_evaluador: Optional[str] = None
    cerrado_por_id: Optional[int] = None
    cerrado_en: Optional[datetime] = None
    version: int
    actualizado_en: datetime
    creado_en: datetime
    puede_editar: bool = False
    puede_cerrar: bool = False

    model_config = ConfigDict(from_attributes=True)


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

