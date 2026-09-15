from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BitacoraBackupCrear(BaseModel):
    texto: str = Field(min_length=1, max_length=5000)


class BitacoraBackupResponse(BaseModel):
    id: int
    texto: str
    estado: str
    usuario_nombre: Optional[str] = None
    completado_en: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BitacoraBackupCompletarResponse(BaseModel):
    """Resultado de archivar las anotaciones pendientes tras un backup."""

    completadas: int
