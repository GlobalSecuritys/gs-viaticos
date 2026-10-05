import sys
from sqlalchemy import inspect, text
from app.database import engine

insp = inspect(engine)
tables = [t for t in insp.get_table_names() if "inventario" in t]
print("Tablas de inventario en BD:")
with engine.connect() as conn:
    for t in sorted(tables):
        cols = [c["name"] for c in insp.get_columns(t)]
        try:
            count = conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
            print(f"  {t} ({count} filas): {cols}")
        except Exception as e:
            print(f"  {t} (error: {e})")
