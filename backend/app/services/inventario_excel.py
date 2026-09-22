"""Servicio para lectura, parseo y cache en memoria del archivo Excel de Inventario.

El archivo vive en backend/data/inventario/inventario_general.xlsx.
Se cachea en memoria y se invalida automaticamente si la fecha de modificacion
del archivo en disco (mtime) cambia.
"""

import os
import threading
from typing import Any, Dict, List, Optional
import openpyxl

EXCEL_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "inventario", "inventario_general.xlsx")
)

_cache_lock = threading.Lock()
_cache_mtime: Optional[float] = None
_cache_data: Optional[Dict[str, Any]] = None


def obtener_ruta_excel() -> str:
    return EXCEL_PATH


def existe_archivo_excel() -> bool:
    return os.path.exists(EXCEL_PATH) and os.path.isfile(EXCEL_PATH)


def _convertir_valor(val: Any) -> Any:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val).strip()


def _cargar_excel_desde_disco() -> Dict[str, Any]:
    """Carga todas las hojas del archivo Excel con sus columnas reales."""
    if not existe_archivo_excel():
        return {
            "existe": False,
            "archivo": "inventario_general.xlsx",
            "ruta": EXCEL_PATH,
            "hojas": [],
            "datos_hojas": {},
        }

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True, read_only=True)
    hojas = wb.sheetnames
    datos_hojas: Dict[str, Dict[str, Any]] = {}

    for sheet_name in hojas:
        ws = wb[sheet_name]
        filas_iter = ws.iter_rows(values_only=True)

        encabezados: List[str] = []
        filas: List[Dict[str, Any]] = []

        for row in filas_iter:
            if not row or all(c is None for c in row):
                continue
            if not encabezados:
                encabezados = [
                    str(c).strip() if c is not None and str(c).strip() else f"Col_{i+1}"
                    for i, c in enumerate(row)
                ]
                nombres_vistos: Dict[str, int] = {}
                cols_unicas: List[str] = []
                for col in encabezados:
                    if col in nombres_vistos:
                        nombres_vistos[col] += 1
                        cols_unicas.append(f"{col}_{nombres_vistos[col]}")
                    else:
                        nombres_vistos[col] = 1
                        cols_unicas.append(col)
                encabezados = cols_unicas
                continue

            fila_dict: Dict[str, Any] = {}
            tiene_datos = False
            for i, h in enumerate(encabezados):
                val = row[i] if i < len(row) else None
                convertido = _convertir_valor(val)
                fila_dict[h] = convertido
                if convertido:
                    tiene_datos = True
            if tiene_datos:
                filas.append(fila_dict)

        datos_hojas[sheet_name] = {
            "columnas": encabezados,
            "total_filas": len(filas),
            "filas": filas,
        }

    wb.close()
    return {
        "existe": True,
        "archivo": "inventario_general.xlsx",
        "hojas": hojas,
        "datos_hojas": datos_hojas,
    }


def obtener_datos_inventario_excel(forzar_recarga: bool = False) -> Dict[str, Any]:
    """Retorna los datos del Excel cacheados en memoria.

    Invalida el cache automaticamente si el mtime del archivo cambio.
    """
    global _cache_mtime, _cache_data

    if not existe_archivo_excel():
        return {
            "existe": False,
            "archivo": "inventario_general.xlsx",
            "ruta": EXCEL_PATH,
            "hojas": [],
            "datos_hojas": {},
            "mensaje": "El archivo inventario_general.xlsx no se encuentra en el servidor (backend/data/inventario/).",
        }

    mtime_actual = os.path.getmtime(EXCEL_PATH)

    with _cache_lock:
        if forzar_recarga or _cache_data is None or _cache_mtime != mtime_actual:
            _cache_data = _cargar_excel_desde_disco()
            _cache_mtime = mtime_actual

        return _cache_data