"""add bitacora_backup table

Revision ID: 0019_add_bitacora_backup
Revises: 0018_add_ot_asignaciones
Create Date: 2026-09-12 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0019_add_bitacora_backup'
down_revision: Union[str, None] = '0018_add_ot_asignaciones'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bitacora_backup',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('texto', sa.Text(), nullable=False),
        sa.Column('estado', sa.String(length=20), server_default='pendiente', nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('usuario_nombre', sa.String(length=100), nullable=True),
        sa.Column('completado_en', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bitacora_backup_estado', 'bitacora_backup', ['estado'])
    op.create_index('ix_bitacora_backup_usuario_id', 'bitacora_backup', ['usuario_id'])


def downgrade() -> None:
    op.drop_index('ix_bitacora_backup_usuario_id', table_name='bitacora_backup')
    op.drop_index('ix_bitacora_backup_estado', table_name='bitacora_backup')
    op.drop_table('bitacora_backup')
