from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BitacoraBackup(Base):
    """
    Anotaciones de la Bitácora de Descargas del módulo de Backup.

    Los registros NUNCA se borran: la visibilidad se controla con `estado`.
      - "pendiente"  -> visible en la bitácora activa.
      - "completado" -> archivada al completarse un backup (subida de CSV).
      - "eliminado"  -> ocultada manualmente por el administrador.

    El nombre del autor se guarda "congelado" para que la anotación conserve
    su trazabilidad aunque el usuario cambie de nombre o sea dado de baja.
    """

    __tablename__ = "bitacora_backup"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    texto: Mapped[str] = mapped_column(Text, nullable=False)

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="pendiente",
        index=True,
    )

    usuario_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    usuario_nombre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    completado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
        default=None,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
    )
