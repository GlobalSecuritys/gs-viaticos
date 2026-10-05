import os
import sys
from sqlalchemy import inspect, text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import engine

PLANILLAS_ORDEN = [
    (1, "RTC - Comware"),
    (2, "RTC - American Global 2026"),
    (3, "Mantenimiento 2026"),
    (4, "Zeus"),
    (5, "Inventario general Global Security Bank SAS"),
]

def migrar_planillas_db(conn):
    insp = inspect(conn)
    tables = insp.get_table_names()

    # 1. Restaurar tablas desde legacy si no existen las tablas activas
    if "inventario_planillas" not in tables and "inventario_legacy_planillas" in tables:
        print("Restaurando inventario_legacy_planillas -> inventario_planillas")
        conn.execute(text('ALTER TABLE "inventario_legacy_planillas" RENAME TO "inventario_planillas"'))

    if "inventario_items" not in tables and "inventario_legacy_items" in tables:
        print("Restaurando inventario_legacy_items -> inventario_items")
        conn.execute(text('ALTER TABLE "inventario_legacy_items" RENAME TO "inventario_items"'))

    if "inventario_movimientos" not in tables and "inventario_legacy_movimientos" in tables:
        print("Restaurando inventario_legacy_movimientos -> inventario_movimientos")
        conn.execute(text('ALTER TABLE "inventario_legacy_movimientos" RENAME TO "inventario_movimientos"'))

    # Agregar columna orden si no existe
    conn.execute(text("ALTER TABLE inventario_planillas ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 1;"))

    # 2. Renombrar MANTENIMIENTO a "Mantenimiento 2026" (conservando id)
    conn.execute(text("""
        UPDATE inventario_planillas
        SET nombre = 'Mantenimiento 2026', orden = 3
        WHERE UPPER(TRIM(nombre)) IN ('MANTENIMIENTO', 'MANTENIMIENTO 2026');
    """))

    # Obtener el id de Mantenimiento 2026
    mantenimiento_id = conn.execute(text(
        "SELECT id FROM inventario_planillas WHERE nombre = 'Mantenimiento 2026'"
    )).scalar()

    if not mantenimiento_id:
        # Si no existía, crearla
        mantenimiento_id = conn.execute(text(
            "INSERT INTO inventario_planillas (nombre, orden, activa) VALUES ('Mantenimiento 2026', 3, true) RETURNING id"
        )).scalar()
        print(f"Creada planilla 'Mantenimiento 2026' con id={mantenimiento_id}")
    else:
        print(f"Planilla 'Mantenimiento 2026' identificada con id={mantenimiento_id}")

    # Asignar todos los ítems existentes a Mantenimiento 2026
    conn.execute(text("""
        UPDATE inventario_items
        SET planilla_id = :mid
        WHERE planilla_id IS NULL OR planilla_id NOT IN (SELECT id FROM inventario_planillas);
    """), {"mid": mantenimiento_id})

    # Si hay items en planillas que no sean Mantenimiento 2026, reasignarlos a Mantenimiento 2026
    conn.execute(text("""
        UPDATE inventario_items
        SET planilla_id = :mid
    """), {"mid": mantenimiento_id})
    print(f"Todos los ítems asignados a Mantenimiento 2026 (id={mantenimiento_id}).")

    # 3. Renombrar RTC a "RTC - Comware" (si existe planilla RTC vacía)
    rtc_row = conn.execute(text("""
        SELECT id FROM inventario_planillas WHERE UPPER(TRIM(nombre)) = 'RTC'
    """)).first()

    if rtc_row:
        conn.execute(text("""
            UPDATE inventario_planillas
            SET nombre = 'RTC - Comware', orden = 1
            WHERE id = :rid
        """), {"rid": rtc_row[0]})
        print(f"Planilla RTC (id={rtc_row[0]}) renombrada a 'RTC - Comware'.")
    else:
        # Asegurarse que RTC - Comware tenga orden 1
        conn.execute(text("""
            UPDATE inventario_planillas
            SET orden = 1
            WHERE nombre = 'RTC - Comware'
        """))

    # 4. Crear las planillas restantes si no existen con su respectivo orden
    for orden_num, nombre_planilla in PLANILLAS_ORDEN:
        existe = conn.execute(text(
            "SELECT id FROM inventario_planillas WHERE nombre = :nombre"
        ), {"nombre": nombre_planilla}).scalar()

        if not existe:
            conn.execute(text(
                "INSERT INTO inventario_planillas (nombre, orden, activa) VALUES (:nombre, :orden, true)"
            ), {"nombre": nombre_planilla, "orden": orden_num})
            print(f"Creada planilla vacía '{nombre_planilla}' con orden {orden_num}.")
        else:
            conn.execute(text(
                "UPDATE inventario_planillas SET orden = :orden WHERE id = :id"
            ), {"orden": orden_num, "id": existe})

    print("Migración de planillas completada con éxito.")

def main():
    with engine.begin() as conn:
        migrar_planillas_db(conn)

if __name__ == "__main__":
    main()
