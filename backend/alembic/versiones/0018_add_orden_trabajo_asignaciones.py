"""add orden_trabajo to asignaciones

Revision ID: 0018_add_ot_asignaciones
Revises: 0017_add_inv_accesos
Create Date: 2026-09-10 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0018_add_ot_asignaciones'
down_revision: Union[str, None] = '0017_add_inv_accesos'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # La columna ya puede existir: el arranque de la API la agrega con
    # ADD COLUMN IF NOT EXISTS (main.py), así que se comprueba antes.
    columnas = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("asignaciones")}
    if "orden_trabajo" not in columnas:
        op.add_column(
            'asignaciones',
            sa.Column('orden_trabajo', sa.String(length=50), nullable=True)
        )


def downgrade() -> None:
    op.drop_column('asignaciones', 'orden_trabajo')
