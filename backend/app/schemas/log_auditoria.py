from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LogAuditoriaResponse(BaseModel):
    id: int
    actor_id: int
    actor_nombre: str
    actor_rol: str
    usuario_objetivo_id: Optional[int] = None
    usuario_objetivo_nombre: Optional[str] = None
    accion: str
    detalle: Optional[str] = None
    resultado: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
