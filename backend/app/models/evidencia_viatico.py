from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.viatico import Viatico


class EvidenciaViatico(Base):
    __tablename__ = "evidencias_viatico"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    viatico_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("viaticos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    secure_url: Mapped[str] = mapped_column(String(500), nullable=False)
    public_id: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
    )

    viatico: Mapped["Viatico"] = relationship("Viatico", back_populates="evidencias")