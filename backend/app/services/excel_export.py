import io
import json
import os
from copy import copy
from datetime import date
from decimal import Decimal
from typing import List, Optional

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.models.asignacion import Asignacion
from app.models.usuario import Usuario
from app.models.viatico import Viatico

TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__),
    "templates",
    "FORMATO LEGALIZACION VIATICOS.xlsx",
)

MESES_ES = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
]

MESES_ABR = [
    "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
]

def dividir_nombres_apellidos(nombre_completo: str) -> tuple[str, str]:
    if not nombre_completo:
        return ("—", "—")
    partes = [p for p in nombre_completo.strip().split() if p]
    if len(partes) == 0:
        return ("—", "—")
    if len(partes) == 1:
        return (partes[0], "—")
    if len(partes) == 2:
        return (partes[0], partes[1])
    if len(partes) == 3:
        return (" ".join(partes[:2]), partes[2])
    mitad = len(partes) // 2
    return (" ".join(partes[:mitad]), " ".join(partes[mitad:]))

def _formato_fecha_anticipo(f: Optional[date]) -> str:
    if not f:
        return "—"
    if isinstance(f, date):
        return f"{MESES_ES[f.month]} {f.day} {f.year}"
    return str(f)

def _formato_fecha_viaje(f: Optional[date]) -> str:
    if not f:
        return "—"
    if isinstance(f, date):
        return f"{f.day:02d}-{MESES_ABR[f.month]}"
    return str(f)

# ═══════════════════════════════════════════════════════════════════
#  Paleta de colores — fiel a la foto de referencia
# ═══════════════════════════════════════════════════════════════════
C_NAVY      = "0A3A60"    # Azul corporativo oscuro (cabeceras tabla)
C_NAVY_TEXT = "FFFFFF"    # Texto sobre azul
C_HEADER_BG = "D9E1F2"   # Azul muy claro — fondo bloques info empleado
C_ROW_ALT   = "E9F0FB"   # Azul claro alternado filas de datos
C_GOLD_BG   = "FFC000"   # Dorado fuerte — subtotal
C_GOLD_LIGHT= "FFE699"   # Dorado claro — anticipo
C_LABEL_BG  = "F2F2F2"   # Gris muy claro para etiquetas de celda
C_BORDER    = "8EAADB"   # Borde azulado
C_DARK_TEXT = "0F172A"
C_GREEN     = "166534"
C_SALDO_BG  = "D6E4BC"   # Verde claro para saldo

def _thin(color=C_BORDER):
    return Side(style="thin", color=color)

def _border(color=C_BORDER):
    s = _thin(color)
    return Border(left=s, right=s, top=s, bottom=s)

def _border_all_dark():
    s = _thin("000000")
    return Border(left=s, right=s, top=s, bottom=s)

def _fill(hex_color):
    return PatternFill(start_color=hex_color, end_color=hex_color, fill_type="solid")

def _font(bold=False, color=C_DARK_TEXT, size=10, italic=False):
    return Font(name="Calibri", size=size, bold=bold, color=color, italic=italic)

def _al(h="left", v="center", wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

def _set_row_height(ws, row, height):
    ws.row_dimensions[row].height = height

def _label_cell(ws, row, col, text):
    """Celda de etiqueta (fondo gris, negrita)."""
    c = ws.cell(row=row, column=col, value=text)
    c.font = _font(bold=True, size=9)
    c.fill = _fill(C_LABEL_BG)
    c.border = _border("BFBFBF")
    c.alignment = _al("left", "center")

def _value_cell(ws, row, col, value):
    """Celda de valor."""
    c = ws.cell(row=row, column=col, value=value)
    c.font = _font(size=10)
    c.border = _border("BFBFBF")
    c.alignment = _al("left", "center")
    return c

def _header_brand(ws, row_title, row_code, company_cols, meta_col_start, total_cols):
    """
    Fila de marca: compañía centrada, metadatos a la derecha.
    row_title  : fila donde va el nombre de la empresa
    row_code   : primera fila de los metadatos (Código, Versión, etc.)
    company_cols: (inicio, fin) rango de merge para nombre empresa
    meta_col_start: columna inicio metadatos
    total_cols  : total de columnas de la hoja
    """
    c1, c2 = company_cols

    # ── Fila 1: Nombre empresa ──────────────────────────────────────
    ws.merge_cells(start_row=row_title, start_column=2, end_row=row_title, end_column=c2 - 1)
    cell_company = ws.cell(row=row_title, column=2, value="GLOBAL SECURITY BANK SAS")
    cell_company.font = _font(bold=True, size=13, color=C_NAVY)
    cell_company.alignment = _al("center", "center")
    cell_company.fill = _fill("FFFFFF")

    # ── Metadatos derecha ──────────────────────────────────────────
    meta = [
        ("Código",    "OP-FR-02"),
        ("Versión",   "3"),
        ("Fecha Act", date.today().strftime("%b-%y")),
        ("Página",    "1 de 1"),
    ]
    for i, (lbl, val) in enumerate(meta):
        r = row_code + i
        ws.cell(row=r, column=meta_col_start, value=lbl).font = _font(bold=True, size=9, color=C_DARK_TEXT)
        ws.cell(row=r, column=meta_col_start).fill = _fill(C_LABEL_BG)
        ws.cell(row=r, column=meta_col_start).border = _border("BFBFBF")
        ws.cell(row=r, column=meta_col_start).alignment = _al("center")
        v_cell = ws.cell(row=r, column=meta_col_start + 1, value=val)
        v_cell.font = _font(size=9)
        v_cell.border = _border("BFBFBF")
        v_cell.alignment = _al("center")

def _table_header_row(ws, row, headers, col_start=1):
    for ci, text in enumerate(headers, start=col_start):
        c = ws.cell(row=row, column=ci, value=text)
        c.font = _font(bold=True, color=C_NAVY_TEXT, size=10)
        c.fill = _fill(C_NAVY)
        c.alignment = _al("center", "center", wrap=True)
        c.border = _border_all_dark()
        _set_row_height(ws, row, 30)

def _data_row(ws, row, values, alt=False, col_start=1):
    bg = C_ROW_ALT if alt else "FFFFFF"
    for ci, val in enumerate(values, start=col_start):
        c = ws.cell(row=row, column=ci, value=val)
        c.font = _font(size=9)
        c.fill = _fill(bg)
        c.border = _border()
        c.alignment = _al("left", "center")
    return row

def _currency_cell(ws, row, col, value, bg=None, bold=False, color=C_DARK_TEXT):
    c = ws.cell(row=row, column=col, value=float(value))
    c.font = _font(bold=bold, color=color)
    c.alignment = _al("right", "center")
    c.number_format = '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)'
    if bg:
        c.fill = _fill(bg)
    c.border = _border_all_dark()
    return c

def _autofit(ws, extra=4, minimum=10, maximum=40):
    for col in ws.columns:
        max_len = 0
        for cell in col:
            try:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            except Exception:
                pass
        letter = get_column_letter(col[0].column)
        ws.column_dimensions[letter].width = min(max(max_len + extra, minimum), maximum)


# ═══════════════════════════════════════════════════════════════════
#  EXCEL INDEPENDIENTES
# ═══════════════════════════════════════════════════════════════════
def generar_excel_viaticos_independientes(
    usuario: Usuario,
    viaticos: List[Viatico],
    fecha_inicio=None,
    fecha_fin=None,
) -> io.BytesIO:
    """
    Genera un archivo Excel (.xlsx) con los viáticos independientes
    siguiendo el formato corporativo GSB (basado en OP-FR-02).
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Viáticos Independientes"

    TOTAL_COLS = 10   # A..J
    META_COL   = 9    # cols J, K  (índice 9, 10)

    # ── Columnas de ancho fijo ──────────────────────────────────
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 13
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 24
    ws.column_dimensions["E"].width = 18
    ws.column_dimensions["F"].width = 14
    ws.column_dimensions["G"].width = 12
    ws.column_dimensions["H"].width = 12
    ws.column_dimensions["I"].width = 18
    ws.column_dimensions["J"].width = 14

    # ══ FILA 1: Logo  |  Empresa  |  Metadatos ══════════════════
    ws.row_dimensions[1].height = 34
    ws.row_dimensions[2].height = 16
    ws.row_dimensions[3].height = 16
    ws.row_dimensions[4].height = 16

    # Celda A1 — "logo" textual
    ws.merge_cells("A1:A4")
    logo = ws["A1"]
    logo.value = "🛡 GSB"
    logo.font = _font(bold=True, size=14, color=C_NAVY)
    logo.alignment = _al("center", "center")
    logo.fill = _fill("E9F0FB")
    logo.border = _border(C_NAVY)

    # Nombre empresa (cols B-H, fila 1)
    ws.merge_cells("B1:H4")
    empresa_cell = ws["B1"]
    empresa_cell.value = "GLOBAL SECURITY BANK SAS"
    empresa_cell.font = _font(bold=True, size=14, color=C_NAVY)
    empresa_cell.alignment = _al("center", "center")
    empresa_cell.fill = _fill("FFFFFF")
    empresa_cell.border = _border(C_NAVY)

    # Metadatos derecha I-J
    meta_rows = [
        ("Código",    "OP-FR-02"),
        ("Versión",   "3"),
        ("Fecha Act", date.today().strftime("%b-%y")),
        ("Página",    "1 de 1"),
    ]
    for i, (lbl, val) in enumerate(meta_rows):
        r = i + 1
        cl = ws.cell(row=r, column=9, value=lbl)
        cl.font = _font(bold=True, size=9)
        cl.fill = _fill(C_LABEL_BG)
        cl.border = _border("BFBFBF")
        cl.alignment = _al("center", "center")

        cv = ws.cell(row=r, column=10, value=val)
        cv.font = _font(size=9)
        cv.border = _border("BFBFBF")
        cv.alignment = _al("center", "center")

    # ══ BLOQUE INFO EMPLEADO (filas 6-8) ═════════════════════════
    # Fila 5: separador
    ws.row_dimensions[5].height = 6

    # Fila 6
    ws.row_dimensions[6].height = 22
    _label_cell(ws, 6, 1, "Nombres :")
    ws.merge_cells("B6:D6")
    _value_cell(ws, 6, 2, usuario.nombre or "—")
    _label_cell(ws, 6, 5, "Apellidos:")
    ws.merge_cells("F6:J6")
    _value_cell(ws, 6, 6, "—")

    # Fila 7
    ws.row_dimensions[7].height = 22
    _label_cell(ws, 7, 1, "Cédula :")
    ws.merge_cells("B7:C7")
    _value_cell(ws, 7, 2, usuario.codigo_empleado or "—")
    _label_cell(ws, 7, 4, "Período :")
    str_ini = fecha_inicio.strftime("%d/%m/%Y") if fecha_inicio else "Inicio"
    str_fin = fecha_fin.strftime("%d/%m/%Y") if fecha_fin else "Hoy"
    ws.merge_cells("E7:G7")
    _value_cell(ws, 7, 5, f"{str_ini}  →  {str_fin}")
    _label_cell(ws, 7, 8, "Fecha planilla :")
    ws.merge_cells("I7:J7")
    _value_cell(ws, 7, 9, date.today().strftime("%d/%m/%Y"))

    # Fila 8: Total ítems (se llenará abajo)
    ws.row_dimensions[8].height = 22
    _label_cell(ws, 8, 1, "Total ítems :")
    _value_cell(ws, 8, 2, len(viaticos))
    _label_cell(ws, 8, 4, "Correo :")
    ws.merge_cells("E8:G8")
    _value_cell(ws, 8, 5, usuario.correo or "—")

    # ══ TABLA DE DATOS (fila 10 en adelante) ═════════════════════
    ws.row_dimensions[9].height = 6   # separador

    HEADERS = [
        "No. ítem",
        "Fecha de Viaje",
        "NIT / Identificación",
        "Razón Social",
        "Concepto",
        "Origen",
        "Destino",
        "Tiene soporte\n(si o no)",
        "Estado",
        "Valor",
    ]
    HEADER_ROW = 10
    _table_header_row(ws, HEADER_ROW, HEADERS, col_start=1)

    row_idx = HEADER_ROW + 1
    total_valor = Decimal("0.00")

    for i, v in enumerate(viaticos, start=1):
        # Parsear descripcion para extraer origen/destino
        try:
            meta = json.loads(v.descripcion or "{}")
        except Exception:
            meta = {}

        origen  = meta.get("origen", "—") or "—"
        destino = meta.get("destino", v.ciudad or "—") or "—"
        tiene_soporte = "SI" if (getattr(v, "evidencias", None) and len(v.evidencias) > 0) else "no"
        val = Decimal(str(v.valor or 0))
        total_valor += val
        alt = (i % 2 == 0)

        bg = C_ROW_ALT if alt else "FFFFFF"
        row_data = [
            i,
            v.fecha.strftime("%d-%b") if isinstance(v.fecha, date) else str(v.fecha),
            v.nit_identificacion or "—",
            v.cliente or "—",
            (v.tipo_gasto or "—").capitalize(),
            origen,
            destino,
            tiene_soporte,
            (v.estado or "—").capitalize(),
        ]

        ws.row_dimensions[row_idx].height = 18
        for ci, cell_val in enumerate(row_data, start=1):
            c = ws.cell(row=row_idx, column=ci, value=cell_val)
            c.font = _font(size=9)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _al("center" if ci in (1, 2, 8, 9) else "left", "center")

        # Columna J: valor
        _currency_cell(ws, row_idx, 10, val, bg=bg)
        row_idx += 1

    # ══ FILAS DE TOTALES ═════════════════════════════════════════
    ws.row_dimensions[row_idx].height = 20
    # Subtotal label (cols H-I merged)
    ws.merge_cells(start_row=row_idx, start_column=8, end_row=row_idx, end_column=9)
    sub_lbl = ws.cell(row=row_idx, column=8, value="Subtotal")
    sub_lbl.font = _font(bold=True, size=10, color="000000")
    sub_lbl.fill = _fill(C_GOLD_BG)
    sub_lbl.alignment = _al("right", "center")
    sub_lbl.border = _border_all_dark()

    _currency_cell(ws, row_idx, 10, total_valor, bg=C_GOLD_BG, bold=True)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


# ═══════════════════════════════════════════════════════════════════
#  EXCEL ASIGNACIÓN
# ═══════════════════════════════════════════════════════════════════
def generar_excel_viaticos_asignacion(
    asignacion: Asignacion,
    viaticos: List[Viatico],
) -> io.BytesIO:
    """
    Genera un archivo Excel (.xlsx) con los viáticos asociados a una Asignación
    utilizando como plantilla base el archivo oficial FORMATO LEGALIZACION VIATICOS.xlsx.
    """
    wb = openpyxl.load_workbook(TEMPLATE_PATH)
    ws = wb.active

    tecnico = asignacion.tecnico
    nombre_tecnico = tecnico.nombre if tecnico else "—"
    cedula_tecnico = tecnico.codigo_empleado if tecnico else "—"
    nombres, apellidos = dividir_nombres_apellidos(nombre_tecnico)
    anticipo_num = float(asignacion.monto_anticipo or 0)

    # ── Encabezados / Bloque Info ────────────────────────────────
    ws["D6"] = nombres
    ws["G6"] = apellidos
    ws["C7"] = cedula_tecnico

    aprobados_count = len([v for v in viaticos if str(v.estado).lower() == "aprobado"])
    ws["F7"] = aprobados_count
    ws["J7"] = date.today().strftime("%d/%m/%y")

    if asignacion.fecha_inicio:
        ws["C8"] = _formato_fecha_anticipo(asignacion.fecha_inicio)
    else:
        ws["C8"] = "—"

    ws["G8"] = "SI____ NO____"
    ws["I8"] = "SI____ NO____"
    ws["K8"] = anticipo_num

    # ── Tabla de ítems ──────────────────────────────────────────
    total_items = len(viaticos)
    base_slots = 14  # filas 11 a 24 en la plantilla original

    if total_items > base_slots:
        extra = total_items - base_slots
        ws.insert_rows(25, amount=extra)
        for r in range(25, 25 + extra):
            for c in range(1, 13):
                src = ws.cell(row=24, column=c)
                dst = ws.cell(row=r, column=c)
                if src.has_style:
                    dst.font = copy(src.font)
                    dst.border = copy(src.border)
                    dst.fill = copy(src.fill)
                    dst.number_format = copy(src.number_format)
                    dst.alignment = copy(src.alignment)
        last_item_row = 24 + extra
    else:
        last_item_row = 24

    for idx, v in enumerate(viaticos):
        r = 11 + idx
        try:
            meta = json.loads(v.descripcion or "{}")
        except Exception:
            meta = {}

        nit = v.nit_identificacion or meta.get("nit") or "—"
        razon = meta.get("razon_social") or v.cliente or asignacion.cliente or "—"
        concepto = (v.tipo_gasto or "—").capitalize()
        oficina = asignacion.empresa or asignacion.ciudad or "—"
        origen = meta.get("origen") or "—"
        destino = meta.get("destino") or v.ciudad or asignacion.ciudad or "—"
        tiene_soporte = (
            "SI"
            if (
                meta.get("tiene_soporte") is True
                or (getattr(v, "evidencias", None) and len(v.evidencias) > 0)
            )
            else "NO"
        )
        val = float(v.valor or 0)

        ws.cell(row=r, column=2, value=idx + 1)
        ws.cell(row=r, column=3, value=_formato_fecha_viaje(v.fecha))
        ws.cell(row=r, column=4, value=nit)
        ws.cell(row=r, column=5, value=razon)
        ws.cell(row=r, column=6, value=concepto)
        ws.cell(row=r, column=7, value=oficina)
        ws.cell(row=r, column=8, value=origen)
        ws.cell(row=r, column=9, value=destino)
        ws.cell(row=r, column=10, value=tiene_soporte)
        ws.cell(row=r, column=11, value=val)

    # ── Totales y Fórmulas ──────────────────────────────────────
    subtotal_row = last_item_row + 1
    ant_row = subtotal_row + 1
    gsb_row = ant_row + 1
    tec_row = gsb_row + 1
    tot_row = tec_row + 1

    ws.cell(row=subtotal_row, column=10, value="Subtotal")
    ws.cell(row=subtotal_row, column=11, value=f"=SUM(K11:K{last_item_row})")

    ws.cell(row=ant_row, column=10, value="valor del anticipo")
    ws.cell(row=ant_row, column=11, value="=K8")

    ws.cell(row=gsb_row, column=10, value="saldo a favor GSB")
    ws.cell(row=gsb_row, column=11, value=f"=IF(K{ant_row}>K{subtotal_row}, K{ant_row}-K{subtotal_row}, 0)")

    ws.cell(row=tec_row, column=10, value="saldo a favor TECNICO")
    ws.cell(row=tec_row, column=11, value=f"=IF(K{subtotal_row}>K{ant_row}, K{subtotal_row}-K{ant_row}, 0)")

    ws.cell(row=tot_row, column=10, value="TOTAL LEGALIZADO")
    ws.cell(row=tot_row, column=11, value=f"=K{subtotal_row}")

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream

