"""add asignaciones table

Revision ID: 0004_add_asignaciones
Revises: 0f57b8fc3e66
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0004_add_asignaciones'
down_revision: Union[str, None] = '0f57b8fc3e66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'asignaciones',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('tecnico_id', sa.Integer(), nullable=False),
        sa.Column('creado_por_id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.String(length=30), nullable=False),
        sa.Column('cliente', sa.String(length=150), nullable=False),
        sa.Column('empresa', sa.String(length=150), nullable=True),
        sa.Column('ciudad', sa.String(length=100), nullable=False),
        sa.Column('fecha_inicio', sa.Date(), nullable=False),
        sa.Column('fecha_fin', sa.Date(), nullable=False),
        sa.Column('observaciones', sa.Text(), nullable=True),
        sa.Column('estado', sa.String(length=20), server_default='pendiente', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tecnico_id'], ['usuarios.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['creado_por_id'], ['usuarios.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_asignaciones_tecnico_id'), 'asignaciones', ['tecnico_id'], unique=False)
    op.create_index(op.f('ix_asignaciones_creado_por_id'), 'asignaciones', ['creado_por_id'], unique=False)
    op.create_index(op.f('ix_asignaciones_fecha_inicio'), 'asignaciones', ['fecha_inicio'], unique=False)
    op.create_index(op.f('ix_asignaciones_fecha_fin'), 'asignaciones', ['fecha_fin'], unique=False)
    op.create_index(op.f('ix_asignaciones_estado'), 'asignaciones', ['estado'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_asignaciones_estado'), table_name='asignaciones')
    op.drop_index(op.f('ix_asignaciones_fecha_fin'), table_name='asignaciones')
    op.drop_index(op.f('ix_asignaciones_fecha_inicio'), table_name='asignaciones')
    op.drop_index(op.f('ix_asignaciones_creado_por_id'), table_name='asignaciones')
    op.drop_index(op.f('ix_asignaciones_tecnico_id'), table_name='asignaciones')
    op.drop_table('asignaciones')
