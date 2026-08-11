"""add notificaciones table

Revision ID: 0005_add_notificaciones
Revises: 0004_add_asignaciones
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_notificaciones"
down_revision: Union[str, None] = "0004_add_asignaciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notificaciones",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tecnico_nombre", sa.String(length=100), nullable=False),
        sa.Column("valor", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("ciudad", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("notificaciones")