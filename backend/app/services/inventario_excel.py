"""Servicio para lectura, parseo, búsqueda y caché en memoria de archivos Excel de Inventario.

Los archivos se encuentran en:
- backend/data/migracion_inventario/ (prioridad)
- backend/data/inventario/ (alternativa)

Soporta múltiples archivos y selección automática según la planilla activa.
"""

import os
import re
import threading
import unicodedata
import warnings
from typing import Any, Dict, List, Optional, Tuple
import openpyxl

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

# Carpetas de búsqueda en orden de prioridad
DIRECTORIOS_DATOS = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "migracion_inventario")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "inventario")),
]

_cache_lock = threading.Lock()
# Dict[ruta_absoluta, {"mtime": float, "data": Dict}]
_cache_archivos: Dict[str, Dict[str, Any]] = {}


def _normalizar_texto(texto: str) -> str:
    """Normaliza texto eliminando tildes, signos y pasando a minúsculas."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", texto)
    sin_tildes = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", sin_tildes.lower())


def listar_archivos_excel_disponibles() -> List[Dict[str, str]]:
    """Lista todos los archivos .xlsx disponibles en las carpetas de datos."""
    archivos: List[Dict[str, str]] = []
    vistos = set()
    for carpeta in DIRECTORIOS_DATOS:
        if not os.path.exists(carpeta) or not os.path.isdir(carpeta):
            continue
        for nombre in sorted(os.listdir(carpeta)):
            if nombre.lower().endswith(".xlsx") and not nombre.startswith("~$"):
                ruta_completa = os.path.join(carpeta, nombre)
                if os.path.isfile(ruta_completa) and nombre not in vistos:
                    vistos.add(nombre)
                    archivos.append({
                        "nombre": nombre,
                        "ruta": ruta_completa,
                        "carpeta": os.path.basename(carpeta),
                    })
    return archivos


def resolver_ruta_excel(
    planilla_id: Optional[int] = None,
    planilla_nombre: Optional[str] = None,
    archivo: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Resuelve la ruta absoluta del archivo Excel según el archivo o la planilla indicada.

    Returns:
        (ruta_absoluta, nombre_archivo) o (None, None) si no se encuentra.
    """
    archivos_disponibles = listar_archivos_excel_disponibles()
    if not archivos_disponibles:
        return None, None

    # 1. Si se pidió un archivo explícito
    if archivo and archivo.strip():
        archivo_limpio = os.path.basename(archivo.strip())
        for a in archivos_disponibles:
            if a["nombre"].lower() == archivo_limpio.lower():
                return a["ruta"], a["nombre"]

    # 2. Si se proporcionó el nombre de la planilla
    nombre_pl = (planilla_nombre or "").strip()
    norm_pl = _normalizar_texto(nombre_pl)

    if norm_pl:
        # Reglas prioritarias conocidas para las 5 planillas del SGC
        if "mantenimiento" in norm_pl:
            for a in archivos_disponibles:
                if "mantenimiento" in _normalizar_texto(a["nombre"]):
                    return a["ruta"], a["nombre"]

        if "americanglobal" in norm_pl or ("rtc" in norm_pl and "american" in norm_pl):
            for a in archivos_disponibles:
                if "americanglobal" in _normalizar_texto(a["nombre"]):
                    return a["ruta"], a["nombre"]

        if "zeus" in norm_pl:
            for a in archivos_disponibles:
                if "zeus" in _normalizar_texto(a["nombre"]):
                    return a["ruta"], a["nombre"]

        if "comware" in norm_pl:
            for a in archivos_disponibles:
                if "comware" in _normalizar_texto(a["nombre"]):
                    return a["ruta"], a["nombre"]

        if "general" in norm_pl or "globalsecurity" in norm_pl:
            for a in archivos_disponibles:
                if "general" in _normalizar_texto(a["nombre"]):
                    return a["ruta"], a["nombre"]

        # Búsqueda difusa por palabras coincidentes
        palabras = [p for p in re.split(r"\W+", nombre_pl.lower()) if len(p) >= 3]
        for a in archivos_disponibles:
            norm_a = a["nombre"].lower()
            if any(p in norm_a for p in palabras):
                return a["ruta"], a["nombre"]

    # 3. Fallback: primer archivo disponible
    primer = archivos_disponibles[0]
    return primer["ruta"], primer["nombre"]


def _convertir_valor(val: Any) -> Any:
    """Convierte celdas de Excel a cadenas seguras para serializar en JSON."""
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        try:
            return val.isoformat()
        except Exception:
            return str(val)
    if isinstance(val, float):
        if val.is_integer():
            return str(int(val))
        return f"{val:.2f}".rstrip("0").rstrip(".")
    if isinstance(val, int):
        return str(val)
    return str(val).strip()


def _cargar_excel_desde_disco(ruta_archivo: str, nombre_archivo: str) -> Dict[str, Any]:
    """Carga todas las hojas del archivo Excel con sus columnas limpias y filas."""
    wb = openpyxl.load_workbook(ruta_archivo, data_only=True, read_only=True)
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

            # Primera fila no vacía como encabezados
            if not encabezados:
                encabezados_raw = [
                    str(c).replace("\n", " ").replace("\r", " ").strip()
                    if c is not None and str(c).strip()
                    else f"Col_{i+1}"
                    for i, c in enumerate(row)
                ]
                # Asegurar columnas únicas
                nombres_vistos: Dict[str, int] = {}
                cols_unicas: List[str] = []
                for col in encabezados_raw:
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
        "archivo": nombre_archivo,
        "ruta": ruta_archivo,
        "hojas": hojas,
        "datos_hojas": datos_hojas,
    }


def _obtener_datos_archivo_cacheados(ruta: str, nombre: str, forzar_recarga: bool = False) -> Dict[str, Any]:
    global _cache_archivos
    mtime_actual = os.path.getmtime(ruta)

    with _cache_lock:
        cached = _cache_archivos.get(ruta)
        if forzar_recarga or not cached or cached.get("mtime") != mtime_actual:
            data = _cargar_excel_desde_disco(ruta, nombre)
            _cache_archivos[ruta] = {"mtime": mtime_actual, "data": data}
            return data
        return cached["data"]


def obtener_datos_inventario_excel(
    planilla_id: Optional[int] = None,
    planilla_nombre: Optional[str] = None,
    archivo: Optional[str] = None,
    hoja: Optional[str] = None,
    limit: int = 1500,
    offset: int = 0,
    forzar_recarga: bool = False,
) -> Dict[str, Any]:
    """Retorna los datos del Excel correspondiente a la planilla o archivo indicado."""
    ruta, nombre_archivo = resolver_ruta_excel(
        planilla_id=planilla_id,
        planilla_nombre=planilla_nombre,
        archivo=archivo,
    )

    if not ruta or not os.path.exists(ruta):
        ref_nombre = archivo or planilla_nombre or (f"Planilla {planilla_id}" if planilla_id else "inventario")
        return {
            "existe": False,
            "archivo": ref_nombre if ref_nombre.endswith(".xlsx") else f"{ref_nombre}.xlsx",
            "ruta": "",
            "hojas": [],
            "hoja_activa": None,
            "columnas": [],
            "total_filas": 0,
            "filas": [],
            "mensaje": f"No se encontró un archivo Excel para '{ref_nombre}' en backend/data/migracion_inventario/.",
        }

    datos_completos = _obtener_datos_archivo_cacheados(ruta, nombre_archivo, forzar_recarga=forzar_recarga)

    hojas = datos_completos.get("hojas", [])
    datos_hojas = datos_completos.get("datos_hojas", {})

    # Determinar la hoja activa
    hoja_activa = None
    if hoja and hoja in hojas:
        hoja_activa = hoja
    elif "INVENTARIO GENERAL" in hojas and datos_hojas.get("INVENTARIO GENERAL", {}).get("total_filas", 0) > 0:
        hoja_activa = "INVENTARIO GENERAL"
    else:
        # Primera hoja que tenga filas
        for h in hojas:
            if datos_hojas.get(h, {}).get("total_filas", 0) > 0:
                hoja_activa = h
                break
        if not hoja_activa and hojas:
            hoja_activa = hojas[0]

    hoja_info = datos_hojas.get(hoja_activa, {}) if hoja_activa else {}
    columnas = hoja_info.get("columnas", [])
    todas_las_filas = hoja_info.get("filas", [])
    total_filas = len(todas_las_filas)

    # Paginación
    inicio = max(0, offset)
    fin = inicio + limit
    filas_paginadas = todas_las_filas[inicio:fin]

    return {
        "existe": True,
        "archivo": nombre_archivo,
        "hojas": hojas,
        "hoja_activa": hoja_activa,
        "columnas": columnas,
        "total_filas": total_filas,
        "filas": filas_paginadas,
        "mensaje": None,
    }


def buscar_en_excel(
    hoja: Optional[str] = None,
    serial: Optional[str] = None,
    oficina: Optional[str] = None,
    tecnico: Optional[str] = None,
    fecha: Optional[str] = None,
    planilla_id: Optional[int] = None,
    planilla_nombre: Optional[str] = None,
    archivo: Optional[str] = None,
) -> Dict[str, Any]:
    """Busca registros en el archivo Excel según criterios progresivos."""
    ruta, nombre_archivo = resolver_ruta_excel(
        planilla_id=planilla_id,
        planilla_nombre=planilla_nombre,
        archivo=archivo,
    )

    criterios = {
        "serial": (serial or "").strip(),
        "oficina": (oficina or "").strip(),
        "tecnico": (tecnico or "").strip(),
        "fecha": (fecha or "").strip(),
    }

    if not ruta or not os.path.exists(ruta):
        return {
            "total_encontrados": 0,
            "hoja": hoja or "",
            "criterios": criterios,
            "resultados": [],
        }

    datos_completos = _obtener_datos_archivo_cacheados(ruta, nombre_archivo)
    datos_hojas = datos_completos.get("datos_hojas", {})
    hojas = datos_completos.get("hojas", [])

    hojas_a_buscar = [hoja] if (hoja and hoja in datos_hojas) else hojas

    resultados: List[Dict[str, Any]] = []

    def coincide_criterio(fila: Dict[str, Any], valor_buscado: str, posibles_cols: List[str]) -> bool:
        if not valor_buscado:
            return True
        v_low = valor_buscado.lower()

        # 1. Probar en columnas sugeridas
        for col_name, val in fila.items():
            c_low = col_name.lower()
            if any(p in c_low for p in posibles_cols):
                if v_low in str(val or "").lower():
                    return True

        # 2. Si no encontró en columnas específicas, buscar en toda la fila
        return any(v_low in str(val or "").lower() for val in fila.values())

    for h_name in hojas_a_buscar:
        info = datos_hojas.get(h_name, {})
        for fila in info.get("filas", []):
            if not coincide_criterio(fila, criterios["serial"], ["serial", "codigo", "código", "id", "sds"]):
                continue
            if not coincide_criterio(fila, criterios["oficina"], ["oficina", "sede", "destino", "cliente"]):
                continue
            if not coincide_criterio(fila, criterios["tecnico"], ["tecnico", "técnico", "responsable", "nombre"]):
                continue
            if not coincide_criterio(fila, criterios["fecha"], ["fecha"]):
                continue

            fila_con_hoja = dict(fila)
            fila_con_hoja["_hoja_origen"] = h_name
            resultados.append(fila_con_hoja)
            if len(resultados) >= 500:
                break
        if len(resultados) >= 500:
            break

    return {
        "total_encontrados": len(resultados),
        "hoja": hoja or (hojas[0] if hojas else ""),
        "criterios": criterios,
        "resultados": resultados,
    }