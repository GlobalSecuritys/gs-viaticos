"""add evaluaciones_compromisos table and migrate existing data

Revision ID: 0023_add_evaluaciones_compromisos
Revises: 0022_resumen_mensual_archiv
Create Date: 2026-10-13

Crea la tabla independiente evaluaciones_compromisos para gestionar el ciclo de
vida de los compromisos de evaluación con control de concurrencia optimista (version),
y migra los compromisos existentes de evaluaciones completadas sin modificar la columna vieja.
"""

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023_eval_compromisos"
down_revision: Union[str, None] = "0022_resumen_mensual_archiv"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Crear tabla independiente de compromisos
    op.create_table(
        "evaluaciones_compromisos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "evaluacion_id",
            sa.Integer(),
            sa.ForeignKey("evaluaciones_desempeno.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column(
            "compromisos",
            sa.JSON(),
            nullable=False,
            server_default=sa.text('\'["", "", "", "", "", "", "", ""]\''),
        ),
        sa.Column(
            "estado",
            sa.String(length=30),
            nullable=False,
            server_default="abierto",
        ),
        sa.Column("nombre_evaluador", sa.String(length=150), nullable=True),
        sa.Column(
            "cerrado_por_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("cerrado_en", sa.DateTime(timezone=False), nullable=True),
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # 2. Migración no destructiva de datos existentes:
    # Para cualquier evaluación que ya esté en estado 'completado', insertar una fila
    # inicial en 'abierto' con los compromisos normalizados a 8 posiciones.
    bind = op.get_bind()
    conn = bind.connection

    # Seleccionar evaluaciones completadas existentes
    result = bind.execute(
        sa.text("SELECT id, nombre_evaluador, compromisos FROM evaluaciones_desempeno WHERE estado = 'completado'")
    ).fetchall()

    for row in result:
        eval_id = row[0]
        nombre_eval = row[1]
        raw_comp = row[2]

        lista_comp = []
        if isinstance(raw_comp, list):
            lista_comp = [str(c or "").strip() for c in raw_comp]
        elif isinstance(raw_comp, str):
            try:
                parsed = json.loads(raw_comp)
                if isinstance(parsed, list):
                    lista_comp = [str(c or "").strip() for c in parsed]
            except Exception:
                pass

        # Asegurar exactamente 8 posiciones
        while len(lista_comp) < 8:
            lista_comp.append("")
        lista_comp = lista_comp[:8]

        bind.execute(
            sa.text(
                """
                INSERT INTO evaluaciones_compromisos (
                    evaluacion_id, compromisos, estado, nombre_evaluador, version, creado_en, actualizado_en
                ) VALUES (
                    :eval_id, :compromisos, 'abierto', :nombre_eval, 1, NOW(), NOW()
                )
                """
            ),
            {
                "eval_id": eval_id,
                "compromisos": json.dumps(lista_comp, ensure_ascii=False),
                "nombre_eval": nombre_eval,
            },
        )


def downgrade() -> None:
    op.drop_table("evaluaciones_compromisos")
