"""add eliminado_en to asignaciones

Revision ID: 0014_add_eliminado_en_asig
Revises: 0013_add_origen_evidencias
Create Date: 2026-08-27 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0014_add_eliminado_en_asig'
down_revision: Union[str, None] = '0013_add_origen_evidencias'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'asignaciones',
        sa.Column('eliminado_en', sa.DateTime(timezone=False), nullable=True)
    )
    op.create_index(op.f('ix_asignaciones_eliminado_en'), 'asignaciones', ['eliminado_en'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_asignaciones_eliminado_en'), table_name='asignaciones')
    op.drop_column('asignaciones', 'eliminado_en')
