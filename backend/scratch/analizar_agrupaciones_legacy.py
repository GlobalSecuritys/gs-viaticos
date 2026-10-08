"""Analizar descripciones y agrupaciones en legacy para MANTENIMIENTO"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

with engine.connect() as conn:
    print("=== AGRUPACIÓN POR DESCRIPCIÓN EN LEGACY MANTENIMIENTO ===")
    desc_stats = conn.execute(text("""
        SELECT 
            COUNT(DISTINCT descripcion) as descripciones_distintas,
            COUNT(*) as total_filas,
            SUM(cantidad_stock) as total_unidades
        FROM inventario_legacy_items_v2
        WHERE union_temporal::text = 'MANTENIMIENTO'
    """)).mappings().first()
    print("Stats descripciones:", dict(desc_stats))

    print("\n=== TOP 10 DESCRIPCIONES EN LEGACY (POR CANTIDAD DE REGISTROS) ===")
    top_desc = conn.execute(text("""
        SELECT 
            descripcion, 
            COUNT(*) as total_registros,
            SUM(cantidad_stock) as suma_stock,
            COUNT(CASE WHEN cantidad_stock > 0 THEN 1 END) as reg_con_stock,
            COUNT(CASE WHEN cantidad_stock = 0 THEN 1 END) as reg_sin_stock
        FROM inventario_legacy_items_v2
        WHERE union_temporal::text = 'MANTENIMIENTO'
        GROUP BY descripcion
        ORDER BY COUNT(*) DESC
        LIMIT 10
    """)).mappings().all()
    for r in top_desc:
        print(dict(r))

    print("\n=== VALORES POSIBLES DE cantidad_stock EN LEGACY ===")
    val_stock = conn.execute(text("""
        SELECT cantidad_stock, COUNT(*) as cantidad_filas
        FROM inventario_legacy_items_v2
        WHERE union_temporal::text = 'MANTENIMIENTO'
        GROUP BY cantidad_stock
        ORDER BY cantidad_stock
    """)).mappings().all()
    for v in val_stock:
        print(dict(v))

    print("\n=== ¿HAY MOVIMIENTOS O DESPACHOS EN LEGACY PARA ESTA PLANILLA? ===")
    # Ver si hay tablas de movimientos legacy o despachos
    tablas_legacy = conn.execute(text("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name LIKE '%inventario%legacy%' OR table_name LIKE '%legacy%inventario%'
    """)).fetchall()
    print("Tablas legacy en la BD:", [t[0] for t in tablas_legacy])
