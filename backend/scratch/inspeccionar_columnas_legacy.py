"""Inspeccionar columnas de inventario_legacy_items_v2 y relaciones"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

with engine.connect() as conn:
    print("=== COLUMNAS inventario_legacy_items_v2 ===")
    cols = conn.execute(text("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'inventario_legacy_items_v2'
        ORDER BY ordinal_position
    """)).fetchall()
    for c in cols:
        print(f"  {c[0]:25} {c[1]}")

    print("\n=== MUESTRA 3 REGISTROS CON STOCK > 0 ===")
    r_stock = conn.execute(text("""
        SELECT * FROM inventario_legacy_items_v2 
        WHERE union_temporal::text = 'MANTENIMIENTO' AND cantidad_stock > 0 
        LIMIT 3
    """)).mappings().all()
    for r in r_stock:
        print(dict(r))

    print("\n=== MUESTRA 3 REGISTROS CON STOCK = 0 ===")
    r_cero = conn.execute(text("""
        SELECT * FROM inventario_legacy_items_v2 
        WHERE union_temporal::text = 'MANTENIMIENTO' AND cantidad_stock = 0 
        LIMIT 3
    """)).mappings().all()
    for r in r_cero:
        print(dict(r))

    print("\n=== VERIFICAR SI 'PRUEBA 1' EXISTE EN LEGACY ===")
    match_prueba = conn.execute(text("""
        SELECT * FROM inventario_legacy_items_v2 
        WHERE union_temporal::text = 'MANTENIMIENTO' AND LOWER(descripcion) LIKE '%prueba%'
    """)).mappings().all()
    print("Coincidencias con 'prueba':", [dict(m) for m in match_prueba])
