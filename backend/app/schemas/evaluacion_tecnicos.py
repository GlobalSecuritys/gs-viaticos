from datetime import date, datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class PeriodoCreate(BaseModel):
    nombre: str = Field(..., min_length=3, max_length=100, description="Ej: SEGUNDO SEMESTRE 2026")


class PeriodoUpdate(BaseModel):
    nombre: str = Field(..., min_length=3, max_length=100)


class TituloPanelUpdate(BaseModel):
    titulo: str = Field(..., min_length=3, max_length=150)


class TituloPanelResponse(BaseModel):
    titulo: str


class PeriodoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    activo: bool
    creado_en: datetime
    cerrado_en: Optional[datetime] = None
    total_evaluaciones: Optional[int] = 0


class ConfigCapaUpdate(BaseModel):
    capa: str = Field(..., pattern="^(viaticos|asistente_oper)$")
    usuario_id: Optional[int] = None


class ConfigCapaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    capa: str
    usuario_id: Optional[int] = None
    usuario_nombre: Optional[str] = None
    usuario_correo: Optional[str] = None
    actualizado_en: Optional[datetime] = None


class CapaBorradorUpdate(BaseModel):
    respuestas: dict[str, Any] = Field(default_factory=dict)
    observacion: Optional[str] = None
    version: int = Field(..., ge=1)


class CapaEnviarSubmit(BaseModel):
    respuestas: dict[str, Any] = Field(...)
    observacion: Optional[str] = None
    version: int = Field(..., ge=1)


class CierreEvaluacionSubmit(BaseModel):
    observacion_final: str = Field(..., min_length=5, description="Observación final obligatoria de Pilar")


class CapaItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    capa: str
    respuestas: dict[str, Any]
    observacion: Optional[str] = None
    estado: str  # borrador | enviado
    enviado_en: Optional[datetime] = None
    enviado_por_id: Optional[int] = None
    enviado_por_nombre: Optional[str] = None
    version: int


class ResumenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    evaluacion_id: int
    calificacion_auto: Optional[float] = None
    calificacion_viaticos: Optional[float] = None
    calificacion_asistente_oper: Optional[float] = None
    calificacion_final: Optional[float] = None
    porcentaje: Optional[float] = None
    nivel: Optional[str] = None
    resultado: Optional[str] = None
    observacion_final: str
    cerrado_por_id: Optional[int] = None
    cerrado_por_nombre: Optional[str] = None
    cerrado_en: Optional[datetime] = None


class EvaluacionTecnicoListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_evaluado_id: int
    tecnico_nombre: str
    tecnico_cedula: Optional[str] = None
    tecnico_correo: str
    cargo: str
    periodo_id: Optional[int] = None
    periodo_nombre: Optional[str] = None
    estado: str  # pendiente | en_evaluacion | listo_para_cierre | completado
    estado_auto: str = "pendiente"
    estado_viaticos: str = "pendiente"
    estado_asistente_oper: str = "pendiente"
    calificacion_final: Optional[float] = None
    resultado: Optional[str] = None


class EvaluacionTecnicoDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_evaluado_id: int
    tecnico_nombre: str
    tecnico_cedula: Optional[str] = None
    tecnico_correo: str
    cargo: str
    fecha: date
    periodo_id: Optional[int] = None
    periodo_nombre: Optional[str] = None
    estado: str
    nombre_evaluador: Optional[str] = None
    capas: dict[str, Optional[CapaItemResponse]] = Field(default_factory=dict)
    resumen: Optional[ResumenResponse] = None
    puede_editar_capas: list[str] = Field(default_factory=list)
