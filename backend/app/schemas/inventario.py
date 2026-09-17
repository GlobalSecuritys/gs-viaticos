from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

UnionTemporalLiteral = Literal["RTC", "MANTENIMIENTO"]
EstadoDespachoLiteral = Literal[
    "instalado",
    "pendiente_instalacion",
    "alerta_seguimiento",
    "dañado",
    "suministro_oficina",
]


def _texto_opcional(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = " ".join(v.split())
    return v or None


# -----------------------------------------------------------------------------
# ÍTEMS (stock)
# -----------------------------------------------------------------------------
class ItemBase(BaseModel):
    codigo_barras: Optional[str] = Field(default=None, max_length=60)
    serial_gsb: Optional[str] = Field(default=None, max_length=60)
    fecha_compra: Optional[date] = None
    factura: Optional[str] = Field(default=None, max_length=60)
    no_sds: Optional[str] = Field(default=None, max_length=60)
    id_equipo: Optional[str] = Field(default=None, max_length=60)

    @field_validator("codigo_barras", "serial_gsb", "factura", "no_sds", "id_equipo")
    @classmethod
    def limpiar(cls, v: Optional[str]) -> Optional[str]:
        v = _texto_opcional(v)
        return v.upper() if v else None


class ItemCreate(ItemBase):
    union_temporal: UnionTemporalLiteral
    descripcion: str = Field(min_length=1, max_length=255)
    cantidad_stock: int = Field(default=0, ge=0)

    @field_validator("descripcion")
    @classmethod
    def normalizar_descripcion(cls, v: str) -> str:
        return " ".join(v.split()).upper()


class ItemUpdate(ItemBase):
    union_temporal: Optional[UnionTemporalLiteral] = None
    descripcion: Optional[str] = Field(default=None, min_length=1, max_length=255)
    cantidad_stock: Optional[int] = Field(default=None, ge=0)

    @field_validator("descripcion")
    @classmethod
    def normalizar_descripcion(cls, v: Optional[str]) -> Optional[str]:
        return " ".join(v.split()).upper() if v else v


class ItemResponse(BaseModel):
    id: int
    union_temporal: UnionTemporalLiteral
    codigo_barras: Optional[str] = None
    descripcion: str
    serial_gsb: Optional[str] = None
    cantidad_stock: int
    fecha_compra: Optional[date] = None
    factura: Optional[str] = None
    no_sds: Optional[str] = None
    id_equipo: Optional[str] = None
    total_despachos: int = 0
    creado_en: datetime
    actualizado_en: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemListResponse(BaseModel):
    total: int
    total_unidades: int
    items: List[ItemResponse]


# -----------------------------------------------------------------------------
# DESPACHOS (salidas)
# -----------------------------------------------------------------------------
class DespachoBase(BaseModel):
    oficina_destino: Optional[str] = Field(default=None, max_length=120)
    oficina_instalada: Optional[str] = Field(default=None, max_length=120)
    fecha_instalacion: Optional[date] = None
    numero_orden: Optional[str] = Field(default=None, max_length=60)
    observacion: Optional[str] = None

    @field_validator("oficina_destino", "oficina_instalada", "numero_orden")
    @classmethod
    def limpiar(cls, v: Optional[str]) -> Optional[str]:
        v = _texto_opcional(v)
        return v.upper() if v else None

    @field_validator("observacion")
    @classmethod
    def limpiar_observacion(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None


class DespachoCreate(DespachoBase):
    item_id: int
    # Desde la app el técnico es obligatorio y sale de la lista de `usuarios`.
    tecnico_id: int
    asignacion_id: Optional[int] = None
    cantidad: int = Field(default=1, gt=0)
    fecha_despacho: date
    estado: EstadoDespachoLiteral = "pendiente_instalacion"


class DespachoUpdate(DespachoBase):
    tecnico_id: Optional[int] = None
    asignacion_id: Optional[int] = None
    cantidad: Optional[int] = Field(default=None, gt=0)
    fecha_despacho: Optional[date] = None
    estado: Optional[EstadoDespachoLiteral] = None


class DespachoEstadoUpdate(BaseModel):
    estado: EstadoDespachoLiteral
    fecha_instalacion: Optional[date] = None


class DespachoResponse(BaseModel):
    id: int
    item_id: int
    item_descripcion: Optional[str] = None
    item_codigo_barras: Optional[str] = None
    item_serial_gsb: Optional[str] = None
    tecnico_id: Optional[int] = None
    tecnico_nombre: Optional[str] = None
    tecnico_nombre_origen: Optional[str] = None
    asignacion_id: Optional[int] = None
    asignacion_etiqueta: Optional[str] = None
    union_temporal: UnionTemporalLiteral
    estado: EstadoDespachoLiteral
    cantidad: int
    oficina_destino: Optional[str] = None
    oficina_instalada: Optional[str] = None
    fecha_despacho: Optional[date] = None
    fecha_instalacion: Optional[date] = None
    numero_orden: Optional[str] = None
    observacion: Optional[str] = None
    nota_migracion: Optional[str] = None
    migrado: bool = False
    creado_en: datetime
    actualizado_en: datetime


class DespachoListResponse(BaseModel):
    total: int
    por_estado: dict[str, int]
    despachos: List[DespachoResponse]


# -----------------------------------------------------------------------------
# PRÉSTAMOS
# -----------------------------------------------------------------------------
class PrestamoCreate(BaseModel):
    union_temporal: UnionTemporalLiteral
    descripcion: str = Field(min_length=1, max_length=255)
    cantidad: int = Field(gt=0)
    item_id: Optional[int] = None

    @field_validator("descripcion")
    @classmethod
    def normalizar_descripcion(cls, v: str) -> str:
        return " ".join(v.split()).upper()


class PrestamoUpdate(BaseModel):
    union_temporal: Optional[UnionTemporalLiteral] = None
    descripcion: Optional[str] = Field(default=None, min_length=1, max_length=255)
    cantidad: Optional[int] = Field(default=None, gt=0)
    item_id: Optional[int] = None

    @field_validator("descripcion")
    @classmethod
    def normalizar_descripcion(cls, v: Optional[str]) -> Optional[str]:
        return " ".join(v.split()).upper() if v else v


class PrestamoResponse(BaseModel):
    id: int
    union_temporal: UnionTemporalLiteral
    descripcion: str
    cantidad: int
    item_id: Optional[int] = None
    migrado: bool = False
    creado_en: datetime
    actualizado_en: datetime


# -----------------------------------------------------------------------------
# LECTURA DE TÉCNICOS Y ASIGNACIONES (para el formulario de despacho)
# -----------------------------------------------------------------------------
class TecnicoOpcion(BaseModel):
    id: int
    nombre: str
    activo: bool

    model_config = ConfigDict(from_attributes=True)


class AsignacionOpcion(BaseModel):
    id: int
    etiqueta: str
    estado: str
    fecha_inicio: date
    fecha_fin: date
