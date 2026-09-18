"""add_tecnico_items_and_prestamo_columns

Revision ID: f2a3b4c5d6e7
Revises: e1e87c5ebe6e
Create Date: 2026-09-18 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1e87c5ebe6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Columnas en inventario_tecnicos_items
    op.add_column(
        "inventario_tecnicos_items",
        sa.Column("fecha_despacho", sa.Date(), nullable=True),
    )
    op.create_index(
        op.f("ix_inventario_tecnicos_items_fecha_despacho"),
        "inventario_tecnicos_items",
        ["fecha_despacho"],
        unique=False,
    )
    op.add_column(
        "inventario_tecnicos_items",
        sa.Column("numero_orden", sa.String(length=60), nullable=True),
    )
    op.add_column(
        "inventario_tecnicos_items",
        sa.Column("oficina_instalada", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "inventario_tecnicos_items",
        sa.Column("fecha_instalacion", sa.Date(), nullable=True),
    )

    # 2. Columna en inventario_prestamos
    op.add_column(
        "inventario_prestamos",
        sa.Column("fecha_prestamo", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inventario_prestamos", "fecha_prestamo")
    op.drop_column("inventario_tecnicos_items", "fecha_instalacion")
    op.drop_column("inventario_tecnicos_items", "oficina_instalada")
    op.drop_column("inventario_tecnicos_items", "numero_orden")
    op.drop_index(
        op.f("ix_inventario_tecnicos_items_fecha_despacho"),
        table_name="inventario_tecnicos_items",
    )
    op.drop_column("inventario_tecnicos_items", "fecha_despacho")
