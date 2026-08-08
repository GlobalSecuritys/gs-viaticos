from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class Asignacion(Base):
    """
    Asignación/Designación de un técnico a un cliente/OT durante un rango
    de fechas. Entidad independiente de Viatico (no se infiere de viáticos).

    Campos alineados 1:1 con lo que el frontend ya espera, según
    frontend/src/utils/asignaciones.js y AsignacionForm.jsx:
      - tipo: uno de TIPOS_ASIGNACION (rtc, oficina, instalacion, auditoria,
        capacitacion, mantenimiento, soporte)
      - estado: uno de ESTADOS_ASIGNACION (pendiente, en_curso, finalizada,
        cancelada)
    """

    __tablename__ = "asignaciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    tecnico_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    creado_por_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    cliente: Mapped[str] = mapped_column(String(150), nullable=False)
    empresa: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    ciudad: Mapped[str] = mapped_column(String(100), nullable=False)

    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    observaciones: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="pendiente",
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    tecnico: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[tecnico_id],
    )
    creado_por: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[creado_por_id],
    )
