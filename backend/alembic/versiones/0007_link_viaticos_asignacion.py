"""link viaticos to asignaciones

Revision ID: 0007_link_viaticos_asignacion
Revises: 0006_add_log_auditoria
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007_link_viaticos_asignacion"
down_revision: Union[str, None] = "0006_add_log_auditoria"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Agregar monto_anticipo a asignaciones
    op.add_column(
        "asignaciones",
        sa.Column(
            "monto_anticipo",
            sa.Numeric(precision=10, scale=2),
            server_default="0.00",
            nullable=False,
        ),
    )

    # 2. Agregar asignacion_id a viaticos
    op.add_column(
        "viaticos",
        sa.Column(
            "asignacion_id",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_viaticos_asignacion_id_asignaciones",
        "viaticos",
        "asignaciones",
        ["asignacion_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_viaticos_asignacion_id"),
        "viaticos",
        ["asignacion_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_viaticos_asignacion_id"), table_name="viaticos")
    op.drop_constraint(
        "fk_viaticos_asignacion_id_asignaciones",
        "viaticos",
        type_="foreignkey",
    )
    op.drop_column("viaticos", "asignacion_id")
    op.drop_column("asignaciones", "monto_anticipo")
