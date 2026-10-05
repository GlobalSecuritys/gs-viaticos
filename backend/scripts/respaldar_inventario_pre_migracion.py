import json
import os
import sys
from datetime import date, datetime
from sqlalchemy import text, inspect

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import engine

def serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj

def main():
    insp = inspect(engine)
    tables = [t for t in insp.get_table_names() if 'inventario' in t]
    backup_data = {}

    print("Iniciando respaldo de tablas de inventario...")
    with engine.connect() as conn:
        for t in sorted(tables):
            rows = [dict(r) for r in conn.execute(text(f'SELECT * FROM "{t}"')).mappings()]
            backup_data[t] = rows
            print(f"  [OK] {t}: {len(rows)} filas respaldadas.")

    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "backup_inventario_pre_migracion.json")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, default=serialize, indent=2)

    print(f"\nRespaldo completado exitosamente en: {output_file}")

if __name__ == "__main__":
    main()
