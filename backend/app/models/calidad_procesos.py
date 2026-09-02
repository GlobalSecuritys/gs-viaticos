from datetime import datetime
from typing import List, Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ProcesoCalidad(Base):
    __tablename__ = "procesos_calidad"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)  # 'direccion' | 'misional' | 'apoyo'
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color_hex: Mapped[str] = mapped_column(String(20), nullable=False, default="#D4AF37")
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    responsables: Mapped[List["ProcesoCalidadResponsable"]] = relationship(
        "ProcesoCalidadResponsable",
        back_populates="proceso",
        cascade="all, delete-orphan",
        order_by="ProcesoCalidadResponsable.id"
    )

    documentos: Mapped[List["ProcesoCalidadDocumento"]] = relationship(
        "ProcesoCalidadDocumento",
        back_populates="proceso",
        cascade="all, delete-orphan",
        order_by="ProcesoCalidadDocumento.created_at.desc()"
    )


class ProcesoCalidadResponsable(Base):
    __tablename__ = "procesos_calidad_responsables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proceso_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("procesos_calidad.id", ondelete="CASCADE"),
        nullable=False
    )
    usuario_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False
    )
    rol_en_proceso: Mapped[str] = mapped_column(String(100), nullable=False, default="Responsable")
    asignado_por: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now()
    )

    proceso: Mapped["ProcesoCalidad"] = relationship(
        "ProcesoCalidad",
        back_populates="responsables"
    )
    usuario = relationship("Usuario", foreign_keys=[usuario_id])
    asignador = relationship("Usuario", foreign_keys=[asignado_por])


class ProcesoCalidadDocumento(Base):
    __tablename__ = "procesos_calidad_documentos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proceso_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("procesos_calidad.id", ondelete="CASCADE"),
        nullable=False
    )
    nombre_documento: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    categoria_documento: Mapped[str] = mapped_column(String(100), nullable=False, default="Procedimiento")
    cloudinary_public_id: Mapped[str] = mapped_column(String(255), nullable=False)
    cloudinary_secure_url: Mapped[str] = mapped_column(String(500), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="v1")
    subido_por: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now()
    )

    proceso: Mapped["ProcesoCalidad"] = relationship(
        "ProcesoCalidad",
        back_populates="documentos"
    )
    usuario_subio = relationship("Usuario", foreign_keys=[subido_por])
