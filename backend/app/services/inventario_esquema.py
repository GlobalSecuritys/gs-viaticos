"""Creación del esquema de inventario y retiro de las tablas del módulo anterior.

El módulo anterior (planillas, kardex, traspasos, jerarquía de empresas) usaba
el mismo nombre `inventario_items` con otra estructura. Sus tablas NO se borran:
se renombran a `inventario_legacy_*` junto con sus índices y secuencias (Postgres
no los renombra con la tabla, y chocarían con los de las tablas nuevas).

Idempotente: lo llaman el arranque de la API y scripts/migrar_inventario.py.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.models.inventario import InventarioDespacho, InventarioItem, InventarioPrestamo

TABLAS_LEGACY = [
    "inventario_usuarios_asignados",
    "inventario_movimientos",
    "inventario_traspasos",
    "inventario_items",
    "inventario_planillas",
    "inventario_clientes",
    "inventario_empresas",
]


def _nombre_legacy(nombre: str) -> str:
    return nombre.replace("inventario_", "inventario_legacy_", 1)[:63]


def _es_items_legacy(conn) -> bool:
    insp = inspect(conn)
    if not insp.has_table("inventario_items"):
        return False
    return "planilla_id" in {c["name"] for c in insp.get_columns("inventario_items")}


def renombrar_tablas_legacy(engine: Engine) -> list[str]:
    """Renombra las tablas del inventario anterior. Devuelve las renombradas."""
    renombradas: list[str] = []
    with engine.begin() as conn:
        insp = inspect(conn)
        items_legacy = _es_items_legacy(conn)
        for tabla in TABLAS_LEGACY:
            if not insp.has_table(tabla) or insp.has_table(_nombre_legacy(tabla)):
                continue
            # inventario_items es también el nombre de la tabla nueva: solo se
            # retira si todavía tiene la estructura del módulo anterior.
            if tabla == "inventario_items" and not items_legacy:
                continue

            indices = conn.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = :t"),
                {"t": tabla},
            ).scalars().all()
            secuencias = conn.execute(
                text(
                    "SELECT pg_get_serial_sequence(:t, a.attname) FROM pg_attribute a "
                    "WHERE a.attrelid = CAST(:t AS regclass) AND a.attnum > 0 AND NOT a.attisdropped"
                ),
                {"t": tabla},
            ).scalars().all()

            conn.execute(text(f'ALTER TABLE "{tabla}" RENAME TO "{_nombre_legacy(tabla)}"'))
            for indice in indices:
                if "inventario_" in indice and "inventario_legacy_" not in indice:
                    nuevo = indice.replace("inventario_", "inventario_legacy_", 1)[:63]
                    conn.execute(text(f'ALTER INDEX "{indice}" RENAME TO "{nuevo}"'))
            for secuencia in filter(None, secuencias):
                nombre_seq = secuencia.split(".")[-1].strip('"')
                if "inventario_legacy_" not in nombre_seq:
                    conn.execute(
                        text(f'ALTER SEQUENCE {secuencia} RENAME TO "{_nombre_legacy(nombre_seq)}"')
                    )
            renombradas.append(tabla)
    return renombradas


TABLAS_ANTERIORES_A_RETIRAR = [
    # Mapeo: tabla_actual -> tabla_destino_legacy
    ("inventario_tecnicos_items", "inventario_legacy_tecnicos_items"),
    ("inventario_prestamos", "inventario_legacy_prestamos"),
    ("inventario_despachos", "inventario_legacy_despachos"),
    ("inventario_items", "inventario_legacy_items_v2"),
]


def retirar_tablas_inventario_anterior(engine: Engine) -> list[str]:
    """Renombra las tablas del inventario anterior (items, despachos, prestamos, tecnicos_items).

    No borra datos (sin DROP). Renombra tablas, índices y secuencias.
    """
    renombradas: list[str] = []
    with engine.begin() as conn:
        insp = inspect(conn)
        for origen, destino in TABLAS_ANTERIORES_A_RETIRAR:
            if not insp.has_table(origen):
                continue
            if insp.has_table(destino):
                # Si la tabla destino ya existe (ej. corrida previa), no intentar sobreescribir
                continue

            indices = conn.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = :t"),
                {"t": origen},
            ).scalars().all()
            secuencias = conn.execute(
                text(
                    "SELECT pg_get_serial_sequence(:t, a.attname) FROM pg_attribute a "
                    "WHERE a.attrelid = CAST(:t AS regclass) AND a.attnum > 0 AND NOT a.attisdropped"
                ),
                {"t": origen},
            ).scalars().all()

            conn.execute(text(f'ALTER TABLE "{origen}" RENAME TO "{destino}"'))
            for indice in indices:
                nuevo = indice.replace("inventario_", "inventario_legacy_", 1)[:63]
                if nuevo != indice:
                    try:
                        conn.execute(text(f'ALTER INDEX "{indice}" RENAME TO "{nuevo}"'))
                    except Exception:
                        pass
            for secuencia in filter(None, secuencias):
                nombre_seq = secuencia.split(".")[-1].strip('"')
                nuevo_seq = nombre_seq.replace("inventario_", "inventario_legacy_", 1)[:63]
                if nuevo_seq != nombre_seq:
                    try:
                        conn.execute(
                            text(f'ALTER SEQUENCE {secuencia} RENAME TO "{nuevo_seq}"')
                        )
                    except Exception:
                        pass
            renombradas.append(f"{origen} -> {destino}")
    return renombradas


def asegurar_esquema_inventario(engine: Engine) -> list[str]:
    """Retira las tablas legacy (si existen) y crea la tabla de registro de salidas."""
    # 1. Retiro de tablas legacy de v1 si quedaba alguna
    renombradas_v1 = renombrar_tablas_legacy(engine)
    # 2. Retiro de las 4 tablas de la versión anterior de uniones temporales
    renombradas_v2 = retirar_tablas_inventario_anterior(engine)

    # 3. Crear la nueva tabla simple de registro de salidas
    from app.models.inventario_salida import InventarioSalidaRegistro
    InventarioSalidaRegistro.__table__.create(bind=engine, checkfirst=True)

    return renombradas_v1 + renombradas_v2
