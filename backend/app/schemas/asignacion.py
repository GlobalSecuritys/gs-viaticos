from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

TipoAsignacion = Literal[
    "rtc",
    "oficina",
    "instalacion",
    "auditoria",
    "capacitacion",
    "mantenimiento",
    "soporte",
]

EstadoAsignacion = Literal[
    "pendiente",
    "en_curso",
    "finalizada",
    "cancelada",
]


class AsignacionBase(BaseModel):
    tecnico_id: int
    tipo: TipoAsignacion
    cliente: str
    empresa: str | None = None
    ciudad: str
    fecha_inicio: date
    fecha_fin: date
    observaciones: str | None = None

    @model_validator(mode="after")
    def validar_rango_fechas(self) -> "AsignacionBase":
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError(
                "La fecha de fin no puede ser anterior a la fecha de inicio"
            )
        return self


class AsignacionCreate(AsignacionBase):
    pass


class AsignacionUpdate(BaseModel):
    """
    Edición de una asignación existente. Todos los campos son opcionales
    (incluye reasignar tecnico_id), tal como lo consume AsignacionForm.jsx
    al reutilizarse tanto para crear como para editar.
    """

    tecnico_id: int | None = None
    tipo: TipoAsignacion | None = None
    cliente: str | None = None
    empresa: str | None = None
    ciudad: str | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    observaciones: str | None = None

    @model_validator(mode="after")
    def validar_rango_fechas(self) -> "AsignacionUpdate":
        if (
            self.fecha_inicio is not None
            and self.fecha_fin is not None
            and self.fecha_fin < self.fecha_inicio
        ):
            raise ValueError(
                "La fecha de fin no puede ser anterior a la fecha de inicio"
            )
        return self


class AsignacionResponse(AsignacionBase):
    """
    Shape 1:1 con lo que ya consumen Asignaciones.jsx, DetalleAsignacion.jsx
    y utils/asignaciones.js: incluye estado y los nombres ya resueltos
    (tecnico_nombre, creado_por_nombre), que el router arma a partir de
    las relaciones tecnico/creado_por del modelo (igual que
    ViaticoAdminResponse resuelve nombre/correo).
    """

    id: int
    estado: EstadoAsignacion
    creado_por_id: int
    tecnico_nombre: str
    creado_por_nombre: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)