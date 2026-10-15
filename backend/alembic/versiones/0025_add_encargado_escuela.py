"""add usuarios.encargado_escuela

Revision ID: 0025_encargado_escuela
Revises: 0024_configuracion_general
Create Date: 2026-10-15

Permiso exclusivo para consultar las falencias detectadas en la Escuela GSB.
Nadie queda marcado: la cuenta Master lo otorga desde Administración de Usuarios.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0025_encargado_escuela"
down_revision: Union[str, None] = "0024_configuracion_general"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "usuarios",
        sa.Column("encargado_escuela", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("usuarios", "encargado_escuela")
