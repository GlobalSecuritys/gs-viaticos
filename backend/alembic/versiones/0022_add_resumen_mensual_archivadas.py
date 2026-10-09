"""add resumen_mensual a estadisticas_asignaciones_archivadas

Revision ID: 0022_resumen_mensual_archiv
Revises: 0021_add_evaluaciones_desempeno
Create Date: 2026-10-09

Solo agrega una columna JSON nullable, sin default ni índices: en PostgreSQL
es un cambio de catálogo y no reescribe la tabla.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0022_resumen_mensual_archiv"
down_revision: Union[str, None] = "0021_add_evaluaciones_desempeno"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "estadisticas_asignaciones_archivadas",
        sa.Column("resumen_mensual", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("estadisticas_asignaciones_archivadas", "resumen_mensual")
