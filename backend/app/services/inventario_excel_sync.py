"""
Servicio de sincronización del Excel de Comware (y planillas app-managed).

Principio:
  La app es la fuente de verdad. El Excel es un espejo que se regenera
  automáticamente después de cada movimiento (entrada, salida, instalación,
  devolución, anulación) de forma asíncrona.

Archivos:
  - Plantilla (solo lectura):
    backend/data/migracion_inventario/INVENTARIO GSB_COMWARE  RTC 2026.xlsx
  - Excel vivo:
    backend/data/inventario_vivo/comware/INVENTARIO GSB_COMWARE RTC 2026 - ACTUAL.xlsx
  - Historial (máximo 30 respaldos):
    backend/data/inventario_vivo/comware/historial/<fecha_hora>_<tipo_movimiento>.xlsx
"""

import os
import shutil
import logging
import threading
import time
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from openpyxl.styles import Font, PatternFill
from sqlalchemy import text

from app.database import SessionLocal

logger = logging.getLogger("inventario.sync")

# ── Rutas ─────────────────────────────────────────────────────────────────────
BASE_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
PLANTILLA_COMWARE_PATH = os.path.join(
    BASE_DATA_DIR, "migracion_inventario", "INVENTARIO GSB_COMWARE  RTC 2026.xlsx"
)
DIR_VIVO_COMWARE = os.path.join(BASE_DATA_DIR, "inventario_vivo", "comware")
EXCEL_VIVO_COMWARE = os.path.join(DIR_VIVO_COMWARE, "INVENTARIO GSB_COMWARE RTC 2026 - ACTUAL.xlsx")
DIR_HISTORIAL_COMWARE = os.path.join(DIR_VIVO_COMWARE, "historial")

MAX_HISTORIAL_BACKUPS = 30
PLANILLA_COMWARE_ID = 2

# ── Estilos para las celdas reconstruidas ─────────────────────────────────────
FONT_ARIAL_NARROW = Font(name="Arial Narrow", size=11)
FILL_SALIDAS_VERDE = PatternFill(fill_type="solid", start_color="D9EAD3", end_color="D9EAD3")
FILL_BLANCO = PatternFill(fill_type="solid", start_color="FFFFFF", end_color="FFFFFF")

# ── Correos Comware que van al final de SALIDAS ──────────────────────────────
CORREOS_COMWARE = [
    "yuly.gonzalez@comware.com.co",
    "july.melendez@comware.com.co",
    "daniel.correa@comware.com.co",
]

# ── Control de concurrencia y estado ──────────────────────────────────────────
_lock_sync = threading.Lock()
_generando = False
_necesita_reintento = False
_ultimo_tipo_pendiente = "movimiento"

_estado_sync: Dict[str, Any] = {
    "planilla_id": PLANILLA_COMWARE_ID,
    "estado": "sincronizado",  # "sincronizado" | "sincronizando" | "desactualizado"
    "sincronizado_en": None,
    "ultimo_movimiento": "inicio",
    "error": None,
    "archivo_vivo": os.path.basename(EXCEL_VIVO_COMWARE),
    "total_stock": 0,
    "total_salidas": 0,
}


def obtener_ruta_excel_vivo(planilla_id: int) -> Optional[str]:
    """Retorna la ruta del Excel vivo si existe para la planilla."""
    if planilla_id == PLANILLA_COMWARE_ID:
        if os.path.exists(EXCEL_VIVO_COMWARE):
            return EXCEL_VIVO_COMWARE
    return None


def obtener_estado_sincronizacion(planilla_id: int) -> Dict[str, Any]:
    """Retorna el estado actual de sincronización del Excel de la planilla."""
    if planilla_id != PLANILLA_COMWARE_ID:
        return {
            "planilla_id": planilla_id,
            "estado": "no_aplica",
            "mensaje": "Esta planilla se gestiona directamente desde archivo Excel.",
        }

    with _lock_sync:
        estado_copia = dict(_estado_sync)

    # Si aún no tiene sincronizado_en y el archivo vivo existe, tomar su mtime
    if not estado_copia.get("sincronizado_en") and os.path.exists(EXCEL_VIVO_COMWARE):
        try:
            mtime = os.path.getmtime(EXCEL_VIVO_COMWARE)
            estado_copia["sincronizado_en"] = datetime.fromtimestamp(mtime).isoformat()
        except Exception:
            pass

    return estado_copia


def disparar_sincronizacion_excel(planilla_id: int, tipo_movimiento: str = "movimiento") -> None:
    """Dispara la sincronización en segundo plano de manera no bloqueante y agrupada (debounce)."""
    if planilla_id != PLANILLA_COMWARE_ID:
        return

    global _generando, _necesita_reintento, _ultimo_tipo_pendiente

    with _lock_sync:
        if _generando:
            _necesita_reintento = True
            _ultimo_tipo_pendiente = tipo_movimiento
            logger.info("[ExcelSync] Sincronización en curso. Se programó reintento con estado final.")
            return

    # Iniciar hilo en segundo plano para no bloquear el worker de FastAPI
    t = threading.Thread(
        target=_worker_sincronizacion,
        args=(planilla_id, tipo_movimiento),
        daemon=True,
        name=f"excel-sync-{planilla_id}",
    )
    t.start()


def _worker_sincronizacion(planilla_id: int, tipo_inicial: str) -> None:
    """Loop del worker: genera el Excel y, si hubo nuevos movimientos mientras corría, corre una vez más."""
    global _generando, _necesita_reintento, _ultimo_tipo_pendiente

    tipo_actual = tipo_inicial
    while True:
        with _lock_sync:
            _generando = True
            _estado_sync["estado"] = "sincronizando"

        exito = False
        try:
            _ejecutar_generacion_comware(planilla_id, tipo_actual)
            exito = True
        except Exception as e:
            logger.exception(f"[ExcelSync] Error al generar Excel de Comware: {e}")
            with _lock_sync:
                _estado_sync["estado"] = "desactualizado"
                _estado_sync["error"] = str(e)

        with _lock_sync:
            if not _necesita_reintento:
                _generando = False
                if exito:
                    _estado_sync["estado"] = "sincronizado"
                    _estado_sync["error"] = None
                break
            # Hubo movimientos adicionales mientras generábamos: reiniciar con el último tipo
            _necesita_reintento = False
            tipo_actual = _ultimo_tipo_pendiente


def _rotar_historial(dir_historial: str, max_backups: int = MAX_HISTORIAL_BACKUPS) -> None:
    """Conserva solo los últimos N respaldos en la carpeta de historial."""
    try:
        archivos = []
        for f in os.listdir(dir_historial):
            if f.endswith(".xlsx"):
                ruta = os.path.join(dir_historial, f)
                archivos.append((os.path.getmtime(ruta), ruta))
        archivos.sort(key=lambda x: x[0], reverse=True)
        for _, ruta in archivos[max_backups:]:
            try:
                os.remove(ruta)
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"[ExcelSync] Advertencia al rotar historial: {e}")


def _ejecutar_generacion_comware(planilla_id: int, tipo_movimiento: str) -> Dict[str, Any]:
    """Genera atómicamente el Excel vivo de Comware a partir de la plantilla y la BD."""
    if not os.path.exists(PLANTILLA_COMWARE_PATH):
        raise FileNotFoundError(f"Plantilla base no encontrada: {PLANTILLA_COMWARE_PATH}")

    os.makedirs(DIR_VIVO_COMWARE, exist_ok=True)
    os.makedirs(DIR_HISTORIAL_COMWARE, exist_ok=True)

    # 1. Consultar registros en BD
    db = SessionLocal()
    try:
        # Registros en stock para INVENTARIO GENERAL
        filas_general = db.execute(
            text(
                "SELECT fecha, numero_orden, codigo_barras, descripcion, cantidad, "
                "id_equipo, serial, concatenado, oficina, tecnico, fecha_despacho "
                "FROM inventario_registros "
                "WHERE planilla_id = :pid AND estado = 'stock' AND anulado_en IS NULL "
                "ORDER BY fecha ASC NULLS LAST, id ASC"
            ),
            {"pid": planilla_id},
        ).fetchall()

        # Registros en salidas para SALIDAS
        filas_salidas = db.execute(
            text(
                "SELECT fecha, numero_orden, codigo_barras, descripcion, cantidad, "
                "id_equipo, serial, concatenado, oficina, tecnico, fecha_despacho, "
                "observacion, numero_orden_despacho, oficina_instalada, fecha_instalacion "
                "FROM inventario_registros "
                "WHERE planilla_id = :pid AND estado IN ('pendiente', 'instalado') AND anulado_en IS NULL "
                "ORDER BY fecha_despacho ASC NULLS LAST, id ASC"
            ),
            {"pid": planilla_id},
        ).fetchall()
    finally:
        db.close()

    total_general = len(filas_general)
    total_salidas = len(filas_salidas)

    # 2. Cargar plantilla con openpyxl (conserva las 31 hojas, anchos, formatos)
    wb = openpyxl.load_workbook(PLANTILLA_COMWARE_PATH, data_only=False)

    # ── Hoja INVENTARIO GENERAL ──────────────────────────────────────────────
    if "INVENTARIO GENERAL" in wb.sheetnames:
        ws_gen = wb["INVENTARIO GENERAL"]
        if ws_gen.max_row > 1:
            ws_gen.delete_rows(2, ws_gen.max_row - 1)

        for idx, row in enumerate(filas_general, start=2):
            f_fecha, f_orden, f_cod, f_desc, f_cant, f_eq, f_sn, _, f_ofic, f_tec, f_desp = row

            # Col 1: FECHA
            c1 = ws_gen.cell(idx, 1)
            if f_fecha:
                c1.value = datetime.combine(f_fecha, datetime.min.time()) if isinstance(f_fecha, date) and not isinstance(f_fecha, datetime) else f_fecha
                c1.number_format = "d/m/yyyy"
            c1.font = FONT_ARIAL_NARROW

            # Col 2: NUMERO DE ORDEN
            c2 = ws_gen.cell(idx, 2, f_orden or "")
            c2.font = FONT_ARIAL_NARROW

            # Col 3: CODIGO DE BARRAS
            c3 = ws_gen.cell(idx, 3, f_cod or "N/A")
            c3.font = FONT_ARIAL_NARROW

            # Col 4: DESCRIPCIÓN
            c4 = ws_gen.cell(idx, 4, f_desc or "")
            c4.font = FONT_ARIAL_NARROW

            # Col 5: CANTIDAD
            c5 = ws_gen.cell(idx, 5, f_cant or 1)
            c5.font = FONT_ARIAL_NARROW

            # Col 6: ID. EQUIPO
            c6 = ws_gen.cell(idx, 6, f_eq or "N/A")
            c6.font = FONT_ARIAL_NARROW

            # Col 7: SERIALES GSB
            c7 = ws_gen.cell(idx, 7, f_sn or "N/A")
            c7.font = FONT_ARIAL_NARROW

            # Col 8: CONCATENADO (Fórmula idéntica al original)
            c8 = ws_gen.cell(idx, 8, f'=CONCATENATE("GSB",G{idx},"-","SN",F{idx})')
            c8.font = FONT_ARIAL_NARROW

            # Col 9: OFICINA
            c9 = ws_gen.cell(idx, 9, f_ofic or "")
            c9.font = FONT_ARIAL_NARROW

            # Col 10: TECNICO
            c10 = ws_gen.cell(idx, 10, f_tec or "")
            c10.font = FONT_ARIAL_NARROW

            # Col 11: FECHA DE DESPACHO
            c11 = ws_gen.cell(idx, 11)
            if f_desp:
                c11.value = datetime.combine(f_desp, datetime.min.time()) if isinstance(f_desp, date) and not isinstance(f_desp, datetime) else f_desp
                c11.number_format = "d/m/yyyy"
            c11.font = FONT_ARIAL_NARROW

    # ── Hoja SALIDAS (con espacio al final en nombre) ─────────────────────────
    salidas_sheet_name = next((s for s in wb.sheetnames if s.strip().upper() == "SALIDAS"), "SALIDAS ")
    if salidas_sheet_name in wb.sheetnames:
        ws_sal = wb[salidas_sheet_name]
        if ws_sal.max_row > 1:
            ws_sal.delete_rows(2, ws_sal.max_row - 1)

        fila_actual = 2
        for row in filas_salidas:
            (
                f_fecha_c, f_fact, f_cod, f_desc, f_cant, f_eq, f_sn, _,
                f_ofic, f_tec, f_desp, f_obs, f_num_orden, f_ofic_inst, f_fecha_inst
            ) = row

            # Col 1: FECHA COMPRA EQUIPO
            c1 = ws_sal.cell(fila_actual, 1)
            if f_fecha_c:
                c1.value = datetime.combine(f_fecha_c, datetime.min.time()) if isinstance(f_fecha_c, date) and not isinstance(f_fecha_c, datetime) else f_fecha_c
                c1.number_format = "d/m/yyyy"

            # Col 2: FACTURA
            ws_sal.cell(fila_actual, 2, f_fact or "")
            # Col 3: CODIGO BARRAS
            ws_sal.cell(fila_actual, 3, f_cod or "N/A")
            # Col 4: DESCRIPCIÓN
            ws_sal.cell(fila_actual, 4, f_desc or "")
            # Col 5: CANTIDAD
            ws_sal.cell(fila_actual, 5, f_cant or 1)
            # Col 6: ID. EQUIPO
            ws_sal.cell(fila_actual, 6, f_eq or "N/A")
            # Col 7: SERIALES GSB
            ws_sal.cell(fila_actual, 7, f_sn or "N/A")
            # Col 8: CONCATENADO (Fórmula)
            ws_sal.cell(fila_actual, 8, f'=CONCATENATE("GSB",G{fila_actual},"-","SN",F{fila_actual})')
            # Col 9: OFICINA
            ws_sal.cell(fila_actual, 9, f_ofic or "")
            # Col 10: TECNICO
            ws_sal.cell(fila_actual, 10, f_tec or "")

            # Col 11: FECHA DE DESPACHO
            c11 = ws_sal.cell(fila_actual, 11)
            if f_desp:
                c11.value = datetime.combine(f_desp, datetime.min.time()) if isinstance(f_desp, date) and not isinstance(f_desp, datetime) else f_desp
                c11.number_format = "d/m/yyyy"

            # Col 12: OBSERVACION
            ws_sal.cell(fila_actual, 12, f_obs or "UT-GBSCOM")
            # Col 13: NUMERO DE ORDEN
            ws_sal.cell(fila_actual, 13, f_num_orden or "")
            # Col 14: OFICINA INSTALDA
            ws_sal.cell(fila_actual, 14, f_ofic_inst or "")

            # Col 15: FECHA DE INSTALACION
            c15 = ws_sal.cell(fila_actual, 15)
            if f_fecha_inst:
                c15.value = datetime.combine(f_fecha_inst, datetime.min.time()) if isinstance(f_fecha_inst, date) and not isinstance(f_fecha_inst, datetime) else f_fecha_inst
                c15.number_format = "d/m/yyyy"

            # Aplicar fuentes y colores originales
            for col_idx in range(1, 16):
                cell = ws_sal.cell(fila_actual, col_idx)
                cell.font = FONT_ARIAL_NARROW
                if col_idx <= 11:
                    cell.fill = FILL_SALIDAS_VERDE
                else:
                    cell.fill = FILL_BLANCO

            fila_actual += 1

        # Dejar 1 fila vacía antes de los correos
        fila_actual += 1

        # Escribir las 3 filas de correos institucionales de Comware
        for correo in CORREOS_COMWARE:
            cell_correo = ws_sal.cell(fila_actual, 4, correo)
            cell_correo.font = FONT_ARIAL_NARROW
            fila_actual += 1

    # 3. Guardar en archivo temporal
    pid = os.getpid()
    tmp_path = os.path.join(DIR_VIVO_COMWARE, f"INVENTARIO_ACTUAL.tmp.{pid}.xlsx")
    wb.save(tmp_path)
    wb.close()

    # 4. Validar el archivo generado reabriéndolo con openpyxl
    wb_val = openpyxl.load_workbook(tmp_path, data_only=True, read_only=True)
    try:
        if len(wb_val.sheetnames) < 30:
            raise ValueError(f"Validación falló: solo se encontraron {len(wb_val.sheetnames)} hojas (esperadas 31).")
        ws_g = wb_val["INVENTARIO GENERAL"]
        ws_s = wb_val[salidas_sheet_name]
        # max_row en INVENTARIO GENERAL debe ser 1 (encabezado) + total_general
        filas_g = ws_g.max_row or 0
        if total_general > 0 and filas_g < total_general:
            raise ValueError(f"Validación falló en INVENTARIO GENERAL: {filas_g} filas < {total_general} esperadas.")
    finally:
        wb_val.close()

    # 5. Respaldar archivo vivo previo en historial
    ahora_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    if os.path.exists(EXCEL_VIVO_COMWARE):
        respaldo_nombre = f"{ahora_str}_{tipo_movimiento}.xlsx"
        respaldo_path = os.path.join(DIR_HISTORIAL_COMWARE, respaldo_nombre)
        try:
            shutil.copy2(EXCEL_VIVO_COMWARE, respaldo_path)
            _rotar_historial(DIR_HISTORIAL_COMWARE, MAX_HISTORIAL_BACKUPS)
        except Exception as e:
            logger.warning(f"[ExcelSync] No se pudo crear respaldo en historial: {e}")

    # 6. Reemplazo atómico con reintento (por si un proceso en Windows tiene el archivo abierto)
    reintentos = 3
    reemplazado = False
    for intento in range(1, reintentos + 1):
        try:
            os.replace(tmp_path, EXCEL_VIVO_COMWARE)
            reemplazado = True
            break
        except PermissionError as pe:
            logger.warning(
                f"[ExcelSync] Intento {intento}/{reintentos}: Archivo bloqueado ({pe}). Reintentando en 0.5s..."
            )
            time.sleep(0.5)

    if not reemplazado:
        # Dejar el tmp para reintentar después y registrar error
        raise PermissionError(
            "El archivo Excel vivo está bloqueado (posiblemente abierto en Excel en Windows). "
            "Cierra el archivo y presiona 'Reintentar'."
        )

    # 7. Actualizar estado en memoria
    with _lock_sync:
        _estado_sync.update({
            "planilla_id": planilla_id,
            "estado": "sincronizado",
            "sincronizado_en": datetime.now().isoformat(),
            "ultimo_movimiento": tipo_movimiento,
            "error": None,
            "total_stock": total_general,
            "total_salidas": total_salidas,
        })

    logger.info(
        f"[ExcelSync] Excel Comware sincronizado exitosamente: "
        f"{total_general} en bodega, {total_salidas} en salidas (movimiento: {tipo_movimiento})."
    )

    return dict(_estado_sync)

