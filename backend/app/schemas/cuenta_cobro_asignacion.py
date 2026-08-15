from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CuentaCobroAsignacionBase(BaseModel):
    asignacion_id: int
    secure_url: str
    public_id: str


class CuentaCobroAsignacionResponse(BaseModel):
    id: int
    asignacion_id: int
    tecnico_id: int
    secure_url: str
    public_id: str
    fecha_subida: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
