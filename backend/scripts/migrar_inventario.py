# -*- coding: utf-8 -*-
"""
Migración ÚNICA del inventario desde los Excel a la base de datos.

Después de esta migración la app es la única fuente de verdad del inventario:
los Excel no se vuelven a cargar ni a editar. Este script solo LEE los archivos
de backend/data/migracion_inventario/ (nunca los modifica).

Uso:
    cd c:\\gs-viaticos\\backend
    ..\\venv\\Scripts\\python.exe scripts/migrar_inventario.py --dry-run   # no escribe nada
    ..\\venv\\Scripts\\python.exe scripts/migrar_inventario.py             # migra

Archivos (uno por unión temporal):
    *RTC*.xlsx            -> union_temporal = RTC
    *MANTENIMIENTO*.xlsx  -> union_temporal = MANTENIMIENTO

Hojas usadas: INVENTARIO GENERAL (stock), SALIDAS (despachos), PRESTAMOS.
Las hojas por técnico de Mantenimiento son una vista de SALIDAS y se ignoran.

Estado del despacho: sale del COLOR DE FONDO real de la fila en SALIDAS, no del
texto. Un color fuera de la tabla detiene la migración (no se adivina).

Idempotencia (correrlo dos veces no duplica):
  * Ítems: índice único (unión temporal, código de barras, descripción,
    serial GSB, ID. equipo); se inserta con ON CONFLICT DO NOTHING.
  * Despachos: clave `UT|código de barras|serial|fecha de despacho|n`. `n` es
    la ocurrencia de esa combinación dentro del archivo: hay filas distintas
    (mismo sensor sin serial, mismo día, otra orden) que comparten los tres
    primeros valores, y sin `n` se perderían.
  * Préstamos: clave `UT|PRESTAMO|descripción|n`.
Una segunda corrida no modifica filas existentes (tampoco el stock), así no
pisa cambios hechos después desde la app.
"""

import argparse
import glob
import os
import re
import sys
import unicodedata
import warnings
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import openpyxl  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.models.asignacion import Asignacion  # noqa: E402
from app.models.inventario import (  # noqa: E402
    EstadoDespacho,
    InventarioDespacho,
    InventarioItem,
    InventarioPrestamo,
    UnionTemporal,
)
from app.models.usuario import Usuario  # noqa: E402
from app.services.inventario_esquema import asegurar_esquema_inventario  # noqa: E402

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "migracion_inventario")
BATCH = 500

# Tolerancia (días) entre la fecha del despacho/instalación y el rango de la
# asignación para considerarla "cercana".
TOLERANCIA_DIAS_ASIGNACION = 3

# RGB de relleno -> estado, por unión temporal. El blanco (o sin relleno) es
# pendiente_instalacion en ambos archivos.
BLANCO = "FFFFFF"
COLORES_ESTADO = {
    UnionTemporal.RTC: {
        "D9EAD3": EstadoDespacho.instalado,
        "E69138": EstadoDespacho.alerta_seguimiento,
        "FF9900": EstadoDespacho.alerta_seguimiento,
    },
    UnionTemporal.MANTENIMIENTO: {
        "D9EAD3": EstadoDespacho.instalado,
        "E69138": EstadoDespacho.suministro_oficina,
        "FF9900": EstadoDespacho.suministro_oficina,
        "FF0000": EstadoDespacho.alerta_seguimiento,
        "6AA84F": EstadoDespacho.danado,
    },
}

VALORES_VACIOS = {"", "N/A", "NA", "N A", "-"}


class ErrorMigracion(Exception):
    pass


# -----------------------------------------------------------------------------
# Normalización de celdas
# -----------------------------------------------------------------------------
def normalizar(s) -> str:
    """MAYÚSCULAS, sin tildes, sin puntuación, espacios colapsados (para comparar)."""
    s = str(s or "").upper()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def es_error_excel(v) -> bool:
    return isinstance(v, str) and v.strip().upper() in {"#VALUE!", "#REF!", "#N/A", "#DIV/0!", "#NAME?", "#NUM!", "#NULL!"}


def texto(v) -> Optional[str]:
    """Valor de celda como texto limpio (espacios colapsados). Números enteros sin '.0'."""
    if v is None or es_error_excel(v):
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, datetime):
        v = v.date().isoformat()
    s = " ".join(str(v).split())
    return s or None


def identificador(v) -> Optional[str]:
    """Código de barras / serial / factura: 'N/A' y vacíos significan 'no tiene'."""
    s = texto(v)
    if s is None or s.upper() in VALORES_VACIOS:
        return None
    return s.upper()[:60]


RE_FECHA = re.compile(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$")


def fecha(v) -> tuple[Optional[date], Optional[str]]:
    """Devuelve (fecha, valor_original_si_no_se_pudo_leer)."""
    if v is None:
        return None, None
    if isinstance(v, datetime):
        return v.date(), None
    if isinstance(v, date):
        return v, None
    if isinstance(v, (int, float)) and 30000 <= v <= 80000:
        # Fecha guardada como número de serie de Excel sin formato de fecha.
        return date(1899, 12, 30) + timedelta(days=int(v)), None
    s = texto(v)
    if s is None:
        return None, str(v).strip() or None
    m = RE_FECHA.match(s)
    if m:
        d, mth, y = map(int, m.groups())
        if 2000 <= y <= 2100:
            try:
                return date(y, mth, d), None
            except ValueError:
                pass
    return None, s


def entero(v, contexto: str) -> int:
    if isinstance(v, (int, float)) and float(v).is_integer() and v > 0:
        return int(v)
    raise ErrorMigracion(f"{contexto}: CANTIDAD no es un entero positivo ({v!r})")


def encabezado(v) -> Optional[str]:
    return normalizar(v) or None


def color_relleno(celda) -> Optional[str]:
    """RGB (6 hex) del fondo, o None si es blanco / sin relleno."""
    f = celda.fill
    if f is None or f.fill_type in (None, "none"):
        return None
    if f.fill_type != "solid":
        raise ErrorMigracion(f"{celda.coordinate}: patrón de relleno no soportado ({f.fill_type})")
    fg = f.fgColor
    if fg.type != "rgb" or not isinstance(fg.rgb, str):
        raise ErrorMigracion(
            f"{celda.coordinate}: color de relleno no RGB ({fg.type}={getattr(fg, fg.type, None)})"
        )
    rgb = fg.rgb[-6:].upper()
    return None if rgb == BLANCO else rgb


# -----------------------------------------------------------------------------
# Lectura de hojas
# -----------------------------------------------------------------------------
def buscar_hoja(wb, nombre: str):
    for ws in wb.worksheets:
        if normalizar(ws.title) == nombre:
            return ws
    raise ErrorMigracion(f"No se encontró la hoja '{nombre}'")


def filas_hoja(ws, columnas_requeridas: list[str]):
    """Genera (fila_excel, {columna: celda}) de las filas con datos."""
    cab = [encabezado(c.value) for c in ws[1]]
    faltan = [c for c in columnas_requeridas if c not in cab]
    if faltan:
        raise ErrorMigracion(f"Hoja '{ws.title}': faltan columnas {faltan} (encabezados: {cab})")
    indices = {nombre: i for i, nombre in enumerate(cab) if nombre}
    for fila in ws.iter_rows(min_row=2):
        celdas = {nombre: fila[i] for nombre, i in indices.items() if i < len(fila)}
        con_datos = any(
            texto(c.value) is not None
            for nombre, c in celdas.items()
            if nombre != "CONCATENADO"
        )
        if con_datos:
            yield fila[0].row, celdas, [fila[i] for i in indices.values() if i < len(fila)]


@dataclass
class DespachoFila:
    fila: int
    clave_item: tuple
    estado: EstadoDespacho
    cantidad: int
    tecnico_nombre: Optional[str]
    oficina_destino: Optional[str]
    oficina_instalada: Optional[str]
    fecha_despacho: Optional[date]
    fecha_instalacion: Optional[date]
    numero_orden: Optional[str]
    observacion: Optional[str]
    notas: list[str]
    clave_migracion: str
    tecnico_id: Optional[int] = None
    asignacion_id: Optional[int] = None
    motivo_asignacion: Optional[str] = None


@dataclass
class Archivo:
    ruta: str
    ut: UnionTemporal
    items: dict = field(default_factory=dict)  # clave -> dict de columnas
    stock: Counter = field(default_factory=Counter)  # clave -> unidades
    filas_stock: int = 0
    conflictos_item: int = 0
    despachos: list = field(default_factory=list)
    prestamos: list = field(default_factory=list)
    celdas_prestamos_ignoradas: list = field(default_factory=list)


def clave_item(ut: UnionTemporal, cod, desc, serial, id_equipo) -> tuple:
    return (ut.value, cod or "", desc, serial or "", id_equipo or "")


def registrar_item(arch: Archivo, celdas: dict, col_fecha: str) -> tuple:
    desc = texto(celdas["DESCRIPCION"].value)
    if not desc:
        raise ErrorMigracion(f"{arch.ut.value} fila {celdas['DESCRIPCION'].row}: fila con datos pero sin DESCRIPCIÓN")
    desc = desc.upper()[:255]
    cod = identificador(celdas["CODIGO DE BARRAS"].value)
    serial = identificador(celdas["SERIALES GSB"].value)
    id_equipo = identificador(celdas["ID EQUIPO"].value)
    clave = clave_item(arch.ut, cod, desc, serial, id_equipo)

    fecha_compra, _ = fecha(celdas[col_fecha].value)
    atributos = {
        "union_temporal": arch.ut,
        "codigo_barras": cod,
        "descripcion": desc,
        "serial_gsb": serial,
        "id_equipo": id_equipo,
        "fecha_compra": fecha_compra,
        "factura": identificador(celdas["FACTURA"].value),
        "no_sds": identificador(celdas["NO SDS"].value) if "NO SDS" in celdas else None,
    }
    previo = arch.items.get(clave)
    if previo is None:
        arch.items[clave] = atributos
    elif any(previo[k] != atributos[k] for k in ("fecha_compra", "factura", "no_sds")):
        # Misma unidad/elemento con otra factura o fecha: se conserva la primera.
        arch.conflictos_item += 1
    return clave


def leer_archivo(ruta: str, ut: UnionTemporal) -> Archivo:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(ruta, read_only=False, data_only=False)
    arch = Archivo(ruta=ruta, ut=ut)
    base_item = ["CODIGO DE BARRAS", "DESCRIPCION", "CANTIDAD", "ID EQUIPO", "SERIALES GSB", "FACTURA"]

    # INVENTARIO GENERAL -> stock
    ws = buscar_hoja(wb, "INVENTARIO GENERAL")
    for fila, celdas, _ in filas_hoja(ws, base_item + ["FECHA"]):
        clave = registrar_item(arch, celdas, "FECHA")
        arch.stock[clave] += entero(celdas["CANTIDAD"].value, f"{ut.value} INVENTARIO GENERAL fila {fila}")
        arch.filas_stock += 1

    # SALIDAS -> despachos
    ws = buscar_hoja(wb, "SALIDAS")
    requeridas = base_item + [
        "FECHA COMPRA EQUIPO", "OFICINA", "TECNICO", "FECHA DE DESPACHO",
        "OBSERVACION", "NUMERO DE ORDEN", "OFICINA INSTALDA", "FECHA DE INSTALACION",
    ]
    colores = COLORES_ESTADO[ut]
    ocurrencias: Counter = Counter()
    errores_color = []
    for fila, celdas, celdas_con_encabezado in filas_hoja(ws, requeridas):
        clave = registrar_item(arch, celdas, "FECHA COMPRA EQUIPO")

        estados = set()
        for c in celdas_con_encabezado:
            rgb = color_relleno(c)
            if rgb is None:
                continue
            if rgb not in colores:
                errores_color.append(f"fila {fila}: color {rgb} en {c.coordinate}")
                break
            estados.add(colores[rgb])
        if len(estados) > 1:
            errores_color.append(f"fila {fila}: colores de estados distintos {sorted(e.value for e in estados)}")
            continue
        estado = estados.pop() if estados else EstadoDespacho.pendiente_instalacion

        notas = []
        f_desp, raw_desp = fecha(celdas["FECHA DE DESPACHO"].value)
        if raw_desp:
            notas.append(f"FECHA DE DESPACHO original: '{raw_desp}'")
        f_inst, raw_inst = fecha(celdas["FECHA DE INSTALACION"].value)
        if raw_inst:
            notas.append(f"FECHA DE INSTALACION original: '{raw_inst}'")
        if es_error_excel(celdas["NUMERO DE ORDEN"].value):
            notas.append(f"NUMERO DE ORDEN original: '{celdas['NUMERO DE ORDEN'].value}'")

        base_clave = (
            f"{ut.value}|{clave[1]}|{clave[3]}|"
            f"{f_desp.isoformat() if f_desp else 'SIN-FECHA:' + (raw_desp or '')}"
        )
        ocurrencias[base_clave] += 1

        arch.despachos.append(
            DespachoFila(
                fila=fila,
                clave_item=clave,
                estado=estado,
                cantidad=entero(celdas["CANTIDAD"].value, f"{ut.value} SALIDAS fila {fila}"),
                tecnico_nombre=(texto(celdas["TECNICO"].value) or None),
                oficina_destino=(texto(celdas["OFICINA"].value) or "").upper()[:120] or None,
                oficina_instalada=(texto(celdas["OFICINA INSTALDA"].value) or "").upper()[:120] or None,
                fecha_despacho=f_desp,
                fecha_instalacion=f_inst,
                numero_orden=(texto(celdas["NUMERO DE ORDEN"].value) or "").upper()[:60] or None,
                observacion=texto(celdas["OBSERVACION"].value),
                notas=notas,
                clave_migracion=f"{base_clave}|{ocurrencias[base_clave]}"[:255],
            )
        )
    if errores_color:
        raise ErrorMigracion(
            f"{ut.value}: filas de SALIDAS con color no reconocido (no se adivina el estado):\n  "
            + "\n  ".join(errores_color)
        )

    # PRESTAMOS
    ws = buscar_hoja(wb, "PRESTAMOS")
    ocurrencias_p: Counter = Counter()
    for fila, celdas, _ in filas_hoja(ws, ["DESCRIPCION", "CANTIDAD"]):
        desc = texto(celdas["DESCRIPCION"].value)
        cant = celdas["CANTIDAD"].value
        if not desc and cant in (None, ""):
            continue
        if not desc:
            raise ErrorMigracion(f"{ut.value} PRESTAMOS fila {fila}: CANTIDAD sin DESCRIPCIÓN")
        desc = desc.upper()[:255]
        ocurrencias_p[desc] += 1
        arch.prestamos.append({
            "fila": fila,
            "descripcion": desc,
            "cantidad": entero(cant, f"{ut.value} PRESTAMOS fila {fila}"),
            "clave_migracion": f"{ut.value}|PRESTAMO|{desc}|{ocurrencias_p[desc]}"[:255],
        })
    # Celdas con valor fuera de las columnas con encabezado (no se migran:
    # no hay forma de saber qué significan).
    cols_con_encabezado = {c.column for c in ws[1] if encabezado(c.value)}
    for fila in ws.iter_rows(min_row=2):
        for c in fila:
            if c.column not in cols_con_encabezado and texto(c.value) is not None:
                arch.celdas_prestamos_ignoradas.append(f"{c.coordinate}={c.value!r}")
    return arch


# -----------------------------------------------------------------------------
# Vinculación con usuarios y asignaciones
# -----------------------------------------------------------------------------
class Vinculador:
    def __init__(self, db):
        self.tecnicos = [
            (u.id, set(normalizar(u.nombre).split()))
            for u in db.scalars(select(Usuario).where(Usuario.rol == "tecnico")).all()
        ]
        self.asignaciones = defaultdict(list)
        for a in db.scalars(select(Asignacion).where(Asignacion.eliminado_en.is_(None))).all():
            self.asignaciones[a.tecnico_id].append(a)
        self._cache: dict[str, Optional[int]] = {}

    def tecnico(self, nombre: Optional[str]) -> Optional[int]:
        """Coincide si TODAS las palabras del nombre del Excel están en el nombre
        del usuario y el resultado es único. Varios técnicos en una celda
        ('A / B') no se vinculan a ninguno."""
        if not nombre:
            return None
        if nombre not in self._cache:
            tokens = set(normalizar(nombre).split())
            candidatos = []
            if "/" not in nombre and len(tokens) >= 2:
                candidatos = [uid for uid, nombre_u in self.tecnicos if tokens <= nombre_u]
            self._cache[nombre] = candidatos[0] if len(candidatos) == 1 else None
        return self._cache[nombre]

    @staticmethod
    def _orden(v: Optional[str]) -> Optional[str]:
        if not v or not v.strip().isdigit():
            return None
        return str(int(v.strip()))

    @staticmethod
    def _misma_oficina(a: Asignacion, oficinas: list[str]) -> bool:
        municipio = set(normalizar(a.empresa).split())
        if not municipio:
            return False
        return any(municipio <= set(normalizar(o).split()) for o in oficinas if o)

    def asignacion(self, d: DespachoFila) -> tuple[Optional[int], Optional[str]]:
        if d.tecnico_id is None:
            return None, None
        candidatas = self.asignaciones.get(d.tecnico_id, [])
        if not candidatas:
            return None, None

        orden = self._orden(d.numero_orden)
        if orden:
            por_orden = [a for a in candidatas if self._orden(a.orden_trabajo) == orden]
            if len(por_orden) == 1:
                return por_orden[0].id, "orden de trabajo"

        referencia = d.fecha_instalacion or d.fecha_despacho
        if referencia is None:
            return None, None
        tol = timedelta(days=TOLERANCIA_DIAS_ASIGNACION)
        cercanas = [
            a for a in candidatas
            if a.fecha_inicio - tol <= referencia <= a.fecha_fin + tol
            and self._misma_oficina(a, [d.oficina_instalada, d.oficina_destino])
        ]
        if len(cercanas) == 1:
            return cercanas[0].id, "técnico + oficina + fecha"
        return None, None


# -----------------------------------------------------------------------------
# Escritura
# -----------------------------------------------------------------------------
def insertar_en_lotes(db, modelo, filas: list[dict], **conflicto) -> int:
    insertadas = 0
    for i in range(0, len(filas), BATCH):
        stmt = pg_insert(modelo).values(filas[i: i + BATCH]).on_conflict_do_nothing(**conflicto)
        insertadas += db.execute(stmt).rowcount
        db.commit()
    return insertadas


def ids_items(db, ut: UnionTemporal) -> dict[tuple, int]:
    filas = db.execute(
        select(
            InventarioItem.id, InventarioItem.codigo_barras, InventarioItem.descripcion,
            InventarioItem.serial_gsb, InventarioItem.id_equipo,
        ).where(InventarioItem.union_temporal == ut)
    ).all()
    return {clave_item(ut, cod, desc, ser, ide): iid for iid, cod, desc, ser, ide in filas}


def escribir(db, arch: Archivo) -> dict:
    res = {}
    res["items_insertados"] = insertar_en_lotes(db, InventarioItem, [
        {**attrs, "cantidad_stock": arch.stock.get(clave, 0)} for clave, attrs in arch.items.items()
    ])
    mapa = ids_items(db, arch.ut)

    res["despachos_insertados"] = insertar_en_lotes(db, InventarioDespacho, [
        {
            "item_id": mapa[d.clave_item],
            "tecnico_id": d.tecnico_id,
            "asignacion_id": d.asignacion_id,
            "union_temporal": arch.ut,
            "estado": d.estado,
            "cantidad": d.cantidad,
            "oficina_destino": d.oficina_destino,
            "oficina_instalada": d.oficina_instalada,
            "fecha_despacho": d.fecha_despacho,
            "fecha_instalacion": d.fecha_instalacion,
            "numero_orden": d.numero_orden,
            "observacion": d.observacion,
            "tecnico_nombre_origen": (d.tecnico_nombre or "")[:120] or None,
            "nota_migracion": "; ".join(d.notas) or None,
            "clave_migracion": d.clave_migracion,
        }
        for d in arch.despachos
    ], index_elements=["clave_migracion"])

    res["prestamos_insertados"] = insertar_en_lotes(db, InventarioPrestamo, [
        {
            "union_temporal": arch.ut,
            "descripcion": p["descripcion"],
            "cantidad": p["cantidad"],
            "item_id": mapa[p["clave_item"]] if p["clave_item"] else None,
            "clave_migracion": p["clave_migracion"],
        }
        for p in arch.prestamos
    ], index_elements=["clave_migracion"])
    return res


# -----------------------------------------------------------------------------
# Principal
# -----------------------------------------------------------------------------
def localizar_archivos(directorio: str) -> list[tuple[str, UnionTemporal]]:
    archivos = []
    for ut, patron in ((UnionTemporal.RTC, "*RTC*.xlsx"), (UnionTemporal.MANTENIMIENTO, "*MANTENIMIENTO*.xlsx")):
        encontrados = [f for f in glob.glob(os.path.join(directorio, patron)) if not os.path.basename(f).startswith("~$")]
        if len(encontrados) != 1:
            raise ErrorMigracion(f"Se esperaba exactamente un archivo {patron} en {directorio}; hay {encontrados}")
        archivos.append((encontrados[0], ut))
    return archivos


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Lee y valida todo sin escribir en la base.")
    parser.add_argument("--dir", default=DATA_DIR, help="Carpeta con los dos Excel.")
    args = parser.parse_args()
    directorio = os.path.abspath(args.dir)

    print(f"{'SIMULACIÓN (--dry-run): no se escribe nada' if args.dry_run else 'MIGRACIÓN REAL'}")
    print(f"Carpeta: {directorio}\n")

    archivos = [leer_archivo(ruta, ut) for ruta, ut in localizar_archivos(directorio)]

    if not args.dry_run:
        renombradas = asegurar_esquema_inventario(engine)
        if renombradas:
            print(f"Tablas del inventario anterior renombradas a inventario_legacy_*: {renombradas}\n")

    db = SessionLocal()
    try:
        vinc = Vinculador(db)
        total_sin_tecnico = total_sin_asignacion = 0
        for arch in archivos:
            ut = arch.ut.value
            descripciones = Counter(attrs["descripcion"] for attrs in arch.items.values())
            claves_por_desc = {attrs["descripcion"]: clave for clave, attrs in arch.items.items()}
            for p in arch.prestamos:
                # Solo se enlaza si la descripción identifica un único ítem.
                p["clave_item"] = claves_por_desc[p["descripcion"]] if descripciones[p["descripcion"]] == 1 else None
            for d in arch.despachos:
                d.tecnico_id = vinc.tecnico(d.tecnico_nombre)
                d.asignacion_id, d.motivo_asignacion = vinc.asignacion(d)

            por_estado = Counter(d.estado.value for d in arch.despachos)
            sin_tecnico = [d for d in arch.despachos if d.tecnico_id is None]
            sin_asignacion = [d for d in arch.despachos if d.asignacion_id is None]
            total_sin_tecnico += len(sin_tecnico)
            total_sin_asignacion += len(sin_asignacion)

            print("=" * 78)
            print(f"{ut}  —  {os.path.basename(arch.ruta)}")
            print("=" * 78)
            print(f"INVENTARIO GENERAL: {arch.filas_stock} filas -> stock {sum(arch.stock.values())} unidades")
            print(f"Ítems distintos (stock + despachados): {len(arch.items)}"
                  f"  | con stock > 0: {sum(1 for v in arch.stock.values() if v > 0)}")
            if arch.conflictos_item:
                print(f"  Aviso: {arch.conflictos_item} fila(s) repiten un ítem con otra factura/fecha/No SDS; se conservó la primera.")
            print(f"SALIDAS: {len(arch.despachos)} filas -> {len(arch.despachos)} despachos")
            for e in EstadoDespacho:
                print(f"    {e.value:<24} {por_estado.get(e.value, 0):>5}")
            print(f"  Sin técnico vinculado:   {len(sin_tecnico)}")
            for nombre, n in Counter(d.tecnico_nombre or '(vacío)' for d in sin_tecnico).most_common():
                print(f"      {nombre!r}: {n}")
            print(f"  Con asignación vinculada: {len(arch.despachos) - len(sin_asignacion)}"
                  f"  {dict(Counter(d.motivo_asignacion for d in arch.despachos if d.asignacion_id))}")
            print(f"  Sin asignación vinculada: {len(sin_asignacion)}")
            con_notas = [d for d in arch.despachos if d.notas]
            print(f"  Con fechas no legibles (valor original guardado en nota_migracion): {len(con_notas)}")
            for d in con_notas[:12]:
                print(f"      fila {d.fila}: {'; '.join(d.notas)}")
            if len(con_notas) > 12:
                print(f"      … y {len(con_notas) - 12} más")
            print(f"PRESTAMOS: {len(arch.prestamos)} filas"
                  f" ({sum(1 for p in arch.prestamos if p['clave_item'])} enlazadas a un ítem)")
            if arch.celdas_prestamos_ignoradas:
                print(f"  Celdas sin encabezado NO migradas: {', '.join(arch.celdas_prestamos_ignoradas)}")

            if not args.dry_run:
                res = escribir(db, arch)
                print(f"Insertados ahora: ítems {res['items_insertados']}, despachos {res['despachos_insertados']}, "
                      f"préstamos {res['prestamos_insertados']} (el resto ya existía)")
            print()

        print("=" * 78)
        print("RESUMEN")
        print("=" * 78)
        print(f"Ítems:      {sum(len(a.items) for a in archivos)}")
        print(f"Despachos:  {sum(len(a.despachos) for a in archivos)}")
        por_estado = Counter(d.estado.value for a in archivos for d in a.despachos)
        for e in EstadoDespacho:
            print(f"    {e.value:<24} {por_estado.get(e.value, 0):>5}")
        print(f"Préstamos:  {sum(len(a.prestamos) for a in archivos)}")
        print(f"Despachos sin técnico vinculado:    {total_sin_tecnico}")
        print(f"Despachos sin asignación vinculada: {total_sin_asignacion}")

        if not args.dry_run:
            print("\nVerificación contra la base (despachos migrados por archivo):")
            ok = True
            for arch in archivos:
                en_bd = db.scalar(
                    select(func.count()).select_from(InventarioDespacho).where(
                        InventarioDespacho.union_temporal == arch.ut,
                        InventarioDespacho.clave_migracion.is_not(None),
                    )
                )
                prest_bd = db.scalar(
                    select(func.count()).select_from(InventarioPrestamo).where(
                        InventarioPrestamo.union_temporal == arch.ut,
                        InventarioPrestamo.clave_migracion.is_not(None),
                    )
                )
                coincide = en_bd == len(arch.despachos) and prest_bd == len(arch.prestamos)
                ok &= coincide
                print(f"  {arch.ut.value:<14} SALIDAS {len(arch.despachos):>5} = BD {en_bd:>5} | "
                      f"PRESTAMOS {len(arch.prestamos):>3} = BD {prest_bd:>3}  {'OK' if coincide else 'NO COINCIDE'}")
            if not ok:
                sys.exit(2)
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except ErrorMigracion as e:
        print(f"\nERROR: {e}")
        print("No se escribió nada. Corrija el origen del problema y vuelva a ejecutar.")
        sys.exit(1)
