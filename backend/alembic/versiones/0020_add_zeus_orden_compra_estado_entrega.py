"""add_zeus_orden_compra_estado_entrega

Agrega a inventario_items:
  1. Tipo ENUM nativo ``inventario_estado_entrega`` (en_stock | en_transito | en_proceso).
  2. Columna ``orden_compra`` VARCHAR(20) NULL  — solo usada por PROYECTO_ZEUS.
  3. Columna ``estado_entrega`` inventario_estado_entrega NULL — solo usada por PROYECTO_ZEUS.

Revision ID: 0020_add_zeus_orden_compra_estado_entrega
Revises: f2a3b4c5d6e7
Create Date: 2026-09-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0020_zeus_orden_estado"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Crear el tipo ENUM en Postgres (fuera de transacción para ENUM ADD VALUE).
    #    CREATE TYPE no es transaccional en PG, pero sí es idempotente con IF NOT EXISTS.
    op.execute(
        "CREATE TYPE inventario_estado_entrega AS ENUM "
        "('en_stock', 'en_transito', 'en_proceso')"
    )

    # 2. Columna orden_compra
    op.add_column(
        "inventario_items",
        sa.Column("orden_compra", sa.String(20), nullable=True),
    )

    # 3. Columna estado_entrega usando el tipo recién creado
    op.add_column(
        "inventario_items",
        sa.Column(
            "estado_entrega",
            sa.Enum(
                "en_stock",
                "en_transito",
                "en_proceso",
                name="inventario_estado_entrega",
                create_type=False,  # ya fue creado arriba
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("inventario_items", "estado_entrega")
    op.drop_column("inventario_items", "orden_compra")
    # Eliminar el tipo ENUM
    op.execute("DROP TYPE IF EXISTS inventario_estado_entrega")
