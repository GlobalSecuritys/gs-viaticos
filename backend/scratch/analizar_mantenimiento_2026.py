"""Análisis de sólo lectura para CI FR - INVENTARIO MANTENIMIENTO 2026 (planilla_id = 1)"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

with engine.connect() as conn:
    print("=== 1. PLANILLA ID = 1 ===")
    p = conn.execute(text("SELECT id, nombre, descripcion, orden, activa FROM inventario_planillas WHERE id = 1")).mappings().first()
    print("Planilla:", dict(p) if p else "No encontrada")

    print("\n=== 2. MAPEO LEGACY PARA PLANILLA 1 ===")
    mapeo = conn.execute(text("SELECT * FROM inventario_mapeo_legacy WHERE planilla_id = 1")).mappings().all()
    for m in mapeo:
        print(dict(m))

    print("\n=== 3. ITEMS EN inventario_items (planilla_id = 1) ===")
    items = conn.execute(text("""
        SELECT id, planilla_id, codigo, descripcion, marca, stock_actual, eliminado_en
        FROM inventario_items
        WHERE planilla_id = 1
    """)).mappings().all()
    print(f"Total filas en inventario_items con planilla_id=1: {len(items)}")
    for it in items:
        print("Item:", dict(it))

    if items:
        item_ids = [it['id'] for it in items]
        print("\n=== 3.1 MOVIMIENTOS / KARDEX DE ESTOS ITEMS ===")
        movs = conn.execute(text(f"""
            SELECT id, item_id, tipo, cantidad, origen, stock_resultante, fecha, observacion
            FROM inventario_movimientos
            WHERE item_id IN ({','.join(str(i) for i in item_ids)})
        """)).mappings().all()
        print(f"Total movimientos: {len(movs)}")
        for m in movs:
            print("Mov:", dict(m))

    print("\n=== 4. ITEMS EN inventario_legacy_items_v2 ASOCIADOS ===")
    ut = mapeo[0]['union_temporal'] if mapeo else None
    print(f"Buscando legacy con union_temporal: {ut}")
    if ut:
        leg_count = conn.execute(text("SELECT COUNT(*), SUM(cantidad_stock) FROM inventario_legacy_items_v2 WHERE union_temporal::text = :ut"), {"ut": ut}).first()
        print(f"Count legacy items: {leg_count[0]}, Sum cantidad_stock: {leg_count[1]}")

        # Análisis de stock en legacy
        leg_stock_stats = conn.execute(text("""
            SELECT 
                COUNT(*) as total_registros,
                COUNT(CASE WHEN cantidad_stock > 0 THEN 1 END) as con_stock,
                COUNT(CASE WHEN cantidad_stock = 0 THEN 1 END) as stock_cero,
                COUNT(CASE WHEN cantidad_stock < 0 THEN 1 END) as stock_negativo,
                COUNT(CASE WHEN cantidad_stock IS NULL THEN 1 END) as stock_null,
                SUM(cantidad_stock) as suma_stock
            FROM inventario_legacy_items_v2
            WHERE union_temporal::text = :ut
        """), {"ut": ut}).mappings().first()
        print("Estadísticas legacy:", dict(leg_stock_stats))

        # Muestra de items legacy
        print("\n=== 4.1 MUESTRA DE ITEMS LEGACY (3 registros con stock y 3 con stock 0) ===")
        muestra_con_stock = conn.execute(text("""
            SELECT id, codigo, descripcion, cantidad_stock, unidad_medida, serial
            FROM inventario_legacy_items_v2
            WHERE union_temporal::text = :ut AND cantidad_stock > 0
            LIMIT 3
        """), {"ut": ut}).mappings().all()
        for r in muestra_con_stock:
            print("Con stock:", dict(r))

        muestra_sin_stock = conn.execute(text("""
            SELECT id, codigo, descripcion, cantidad_stock, unidad_medida, serial
            FROM inventario_legacy_items_v2
            WHERE union_temporal::text = :ut AND cantidad_stock = 0
            LIMIT 3
        """), {"ut": ut}).mappings().all()
        for r in muestra_sin_stock:
            print("Sin stock:", dict(r))

        # Chequear si el 1 item de inventario_items coincide con alguno de legacy
        if items:
            for it in items:
                print(f"\nBuscando coincidencias para item nuevo id={it['id']}, codigo='{it['codigo']}', desc='{it['descripcion']}':")
                coincidencias = conn.execute(text("""
                    SELECT id, codigo, descripcion, cantidad_stock
                    FROM inventario_legacy_items_v2
                    WHERE union_temporal::text = :ut
                      AND (codigo = :cod OR LOWER(descripcion) = LOWER(:desc))
                """), {"ut": ut, "cod": it['codigo'], "desc": it['descripcion']}).mappings().all()
                print(f"Coincidencias encontradas: {len(coincidencias)}")
                for c in coincidencias:
                    print("  Coincidencia:", dict(c))

        # Chequear duplicados internos dentro de legacy
        dups_codigo = conn.execute(text("""
            SELECT codigo, COUNT(*) as cnt, SUM(cantidad_stock) as suma_cant
            FROM inventario_legacy_items_v2
            WHERE union_temporal::text = :ut AND codigo IS NOT NULL AND codigo <> ''
            GROUP BY codigo
            HAVING COUNT(*) > 1
            LIMIT 5
        """), {"ut": ut}).mappings().all()
        print(f"\nCódigos repetidos dentro de legacy (muestra 5): {len(dups_codigo)}")
        for d in dups_codigo:
            print("  Dup codigo:", dict(d))

        dups_desc = conn.execute(text("""
            SELECT descripcion, COUNT(*) as cnt, SUM(cantidad_stock) as suma_cant
            FROM inventario_legacy_items_v2
            WHERE union_temporal::text = :ut AND descripcion IS NOT NULL AND descripcion <> ''
            GROUP BY descripcion
            HAVING COUNT(*) > 1
            LIMIT 5
        """), {"ut": ut}).mappings().all()
        print(f"\nDescripciones repetidas dentro de legacy (muestra 5): {len(dups_desc)}")
        for d in dups_desc:
            print("  Dup desc:", dict(d))
