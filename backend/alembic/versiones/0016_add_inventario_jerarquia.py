"""add jerarquia empresarial al inventario (empresas, clientes, scope de planillas, traspasos)

Revision ID: 0016_add_inv_jerarquia
Revises: 0015_add_inventario
Create Date: 2026-09-09 09:00:00.000000

Reestructura el inventario plano en tres niveles:
  Global Security Bank SAS -> tarjetas (Zeus, Oberon, Securitas, Electronic Servis Securitas)
  Unión Temporal Mantenimiento 2024 GSB_SDSS -> inventario directo (sin tarjetas)
  Unión Temporal RTC -> inventario directo (sin tarjetas)

Las planillas que ya existían (MANTENIMIENTO, RTC, y cualquier otra creada a
mano) quedan bajo Global con cliente_id = NULL: son categorías internas de
Global y no se reasignan a ninguna tarjeta ni a las uniones temporales del
mismo nombre.

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
revision: str = '0016_add_inv_jerarquia'
down_revision: Union[str, None] = '0015_add_inventario'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


EMPRESA_GLOBAL = 'Global Security Bank SAS'
EMPRESAS = [
    (EMPRESA_GLOBAL, 'global', 1),
    ('Unión Temporal Mantenimiento 2024 GSB_SDSS', 'union_temporal', 2),
    ('Unión Temporal RTC', 'union_temporal', 3),
]
CLIENTES_GLOBAL = ['Zeus', 'Oberon', 'Securitas', 'Electronic Servis Securitas']


def upgrade() -> None:
    """No-op: ver la nota del encabezado."""


def downgrade() -> None:
    """No-op: ver la nota del encabezado."""
