"""
Creación y verificación del esquema de inventario canónico:
inventario_planillas, inventario_items, inventario_movimientos.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.models.inventario import (
    InventarioItem,
    InventarioMovimiento,
    InventarioPlanilla,
)

TABLAS_LEGACY_HISTORICAS = [
    "inventario_usuarios_asignados",
    "inventario_traspasos",
    "inventario_clientes",
    "inventario_empresas",
]


def _nombre_legacy(nombre: str) -> str:
    return nombre.replace("inventario_", "inventario_legacy_", 1)[:63]


def asegurar_esquema_inventario(engine: Engine) -> list[str]:
    """Asegura la existencia de las tablas canónicas de inventario."""
    renombradas: list[str] = []

    # 1. Asegurar creación de las 3 tablas canónicas
    for modelo in (InventarioPlanilla, InventarioItem, InventarioMovimiento):
        modelo.__table__.create(bind=engine, checkfirst=True)

    # 2. Retiro de tablas legacy descartadas si existieran
    with engine.begin() as conn:
        insp = inspect(conn)
        for tabla in TABLAS_LEGACY_HISTORICAS:
            if not insp.has_table(tabla) or insp.has_table(_nombre_legacy(tabla)):
                continue
            conn.execute(text(f'ALTER TABLE "{tabla}" RENAME TO "{_nombre_legacy(tabla)}"'))
            renombradas.append(tabla)

    return renombradas
