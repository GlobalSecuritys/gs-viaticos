from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# Los tipos de traspaso quedan fuera de este Literal a propósito: solo los emite
# el motor de traspasos, nunca la captura manual de movimientos.
TipoMovimiento = Literal["ajuste_inicial", "compra", "devolucion", "salida"]
TipoEmpresa = Literal["global", "union_temporal"]
EstadoTraspaso = Literal["pendiente", "completado", "rechazado"]
NivelEntidad = Literal["ninguno", "lector", "admin"]


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
    # Entidad a la que pertenece la planilla. `cliente_id` solo aplica a las
    # tarjetas de Global; en las uniones temporales va siempre en None.
    empresa_id: int
    cliente_id: Optional[int] = None

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
    empresa_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
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
    # Scope heredado de la planilla, para que la UI sepa de qué entidad es el
    # ítem sin tener que resolver la planilla por su cuenta.
    empresa_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
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
    # Presentes solo en los movimientos generados por un traspaso: permiten que
    # el kardex diga "vino de / fue a [entidad]".
    traspaso_id: Optional[int] = None
    traspaso_contraparte: Optional[str] = None

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


# -----------------------------------------------------------------------------
# JERARQUÍA EMPRESARIAL
# -----------------------------------------------------------------------------
class ClienteResponse(BaseModel):
    """Tarjeta de segundo nivel (solo bajo la empresa tipo `global`)."""

    id: int
    empresa_id: int
    nombre: str
    orden: int
    total_items: int = 0
    total_unidades: int = 0
    # Nivel del usuario que consulta sobre esta tarjeta, y si puede entrar.
    nivel: NivelEntidad = "ninguno"
    accesible: bool = False

    model_config = ConfigDict(from_attributes=True)


class EmpresaResponse(BaseModel):
    id: int
    nombre: str
    tipo: TipoEmpresa
    orden: int
    # Las uniones temporales llevan lista vacía: su inventario es directo.
    clientes: List[ClienteResponse] = []
    # Totales de toda la caja (lo directo más el de sus tarjetas).
    total_items: int = 0
    total_unidades: int = 0
    # Solo lo que cuelga de la empresa sin tarjeta. En las uniones temporales es
    # todo su inventario; en Global son las planillas generales heredadas
    # (MANTENIMIENTO, RTC), que no pertenecen a ninguna tarjeta.
    total_items_directo: int = 0
    total_unidades_directo: int = 0
    # Nivel sobre el inventario DIRECTO de la caja (cliente_id NULL). Las
    # tarjetas llevan el suyo propio en `clientes[].nivel`.
    nivel: NivelEntidad = "ninguno"
    accesible: bool = False

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# TRASPASOS ENTRE ENTIDADES
# -----------------------------------------------------------------------------
class TraspasoCreate(BaseModel):
    item_origen_id: int
    cantidad: int = Field(gt=0)
    empresa_destino_id: int
    cliente_destino_id: Optional[int] = None
    notas: Optional[str] = None


class TraspasoResolucion(BaseModel):
    """Cuerpo opcional al aprobar o rechazar: solo agrega una nota al traspaso."""

    notas: Optional[str] = None


class TraspasoResponse(BaseModel):
    id: int
    estado: EstadoTraspaso
    cantidad: int

    item_origen_id: int
    item_destino_id: Optional[int] = None
    item_descripcion: Optional[str] = None
    item_codigo: Optional[str] = None

    empresa_origen_id: int
    empresa_origen_nombre: Optional[str] = None
    cliente_origen_id: Optional[int] = None
    cliente_origen_nombre: Optional[str] = None

    empresa_destino_id: int
    empresa_destino_nombre: Optional[str] = None
    cliente_destino_id: Optional[int] = None
    cliente_destino_nombre: Optional[str] = None

    solicitado_por_id: int
    solicitado_por_nombre: Optional[str] = None
    fecha_solicitud: datetime
    aprobado_por_id: Optional[int] = None
    aprobado_por_nombre: Optional[str] = None
    fecha_completado: Optional[datetime] = None
    notas: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# ACCESOS POR ENTIDAD DE INVENTARIO
# -----------------------------------------------------------------------------
# Quién puede ver y operar cada empresa/tarjeta. Es independiente del Mapa de
# Procesos SGC: require_seccion("IN", ...) sigue siendo la puerta al módulo y
# esto decide qué entidades ve el usuario una vez dentro.
class AccesoInventarioSet(BaseModel):
    """Establece (o quita, con nivel='ninguno') el acceso de un usuario a una entidad."""

    usuario_id: int
    empresa_id: int
    cliente_id: Optional[int] = None
    nivel: NivelEntidad


class AccesoInventarioResponse(BaseModel):
    usuario_id: int
    empresa_id: int
    empresa_nombre: Optional[str] = None
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
    nivel: NivelEntidad

    model_config = ConfigDict(from_attributes=True)


class UsuarioAccesosInventario(BaseModel):
    """Un usuario y todas sus entidades asignadas, para el panel de gestión."""

    usuario_id: int
    nombre: str
    correo: str
    rol: str
    # superadmin y la cuenta Master no necesitan asignaciones: entran a todo.
    acceso_total: bool = False
    accesos: List[AccesoInventarioResponse] = []
