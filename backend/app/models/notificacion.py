from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Notificacion(Base):
    """Registro mínimo de eventos informativos para el administrador.

    No reemplaza el mecanismo existente (derivar notificaciones desde el
    estado de los viáticos vía GET /admin/viaticos); solo cubre eventos que
    no dejan una fila de viático de la cual derivarse, como la eliminación.
    Los datos del técnico/viático se guardan "congelados" en el momento del
    evento porque el viático original ya no existirá.
    """

    __tablename__ = "notificaciones"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tecnico_nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    ciudad: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
    )
