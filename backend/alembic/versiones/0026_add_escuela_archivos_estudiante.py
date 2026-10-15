"""add escuela_archivos_estudiante

Revision ID: 0026_escuela_archivos
Revises: 0025_encargado_escuela
Create Date: 2026-10-15

Material académico por estudiante de la Escuela GSB. Tabla nueva, sin datos
iniciales; los archivos viven en Cloudinary como type=authenticated.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0026_escuela_archivos"
down_revision: Union[str, None] = "0025_encargado_escuela"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "escuela_archivos_estudiante",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "estudiante_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nombre_original", sa.String(length=255), nullable=False),
        sa.Column("descripcion", sa.String(length=300), nullable=True),
        sa.Column("extension", sa.String(length=10), nullable=False),
        sa.Column("tipo_mime", sa.String(length=100), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False),
        sa.Column("cloudinary_public_id", sa.String(length=255), nullable=False),
        sa.Column("cloudinary_resource_type", sa.String(length=10), nullable=False),
        sa.Column(
            "subido_por_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("subido_por_nombre", sa.String(length=100), nullable=False),
        sa.Column("subido_en", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_escuela_archivos_estudiante_estudiante_id",
        "escuela_archivos_estudiante",
        ["estudiante_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_escuela_archivos_estudiante_estudiante_id", table_name="escuela_archivos_estudiante")
    op.drop_table("escuela_archivos_estudiante")
