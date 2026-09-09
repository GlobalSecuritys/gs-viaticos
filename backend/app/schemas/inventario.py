from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


TipoMovimiento = Literal["ajuste_inicial", "compra", "devolucion", "salida"]


class UsuarioSimple(BaseModel):
    id: int
    nombre: str
    correo: str

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# PLANILLAS
# -----------------------------------------------------------------------------
class PlanillaCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=50)
    descripcion: Optional[str] = Field(default=None, max_length=255)

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre(cls, v: str) -> str:
        return v.strip().upper()


class PlanillaUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=50)
    descripcion: Optional[str] = Field(default=None, max_length=255)
    activa: Optional[bool] = None

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().upper() if v else v


class PlanillaResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    activa: bool
    creado_en: datetime
    total_items: int = 0
    total_unidades: int = 0

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# ÍTEMS
# -----------------------------------------------------------------------------
class CodigoSugeridoResponse(BaseModel):
    """Siguiente código interno disponible, con el formato INV-{AÑO}-{SECUENCIAL}."""

    codigo: str
    anio: int
    secuencial: int


class ItemCreate(BaseModel):
    descripcion: str = Field(min_length=1, max_length=255)
    planilla_id: int
    codigo: Optional[str] = Field(default=None, max_length=60)
    marca: str = Field(default="GENERICA", max_length=60)
    # Cantidad con la que nace el ítem: genera un movimiento 'ajuste_inicial'.
    cantidad_inicial: int = Field(default=0, ge=0)
    observacion: Optional[str] = None

    @field_validator("descripcion", "marca")
    @classmethod
    def a_mayusculas(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("codigo")
    @classmethod
    def limpiar_codigo(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip().upper()
        return v or None


class ItemUpdate(BaseModel):
    descripcion: Optional[str] = Field(default=None, min_length=1, max_length=255)
    codigo: Optional[str] = Field(default=None, max_length=60)
    marca: Optional[str] = Field(default=None, max_length=60)
    planilla_id: Optional[int] = None

    @field_validator("descripcion", "marca")
    @classmethod
    def a_mayusculas(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().upper() if v else v

    @field_validator("codigo")
    @classmethod
    def limpiar_codigo(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().upper()
        return v or None


class ItemResponse(BaseModel):
    id: int
    codigo: Optional[str] = None
    descripcion: str
    marca: str
    planilla_id: int
    planilla_nombre: Optional[str] = None
    stock_actual: int
    foto_referencia_url: Optional[str] = None
    creado_en: datetime
    actualizado_en: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemListResponse(BaseModel):
    total: int
    items: List[ItemResponse]


# -----------------------------------------------------------------------------
# MOVIMIENTOS
# -----------------------------------------------------------------------------
class MovimientoCreate(BaseModel):
    tipo: TipoMovimiento
    cantidad: int = Field(gt=0, description="Siempre positiva; el signo lo da 'tipo'")
    observacion: Optional[str] = None


class MovimientoResponse(BaseModel):
    id: int
    item_id: int
    tipo: str
    cantidad: int
    usuario_id: int
    usuario_nombre: Optional[str] = None
    observacion: Optional[str] = None
    origen: str
    stock_resultante: int
    fecha: datetime

    model_config = ConfigDict(from_attributes=True)


class KardexResponse(BaseModel):
    item: ItemResponse
    movimientos: List[MovimientoResponse]


# -----------------------------------------------------------------------------
# DUPLICADOS
# -----------------------------------------------------------------------------
class DuplicadoMatch(BaseModel):
    item: ItemResponse
    score: float


class DuplicadosResponse(BaseModel):
    tipo: Literal["exacto", "posible", "ninguno"]
    matches: List[DuplicadoMatch]


# -----------------------------------------------------------------------------
# REPORTE GLOBAL
# -----------------------------------------------------------------------------
class PlanillaResumen(BaseModel):
    planilla_id: int
    planilla_nombre: str
    total_items: int
    total_unidades: int
    items_en_cero: int


class ReporteGlobalResponse(BaseModel):
    total_items: int
    total_unidades: int
    items_en_cero: int
    total_movimientos: int
    por_planilla: List[PlanillaResumen]
