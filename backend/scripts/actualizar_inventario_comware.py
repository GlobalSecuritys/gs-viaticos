"""
Script optimizado para actualizar el inventario de RTC - Comware (planilla_id = 2)
con el archivo más reciente (Noviembre 2026):
  - 8,633 registros en INVENTARIO GENERAL (Stock)
  - 837 registros en SALIDAS (5 Instaladas, 832 Pendientes)
Usa psycopg2.extras.execute_values para inserción ultra rápida en 1 segundo.
"""

import sys, os, datetime, json, shutil

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

import openpyxl
from psycopg2.extras import execute_values
from app.database import engine
from app.services.inventario_excel import _limpiar_valor, _convertir_valor

RUTA_NUEVO_EXCEL = r"C:\Users\Global Security Bank\Downloads\CI-FR- INVENTARIO RTC AMERICAN GLOBAL 2026 2.xlsx"
RUTA_DESTINO_COMWARE = os.path.join(backend_dir, "data", "migracion_inventario", "INVENTARIO GSB_COMWARE  RTC 2026.xlsx")
RUTA_BACKUP_OLD = os.path.join(backend_dir, "data", "migracion_inventario", "INVENTARIO GSB_COMWARE  RTC 2026_BACKUP_OLD.xlsx")

def actualizar_inventario():
    print("=== INICIANDO ACTUALIZACIÓN INVENTARIO COMWARE RTC (ULTRA RÁPIDA) ===", flush=True)
    
    # 1. Asegurar archivo base
    if not os.path.exists(RUTA_NUEVO_EXCEL):
        raise FileNotFoundError(f"No se encontró el archivo origen: {RUTA_NUEVO_EXCEL}")
        
    if not os.path.exists(RUTA_BACKUP_OLD) and os.path.exists(RUTA_DESTINO_COMWARE):
        shutil.copy2(RUTA_DESTINO_COMWARE, RUTA_BACKUP_OLD)
        print(f"Respaldo creado: {RUTA_BACKUP_OLD}", flush=True)
        
    shutil.copy2(RUTA_NUEVO_EXCEL, RUTA_DESTINO_COMWARE)
    print(f"Archivo base actualizado en: {RUTA_DESTINO_COMWARE} ({os.path.getsize(RUTA_DESTINO_COMWARE)} bytes)", flush=True)

    # 2. Leer y parsear el Excel nuevo
    wb = openpyxl.load_workbook(RUTA_DESTINO_COMWARE, data_only=True, read_only=True)

    # A. Parse INVENTARIO GENERAL
    print("Leyendo hoja INVENTARIO GENERAL...", flush=True)
    ws_ig = wb["INVENTARIO GENERAL"]
    tuplas_ig = []
    headers_ig = None

    for idx, r in enumerate(ws_ig.iter_rows(values_only=True)):
        if idx == 0:
            headers_ig = r
            continue
        desc = _limpiar_valor(r[3] if len(r) > 3 else None)
        if not desc or "@" in desc:
            continue

        fecha_val = r[0] if len(r) > 0 else None
        if isinstance(fecha_val, (datetime.datetime, datetime.date)):
            fecha_date = fecha_val.date() if isinstance(fecha_val, datetime.datetime) else fecha_val
        else:
            fecha_date = None

        orden = _limpiar_valor(r[1] if len(r) > 1 else None)
        if orden and orden.endswith(".0"):
            orden = orden[:-2]

        cod_barras = _limpiar_valor(r[2] if len(r) > 2 else None)
        id_equipo = _limpiar_valor(r[5] if len(r) > 5 else None)
        serial = _limpiar_valor(r[6] if len(r) > 6 else None)
        concatenado = _limpiar_valor(r[7] if len(r) > 7 else None)
        oficina = _limpiar_valor(r[8] if len(r) > 8 else None)
        tecnico = _limpiar_valor(r[9] if len(r) > 9 else None)

        extra = {}
        for col_idx, col_name in enumerate(headers_ig):
            if col_name and col_idx < len(r):
                val = r[col_idx]
                if val is not None:
                    extra[str(col_name).strip()] = _convertir_valor(val)

        tuplas_ig.append((
            2,  # planilla_id
            "INVENTARIO GENERAL",  # hoja
            "stock",  # estado
            fecha_date,
            orden,
            cod_barras,
            desc,
            1,  # cantidad
            id_equipo,
            serial if serial and serial not in ("N/A", "NA", "-") and not serial.endswith("N/A") else None,
            concatenado,
            oficina,
            tecnico,
            None,  # fecha_despacho
            None,  # observacion
            None,  # numero_orden_despacho
            None,  # oficina_instalada
            None,  # fecha_instalacion
            json.dumps(extra)
        ))

    print(f"Total registros parseados INVENTARIO GENERAL: {len(tuplas_ig)}", flush=True)

    # B. Parse SALIDAS
    print("Leyendo hoja SALIDAS...", flush=True)
    hoja_sal = next(h for h in wb.sheetnames if h.strip().upper() == "SALIDAS")
    ws_sal = wb[hoja_sal]
    tuplas_sal = []
    headers_sal = None

    for idx, r in enumerate(ws_sal.iter_rows(values_only=True)):
        if idx == 0:
            headers_sal = r
            continue
        desc = _limpiar_valor(r[3] if len(r) > 3 else None)
        if not desc or "@" in desc:
            continue

        fecha_val = r[0] if len(r) > 0 else None
        if isinstance(fecha_val, (datetime.datetime, datetime.date)):
            fecha_date = fecha_val.date() if isinstance(fecha_val, datetime.datetime) else fecha_val
        else:
            fecha_date = None

        factura = _limpiar_valor(r[1] if len(r) > 1 else None)
        if factura and factura.endswith(".0"):
            factura = factura[:-2]

        cod_barras = _limpiar_valor(r[2] if len(r) > 2 else None)
        id_equipo = _limpiar_valor(r[5] if len(r) > 5 else None)
        serial = _limpiar_valor(r[6] if len(r) > 6 else None)
        concatenado = _limpiar_valor(r[7] if len(r) > 7 else None)
        oficina = _limpiar_valor(r[8] if len(r) > 8 else None)
        tecnico = _limpiar_valor(r[9] if len(r) > 9 else None)

        fecha_desp = r[10] if len(r) > 10 else None
        if isinstance(fecha_desp, (datetime.datetime, datetime.date)):
            fecha_desp_date = fecha_desp.date() if isinstance(fecha_desp, datetime.datetime) else fecha_desp
        else:
            fecha_desp_date = None

        observacion = _limpiar_valor(r[11] if len(r) > 11 else None)
        orden = _limpiar_valor(r[12] if len(r) > 12 else None)
        ofic_inst = _limpiar_valor(r[13] if len(r) > 13 else None)

        fecha_inst = r[14] if len(r) > 14 else None
        if isinstance(fecha_inst, (datetime.datetime, datetime.date)):
            fecha_inst_date = fecha_inst.date() if isinstance(fecha_inst, datetime.datetime) else fecha_inst
        else:
            fecha_inst_date = None

        has_inst = bool(ofic_inst and ofic_inst.upper() not in ("", "N/A", "NA", "-")) or bool(fecha_inst_date)
        estado = "instalado" if has_inst else "pendiente"

        extra = {}
        for col_idx, col_name in enumerate(headers_sal):
            if col_name and col_idx < len(r):
                val = r[col_idx]
                if val is not None:
                    extra[str(col_name).strip()] = _convertir_valor(val)

        tuplas_sal.append((
            2,  # planilla_id
            "SALIDAS",  # hoja
            estado,
            fecha_date,
            orden or factura,
            cod_barras,
            desc,
            1,  # cantidad
            id_equipo,
            serial if serial and serial not in ("N/A", "NA", "-") and not serial.endswith("N/A") else None,
            concatenado,
            oficina,
            tecnico,
            fecha_desp_date,
            observacion,
            orden,
            ofic_inst,
            fecha_inst_date,
            json.dumps(extra)
        ))

    wb.close()
    print(f"Total registros parseados SALIDAS: {len(tuplas_sal)}", flush=True)

    # 3. Inserción masiva ultra-rápida con execute_values
    print("Guardando en la base de datos (PostgreSQL) con execute_values...", flush=True)
    raw_conn = engine.raw_connection()
    try:
        with raw_conn.cursor() as cur:
            cur.execute("UPDATE inventario_planillas SET fuente = 'app' WHERE id = 2;")
            cur.execute("DELETE FROM inventario_registros WHERE planilla_id = 2;")
            print(f"Registros anteriores eliminados.", flush=True)

            insert_query = """
                INSERT INTO inventario_registros (
                    planilla_id, hoja, estado, fecha, numero_orden, codigo_barras, descripcion,
                    cantidad, id_equipo, serial, concatenado, oficina, tecnico, fecha_despacho,
                    observacion, numero_orden_despacho, oficina_instalada, fecha_instalacion, datos_extra
                ) VALUES %s
            """

            todas_tuplas = tuplas_ig + tuplas_sal
            print(f"Insertando {len(todas_tuplas)} filas en paquetes optimizados...", flush=True)
            execute_values(cur, insert_query, todas_tuplas, page_size=2000)

            cur.execute("SELECT count(*) FROM inventario_registros WHERE planilla_id = 2 AND estado = 'stock';")
            tot_stock = cur.fetchone()[0]

            cur.execute("SELECT count(*) FROM inventario_registros WHERE planilla_id = 2 AND estado IN ('pendiente', 'instalado');")
            tot_salidas = cur.fetchone()[0]

            cur.execute("SELECT count(DISTINCT descripcion) FROM inventario_registros WHERE planilla_id = 2 AND estado = 'stock';")
            tot_prods = cur.fetchone()[0]

        raw_conn.commit()
        print(f"✅ Inserción confirmada en BD: Stock={tot_stock} (en {tot_prods} productos), Salidas={tot_salidas}, Total={tot_stock + tot_salidas}", flush=True)
    finally:
        raw_conn.close()

    print("=== ACTUALIZACIÓN FINALIZADA CON ÉXITO ===", flush=True)

if __name__ == "__main__":
    actualizar_inventario()
