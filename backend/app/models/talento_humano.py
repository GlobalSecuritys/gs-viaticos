from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class EmpleadoPerfil(Base):
    """
    Ficha laboral y personal de un empleado en el módulo de Talento Humano.
    Relación 1-a-1 con el modelo Usuario.
    """
    __tablename__ = "empleados_perfiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    # Información Personal
    cedula: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    telefono_alternativo: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fecha_nacimiento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ciudad: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    direccion: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    estado_civil: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Información Laboral
    cargo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Técnico Instalador")
    area: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Instalaciones")
    tipo_contrato: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Término indefinido")
    fecha_ingreso: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    estado_laboral: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="activo", default="activo"
    )  # 'activo', 'inactivo', 'en_capacitacion'
    jefe_inmediato: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, default="Carlos Ramírez")
    
    # Salario: CONFIDENCIAL — visible únicamente para ADMIN/SUPERADMIN
    salario: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)

    # Contacto de Emergencia
    contacto_emergencia_nombre: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    contacto_emergencia_parentesco: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contacto_emergencia_telefono: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    contacto_emergencia_telefono_alt: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Información Adicional
    observaciones: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Vacaciones
    dias_vacaciones_disponibles: Mapped[int] = mapped_column(Integer, nullable=False, default=12, server_default="12")
    dias_vacaciones_tomados: Mapped[int] = mapped_column(Integer, nullable=False, default=3, server_default="3")
    dias_vacaciones_programados: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # Auditoría de actualización
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    updated_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updated_by_nombre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relación
    usuario: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[usuario_id], lazy="joined")


class EmpleadoDocumento(Base):
    """
    Documentos laborales de un empleado (Cédula, Hoja de vida, Contrato, Certificados, etc.).
    """
    __tablename__ = "empleados_documentos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), index=True, nullable=False
    )
    tipo_documento: Mapped[str] = mapped_column(String(100), nullable=False)
    nombre_documento: Mapped[str] = mapped_column(String(200), nullable=False)
    url_archivo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    public_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="pendiente", default="pendiente"
    )  # 'cargado', 'pendiente'
    fecha_carga: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    cargado_por_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cargado_por_nombre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )


class EmpleadoHistorial(Base):
    """
    Trazabilidad y registro de auditoría de cambios sobre la ficha de un empleado.
    """
    __tablename__ = "empleados_historial"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), index=True, nullable=False
    )
    actor_id: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_rol: Mapped[str] = mapped_column(String(20), nullable=False)
    campo_modificado: Mapped[str] = mapped_column(String(100), nullable=False)
    valor_anterior: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    valor_nuevo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )


class EmpleadoSolicitud(Base):
    """
    Solicitudes de Talento Humano enviadas por los empleados (actualización de datos,
    certificados laborales, reporte de novedades, permisos, vacaciones).
    """
    __tablename__ = "empleados_solicitudes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), index=True, nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)  # 'actualizacion_datos', 'certificado_laboral', 'novedad', 'permiso', 'vacaciones'
    asunto: Mapped[str] = mapped_column(String(200), nullable=False)
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="pendiente", default="pendiente"
    )  # 'pendiente', 'en_revision', 'aprobado', 'rechazado', 'completado'
    respuesta_admin: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True, onupdate=func.now()
    )
