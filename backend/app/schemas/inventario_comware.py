"""
Schemas Pydantic para las operaciones app-managed de inventario (Comware y futuras planillas).
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator


# ─────────────────────────────────────────────────────────────────────────────
# Sub-ítems
# ─────────────────────────────────────────────────────────────────────────────

class ItemEntrada(BaseModel):
    """Un ítem dentro de una Entrada (puede ser con o sin serial)."""
    descripcion: str
    tipo_serial: str = "sin_serial"  # "con_serial" | "sin_serial"
    seriales: Optional[List[str]] = None   # Solo si tipo_serial="con_serial"
    id_equipos: Optional[List[str]] = None  # Opcional, mismo largo que seriales
    cantidad: Optional[int] = None          # Solo si tipo_serial="sin_serial"

    @field_validator("descripcion")
    @classmethod
    def descripcion_no_vacia(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La descripción no puede estar vacía")
        return v


class ItemSalida(BaseModel):
    """Un ítem dentro de una Salida."""
    tipo_serial: str = "sin_serial"  # "con_serial" | "sin_serial"
    serial: Optional[str] = None     # Si con_serial
    descripcion: Optional[str] = None  # Si sin_serial
    cantidad: Optional[int] = None     # Si sin_serial


# ─────────────────────────────────────────────────────────────────────────────
# Requests
# ─────────────────────────────────────────────────────────────────────────────

class EntradaCreate(BaseModel):
    fecha: Optional[date] = None          # Por defecto hoy en el servicio
    numero_orden: Optional[str] = None
    codigo_barras: Optional[str] = None
    items: List[ItemEntrada]


class SalidaCreate(BaseModel):
    tecnico: str
    oficina: str
    fecha_despacho: Optional[date] = None  # Por defecto hoy
    observacion: str = "UT-GBSCOM"
    numero_orden: Optional[str] = None
    items: List[ItemSalida]

    @field_validator("tecnico", "oficina")
    @classmethod
    def no_vacio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El campo no puede estar vacío")
        return v.upper()


class InstalacionCreate(BaseModel):
    registro_ids: List[int]
    oficina_instalada: str
    fecha_instalacion: Optional[date] = None  # Por defecto hoy

    @field_validator("oficina_instalada")
    @classmethod
    def oficina_no_vacia(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La oficina instalada no puede estar vacía")
        return v


class DevolucionCreate(BaseModel):
    registro_id: int
    motivo: str

    @field_validator("motivo")
    @classmethod
    def motivo_no_vacio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El motivo no puede estar vacío")
        return v


class AnulacionCreate(BaseModel):
    registro_id: int
    motivo: str

    @field_validator("motivo")
    @classmethod
    def motivo_no_vacio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El motivo no puede estar vacío")
        return v


# ─────────────────────────────────────────────────────────────────────────────
# Responses
# ─────────────────────────────────────────────────────────────────────────────

class ResumenPlanillaApp(BaseModel):
    """Resumen rápido que devuelven los endpoints de escritura."""
    bodega: int
    salidas_totales: int
    pendientes: int
    instaladas: int
    total_registros: int
    ultimo_movimiento: Optional[str] = None  # ISO datetime del último mov.


class RegistroResponse(BaseModel):
    """Representación de una fila de inventario_registros."""
    id: int
    planilla_id: int
    hoja: str
    estado: str
    fecha: Optional[date]
    numero_orden: Optional[str]
    codigo_barras: Optional[str]
    descripcion: Optional[str]
    cantidad: int
    id_equipo: Optional[str]
    serial: Optional[str]
    concatenado: Optional[str]
    oficina: Optional[str]
    tecnico: Optional[str]
    fecha_despacho: Optional[date]
    observacion: Optional[str]
    numero_orden_despacho: Optional[str]
    oficina_instalada: Optional[str]
    fecha_instalacion: Optional[date]
    creado_en: datetime
    actualizado_en: datetime

    class Config:
        from_attributes = True


class MovimientoResponse(BaseModel):
    """Un registro del historial."""
    id: int
    planilla_id: int
    tipo: str
    usuario_id: Optional[int]
    fecha: datetime
    detalle_items: Optional[Any]
    datos_despacho: Optional[Any]
    motivo: Optional[str]
    resumen_texto: Optional[str]

    class Config:
        from_attributes = True


class OperacionResponse(BaseModel):
    """Respuesta estándar de cualquier operación de escritura."""
    ok: bool
    mensaje: str
    resumen: ResumenPlanillaApp
    registros: List[RegistroResponse] = []
