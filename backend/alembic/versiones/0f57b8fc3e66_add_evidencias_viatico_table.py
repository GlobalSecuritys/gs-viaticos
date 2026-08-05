"""add evidencias_viatico table

Revision ID: 0f57b8fc3e66
Revises: 0003_add_codigo_empleado
Create Date: 2026-08-04 14:55:32.745084

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0f57b8fc3e66'
down_revision: Union[str, None] = '0003_add_codigo_empleado'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('evidencias_viatico',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('viatico_id', sa.Integer(), nullable=False),
    sa.Column('secure_url', sa.String(length=500), nullable=False),
    sa.Column('public_id', sa.String(length=300), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['viatico_id'], ['viaticos.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_evidencias_viatico_viatico_id'), 'evidencias_viatico', ['viatico_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_evidencias_viatico_viatico_id'), table_name='evidencias_viatico')
    op.drop_table('evidencias_viatico')