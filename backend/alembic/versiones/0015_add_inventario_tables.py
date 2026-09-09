"""add inventario tables (planillas, items, movimientos)

Revision ID: 0015_add_inventario
Revises: 0014_add_eliminado_en_asig
Create Date: 2026-09-08 09:00:00.000000

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
    op.create_table(
        'inventario_planillas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=50), nullable=False),
        sa.Column('descripcion', sa.String(length=255), nullable=True),
        sa.Column('activa', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('creado_por_id', sa.Integer(), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['creado_por_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre'),
    )

    op.create_table(
        'inventario_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('codigo', sa.String(length=60), nullable=True),
        sa.Column('descripcion', sa.String(length=255), nullable=False),
        sa.Column('marca', sa.String(length=60), server_default='GENERICA', nullable=False),
        sa.Column('planilla_id', sa.Integer(), nullable=False),
        sa.Column('stock_actual', sa.Integer(), server_default='0', nullable=False),
        sa.Column('foto_referencia_url', sa.String(length=500), nullable=True),
        sa.Column('foto_public_id', sa.String(length=255), nullable=True),
        sa.Column('creado_por_id', sa.Integer(), nullable=True),
        sa.Column('eliminado_en', sa.DateTime(timezone=False), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column('actualizado_en', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['planilla_id'], ['inventario_planillas.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['creado_por_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_inventario_items_codigo'), 'inventario_items', ['codigo'], unique=False)
    op.create_index(op.f('ix_inventario_items_planilla_id'), 'inventario_items', ['planilla_id'], unique=False)

    op.create_table(
        'inventario_movimientos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.String(length=20), nullable=False),
        sa.Column('cantidad', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('observacion', sa.Text(), nullable=True),
        sa.Column('origen', sa.String(length=20), server_default='manual', nullable=False),
        sa.Column('confianza_ia', sa.String(length=10), nullable=True),
        sa.Column('stock_resultante', sa.Integer(), server_default='0', nullable=False),
        sa.Column('fecha', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['item_id'], ['inventario_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_inventario_movimientos_item_id'), 'inventario_movimientos', ['item_id'], unique=False)
    op.create_index(op.f('ix_inventario_movimientos_usuario_id'), 'inventario_movimientos', ['usuario_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_inventario_movimientos_usuario_id'), table_name='inventario_movimientos')
    op.drop_index(op.f('ix_inventario_movimientos_item_id'), table_name='inventario_movimientos')
    op.drop_table('inventario_movimientos')
    op.drop_index(op.f('ix_inventario_items_planilla_id'), table_name='inventario_items')
    op.drop_index(op.f('ix_inventario_items_codigo'), table_name='inventario_items')
    op.drop_table('inventario_items')
    op.drop_table('inventario_planillas')
