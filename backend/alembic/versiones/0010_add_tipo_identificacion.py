"""add tipo_identificacion and nit_identificacion to viaticos

Revision ID: 0010_add_tipo_identificacion
Revises: 0009_add_proveedores
Create Date: 2026-08-12 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0010_add_tipo_identificacion"
down_revision: Union[str, None] = "0009_add_proveedores"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "viaticos",
        sa.Column(
            "tipo_identificacion",
            sa.String(length=20),
            nullable=True,
            server_default="cedula",
        ),
    )
    op.add_column(
        "viaticos",
        sa.Column(
            "nit_identificacion",
            sa.String(length=50),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("viaticos", "nit_identificacion")
    op.drop_column("viaticos", "tipo_identificacion")
