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
    op.create_table(
        'inventario_usuarios_asignados',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.Column('cliente_id', sa.Integer(), nullable=True),
        sa.Column('nivel', sa.String(length=20), server_default='lector', nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['empresa_id'], ['inventario_empresas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['cliente_id'], ['inventario_clientes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_inventario_usuarios_asignados_usuario_id'),
        'inventario_usuarios_asignados', ['usuario_id'],
    )
    op.create_index(
        op.f('ix_inventario_usuarios_asignados_empresa_id'),
        'inventario_usuarios_asignados', ['empresa_id'],
    )
    # Índice de expresión y no UNIQUE: en Postgres dos NULL son distintos, y
    # cliente_id es NULL en todo el inventario directo de una caja.
    op.execute(
        "CREATE UNIQUE INDEX uq_inventario_acceso_usuario_entidad "
        "ON inventario_usuarios_asignados (usuario_id, empresa_id, COALESCE(cliente_id, 0))"
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS uq_inventario_acceso_usuario_entidad')
    op.drop_index(
        op.f('ix_inventario_usuarios_asignados_empresa_id'),
        table_name='inventario_usuarios_asignados',
    )
    op.drop_index(
        op.f('ix_inventario_usuarios_asignados_usuario_id'),
        table_name='inventario_usuarios_asignados',
    )
    op.drop_table('inventario_usuarios_asignados')
