"""Inventario: stock, despachos a técnicos y préstamos.

La app es la única fuente de verdad del inventario. Los Excel
`CI-FR- INVENTARIO RTC AMERICAN GLOBAL 2026.xlsx` y
`CI-FR- INVENTARIO MANTENIMIENTO 2026.xlsx` solo se leyeron una vez
(scripts/migrar_inventario.py) para poblar el histórico.

Equivalencias con las hojas del Excel:
  INVENTARIO GENERAL -> inventario_items     (stock)
  SALIDAS            -> inventario_despachos (histórico de despachos)
  PRESTAMOS          -> inventario_prestamos
"""

import enum
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.asignacion import Asignacion
    from app.models.usuario import Usuario


class UnionTemporal(str, enum.Enum):
    RTC = "RTC"
    MANTENIMIENTO = "MANTENIMIENTO"
    PROYECTO_ZEUS = "PROYECTO_ZEUS"


class EstadoDespacho(str, enum.Enum):
    instalado = "instalado"
    pendiente_instalacion = "pendiente_instalacion"
    alerta_seguimiento = "alerta_seguimiento"
    danado = "dañado"
    suministro_oficina = "suministro_oficina"


class EstadoEntrega(str, enum.Enum):
    """Estado de entrega de un ítem de Proyecto Zeus (ODC).

    Solo aplica para union_temporal = PROYECTO_ZEUS; es NULL para RTC y
    Mantenimiento.
    """
    en_stock = "en_stock"
    en_transito = "en_transito"
    en_proceso = "en_proceso"


# ENUM nativos de Postgres: el estado y la unión temporal no admiten texto libre
# ni siquiera escribiendo directo en la base. Se guardan los `.value`.
UnionTemporalDB = SAEnum(
    UnionTemporal,
    name="inventario_union_temporal",
    values_callable=lambda e: [m.value for m in e],
)
EstadoDespachoDB = SAEnum(
    EstadoDespacho,
    name="inventario_estado_despacho",
    values_callable=lambda e: [m.value for m in e],
)
EstadoEntregaDB = SAEnum(
    EstadoEntrega,
    name="inventario_estado_entrega",
    values_callable=lambda e: [m.value for m in e],
)


class InventarioItem(Base):
    """Elemento de inventario de una unión temporal.

    Un elemento serializado (serial GSB / ID. equipo) es una unidad física; uno
    sin serial agrupa todas las unidades iguales y `cantidad_stock` las cuenta.
    """

    __tablename__ = "inventario_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    union_temporal: Mapped[UnionTemporal] = mapped_column(UnionTemporalDB, nullable=False, index=True)
    codigo_barras: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    serial_gsb: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    cantidad_stock: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)

    # Referencia del fabricante (ej. "ANV-L7082R") — viene de la columna
    # "Número de artículo" de los Excel de inventario.
    numero_articulo: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)

    # Tiempo estimado de entrega libre (ej. "EN STOCK", "8 a 10 Dias")
    tiempo_entrega: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    # ── Proyecto Zeus (ODC) ──────────────────────────────────────────────────
    # Orden de compra a la que pertenece el ítem (ej. "ODC178", "ODC179").
    # NULL para RTC y Mantenimiento.
    orden_compra: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Estado de entrega derivado del texto de tiempo_entrega.
    # NULL para RTC y Mantenimiento.
    estado_entrega: Mapped[Optional[EstadoEntrega]] = mapped_column(
        EstadoEntregaDB, nullable=True
    )

    # Columnas de origen del Excel (FECHA / FECHA COMPRA EQUIPO, FACTURA, No SDS,
    # ID. EQUIPO). Se conservan porque el Excel deja de existir como fuente.
    fecha_compra: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    factura: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    no_sds: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    id_equipo: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    despachos: Mapped[List["InventarioDespacho"]] = relationship(
        "InventarioDespacho", back_populates="item"
    )

    # Identidad del elemento. COALESCE porque en Postgres dos NULL son distintos
    # y la mayoría de elementos no tiene serial o código de barras.
    __table_args__ = (
        Index(
            "uq_inventario_items_identidad",
            "union_temporal",
            text("COALESCE(codigo_barras, '')"),
            "descripcion",
            text("COALESCE(serial_gsb, '')"),
            text("COALESCE(id_equipo, '')"),
            unique=True,
        ),
    )


class InventarioDespacho(Base):
    """Salida de un elemento hacia un técnico (hoja SALIDAS)."""

    __tablename__ = "inventario_despachos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # NULL solo en históricos migrados cuyo técnico no existe en `usuarios`;
    # desde la app el técnico es obligatorio (lo exige el schema).
    tecnico_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    asignacion_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("asignaciones.id", ondelete="SET NULL"), nullable=True, index=True
    )
    union_temporal: Mapped[UnionTemporal] = mapped_column(UnionTemporalDB, nullable=False, index=True)
    estado: Mapped[EstadoDespacho] = mapped_column(EstadoDespachoDB, nullable=False, index=True)

    cantidad: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1", default=1)
    oficina_destino: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    oficina_instalada: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    fecha_despacho: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    fecha_instalacion: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    numero_orden: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    observacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Solo migración: nombre tal como venía en la columna TECNICO (para los que
    # no coincidieron con `usuarios`), valores de celda que no eran una fecha
    # válida, y la clave de idempotencia del script.
    tecnico_nombre_origen: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    nota_migracion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    clave_migracion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)

    creado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    item: Mapped["InventarioItem"] = relationship("InventarioItem", back_populates="despachos")
    tecnico: Mapped[Optional["Usuario"]] = relationship("Usuario", foreign_keys=[tecnico_id])
    asignacion: Mapped[Optional["Asignacion"]] = relationship("Asignacion")


class InventarioPrestamo(Base):
    """Hoja PRESTAMOS. En ambos Excel solo trae DESCRIPCIÓN y CANTIDAD."""

    __tablename__ = "inventario_prestamos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    union_temporal: Mapped[UnionTemporal] = mapped_column(UnionTemporalDB, nullable=False, index=True)
    # Enlace al elemento cuando la descripción coincide exactamente con uno de
    # la misma unión temporal; si no, NULL.
    item_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha_prestamo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    clave_migracion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    item: Mapped[Optional["InventarioItem"]] = relationship("InventarioItem")


class InventarioTecnicoItem(Base):
    """Ítems de inventario asignados a un técnico (hojas de técnicos en Excel de Mantenimiento)."""

    __tablename__ = "inventario_tecnicos_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    union_temporal: Mapped[UnionTemporal] = mapped_column(UnionTemporalDB, nullable=False, index=True)
    tecnico_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tecnico_nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1", default=1)
    codigo_barras: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    serial_gsb: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    id_equipo: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    factura: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    fecha_compra: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    oficina: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    concatenado: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    fecha_despacho: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    observacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    numero_orden: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    oficina_instalada: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    fecha_instalacion: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    tecnico: Mapped["Usuario"] = relationship("Usuario")
