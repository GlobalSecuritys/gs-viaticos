from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class NotificacionResponse(BaseModel):
    id: int
    tecnico_nombre: str
    valor: Decimal
    ciudad: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
