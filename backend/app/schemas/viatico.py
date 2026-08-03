from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

TipoGasto = Literal[
    "alimentacion",
    "transporte",
    "hotel",
    "peajes",
    "parqueadero",
    "otros",
]


class ViaticoBase(BaseModel):
    fecha: date
    cliente: str
    ciudad: str
    ot: str
    tipo_gasto: str
    valor: Decimal
    descripcion: str | None = None


class ViaticoCreate(ViaticoBase):
    tipo_gasto: TipoGasto
    valor: Decimal = Field(gt=0)


class ViaticoUpdate(BaseModel):
    fecha: date | None = None
    cliente: str | None = None
    ciudad: str | None = None
    ot: str | None = None
    tipo_gasto: str | None = None
    valor: Decimal | None = None
    descripcion: str | None = None


class ViaticoResponse(ViaticoBase):
    id: int
    usuario_id: int
    estado: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
