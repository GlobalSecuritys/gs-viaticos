from datetime import date, datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
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

    # Periodo semestral (solo para técnicos; NULL para administrativos)
    periodo_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("evaluaciones_periodos_tecnicos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # JSON con estructura { "1.1": { "calificacion": 4, "observacion": "..." }, ... }
    autoevaluacion: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    evaluacion: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # JSON con lista de compromisos generados [str, str, str, str]
    compromisos: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Estados: 'borrador', 'autoevaluado', 'pendiente', 'en_evaluacion', 'listo_para_cierre', 'completado'
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
    periodo_rel: Mapped[Optional["EvaluacionPeriodoTecnico"]] = relationship(
        "EvaluacionPeriodoTecnico", foreign_keys=[periodo_id]
    )
    capas_tecnico: Mapped[list["EvaluacionTecnicoCapa"]] = relationship(
        "EvaluacionTecnicoCapa", back_populates="evaluacion", cascade="all, delete-orphan"
    )
    resumen_tecnico: Mapped[Optional["EvaluacionTecnicoResumen"]] = relationship(
        "EvaluacionTecnicoResumen", back_populates="evaluacion", uselist=False, cascade="all, delete-orphan"
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


class EvaluacionPeriodoTecnico(Base):
    """
    Periodo de evaluación para técnicos contratistas (semestre).
    Ejemplo: 'SEGUNDO SEMESTRE 2026'.
    """
    __tablename__ = "evaluaciones_periodos_tecnicos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    creado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    cerrado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )

    creado_por: Mapped[Optional["Usuario"]] = relationship("Usuario", foreign_keys=[creado_por_id])


class EvaluacionConfigCapa(Base):
    """
    Configuración de evaluadoras asignadas por capa (viaticos, asistente_oper).
    Pilar o superadmin la editan dinámicamente desde BD/UI.
    """
    __tablename__ = "evaluaciones_config_capas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    capa: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    usuario_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    actualizado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    usuario: Mapped[Optional["Usuario"]] = relationship("Usuario", foreign_keys=[usuario_id])
    actualizado_por: Mapped[Optional["Usuario"]] = relationship("Usuario", foreign_keys=[actualizado_por_id])


class EvaluacionTecnicoCapa(Base):
    """
    Capas independientes de calificación para la evaluación AD-FR-35.
    Capas: 'auto', 'viaticos', 'asistente_oper'.
    Cada fila almacena las respuestas y observación de una capa con control de concurrencia optimista (version).
    """
    __tablename__ = "evaluaciones_tecnicos_capas"
    __table_args__ = (
        UniqueConstraint("evaluacion_id", "capa", name="uq_evaluacion_tecnico_capa"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    evaluacion_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("evaluaciones_desempeno.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    capa: Mapped[str] = mapped_column(String(50), nullable=False)  # 'auto' | 'viaticos' | 'asistente_oper'
    respuestas: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    observacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="borrador", default="borrador"
    )  # 'borrador' | 'enviado'
    enviado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    enviado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1", default=1
    )

    evaluacion: Mapped["EvaluacionDesempeno"] = relationship(
        "EvaluacionDesempeno", back_populates="capas_tecnico"
    )
    enviado_por: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", foreign_keys=[enviado_por_id]
    )


class EvaluacionTecnicoResumen(Base):
    """
    Snapshot de cierre de la evaluación técnica AD-FR-35.
    Guarda los cálculos finales al centavo y la observación final de Pilar.
    """
    __tablename__ = "evaluaciones_tecnicos_resumen"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    evaluacion_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("evaluaciones_desempeno.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    calificacion_auto: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calificacion_viaticos: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calificacion_asistente_oper: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calificacion_final: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    porcentaje: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nivel: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    resultado: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    observacion_final: Mapped[str] = mapped_column(Text, nullable=False)
    cerrado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    cerrado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )

    evaluacion: Mapped["EvaluacionDesempeno"] = relationship(
        "EvaluacionDesempeno", back_populates="resumen_tecnico"
    )
    cerrado_por: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", foreign_keys=[cerrado_por_id]
    )


