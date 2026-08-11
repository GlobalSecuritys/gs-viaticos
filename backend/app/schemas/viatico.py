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


class AsignacionResumenViatico(BaseModel):
    id: int
    cliente: str
    ciudad: str
    monto_anticipo: Decimal
    total_gastado: Decimal
    saldo_restante: Decimal

    model_config = ConfigDict(from_attributes=True)


class ViaticoBase(BaseModel):
    fecha: date
    cliente: str
    ciudad: str
    ot: str
    tipo_gasto: str
    valor: Decimal
    descripcion: str | None = None
    asignacion_id: int | None = None
    monto_presupuesto: Decimal | None = None


class ViaticoCreate(ViaticoBase):
    tipo_gasto: TipoGasto
    valor: Decimal = Field(gt=0)
    asignacion_id: int | None = None


class ViaticoUpdate(BaseModel):
    fecha: date | None = None
    cliente: str | None = None
    ciudad: str | None = None
    ot: str | None = None
    tipo_gasto: str | None = None
    valor: Decimal | None = None
    descripcion: str | None = None
    asignacion_id: int | None = None
    monto_presupuesto: Decimal | None = None


class ViaticoPresupuestoUpdate(BaseModel):
    monto_presupuesto: Decimal = Field(gt=0)


class EvidenciaResponse(BaseModel):
    id: int
    secure_url: str
    public_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ViaticoResponse(ViaticoBase):
    id: int
    usuario_id: int
    asignacion_id: int | None = None
    monto_presupuesto: Decimal | None = None
    estado: str
    created_at: datetime
    updated_at: datetime
    evidencias: list[EvidenciaResponse] = []
    asignacion_resumen: AsignacionResumenViatico | None = None

    model_config = ConfigDict(from_attributes=True)


class ViaticoAdminResponse(ViaticoResponse):
    codigo_empleado: str | None = None
    nombre: str
    correo: str

    model_config = ConfigDict(from_attributes=True)