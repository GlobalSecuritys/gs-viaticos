"""
Schemas del panel de administración de Viáticos.

Contienen las respuestas agregadas que reemplazan los cálculos que antes hacía
el frontend recorriendo TODOS los viáticos (`GET /admin/viaticos`).
"""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

PeriodoResumen = Literal["hoy", "semana", "mes", "historico"]


class ResumenGastosFila(BaseModel):
    """Gasto acumulado de un técnico dentro del periodo consultado."""

    usuario_id: int
    nombre: str
    total: Decimal
    cantidad: int


class ResumenGastosResponse(BaseModel):
    """
    Fuente ÚNICA del "total gastado" del panel. `total` corresponde al periodo
    solicitado y `total_historico` a todo el sistema desde su creación, de modo
    que la UI no necesita dos consultas distintas para ambos indicadores.

    En ambos casos se excluyen los viáticos en estado `rechazado`, igual que
    hacen el cálculo de asignaciones (`asignaciones._a_response`) y el SUMIF del
    Excel de legalización. `total_rechazado` se expone solo para auditar cuánto
    quedó fuera por ese motivo.
    """

    periodo: PeriodoResumen
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    total: Decimal
    total_historico: Decimal
    total_rechazado: Decimal
    filas: list[ResumenGastosFila]


class TecnicoAsignacionResumen(BaseModel):
    """Asignación de un técnico con su anticipo y gasto ya agregados en SQL."""

    id: int
    cliente: str
    empresa: str | None = None
    ciudad: str
    tipo: str
    estado: str
    fecha_inicio: date
    fecha_fin: date
    monto_anticipo: Decimal
    total_gastado: Decimal


class TecnicoDashboardResponse(BaseModel):
    """
    Ficha de técnico para el listado del panel. Se sirve SOLO bajo búsqueda o
    cuando el admin pide expandir el listado completo, nunca en la carga inicial.
    """

    id: int
    nombre: str
    correo: str
    codigo_empleado: str | None = None
    rol: str
    activo: bool
    cantidad_viaticos: int
    total_gastado: Decimal
    asignacion_activa: TecnicoAsignacionResumen | None = None
    asignaciones: list[TecnicoAsignacionResumen] = []
