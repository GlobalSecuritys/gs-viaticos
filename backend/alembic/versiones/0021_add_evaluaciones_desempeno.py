"""add evaluaciones_desempeno table

Revision ID: 0021_add_evaluaciones_desempeno
Revises: 0020_zeus_orden_estado
Create Date: 2026-10-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0021_add_evaluaciones_desempeno"
down_revision: Union[str, None] = "0020_zeus_orden_estado"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evaluaciones_desempeno",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "usuario_evaluado_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("plantilla", sa.String(length=50), nullable=False, server_default="directivos"),
        sa.Column("cargo", sa.String(length=100), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False, server_default=sa.func.current_date()),
        sa.Column("nombre_evaluador", sa.String(length=150), nullable=True),
        sa.Column("autoevaluacion", sa.JSON(), nullable=True),
        sa.Column("evaluacion", sa.JSON(), nullable=True),
        sa.Column("compromisos", sa.JSON(), nullable=True),
        sa.Column("estado", sa.String(length=30), nullable=False, server_default="borrador"),
        sa.Column(
            "autoevaluacion_enviada_por_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("autoevaluacion_enviada_en", sa.DateTime(timezone=False), nullable=True),
        sa.Column(
            "evaluacion_enviada_por_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("evaluacion_enviada_en", sa.DateTime(timezone=False), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("evaluaciones_desempeno")
