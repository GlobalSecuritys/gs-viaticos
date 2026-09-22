from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class SalidaRegistroCreate(BaseModel):
    # Campos opcionales del formulario previo de búsqueda
    serial: Optional[str] = None
    oficina: Optional[str] = None
    tecnico: Optional[str] = None
    fecha_busqueda: Optional[str] = None

    # Campos del formulario de salida
    orden: Optional[str] = None
    oficina_instalada: Optional[str] = None
    fecha: Optional[date] = None

    observaciones: Optional[str] = None


class SalidaRegistroResponse(BaseModel):
    id: int
    serial: Optional[str] = None
    oficina: Optional[str] = None
    tecnico: Optional[str] = None
    fecha_busqueda: Optional[str] = None
    orden: Optional[str] = None
    oficina_instalada: Optional[str] = None
    fecha: Optional[date] = None
    observaciones: Optional[str] = None
    creado_por_id: Optional[int] = None
    creado_en: datetime

    class Config:
        from_attributes = True


class ExcelHojaInfo(BaseModel):
    nombre: str
    columnas: List[str]
    total_filas: int


class ExcelContenidoResponse(BaseModel):
    existe: bool
    archivo: str
    hojas: List[str]
    hoja_activa: Optional[str] = None
    columnas: List[str] = []
    total_filas: int = 0
    filas: List[Dict[str, Any]] = []
    mensaje: Optional[str] = None


class BusquedaResultadoResponse(BaseModel):
    total_encontrados: int
    hoja: str
    criterios: Dict[str, Optional[str]]
    resultados: List[Dict[str, Any]]
