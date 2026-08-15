"""add cuentas_cobro_asignacion table

Revision ID: 0011_add_cuenta_cobro_asignacion
Revises: 0010_add_tipo_identificacion
Create Date: 2026-08-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0011_add_cuenta_cobro_asignacion'
down_revision: Union[str, None] = '0010_add_tipo_identificacion'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cuentas_cobro_asignacion',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('asignacion_id', sa.Integer(), nullable=False),
        sa.Column('tecnico_id', sa.Integer(), nullable=False),
        sa.Column('secure_url', sa.String(length=500), nullable=False),
        sa.Column('public_id', sa.String(length=300), nullable=False),
        sa.Column('fecha_subida', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['asignacion_id'], ['asignaciones.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tecnico_id'], ['usuarios.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(
        op.f('ix_cuentas_cobro_asignacion_asignacion_id'),
        'cuentas_cobro_asignacion',
        ['asignacion_id'],
        unique=False
    )
    op.create_index(
        op.f('ix_cuentas_cobro_asignacion_tecnico_id'),
        'cuentas_cobro_asignacion',
        ['tecnico_id'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_cuentas_cobro_asignacion_tecnico_id'), table_name='cuentas_cobro_asignacion')
    op.drop_index(op.f('ix_cuentas_cobro_asignacion_asignacion_id'), table_name='cuentas_cobro_asignacion')
    op.drop_table('cuentas_cobro_asignacion')
