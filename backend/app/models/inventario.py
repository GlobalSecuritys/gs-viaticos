from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# Tipos de movimiento admitidos. No se modelan como ENUM de BD a propósito
# (misma convención que el resto del sistema: strings + validación en schema),
# para poder agregar tipos nuevos sin migración de tipo.
TIPOS_MOVIMIENTO_ENTRADA = {"ajuste_inicial", "compra", "devolucion"}
TIPOS_MOVIMIENTO_SALIDA = {"salida"}
TIPOS_MOVIMIENTO = TIPOS_MOVIMIENTO_ENTRADA | TIPOS_MOVIMIENTO_SALIDA


class InventarioPlanilla(Base):
    """Agrupador de ítems (equivalente a una hoja del Excel: MANTENIMIENTO, RTC, ...)."""

    __tablename__ = "inventario_planillas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    descripcion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
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
    """Ficha de un elemento de inventario. `stock_actual` es un agregado derivado
    de los movimientos: se actualiza incrementalmente en cada inserción de
    Movimiento para no tener que sumar el kardex completo en cada listado."""

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
    # Soft-delete, misma convención que asignaciones.eliminado_en
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
    """Kardex: registro inmutable de entradas y salidas. `cantidad` siempre es
    positiva; el signo lo determina `tipo`."""

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
    # 'manual' hoy; 'foto_ia' queda reservado para la fase 2 de captura por foto,
    # así esa fase no necesita una migración de columnas.
    origen: Mapped[str] = mapped_column(String(20), nullable=False, server_default="manual", default="manual")
    confianza_ia: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Stock resultante después de aplicar este movimiento (foto del kardex).
    stock_resultante: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    item: Mapped["InventarioItem"] = relationship("InventarioItem", back_populates="movimientos")
