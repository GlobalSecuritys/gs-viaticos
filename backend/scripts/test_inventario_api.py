import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import SessionLocal
from app.models.usuario import Usuario
from app.routers.inventario import (
    listar_planillas,
    listar_items,
    registrar_movimiento,
    obtener_kardex,
    reporte_global,
    siguiente_codigo,
)
from app.schemas.inventario import MovimientoCreate

def run_tests():
    db = SessionLocal()
    try:
        user = db.query(Usuario).filter(Usuario.rol == 'superadmin').first()
        if not user:
            user = db.query(Usuario).first()
        print(f"Testing with user: {user.correo} (rol: {user.rol})")

        # 1. Test planillas
        planillas = listar_planillas(db=db, current_user=user)
        print(f"\n--- Planillas ({len(planillas)}) ---")
        for p in planillas:
            print(f"  [{p.orden}] id={p.id} '{p.nombre}' | items: {p.total_items}, und: {p.total_unidades}")

        assert len(planillas) == 5, f"Expected 5 planillas, got {len(planillas)}"
        nombres_esperados = [
            "RTC - Comware",
            "RTC - American Global 2026",
            "Mantenimiento 2026",
            "Zeus",
            "Inventario general Global Security Bank SAS"
        ]
        nombres_obtenidos = [p.nombre for p in planillas]
        assert nombres_obtenidos == nombres_esperados, f"Order mismatch: {nombres_obtenidos} vs {nombres_esperados}"
        print("  [PASS] Planillas order and names match exactly!")

        # 2. Test items for Mantenimiento 2026 (id=1)
        items_resp = listar_items(db=db, current_user=user, planilla_id=1)
        print(f"\n--- Items Mantenimiento 2026 ({items_resp.total} items, {items_resp.total_unidades} und) ---")
        for it in items_resp.items:
            print(f"  id={it.id} '{it.descripcion}' stock_actual={it.stock_actual}, cantidad_total={it.cantidad_total}")
        assert items_resp.total >= 1, "Expected at least 1 item in Mantenimiento 2026"
        primer_item = items_resp.items[0]
        stock_inicial = primer_item.cantidad_total
        print(f"  Item 1 stock inicial: {stock_inicial}")

        # 3. Test negative stock prevention
        print("\n--- Probando bloqueo de stock negativo en salida ---")
        try:
            mov_exceso = MovimientoCreate(tipo="salida", cantidad=stock_inicial + 999, observacion="Prueba exceso")
            registrar_movimiento(item_id=primer_item.id, datos=mov_exceso, db=db, current_user=user)
            print("  [FAIL] Did not raise exception on negative stock!")
        except Exception as e:
            print(f"  [PASS] Correctly blocked with exception: {e.detail if hasattr(e, 'detail') else e}")

        # 4. Test other planillas items (must be 0 items)
        for p in planillas:
            if p.id != 1:
                sub_items = listar_items(db=db, current_user=user, planilla_id=p.id)
                assert sub_items.total == 0, f"Planilla {p.nombre} should be empty, had {sub_items.total}"
        print("  [PASS] All other 4 planillas are strictly independent and empty!")

        # 5. Test siguiente_codigo per planilla
        cod1 = siguiente_codigo(db=db, current_user=user, planilla_id=1)
        cod2 = siguiente_codigo(db=db, current_user=user, planilla_id=2)
        print(f"\n--- Siguiente código sugerido ---")
        print(f"  Planilla 1: {cod1.codigo}")
        print(f"  Planilla 2: {cod2.codigo}")

        # 6. Test reporte global con y sin filtro
        rep_global = reporte_global(db=db, current_user=user)
        print(f"\n--- Reporte Global Consolidado ---")
        print(f"  Total items: {rep_global.total_items}, Total unidades: {rep_global.total_unidades}")
        rep_p1 = reporte_global(db=db, current_user=user, planilla_id=1)
        print(f"--- Reporte Planilla 1 ---")
        print(f"  Total items: {rep_p1.total_items}, Total unidades: {rep_p1.total_unidades}")
        assert len(rep_p1.por_planilla) == 1, "Report with planilla_id must only return that planilla"
        print("  [PASS] Reportes filtered by planilla work perfectly!")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
