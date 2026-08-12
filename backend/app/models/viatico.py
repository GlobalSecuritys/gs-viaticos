from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario
    from app.models.evidencia_viatico import EvidenciaViatico
    from app.models.asignacion import Asignacion


class Viatico(Base):
    __tablename__ = "viaticos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    asignacion_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("asignaciones.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cliente: Mapped[str] = mapped_column(String(150), nullable=False)
    ciudad: Mapped[str] = mapped_column(String(100), nullable=False)
    ot: Mapped[str] = mapped_column(String(50), nullable=False)
    tipo_gasto: Mapped[str] = mapped_column(String(30), nullable=False)
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    monto_presupuesto: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    comentario_admin: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo_identificacion: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, server_default="cedula"
    )
    nit_identificacion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="pendiente",
        index=True
    )
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

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="viaticos")
    asignacion: Mapped[Optional["Asignacion"]] = relationship("Asignacion", back_populates="viaticos")
    evidencias: Mapped[list["EvidenciaViatico"]] = relationship(
        "EvidenciaViatico",
        back_populates="viatico",
        cascade="all, delete-orphan",
        order_by="EvidenciaViatico.created_at",
    )