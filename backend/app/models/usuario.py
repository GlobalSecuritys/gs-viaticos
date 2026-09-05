from datetime import datetime
from typing import TYPE_CHECKING, List
from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.viatico import Viatico


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    correo: Mapped[str] = mapped_column(String(150), nullable=False, unique=True, index=True)
    codigo_empleado: Mapped[str] = mapped_column(String(15), nullable=True, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), nullable=False, server_default="tecnico")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    acceso_viaticos: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    es_admin_calidad: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    acceso_mapa: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    rol_mapa: Mapped[str] = mapped_column(String(20), nullable=False, server_default="lector", default="lector")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now()
    )

    viaticos: Mapped[List["Viatico"]] = relationship(
        "Viatico",
        back_populates="usuario"
    )
