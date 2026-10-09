from datetime import date, datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class EvaluacionDesempeno(Base):
    """
    Evaluación de Desempeño digitalizada por plantilla.
    Una fila por evaluación (no una fila por ítem).
    Almacena autoevaluación y evaluación como estructuras JSON indexadas por número de ítem.
    """
    __tablename__ = "evaluaciones_desempeno"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    usuario_evaluado_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plantilla: Mapped[str] = mapped_column(String(50), nullable=False, default="directivos")
    cargo: Mapped[str] = mapped_column(String(100), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    nombre_evaluador: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    # JSON con estructura { "1.1": { "calificacion": 4, "observacion": "..." }, ... }
    autoevaluacion: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    evaluacion: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # JSON con lista de compromisos generados [str, str, str, str]
    compromisos: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Estados: 'borrador', 'autoevaluado', 'completado'
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="borrador", default="borrador"
    )

    autoevaluacion_enviada_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    autoevaluacion_enviada_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )

    evaluacion_enviada_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    evaluacion_enviada_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    usuario_evaluado: Mapped["Usuario"] = relationship(
        "Usuario", foreign_keys=[usuario_evaluado_id]
    )
