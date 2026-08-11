"""add log_auditoria table

Revision ID: 0006_add_log_auditoria
Revises: 0005_add_notificaciones
Create Date: 2026-08-10 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0006_add_log_auditoria"
down_revision: Union[str, None] = "0005_add_notificaciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "logs_auditoria",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("actor_nombre", sa.String(length=100), nullable=False),
        sa.Column("actor_rol", sa.String(length=20), nullable=False),
        sa.Column("usuario_objetivo_id", sa.Integer(), nullable=True),
        sa.Column(
            "usuario_objetivo_nombre",
            sa.String(length=100),
            nullable=True,
        ),
        sa.Column("accion", sa.String(length=50), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
        sa.Column("resultado", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_logs_auditoria_created_at"),
        "logs_auditoria",
        ["created_at"],
        unique=False,
    )

    op.create_index(
        op.f("ix_logs_auditoria_actor_id"),
        "logs_auditoria",
        ["actor_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_logs_auditoria_usuario_objetivo_id"),
        "logs_auditoria",
        ["usuario_objetivo_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_logs_auditoria_usuario_objetivo_id"),
        table_name="logs_auditoria",
    )

    op.drop_index(
        op.f("ix_logs_auditoria_actor_id"),
        table_name="logs_auditoria",
    )

    op.drop_index(
        op.f("ix_logs_auditoria_created_at"),
        table_name="logs_auditoria",
    )

    op.drop_table("logs_auditoria")

