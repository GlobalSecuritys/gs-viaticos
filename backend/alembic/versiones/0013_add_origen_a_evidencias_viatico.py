"""add origen to evidencias_viatico

Revision ID: 0013_add_origen_evidencias
Revises: 0012_add_acceso_viaticos
Create Date: 2026-08-22 10:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0013_add_origen_evidencias'
down_revision: Union[str, None] = '0012_add_acceso_viaticos'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'evidencias_viatico',
        sa.Column('origen', sa.String(length=20), server_default='tecnico', nullable=False)
    )


def downgrade() -> None:
    op.drop_column('evidencias_viatico', 'origen')
