from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.asignacion import Asignacion
    from app.models.usuario import Usuario


class CuentaCobroAsignacion(Base):
    __tablename__ = "cuentas_cobro_asignacion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asignacion_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("asignaciones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tecnico_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    secure_url: Mapped[str] = mapped_column(String(500), nullable=False)
    public_id: Mapped[str] = mapped_column(String(300), nullable=False)
    fecha_subida: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
    )

    asignacion: Mapped["Asignacion"] = relationship(
        "Asignacion",
        back_populates="cuenta_cobro",
    )
    tecnico: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[tecnico_id],
    )
