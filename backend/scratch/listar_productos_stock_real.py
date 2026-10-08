"""Listar todos los productos con stock y sin stock con sus cantidades"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

with engine.connect() as conn:
    print("=== PRODUCTOS KARDEX ===")
    pk = conn.execute(text("SELECT id, codigo, descripcion, stock_actual FROM inventario_items WHERE planilla_id = 1 AND eliminado_en IS NULL")).mappings().all()
    for p in pk:
        print(f"  {p['descripcion']:50} -> {p['stock_actual']}")

    print("\n=== PRODUCTOS LEGACY CON STOCK (MANTENIMIENTO) ===")
    pl = conn.execute(text("""
        SELECT 
            TRIM(descripcion) as producto,
            COUNT(*) as reg_totales,
            SUM(cantidad_stock) as stock_disponible
        FROM inventario_legacy_items_v2
        WHERE union_temporal::text = 'MANTENIMIENTO'
        GROUP BY TRIM(descripcion)
        HAVING SUM(cantidad_stock) > 0
        ORDER BY SUM(cantidad_stock) DESC, TRIM(descripcion) ASC
    """)).mappings().all()
    
    total_legacy_stock = 0
    for idx, p in enumerate(pl, 1):
        print(f" {idx:2d}. {p['producto']:52} -> {p['stock_disponible']} uds ({p['reg_totales']} regs)")
        total_legacy_stock += p['stock_disponible']

    print(f"\nTotal productos legacy con stock: {len(pl)}")
    print(f"Total unidades legacy con stock: {total_legacy_stock}")
    print(f"Gran total con Kardex: {total_legacy_stock + sum(p['stock_actual'] for p in pk)} unidades")
