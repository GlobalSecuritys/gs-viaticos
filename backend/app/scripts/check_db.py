"""Script para verificar el estado de inventario_registros en la BD."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    rows = db.execute(text(
        "SELECT estado, COUNT(*) FROM inventario_registros "
        "WHERE planilla_id=2 AND anulado_en IS NULL GROUP BY estado"
    )).fetchall()
    print("Estado BD inventario_registros planilla_id=2:")
    for r in rows:
        print(f"  {r[0]}: {r[1]}")

    total = db.execute(text(
        "SELECT COUNT(*) FROM inventario_registros WHERE planilla_id=2 AND anulado_en IS NULL"
    )).scalar()
    print(f"  TOTAL: {total}")

    # Check fuente
    fuente = db.execute(text(
        "SELECT fuente FROM inventario_planillas WHERE id=2"
    )).scalar()
    print(f"  Fuente planilla 2: {fuente}")

finally:
    db.close()

