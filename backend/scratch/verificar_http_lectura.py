"""Verificar endpoint HTTP de lectura inteligente sin /api"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.usuario import Usuario
from app.core.security import create_access_token

client = TestClient(app)
db = SessionLocal()
try:
    admin = db.query(Usuario).filter(Usuario.rol == 'superadmin').first()
    token = create_access_token(data={"sub": admin.correo})
    headers = {"Authorization": f"Bearer {token}"}

    print("--- 1. PROBAR PLANILLA 1 (Mantenimiento 2026) ---")
    r1 = client.get("/inventario/planillas/1/lectura-inteligente", headers=headers)
    print("Status:", r1.status_code)
    data1 = r1.json()
    print("Metricas:", data1.get("metricas_consolidadas"))
    print("Fuentes kardex:", data1.get("desglose_fuentes", {}).get("kardex_activo", {}).get("unidades"))
    print("Fuentes legacy:", data1.get("desglose_fuentes", {}).get("historico_legacy", {}).get("unidades"))

    print("\n--- 2. PROBAR PLANILLA 2 (RTC - Comware) ---")
    r2 = client.get("/inventario/planillas/2/lectura-inteligente", headers=headers)
    print("Status:", r2.status_code)
    print("Detail:", r2.json().get("detail"))

    print("\n--- 3. PROBAR OBTENER PLANILLAS (Home) ---")
    r_planillas = client.get("/inventario/planillas", headers=headers)
    print("Status:", r_planillas.status_code)
    for p in r_planillas.json():
        print(f"  Planilla {p['id']} ({p['nombre']}): items={p['total_items']}, unidades={p['total_unidades']}")

finally:
    db.close()
