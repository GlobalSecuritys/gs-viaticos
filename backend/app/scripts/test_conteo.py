"""Test _conteo_planilla para Comware leyendo de inventario_registros."""
import sys, os
sys.path.insert(0, ".")
os.environ.setdefault("PYTHONPATH", ".")
from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app.routers.inventario import _conteo_planilla

db = SessionLocal()
try:
    items, unidades = _conteo_planilla(db, 2)
    print(f"Comware => ÍTEMS: {items}, UNIDADES: {unidades}")
    # Esperado: ÍTEMS=9 (productos únicos con stock), UNIDADES=985
finally:
    db.close()

