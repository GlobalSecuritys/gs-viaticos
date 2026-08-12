from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class CuentaCobro(Base):
    __tablename__ = "cuentas_cobro"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    ciudad: Mapped[str] = mapped_column(String(100), nullable=False)
    tipo_identificacion: Mapped[str] = mapped_column(String(20), nullable=False, default="cedula")
    identificacion: Mapped[str] = mapped_column(String(50), nullable=False)
    concepto_servicio: Mapped[str] = mapped_column(Text, nullable=False)
    items: Mapped[str] = mapped_column(Text, nullable=False)  # Almacena arreglo de ítems en formato JSON
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Datos bancarios
    banco: Mapped[str] = mapped_column(String(100), nullable=False)
    tipo_cuenta: Mapped[str] = mapped_column(String(50), nullable=False)
    numero_cuenta: Mapped[str] = mapped_column(String(50), nullable=False)
    titular_nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    titular_cedula: Mapped[str] = mapped_column(String(50), nullable=False)
    titular_celular: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    autorizacion_datos: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pendiente",
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

    @property
    def consecutivo(self) -> str:
        return f"{self.fecha.year}-{self.id}" if self.fecha and self.id else ""

    usuario: Mapped["Usuario"] = relationship("Usuario")
