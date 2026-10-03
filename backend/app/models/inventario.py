"""
Modelos de Inventario (proceso SGC "IN").
Modelos activos:
  * InventarioPlanilla (inventario_planillas): Agrupador independiente (5 planillas).
  * InventarioItem (inventario_items): Elemento de inventario asignado a una planilla.
  * InventarioMovimiento (inventario_movimientos): Kardex inmutable de entradas y salidas.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

TIPOS_MOVIMIENTO_ENTRADA = {"ajuste_inicial", "compra", "devolucion"}
TIPOS_MOVIMIENTO_SALIDA = {"salida"}
TIPOS_MOVIMIENTO = TIPOS_MOVIMIENTO_ENTRADA | TIPOS_MOVIMIENTO_SALIDA


class InventarioPlanilla(Base):
    """Agrupador de ítems (cada planilla representa un inventario independiente)."""

    __tablename__ = "inventario_planillas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    descripcion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1", default=1)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    creado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    items: Mapped[List["InventarioItem"]] = relationship(
        "InventarioItem",
        back_populates="planilla",
        order_by="InventarioItem.descripcion",
    )


class InventarioItem(Base):
    """Ficha de un elemento de inventario. `stock_actual` es un valor sincronizado
    con el kardex (inventario_movimientos)."""

    __tablename__ = "inventario_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    marca: Mapped[str] = mapped_column(String(60), nullable=False, server_default="GENERICA", default="GENERICA")
    planilla_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_planillas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    stock_actual: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    foto_referencia_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    foto_public_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    creado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    eliminado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    planilla: Mapped["InventarioPlanilla"] = relationship(
        "InventarioPlanilla", back_populates="items"
    )
    movimientos: Mapped[List["InventarioMovimiento"]] = relationship(
        "InventarioMovimiento",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventarioMovimiento.fecha.desc()",
    )


class InventarioMovimiento(Base):
    """Kardex: registro inmutable de entradas y salidas.
    La cantidad siempre es positiva; el signo lo determina el tipo."""

    __tablename__ = "inventario_movimientos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    observacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    origen: Mapped[str] = mapped_column(String(20), nullable=False, server_default="manual", default="manual")
    confianza_ia: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    traspaso_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stock_resultante: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    item: Mapped["InventarioItem"] = relationship("InventarioItem", back_populates="movimientos")


# Compatibilidad opcional por si asignaciones.py intenta importar InventarioDespacho
class InventarioDespacho(Base):
    __tablename__ = "inventario_legacy_despachos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asignacion_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
