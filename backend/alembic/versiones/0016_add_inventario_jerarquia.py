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
    op.create_table(
        'inventario_empresas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=120), nullable=False),
        sa.Column('tipo', sa.String(length=20), server_default='union_temporal', nullable=False),
        sa.Column('orden', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre'),
    )

    op.create_table(
        'inventario_clientes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=120), nullable=False),
        sa.Column('orden', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['empresa_id'], ['inventario_empresas.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('empresa_id', 'nombre', name='uq_inventario_cliente_empresa_nombre'),
    )
    op.create_index(op.f('ix_inventario_clientes_empresa_id'), 'inventario_clientes', ['empresa_id'])

    # --- seed de la estructura ---
    conn = op.get_bind()
    for nombre, tipo, orden in EMPRESAS:
        conn.execute(
            sa.text(
                "INSERT INTO inventario_empresas (nombre, tipo, orden) VALUES (:n, :t, :o)"
            ),
            {'n': nombre, 't': tipo, 'o': orden},
        )
    global_id = conn.execute(
        sa.text("SELECT id FROM inventario_empresas WHERE nombre = :n"), {'n': EMPRESA_GLOBAL}
    ).scalar_one()
    for i, nombre in enumerate(CLIENTES_GLOBAL, start=1):
        conn.execute(
            sa.text(
                "INSERT INTO inventario_clientes (empresa_id, nombre, orden) VALUES (:e, :n, :o)"
            ),
            {'e': global_id, 'n': nombre, 'o': i},
        )

    # --- scope de las planillas ---
    op.add_column('inventario_planillas', sa.Column('empresa_id', sa.Integer(), nullable=True))
    op.add_column('inventario_planillas', sa.Column('cliente_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_inventario_planillas_empresa', 'inventario_planillas', 'inventario_empresas',
        ['empresa_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_foreign_key(
        'fk_inventario_planillas_cliente', 'inventario_planillas', 'inventario_clientes',
        ['cliente_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index(op.f('ix_inventario_planillas_empresa_id'), 'inventario_planillas', ['empresa_id'])
    op.create_index(op.f('ix_inventario_planillas_cliente_id'), 'inventario_planillas', ['cliente_id'])

    # Migración de datos: todo lo que ya existía es de Global, sin tarjeta.
    conn.execute(
        sa.text("UPDATE inventario_planillas SET empresa_id = :e WHERE empresa_id IS NULL"),
        {'e': global_id},
    )

    # El nombre deja de ser único globalmente: cada entidad lleva su propio juego
    # de planillas y dos entidades pueden tener una "GENERAL" cada una.
    # El nombre del UNIQUE lo puso Postgres, así que se busca por catálogo en vez
    # de adivinarlo: un DROP fallido abortaría la transacción de la migración.
    op.execute("""
        DO $$
        DECLARE cname text;
        BEGIN
            SELECT con.conname INTO cname
              FROM pg_constraint con
              JOIN pg_class rel ON rel.oid = con.conrelid
             WHERE rel.relname = 'inventario_planillas'
               AND con.contype = 'u'
               AND con.conkey = ARRAY[(
                     SELECT attnum FROM pg_attribute
                      WHERE attrelid = rel.oid AND attname = 'nombre'
                   )]::smallint[];
            IF cname IS NOT NULL THEN
                EXECUTE format('ALTER TABLE inventario_planillas DROP CONSTRAINT %I', cname);
            END IF;
        END $$;
    """)
    # Indice de expresion y no UniqueConstraint: en Postgres dos NULL son
    # distintos, y cliente_id es NULL en todo el inventario directo.
    op.execute(
        "CREATE UNIQUE INDEX uq_inventario_planilla_scope_nombre "
        "ON inventario_planillas (empresa_id, COALESCE(cliente_id, 0), nombre)"
    )

    # --- traspasos entre entidades ---
    op.create_table(
        'inventario_traspasos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_origen_id', sa.Integer(), nullable=False),
        sa.Column('empresa_origen_id', sa.Integer(), nullable=False),
        sa.Column('cliente_origen_id', sa.Integer(), nullable=True),
        sa.Column('empresa_destino_id', sa.Integer(), nullable=False),
        sa.Column('cliente_destino_id', sa.Integer(), nullable=True),
        sa.Column('item_destino_id', sa.Integer(), nullable=True),
        sa.Column('cantidad', sa.Integer(), nullable=False),
        sa.Column('estado', sa.String(length=20), server_default='pendiente', nullable=False),
        sa.Column('solicitado_por_id', sa.Integer(), nullable=False),
        sa.Column('fecha_solicitud', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column('aprobado_por_id', sa.Integer(), nullable=True),
        sa.Column('fecha_completado', sa.DateTime(timezone=False), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['item_origen_id'], ['inventario_items.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['item_destino_id'], ['inventario_items.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['empresa_origen_id'], ['inventario_empresas.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['empresa_destino_id'], ['inventario_empresas.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['cliente_origen_id'], ['inventario_clientes.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['cliente_destino_id'], ['inventario_clientes.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['solicitado_por_id'], ['usuarios.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['aprobado_por_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_inventario_traspasos_item_origen_id'), 'inventario_traspasos', ['item_origen_id'])
    op.create_index(op.f('ix_inventario_traspasos_empresa_origen_id'), 'inventario_traspasos', ['empresa_origen_id'])
    op.create_index(op.f('ix_inventario_traspasos_empresa_destino_id'), 'inventario_traspasos', ['empresa_destino_id'])
    op.create_index(op.f('ix_inventario_traspasos_estado'), 'inventario_traspasos', ['estado'])

    # Trazabilidad del kardex: de qué traspaso vino cada movimiento.
    op.add_column('inventario_movimientos', sa.Column('traspaso_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_inventario_movimientos_traspaso', 'inventario_movimientos', 'inventario_traspasos',
        ['traspaso_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index(op.f('ix_inventario_movimientos_traspaso_id'), 'inventario_movimientos', ['traspaso_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_inventario_movimientos_traspaso_id'), table_name='inventario_movimientos')
    op.drop_constraint('fk_inventario_movimientos_traspaso', 'inventario_movimientos', type_='foreignkey')
    op.drop_column('inventario_movimientos', 'traspaso_id')

    op.drop_index(op.f('ix_inventario_traspasos_estado'), table_name='inventario_traspasos')
    op.drop_index(op.f('ix_inventario_traspasos_empresa_destino_id'), table_name='inventario_traspasos')
    op.drop_index(op.f('ix_inventario_traspasos_empresa_origen_id'), table_name='inventario_traspasos')
    op.drop_index(op.f('ix_inventario_traspasos_item_origen_id'), table_name='inventario_traspasos')
    op.drop_table('inventario_traspasos')

    op.execute('DROP INDEX IF EXISTS uq_inventario_planilla_scope_nombre')
    op.create_unique_constraint('inventario_planillas_nombre_key', 'inventario_planillas', ['nombre'])
    op.drop_index(op.f('ix_inventario_planillas_cliente_id'), table_name='inventario_planillas')
    op.drop_index(op.f('ix_inventario_planillas_empresa_id'), table_name='inventario_planillas')
    op.drop_constraint('fk_inventario_planillas_cliente', 'inventario_planillas', type_='foreignkey')
    op.drop_constraint('fk_inventario_planillas_empresa', 'inventario_planillas', type_='foreignkey')
    op.drop_column('inventario_planillas', 'cliente_id')
    op.drop_column('inventario_planillas', 'empresa_id')

    op.drop_index(op.f('ix_inventario_clientes_empresa_id'), table_name='inventario_clientes')
    op.drop_table('inventario_clientes')
    op.drop_table('inventario_empresas')
