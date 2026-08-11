"""add monto_presupuesto to viaticos

Revision ID: 0008_add_monto_presupuesto
Revises: 0007_link_viaticos_asignacion
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0008_add_monto_presupuesto"
down_revision: Union[str, None] = "0007_link_viaticos_asignacion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "viaticos",
        sa.Column(
            "monto_presupuesto",
            sa.Numeric(precision=10, scale=2),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("viaticos", "monto_presupuesto")
