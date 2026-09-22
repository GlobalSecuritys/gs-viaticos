"""Modelo para registrar salidas de inventario.

Almacena la captura de búsqueda (serial, oficina, técnico, fecha_busqueda)
y los datos de la salida (orden, oficina_instalada, fecha).
"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventarioSalidaRegistro(Base):
    """Registro de salida de inventario."""

    __tablename__ = "inventario_salidas_registro"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Datos opcionales del formulario previo de búsqueda
    serial: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    oficina: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    tecnico: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    fecha_busqueda: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Datos del formulario de salida
    orden: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    oficina_instalada: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    fecha: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Metadatos de auditoría
    observaciones: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    creado_por_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
