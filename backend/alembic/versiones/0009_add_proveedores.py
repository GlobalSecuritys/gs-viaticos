"""add proveedores table

Revision ID: 0009_add_proveedores
Revises: 0008_add_monto_presupuesto_viaticos
Create Date: 2026-08-12 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0009_add_proveedores"
down_revision: Union[str, None] = "0008_add_monto_presupuesto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "proveedores",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("nit", sa.String(length=50), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nit", name="uq_proveedores_nit"),
    )
    op.create_index(
        op.f("ix_proveedores_nit"),
        "proveedores",
        ["nit"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_proveedores_nit"), table_name="proveedores")
    op.drop_table("proveedores")
