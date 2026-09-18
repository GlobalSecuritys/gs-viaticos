from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional, Any
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class EstadisticaAsignacionArchivada(Base):
    """
    Registro histórico de agregados de asignaciones finalizadas eliminadas.
    Permite preservar de forma inmutable las estadísticas financieras, KPIs
    y desgloses por concepto en los dashboards cuando las carpetas y viáticos
    se eliminan permanentemente para aligerar la base de datos.
    """

    __tablename__ = "estadisticas_asignaciones_archivadas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asignacion_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    tecnico_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    creado_por_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    cliente: Mapped[str] = mapped_column(String(150), nullable=False)
    empresa: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)  # Oficina / Sede
    ciudad: Mapped[str] = mapped_column(String(100), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)

    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cerrada_en: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    descargada_en: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    eliminada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    eliminada_por_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    monto_anticipo: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    total_gastado: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    cantidad_viaticos: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    estado_legalizacion: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="legalizado"
    )

    # Desglose por conceptos principales para alimentar los gráficos de distribución
    total_hospedaje: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    total_transporte: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    total_alimentacion: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    total_materiales: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    total_alquiler_escalera: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    total_otros: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )

    # Detalle estructurado de viáticos borrados (fecha, tipo_gasto, valor, descripción, estado)
    desglose_viaticos: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    tecnico: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[tecnico_id])
