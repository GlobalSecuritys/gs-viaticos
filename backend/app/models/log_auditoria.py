from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LogAuditoria(Base):
    """
    Registro inmutable de acciones administrativas (crear/editar usuario,
    cambiar rol, activar/desactivar) sobre GS-VIÁTICOS.

    Guarda los datos del actor y del usuario objetivo "congelados" en el
    momento del evento (mismo patrón de snapshot que ya usa Notificacion
    para tecnico_nombre/ciudad): así el log sigue siendo legible aunque el
    usuario referenciado cambie de nombre/rol o incluso sea eliminado más
    adelante. Por eso NO hay ForeignKey hacia usuarios, solo ids sueltos.
    """

    __tablename__ = "logs_auditoria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    actor_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    actor_nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_rol: Mapped[str] = mapped_column(String(20), nullable=False)

    usuario_objetivo_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    usuario_objetivo_nombre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    accion: Mapped[str] = mapped_column(String(50), nullable=False)
    detalle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resultado: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
