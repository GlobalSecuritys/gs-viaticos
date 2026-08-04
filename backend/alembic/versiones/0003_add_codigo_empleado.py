"""agregar_codigo_empleado

Revision ID: 0003_add_codigo_empleado
Revises: 0002_alter_fk_restrict
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0003_add_codigo_empleado'
down_revision: Union[str, None] = '0002_alter_fk_restrict'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('codigo_empleado', sa.String(length=15), nullable=True))
    op.create_index(op.f('ix_usuarios_codigo_empleado'), 'usuarios', ['codigo_empleado'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_usuarios_codigo_empleado'), table_name='usuarios')
    op.drop_column('usuarios', 'codigo_empleado')