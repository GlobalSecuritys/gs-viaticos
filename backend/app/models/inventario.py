from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# Tipos de movimiento admitidos. No se modelan como ENUM de BD a propósito
# (misma convención que el resto del sistema: strings + validación en schema),
# para poder agregar tipos nuevos sin migración de tipo.
TIPOS_MOVIMIENTO_ENTRADA = {"ajuste_inicial", "compra", "devolucion", "traspaso_entrada"}
TIPOS_MOVIMIENTO_SALIDA = {"salida", "traspaso_salida"}
TIPOS_MOVIMIENTO = TIPOS_MOVIMIENTO_ENTRADA | TIPOS_MOVIMIENTO_SALIDA

# Tipos que solo genera el motor de traspasos: un endpoint de captura manual no
# debe poder emitirlos, o el kardex quedaria con entradas sin traspaso asociado.
TIPOS_MOVIMIENTO_TRASPASO = {"traspaso_entrada", "traspaso_salida"}

# Estructura organizacional del inventario. `global` es la unica caja que se
# subdivide en tarjetas (clientes); las uniones temporales llevan su inventario
# directo a nivel de empresa.
TIPO_EMPRESA_GLOBAL = "global"
TIPO_EMPRESA_UNION = "union_temporal"

ESTADOS_TRASPASO = {"pendiente", "completado", "rechazado"}

# Niveles de acceso de un usuario sobre una entidad concreta del inventario.
# Mismos nombres que NIVELES_SECCION (core/security.py) para no inventar un
# vocabulario paralelo, pero se resuelven contra inventario_usuarios_asignados:
#   lector -> ve el inventario de esa entidad y captura sus propios movimientos
#   admin  -> además gestiona planillas, edita/elimina ítems y mueve traspasos
NIVELES_ENTIDAD = {"ninguno": 0, "lector": 1, "admin": 2}


class InventarioEmpresa(Base):
    """Caja de primer nivel de la jerarquia: la empresa (Global o una UT)."""

    __tablename__ = "inventario_empresas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    tipo: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=TIPO_EMPRESA_UNION, default=TIPO_EMPRESA_UNION
    )
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    clientes: Mapped[List["InventarioCliente"]] = relationship(
        "InventarioCliente",
        back_populates="empresa",
        order_by="InventarioCliente.orden",
    )


class InventarioCliente(Base):
    """Tarjeta / cliente de segundo nivel. Solo cuelga de la empresa tipo `global`."""

    __tablename__ = "inventario_clientes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_empresas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    empresa: Mapped["InventarioEmpresa"] = relationship("InventarioEmpresa", back_populates="clientes")

    __table_args__ = (
        UniqueConstraint("empresa_id", "nombre", name="uq_inventario_cliente_empresa_nombre"),
    )


class InventarioPlanilla(Base):
    """Agrupador de ítems (equivalente a una hoja del Excel: MANTENIMIENTO, RTC, ...)."""

    __tablename__ = "inventario_planillas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(50), nullable=False)
    # Alcance organizacional de la planilla. Es el unico punto donde vive el
    # scope: los items lo heredan de su planilla, asi un item no puede quedar
    # en una entidad distinta a la de su planilla.
    empresa_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_empresas.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # NULL para las uniones temporales (inventario directo en la caja) y para
    # las planillas generales de Global que no pertenecen a una tarjeta.
    cliente_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_clientes.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    descripcion: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    creado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    items: Mapped[List["InventarioItem"]] = relationship(
        "InventarioItem",
        back_populates="planilla",
        order_by="InventarioItem.descripcion",
    )
    empresa: Mapped[Optional["InventarioEmpresa"]] = relationship("InventarioEmpresa")
    cliente: Mapped[Optional["InventarioCliente"]] = relationship("InventarioCliente")

    # El nombre ya no es unico globalmente: cada entidad lleva su propio juego de
    # planillas y es normal que dos entidades tengan una "GENERAL" cada una.
    # Va por indice de expresion y no por UniqueConstraint porque en Postgres dos
    # NULL son distintos entre si, y cliente_id es NULL en todo el inventario
    # directo (uniones temporales y planillas generales de Global).
    __table_args__ = (
        Index(
            "uq_inventario_planilla_scope_nombre",
            "empresa_id",
            text("COALESCE(cliente_id, 0)"),
            "nombre",
            unique=True,
        ),
    )


class InventarioItem(Base):
    """Ficha de un elemento de inventario. `stock_actual` es un agregado derivado
    de los movimientos: se actualiza incrementalmente en cada inserción de
    Movimiento para no tener que sumar el kardex completo en cada listado."""

    __tablename__ = "inventario_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    marca: Mapped[str] = mapped_column(String(60), nullable=False, server_default="GENERICA", default="GENERICA")
    planilla_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_planillas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    stock_actual: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    foto_referencia_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    foto_public_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    creado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    # Soft-delete, misma convención que asignaciones.eliminado_en
    eliminado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    planilla: Mapped["InventarioPlanilla"] = relationship(
        "InventarioPlanilla", back_populates="items"
    )
    movimientos: Mapped[List["InventarioMovimiento"]] = relationship(
        "InventarioMovimiento",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventarioMovimiento.fecha.desc()",
    )


class InventarioMovimiento(Base):
    """Kardex: registro inmutable de entradas y salidas. `cantidad` siempre es
    positiva; el signo lo determina `tipo`."""

    __tablename__ = "inventario_movimientos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    observacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # 'manual' hoy; 'foto_ia' queda reservado para la fase 2 de captura por foto,
    # así esa fase no necesita una migración de columnas.
    origen: Mapped[str] = mapped_column(String(20), nullable=False, server_default="manual", default="manual")
    confianza_ia: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Traspaso que origino el movimiento (NULL en los movimientos ordinarios).
    # Es lo que permite que el kardex diga "vino de / fue a [entidad]".
    traspaso_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_traspasos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Stock resultante después de aplicar este movimiento (foto del kardex).
    stock_resultante: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    item: Mapped["InventarioItem"] = relationship("InventarioItem", back_populates="movimientos")


class InventarioTraspaso(Base):
    """Movimiento real de stock entre dos entidades de la jerarquia.

    El descuento en origen se aplica al crear el traspaso (no se "reserva"): un
    traspaso que quede pendiente mucho tiempo no puede dejar el stock de origen
    mostrando unidades que fisicamente ya salieron. Si el destino rechaza, el
    descuento se revierte con un movimiento de reverso.
    """

    __tablename__ = "inventario_traspasos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    item_origen_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    empresa_origen_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_empresas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cliente_origen_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_clientes.id", ondelete="RESTRICT"), nullable=True
    )

    empresa_destino_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_empresas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cliente_destino_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_clientes.id", ondelete="RESTRICT"), nullable=True
    )
    # Se resuelve al aprobar: puede ser un item que ya existia en el destino o
    # uno creado en ese momento a partir del item de origen.
    item_destino_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_items.id", ondelete="SET NULL"), nullable=True
    )

    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pendiente", default="pendiente", index=True
    )

    solicitado_por_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False
    )
    fecha_solicitud: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    aprobado_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    fecha_completado: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    item_origen: Mapped["InventarioItem"] = relationship(
        "InventarioItem", foreign_keys=[item_origen_id]
    )
    item_destino: Mapped[Optional["InventarioItem"]] = relationship(
        "InventarioItem", foreign_keys=[item_destino_id]
    )
    empresa_origen: Mapped["InventarioEmpresa"] = relationship(
        "InventarioEmpresa", foreign_keys=[empresa_origen_id]
    )
    empresa_destino: Mapped["InventarioEmpresa"] = relationship(
        "InventarioEmpresa", foreign_keys=[empresa_destino_id]
    )
    cliente_origen: Mapped[Optional["InventarioCliente"]] = relationship(
        "InventarioCliente", foreign_keys=[cliente_origen_id]
    )
    cliente_destino: Mapped[Optional["InventarioCliente"]] = relationship(
        "InventarioCliente", foreign_keys=[cliente_destino_id]
    )


class InventarioUsuarioAsignado(Base):
    """Pertenencia de un usuario a una entidad del inventario.

    Una fila por (usuario, entidad): un mismo usuario puede atender Zeus como
    administrador y Oberon como lector. `require_seccion("IN", ...)` sigue siendo
    la puerta al módulo; esta tabla decide qué entidades ve una vez dentro.

    superadmin y la cuenta Master no necesitan filas aquí: pasan siempre, igual
    que en el resto del sistema.
    """

    __tablename__ = "inventario_usuarios_asignados"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    empresa_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("inventario_empresas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL = el inventario directo de la caja (uniones temporales y las planillas
    # generales de Global), igual que en inventario_planillas.
    cliente_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("inventario_clientes.id", ondelete="CASCADE"), nullable=True
    )
    nivel: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="lector", default="lector"
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    usuario: Mapped["Usuario"] = relationship("Usuario")  # noqa: F821
    empresa: Mapped["InventarioEmpresa"] = relationship("InventarioEmpresa")
    cliente: Mapped[Optional["InventarioCliente"]] = relationship("InventarioCliente")

    # Índice de expresión y no UniqueConstraint: en Postgres dos NULL son
    # distintos, y cliente_id es NULL en todo el inventario directo.
    __table_args__ = (
        Index(
            "uq_inventario_acceso_usuario_entidad",
            "usuario_id",
            "empresa_id",
            text("COALESCE(cliente_id, 0)"),
            unique=True,
        ),
    )
