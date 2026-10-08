"""Test de endpoint y servicio de lectura inteligente"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.services.inventario_lectura_inteligente import obtener_lectura_inteligente_mantenimiento
from fastapi import HTTPException

db = SessionLocal()
try:
    print("=== TEST PLANILLA 1 (Mantenimiento 2026) ===")
    res1 = obtener_lectura_inteligente_mantenimiento(db, 1)
    print("Éxito planilla 1:")
    print("  Inventario:", res1["inventario"]["nombre"])
    print("  Métricas consolidadas:", res1["metricas_consolidadas"])
    print("  Fuentes kardex:", res1["desglose_fuentes"]["kardex_activo"]["registros"], "reg,", res1["desglose_fuentes"]["kardex_activo"]["unidades"], "uds")
    print("  Fuentes legacy:", res1["desglose_fuentes"]["historico_legacy"]["registros"], "reg,", res1["desglose_fuentes"]["historico_legacy"]["unidades"], "uds")
    print("  Diagnóstico duplicados:", res1["diagnostico_consistencia"]["hay_posibles_duplicados"])
    print("  Regla:", res1["diagnostico_consistencia"]["regla_utilizada"])

    print("\n=== TEST OTRAS PLANILLAS (debe rechazar porque es piloto exclusivo) ===")
    for pid in [2, 3, 4, 5]:
        try:
            obtener_lectura_inteligente_mantenimiento(db, pid)
            print(f"ERROR: Planilla {pid} no fue rechazada")
        except HTTPException as e:
            print(f"Planilla {pid} correctamente aislada: HTTP {e.status_code}")
finally:
    db.close()
