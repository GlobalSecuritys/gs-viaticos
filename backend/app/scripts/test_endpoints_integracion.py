"""
Test de integración rápido: llama a los servicios directamente sobre la BD real.
Estado esperado al inicio: bodega=985, pendientes=19, instaladas=5
"""
import sys, os
sys.path.insert(0, ".")
from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app.schemas.inventario_comware import EntradaCreate, ItemEntrada, SalidaCreate, ItemSalida, InstalacionCreate
from app.services.inventario_comware import (
    calcular_resumen_app,
    registrar_entrada,
    registrar_salida,
    registrar_instalacion,
    devolver_a_bodega,
    anular_entrada,
)

PLANILLA_ID = 2
USUARIO_ID = 7

db = SessionLocal()
try:
    print("=" * 60)
    print("ESTADO INICIAL")
    r0 = calcular_resumen_app(db, PLANILLA_ID)
    print(f"  bodega={r0.bodega}, salidas={r0.salidas_totales}, pendientes={r0.pendientes}")

    # ── TEST 1: Entrada 2 unidades SIN serial ─────────────────────────────────
    print("\n── TEST 1: Entrada 2 x 'BATERIA RECARGABLE 12V' (sin serial)")
    entrada_data = EntradaCreate(
        numero_orden="OC-TEST-001",
        items=[ItemEntrada(descripcion="BATERIA RECARGABLE 12V", tipo_serial="sin_serial", cantidad=2)]
    )
    regs, res = registrar_entrada(db, PLANILLA_ID, entrada_data, USUARIO_ID)
    print(f"  Creados: {len(regs)} registros — ids: {[r.id for r in regs]}")
    print(f"  bodega={res.bodega}, salidas={res.salidas_totales}")
    assert res.bodega == 987, f"Esperado 987, got {res.bodega}"

    # ── TEST 2: Entrada 1 unidad CON serial ───────────────────────────────────
    print("\n── TEST 2: Entrada 1 x 'SWITCH CISCO' (con serial TEST-SERIAL-001)")
    entrada_data2 = EntradaCreate(
        numero_orden="OC-TEST-002",
        items=[ItemEntrada(
            descripcion="SWITCH CISCO",
            tipo_serial="con_serial",
            seriales=["TEST-SERIAL-001"],
            id_equipos=["EQ-001"]
        )]
    )
    regs2, res2 = registrar_entrada(db, PLANILLA_ID, entrada_data2, USUARIO_ID)
    print(f"  Creados: {len(regs2)} — serial: {regs2[0].serial}, concat: {regs2[0].concatenado}")
    assert res2.bodega == 988, f"Esperado 988, got {res2.bodega}"

    # ── TEST 3: Salida sin serial (FIFO) ──────────────────────────────────────
    print("\n── TEST 3: Salida 2 x 'BATERIA RECARGABLE 12V' a TECNICO TEST / OFICINA PRUEBA")
    salida_data = SalidaCreate(
        tecnico="Tecnico Test",
        oficina="Oficina Prueba",
        items=[ItemSalida(tipo_serial="sin_serial", descripcion="BATERIA RECARGABLE 12V", cantidad=2)]
    )
    desp, res3 = registrar_salida(db, PLANILLA_ID, salida_data, USUARIO_ID)
    print(f"  Despachados: {len(desp)} — bodega={res3.bodega}, pendientes={res3.pendientes}")
    assert res3.bodega == 986, f"Esperado 986, got {res3.bodega}"

    # ── TEST 4: Salida con serial ─────────────────────────────────────────────
    print("\n── TEST 4: Salida serial TEST-SERIAL-001")
    salida_data2 = SalidaCreate(
        tecnico="Tecnico Test",
        oficina="Oficina Prueba",
        items=[ItemSalida(tipo_serial="con_serial", serial="TEST-SERIAL-001")]
    )
    desp2, res4 = registrar_salida(db, PLANILLA_ID, salida_data2, USUARIO_ID)
    print(f"  Despachados: {len(desp2)} — bodega={res4.bodega}, pendientes={res4.pendientes}")
    assert res4.bodega == 985, f"Esperado 985, got {res4.bodega}"

    # ── TEST 5: Instalar los 3 despachados ────────────────────────────────────
    ids_a_instalar = [r.id for r in desp] + [r.id for r in desp2]
    print(f"\n── TEST 5: Instalar {len(ids_a_instalar)} registros: {ids_a_instalar}")
    inst_data = InstalacionCreate(registro_ids=ids_a_instalar, oficina_instalada="OFICINA PRUEBA FINAL")
    _, res5 = registrar_instalacion(db, PLANILLA_ID, inst_data, USUARIO_ID)
    print(f"  bodega={res5.bodega}, pendientes={res5.pendientes}, instaladas={res5.instaladas}")

    # ── TEST 6: Devolver uno a bodega ─────────────────────────────────────────
    # El primero que estaba pendiente del lote de salida serial
    # No podemos devolver ya que están instalados. Necesitamos uno pendiente.
    # Vamos a verificar que 404 sale bien intentando algo mal.
    print("\n── TEST 6: Intentar devolver registro INSTALADO (debe fallar)")
    try:
        devolver_a_bodega(db, PLANILLA_ID, ids_a_instalar[0], "motivo test", USUARIO_ID)
        print("  ERROR: debería haber fallado!")
    except Exception as e:
        print(f"  OK: error esperado → {e.detail}")

    # ── TEST 7: Anular entrada en stock ───────────────────────────────────────
    # El batch de entrada ya fue despachado/instalado, busquemos uno aún en stock
    # ... todos ya se despacharon. Vamos a crear otro y anularlo
    print("\n── TEST 7: Crear y anular una entrada en stock")
    entrada_data3 = EntradaCreate(
        items=[ItemEntrada(descripcion="CABLE UTP PRUEBA", tipo_serial="sin_serial", cantidad=1)]
    )
    regs3, _ = registrar_entrada(db, PLANILLA_ID, entrada_data3, USUARIO_ID)
    reg_para_anular = regs3[0]
    _, res7 = anular_entrada(db, PLANILLA_ID, reg_para_anular.id, "anulación de prueba", USUARIO_ID)
    print(f"  Anulado #{reg_para_anular.id} — bodega={res7.bodega}")

    print("\n" + "=" * 60)
    print("ESTADO FINAL (debe ser igual al inicial: bodega=985)")
    rf = calcular_resumen_app(db, PLANILLA_ID)
    print(f"  bodega={rf.bodega}, salidas={rf.salidas_totales}, pendientes={rf.pendientes}")

    # ── ROLLBACK completo para no alterar la BD ───────────────────────────────
    db.rollback()
    print("\n✅ ROLLBACK aplicado. BD sin cambios.")

    rf2 = calcular_resumen_app(db, PLANILLA_ID)
    print(f"  bodega={rf2.bodega}, salidas={rf2.salidas_totales} (confirmado sin cambios)")

except Exception as e:
    db.rollback()
    import traceback
    traceback.print_exc()
finally:
    db.close()
