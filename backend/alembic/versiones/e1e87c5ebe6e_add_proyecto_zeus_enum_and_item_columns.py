"""add_proyecto_zeus_enum_and_item_columns

Agrega:
  1. El valor 'PROYECTO_ZEUS' al tipo ENUM `inventario_union_temporal`.
  2. Columna `numero_articulo` (VARCHAR 60, nullable) en `inventario_items`.
  3. Columna `tiempo_entrega`  (VARCHAR 80, nullable) en `inventario_items`.
  4. Índice en `inventario_items.numero_articulo`.

Revision ID: e1e87c5ebe6e
Revises: '0019_add_bitacora_backup'
Create Date: 2026-09-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e1e87c5ebe6e"
down_revision: Union[str, None] = "0019_add_bitacora_backup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Ampliar el ENUM nativo de Postgres (no transaccional en PG — se ejecuta
    #    fuera de transacción para evitar "unsafe use of new value of enum type").
    op.execute("ALTER TYPE inventario_union_temporal ADD VALUE IF NOT EXISTS 'PROYECTO_ZEUS'")

    # 2. Nuevas columnas en inventario_items
    op.add_column(
        "inventario_items",
        sa.Column("numero_articulo", sa.String(60), nullable=True),
    )
    op.add_column(
        "inventario_items",
        sa.Column("tiempo_entrega", sa.String(80), nullable=True),
    )

    # 3. Índice en numero_articulo
    op.create_index(
        "ix_inventario_items_numero_articulo",
        "inventario_items",
        ["numero_articulo"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_inventario_items_numero_articulo", table_name="inventario_items")
    op.drop_column("inventario_items", "tiempo_entrega")
    op.drop_column("inventario_items", "numero_articulo")
    # Nota: Postgres no permite eliminar valores de un ENUM, así que no revertimos
    # la adición de 'PROYECTO_ZEUS'. El downgrade solo quita las columnas.
