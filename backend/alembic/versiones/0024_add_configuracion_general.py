"""add configuracion_general table

Revision ID: 0024_configuracion_general
Revises: 0023_eval_compromisos
Create Date: 2026-10-15

Tabla clave → valor para textos editables desde la UI (por ahora, el título
del panel de Evaluación de Técnicos Contratistas). Sin filas iniciales: si la
clave no existe, el backend devuelve el texto por defecto.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024_configuracion_general"
down_revision: Union[str, None] = "0023_eval_compromisos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "configuracion_general",
        sa.Column("clave", sa.String(length=100), primary_key=True),
        sa.Column("valor", sa.Text(), nullable=False),
        sa.Column(
            "actualizado_por_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actualizado_en", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("configuracion_general")
