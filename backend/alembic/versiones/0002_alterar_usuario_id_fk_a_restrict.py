"""alterar_usuario_id_fk_a_restrict

Revision ID: 0002_alter_fk_restrict
Revises: 0001_initial
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_alter_fk_restrict'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('viaticos_usuario_id_fkey', 'viaticos', type_='foreignkey')
    op.create_foreign_key(
        'viaticos_usuario_id_fkey',
        'viaticos',
        'usuarios',
        ['usuario_id'],
        ['id'],
        ondelete='RESTRICT'
    )


def downgrade() -> None:
    op.drop_constraint('viaticos_usuario_id_fkey', 'viaticos', type_='foreignkey')
    op.create_foreign_key(
        'viaticos_usuario_id_fkey',
        'viaticos',
        'usuarios',
        ['usuario_id'],
        ['id'],
        ondelete='CASCADE'
    )
