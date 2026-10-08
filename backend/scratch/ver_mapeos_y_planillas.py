"""Ver todos los mapeos legacy"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

with engine.connect() as conn:
    print("=== TODOS LOS MAPEOS LEGACY ===")
    mapeos = conn.execute(text("SELECT * FROM inventario_mapeo_legacy")).mappings().all()
    for m in mapeos:
        print(dict(m))

    print("\n=== TODAS LAS PLANILLAS ===")
    planillas = conn.execute(text("SELECT id, nombre, orden, activa FROM inventario_planillas ORDER BY orden")).mappings().all()
    for p in planillas:
        print(dict(p))
