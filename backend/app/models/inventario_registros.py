"""
Modelos ORM para la gestión app-managed de inventario (Comware y futuras planillas).

inventario_registros: cada fila es una unidad física (estado: stock | pendiente | instalado).
inventario_historial_movimientos: log inmutable de cada operación (entrada, salida, instalación…).

Nota: las FKs a inventario_planillas y usuarios usan use_alter=True para evitar
problemas de orden de resolución en SQLAlchemy cuando los modelos se importan en
distintos módulos.
"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
# Importar InventarioPlanilla para que su tabla quede en el mismo metadata
from app.models.inventario import InventarioPlanilla  # noqa: F401


class InventarioRegistro(Base):
    """Una unidad física dentro de una planilla app-managed.

    Estados:
      stock     → en bodega (hoja INVENTARIO GENERAL)
      pendiente → despachada, pendiente de instalación (hoja SALIDAS)
      instalado → ya instalada en sitio (hoja SALIDAS, con fecha y oficina)
      anulado   → anulada (soft-delete; anulado_en IS NOT NULL)
    """

    __tablename__ = "inventario_registros"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    planilla_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("inventario_planillas.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    hoja: Mapped[str] = mapped_column(
        String(60), nullable=False, server_default="INVENTARIO GENERAL"
    )
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="stock", index=True
    )  # stock | pendiente | instalado

    # ── Datos de compra / ingreso ─────────────────────────────────────────────
    fecha: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    numero_orden: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    codigo_barras: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1", default=1)
    id_equipo: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    serial: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    concatenado: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # ── Datos de despacho (hoja SALIDAS) ─────────────────────────────────────
    oficina: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tecnico: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    fecha_despacho: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    observacion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero_orden_despacho: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Datos de instalación ──────────────────────────────────────────────────
    oficina_instalada: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    fecha_instalacion: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # ── Extra (columnas futuras del Excel sin campo propio) ───────────────────
    datos_extra: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # ── Auditoría ─────────────────────────────────────────────────────────────
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    creado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )

    # ── Anulación (soft-delete) ───────────────────────────────────────────────
    motivo_devolucion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motivo_anulacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    anulado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    anulado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class InventarioHistorialMovimiento(Base):
    """Log inmutable de cada operación sobre una planilla app-managed."""

    __tablename__ = "inventario_historial_movimientos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    planilla_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("inventario_planillas.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    # entrada | salida | instalacion | devolucion | anulacion
    usuario_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), index=True
    )
    detalle_items: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    datos_despacho: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resumen_texto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
