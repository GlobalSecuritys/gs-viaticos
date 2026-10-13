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
    compromisos_seccion: Mapped[Optional["EvaluacionCompromiso"]] = relationship(
        "EvaluacionCompromiso", back_populates="evaluacion", uselist=False, cascade="all, delete-orphan"
    )


class EvaluacionCompromiso(Base):
    """
    Sección independiente de Compromisos generados en la Evaluación de Desempeño.
    Tiene ciclo de vida propio: 'abierto' / 'cerrado', control de concurrencia optimista (version),
    y almacena exactamente 8 compromisos descriptivos.
    """
    __tablename__ = "evaluaciones_compromisos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    evaluacion_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("evaluaciones_desempeno.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    compromisos: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: [""] * 8,
    )
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="abierto", default="abierto"
    )
    nombre_evaluador: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    cerrado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    cerrado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1", default=1
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    evaluacion: Mapped["EvaluacionDesempeno"] = relationship(
        "EvaluacionDesempeno", back_populates="compromisos_seccion"
    )
    cerrado_por: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", foreign_keys=[cerrado_por_id]
    )

