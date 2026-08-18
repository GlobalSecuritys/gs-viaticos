"""add acceso_viaticos column and migrate admin roles to superadmin

Revision ID: 0012_add_acceso_viaticos
Revises: 0011_add_cuenta_cobro_asignacion
Create Date: 2026-08-18 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012_add_acceso_viaticos'
down_revision: Union[str, None] = '0011_add_cuenta_cobro_asignacion'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Agregar columna acceso_viaticos
    op.add_column(
        'usuarios',
        sa.Column('acceso_viaticos', sa.Boolean(), server_default=sa.text('false'), nullable=False)
    )

    # 2. Migración de datos:
    # - Todos los usuarios con rol 'admin' pasan a 'superadmin'
    # - Por defecto su acceso_viaticos queda en false (server_default='false')
    # - Claudia Milena (claudia@gsbank.com) queda con acceso_viaticos = true
    # - El usuario Admin@gsbank.com mantiene rol == 'superadmin'
    op.execute(
        sa.text("UPDATE usuarios SET rol = 'superadmin' WHERE rol = 'admin'")
    )
    op.execute(
        sa.text("UPDATE usuarios SET acceso_viaticos = false WHERE rol = 'superadmin'")
    )
    op.execute(
        sa.text("UPDATE usuarios SET acceso_viaticos = true WHERE LOWER(correo) = 'claudia@gsbank.com'")
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'acceso_viaticos')
