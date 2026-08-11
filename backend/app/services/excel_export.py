import io
from datetime import date
from decimal import Decimal
from typing import List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.models.asignacion import Asignacion
from app.models.usuario import Usuario
from app.models.viatico import Viatico


def generar_excel_viaticos_independientes(
    usuario: Usuario,
    viaticos: List[Viatico],
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
) -> io.BytesIO:
    """
    Genera un archivo Excel (.xlsx) con los viáticos independientes (asignacion_id IS NULL)
    de un usuario en el rango de fechas especificado.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Viáticos Independientes"

    # Estilos
    font_titulo = Font(name="Calibri", size=14, bold=True, color="1E40AF")
    font_header_info = Font(name="Calibri", size=10, bold=True, color="334155")
    font_value_info = Font(name="Calibri", size=10, color="0F172A")
    font_th = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    font_td = Font(name="Calibri", size=10, color="0F172A")
    font_total = Font(name="Calibri", size=10, bold=True, color="0F172A")

    fill_th = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
    fill_total = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    thin_border_side = Side(style="thin", color="CBD5E1")
    border_all = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )
    border_total = Border(
        top=Side(style="thin", color="0F172A"),
        bottom=Side(style="double", color="0F172A"),
    )

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    # Encabezado
    ws.merge_cells("A1:I1")
    ws["A1"] = "REPORTE DE VIÁTICOS INDEPENDIENTES"
    ws["A1"].font = font_titulo
    ws["A1"].alignment = align_left

    # Info Empleado & Fechas
    ws["A3"] = "Empleado:"
    ws["A3"].font = font_header_info
    ws["B3"] = usuario.nombre
    ws["B3"].font = font_value_info

    ws["D3"] = "Código Empleado:"
    ws["D3"].font = font_header_info
    ws["E3"] = usuario.codigo_empleado or "N/A"
    ws["E3"].font = font_value_info

    ws["G3"] = "Fecha Emisión:"
    ws["G3"].font = font_header_info
    ws["H3"] = date.today().strftime("%Y-%m-%d")
    ws["H3"].font = font_value_info

    str_inicio = fecha_inicio.strftime("%Y-%m-%d") if fecha_inicio else "Inicio"
    str_fin = fecha_fin.strftime("%Y-%m-%d") if fecha_fin else "Actualidad"
    ws["A4"] = "Periodo:"
    ws["A4"].font = font_header_info
    ws["B4"] = f"{str_inicio} a {str_fin}"
    ws["B4"].font = font_value_info

    # Tabla Headers
    headers = [
        "No.",
        "Fecha",
        "Tipo de Gasto",
        "Cliente",
        "Ciudad",
        "OT / Ref",
        "Evidencias",
        "Estado",
        "Valor",
    ]

    header_row = 6
    for col_idx, text in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=text)
        cell.font = font_th
        cell.fill = fill_th
        cell.alignment = align_center
        cell.border = border_all

    row_idx = 7
    total_valor = Decimal("0.00")

    for i, v in enumerate(viaticos, start=1):
        tiene_evidencia = "Sí" if getattr(v, "evidencias", None) and len(v.evidencias) > 0 else "No"
        val = Decimal(str(v.valor or 0))
        total_valor += val

        row_data = [
            i,
            v.fecha.strftime("%Y-%m-%d") if isinstance(v.fecha, date) else str(v.fecha),
            v.tipo_gasto,
            v.cliente or "N/A",
            v.ciudad or "N/A",
            v.ot or "N/A",
            tiene_evidencia,
            v.estado.capitalize() if v.estado else "N/A",
            val,
        ]

        for col_idx, val_cell in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val_cell)
            cell.font = font_td
            cell.border = border_all

            if col_idx in (1, 2, 7, 8):
                cell.alignment = align_center
            elif col_idx == 9:
                cell.alignment = align_right
                cell.number_format = '"$"#,##0.00'
            else:
                cell.alignment = align_left

        row_idx += 1

    # Fila de Subtotal
    ws.cell(row=row_idx, column=8, value="Subtotal").font = font_total
    ws.cell(row=row_idx, column=8).alignment = align_right

    cell_total = ws.cell(row=row_idx, column=9, value=total_valor)
    cell_total.font = font_total
    cell_total.alignment = align_right
    cell_total.number_format = '"$"#,##0.00'
    cell_total.fill = fill_total
    cell_total.border = border_total

    # Ajuste automático de ancho de columnas
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


def generar_excel_viaticos_asignacion(
    asignacion: Asignacion,
    viaticos: List[Viatico],
) -> io.BytesIO:
    """
    Genera un archivo Excel (.xlsx) con los viáticos asociados a una Asignación específica.
    Incluye los datos contextuales de la asignación y métricas de anticipo/gastado/saldo.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Viáticos Asignación"

    font_titulo = Font(name="Calibri", size=14, bold=True, color="1E40AF")
    font_header_info = Font(name="Calibri", size=10, bold=True, color="334155")
    font_value_info = Font(name="Calibri", size=10, color="0F172A")
    font_th = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    font_td = Font(name="Calibri", size=10, color="0F172A")
    font_total = Font(name="Calibri", size=10, bold=True, color="0F172A")
    font_saldo = Font(name="Calibri", size=10, bold=True, color="166534")

    fill_th = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
    fill_summary = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    thin_border_side = Side(style="thin", color="CBD5E1")
    border_all = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )
    border_summary = Border(
        top=Side(style="thin", color="0F172A"),
        bottom=Side(style="thin", color="0F172A"),
    )

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    # Encabezado
    ws.merge_cells("A1:I1")
    ws["A1"] = f"REPORTE DE VIÁTICOS - ASIGNACIÓN #{asignacion.id}"
    ws["A1"].font = font_titulo
    ws["A1"].alignment = align_left

    # Info Asignación
    ws["A3"] = "Técnico:"
    ws["A3"].font = font_header_info
    ws["B3"] = asignacion.tecnico.nombre if asignacion.tecnico else "N/A"
    ws["B3"].font = font_value_info

    ws["D3"] = "Código Empleado:"
    ws["D3"].font = font_header_info
    ws["E3"] = asignacion.tecnico.codigo_empleado if asignacion.tecnico else "N/A"
    ws["E3"].font = font_value_info

    ws["G3"] = "Fecha Emisión:"
    ws["G3"].font = font_header_info
    ws["H3"] = date.today().strftime("%Y-%m-%d")
    ws["H3"].font = font_value_info

    ws["A4"] = "Cliente / Empresa:"
    ws["A4"].font = font_header_info
    emp = f" ({asignacion.empresa})" if asignacion.empresa else ""
    ws["B4"] = f"{asignacion.cliente}{emp}"
    ws["B4"].font = font_value_info

    ws["D4"] = "Ciudad:"
    ws["D4"].font = font_header_info
    ws["E4"] = asignacion.ciudad
    ws["E4"].font = font_value_info

    str_ini = asignacion.fecha_inicio.strftime("%Y-%m-%d") if isinstance(asignacion.fecha_inicio, date) else str(asignacion.fecha_inicio)
    str_fin = asignacion.fecha_fin.strftime("%Y-%m-%d") if isinstance(asignacion.fecha_fin, date) else str(asignacion.fecha_fin)
    ws["G4"] = "Fechas Misión:"
    ws["G4"].font = font_header_info
    ws["H4"] = f"{str_ini} a {str_fin}"
    ws["H4"].font = font_value_info

    # Tabla Headers
    headers = [
        "No.",
        "Fecha",
        "Tipo de Gasto",
        "Cliente",
        "Ciudad",
        "OT / Ref",
        "Evidencias",
        "Estado",
        "Valor",
    ]

    header_row = 6
    for col_idx, text in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=text)
        cell.font = font_th
        cell.fill = fill_th
        cell.alignment = align_center
        cell.border = border_all

    row_idx = 7
    total_gastado = Decimal("0.00")

    for i, v in enumerate(viaticos, start=1):
        tiene_evid = "Sí" if getattr(v, "evidencias", None) and len(v.evidencias) > 0 else "No"
        val = Decimal(str(v.valor or 0))
        if v.estado != "rechazado":
            total_gastado += val

        row_data = [
            i,
            v.fecha.strftime("%Y-%m-%d") if isinstance(v.fecha, date) else str(v.fecha),
            v.tipo_gasto,
            v.cliente or asignacion.cliente,
            v.ciudad or asignacion.ciudad,
            v.ot or f"ASIG-#{asignacion.id}",
            tiene_evid,
            v.estado.capitalize() if v.estado else "N/A",
            val,
        ]

        for col_idx, val_cell in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val_cell)
            cell.font = font_td
            cell.border = border_all

            if col_idx in (1, 2, 7, 8):
                cell.alignment = align_center
            elif col_idx == 9:
                cell.alignment = align_right
                cell.number_format = '"$"#,##0.00'
            else:
                cell.alignment = align_left

        row_idx += 1

    # Totales Financieros
    anticipo = Decimal(str(asignacion.monto_anticipo or 0))
    saldo_restante = max(Decimal("0.00"), anticipo - total_gastado)

    # Fila 1: Anticipo Entregado
    ws.cell(row=row_idx, column=8, value="Anticipo Entregado:").font = font_total
    ws.cell(row=row_idx, column=8).alignment = align_right
    c_ant = ws.cell(row=row_idx, column=9, value=anticipo)
    c_ant.font = font_total
    c_ant.alignment = align_right
    c_ant.number_format = '"$"#,##0.00'
    c_ant.fill = fill_summary

    row_idx += 1
    # Fila 2: Total Gastado
    ws.cell(row=row_idx, column=8, value="Total Gastado:").font = font_total
    ws.cell(row=row_idx, column=8).alignment = align_right
    c_gas = ws.cell(row=row_idx, column=9, value=total_gastado)
    c_gas.font = font_total
    c_gas.alignment = align_right
    c_gas.number_format = '"$"#,##0.00'
    c_gas.fill = fill_summary

    row_idx += 1
    # Fila 3: Saldo Restante GSB
    ws.cell(row=row_idx, column=8, value="Saldo Restante GSB:").font = font_saldo
    ws.cell(row=row_idx, column=8).alignment = align_right
    c_sal = ws.cell(row=row_idx, column=9, value=saldo_restante)
    c_sal.font = font_saldo
    c_sal.alignment = align_right
    c_sal.number_format = '"$"#,##0.00'
    c_sal.fill = fill_summary
    c_sal.border = border_summary

    # Auto-fit columns
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream
