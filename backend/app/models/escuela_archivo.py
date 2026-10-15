from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EscuelaArchivoEstudiante(Base):
    """Material académico que la encargada de la Escuela GSB sube para un estudiante.
    Independiente de Talento Humano: tabla y carpeta de Cloudinary propias
    (gs_viaticos/escuela/estudiantes/{usuario_id}), entrega privada (type=authenticated)."""

    __tablename__ = "escuela_archivos_estudiante"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    estudiante_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nombre_original: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    extension: Mapped[str] = mapped_column(String(10), nullable=False)
    tipo_mime: Mapped[str] = mapped_column(String(100), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    cloudinary_public_id: Mapped[str] = mapped_column(String(255), nullable=False)
    cloudinary_resource_type: Mapped[str] = mapped_column(String(10), nullable=False)
    subido_por_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    subido_por_nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    subido_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
