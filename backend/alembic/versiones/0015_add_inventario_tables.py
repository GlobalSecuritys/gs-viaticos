"""add inventario tables (planillas, items, movimientos)

Revision ID: 0015_add_inventario
Revises: 0014_add_eliminado_en_asig
Create Date: 2026-09-08 09:00:00.000000


NOTA (2026-09): el esquema de inventario dejó de vivir en Alembic. Las tablas
del módulo nuevo (inventario_items, inventario_despachos, inventario_prestamos)
y el retiro de las del módulo anterior los resuelve
app/services/inventario_esquema.py en el arranque de la API, igual que el resto
de módulos recientes. Esta revisión se conserva vacía solo para no romper la
cadena de revisiones en las bases que aún no la habían aplicado; aplicarla tal
como estaba chocaría con las tablas que ya existen.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0015_add_inventario'
down_revision: Union[str, None] = '0014_add_eliminado_en_asig'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: ver la nota del encabezado."""


def downgrade() -> None:
    """No-op: ver la nota del encabezado."""
