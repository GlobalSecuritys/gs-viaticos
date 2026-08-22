from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

TipoGasto = Literal[
    "alimentacion",
    "transporte",
    "hotel",
    "peajes",
    "parqueadero",
    "materiales",
    "otros",
]

TipoIdentificacion = Literal["cedula", "nit_proveedor", "nit_nuevo"]


class AsignacionResumenViatico(BaseModel):
    id: int
    cliente: str
    empresa: str | None = None
    tipo: str | None = None
    ciudad: str
    monto_anticipo: Decimal
    total_gastado: Decimal
    saldo_restante: Decimal
    saldo_favor_tecnico: Decimal = Decimal("0.00")

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
    tipo_identificacion: str | None = "cedula"
    nit_identificacion: str | None = None


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
    tipo_identificacion: str | None = None
    nit_identificacion: str | None = None


class ViaticoPresupuestoUpdate(BaseModel):
    monto_presupuesto: Decimal = Field(gt=0)


class ViaticoEstadoUpdate(BaseModel):
    comentario_admin: str | None = None


class EvidenciaResponse(BaseModel):
    id: int
    secure_url: str
    public_id: str
    origen: str = "tecnico"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CuentaCobroViatico(BaseModel):
    """Subconjunto de CuentaCobro embebido en ViaticoResponse."""
    id: int
    consecutivo: str
    fecha: date
    ciudad: str
    tipo_identificacion: Optional[str] = "cedula"
    identificacion: Optional[str] = None
    concepto_servicio: str
    items: Optional[str] = None
    total: Decimal
    banco: str
    tipo_cuenta: str
    numero_cuenta: str
    titular_nombre: str
    titular_cedula: Optional[str] = None
    titular_celular: Optional[str] = None
    estado: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ViaticoResponse(ViaticoBase):
    id: int
    usuario_id: int
    asignacion_id: int | None = None
    monto_presupuesto: Decimal | None = None
    comentario_admin: str | None = None
    tipo_identificacion: str | None = "cedula"
    nit_identificacion: str | None = None
    estado: str
    created_at: datetime
    updated_at: datetime
    evidencias: list[EvidenciaResponse] = []
    asignacion_resumen: AsignacionResumenViatico | None = None
    cuenta_cobro: Optional[CuentaCobroViatico] = None

    model_config = ConfigDict(from_attributes=True)


class ViaticoAdminResponse(ViaticoResponse):
    codigo_empleado: str | None = None
    nombre: str
    correo: str

    model_config = ConfigDict(from_attributes=True)