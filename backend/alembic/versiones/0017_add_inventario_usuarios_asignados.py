"""add inventario_usuarios_asignados (acceso por empresa/tarjeta)

Revision ID: 0017_add_inv_accesos
Revises: 0016_add_inv_jerarquia
Create Date: 2026-09-09 11:00:00.000000

Pertenencia de un usuario a una entidad del inventario. Una fila por
(usuario, entidad): un mismo usuario puede atender Zeus como administrador y
Oberon como lector.

No toca el Mapa de Procesos SGC: require_seccion("IN", ...) sigue siendo la
puerta al módulo y esta tabla decide qué entidades ve una vez dentro. superadmin
y la cuenta Master no necesitan filas aquí.

La tabla nace vacía a propósito: un usuario sin asignaciones conserva el acceso
plano anterior, de modo que la migración no deja fuera del módulo a nadie que ya
trabajaba en él.

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
revision: str = '0017_add_inv_accesos'
down_revision: Union[str, None] = '0016_add_inv_jerarquia'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: ver la nota del encabezado."""


def downgrade() -> None:
    """No-op: ver la nota del encabezado."""
