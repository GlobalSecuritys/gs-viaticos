from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class CuentaCobroItemSchema(BaseModel):
    oficina: str
    fecha_inicio: str
    fecha_fin: str
    num_tecnicos: int = 1
    valor_diario: Decimal
    valor_total: Decimal


class CuentaCobroCreate(BaseModel):
    fecha: date
    ciudad: str
    tipo_identificacion: str = "cedula"
    identificacion: str
    concepto_servicio: str
    items: List[CuentaCobroItemSchema]
    total: Decimal

    banco: str
    tipo_cuenta: str
    numero_cuenta: str
    titular_nombre: str
    titular_cedula: str
    titular_celular: Optional[str] = None
    autorizacion_datos: bool = True
    viatico_id: Optional[int] = None


class CuentaCobroResponse(BaseModel):
    id: int
    consecutivo: str
    usuario_id: int
    viatico_id: Optional[int] = None
    fecha: date
    ciudad: str
    tipo_identificacion: str
    identificacion: str
    concepto_servicio: str
    items: str  # Cadena JSON
    total: Decimal
    banco: str
    tipo_cuenta: str
    numero_cuenta: str
    titular_nombre: str
    titular_cedula: str
    titular_celular: Optional[str] = None
    autorizacion_datos: bool
    estado: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
