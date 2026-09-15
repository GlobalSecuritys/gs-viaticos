import io
import json
from datetime import date, datetime
from typing import TYPE_CHECKING, Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.utils.numero_a_letras import numero_a_letras

if TYPE_CHECKING:
    from app.models.cuenta_cobro import CuentaCobro


MESES_MAYUS = {
    1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL", 5: "MAYO", 6: "JUNIO",
    7: "JULIO", 8: "AGOSTO", 9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE"
}


def _format_cop(val: Any) -> str:
    """Formato moneda colombiano con espacio: $ 110.000"""
    try:
        n = int(round(float(val or 0)))
        s = f"{n:,}".replace(",", ".")
        return f"$ {s}"
    except Exception:
        return "$ 0"


def _fecha_partes(fecha_val):
    if isinstance(fecha_val, (date, datetime)):
        return fecha_val.day, MESES_MAYUS.get(fecha_val.month, ""), fecha_val.year
    if isinstance(fecha_val, str) and fecha_val:
        try:
            partes = fecha_val.split("T")[0].split("-")
            if len(partes) == 3:
                return int(partes[2]), MESES_MAYUS.get(int(partes[1]), ""), int(partes[0])
        except Exception:
            pass
    return "", "", ""


def generar_pdf_cuenta_cobro(cuenta: "CuentaCobro") -> bytes:
    """
    Genera en memoria un documento PDF con la estética idéntica al formato oficial
    original (DocumentoCuentaCobro.jsx): fuente Times-Roman, texto centrado,
    resaltador fucsia (#FF66CC), tabla clásica con bordes negros y encabezados en #F2F2F2.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=50,
        rightMargin=50,
        topMargin=45,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()

    header_num_style = ParagraphStyle(
        "CCOriginalNum",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=12.5,
        leading=16,
        alignment=1,  # Centrado
        textColor=colors.black,
    )

    date_style = ParagraphStyle(
        "CCOriginalDate",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=11,
        leading=14,
        alignment=0,  # Izquierda
        textColor=colors.black,
    )

    company_style = ParagraphStyle(
        "CCOriginalCompany",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=11.5,
        leading=15,
        alignment=1,  # Centrado
        textColor=colors.black,
    )

    debe_a_style = ParagraphStyle(
        "CCOriginalDebeA",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=11,
        leading=15,
        alignment=1,  # Centrado
        textColor=colors.black,
    )

    suma_style = ParagraphStyle(
        "CCOriginalSuma",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10.5,
        leading=15,
        alignment=4,  # Justificado
        textColor=colors.black,
    )

    table_cell = ParagraphStyle(
        "CCOriginalTableCell",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=8.5,
        leading=11,
        alignment=1,  # Centrado
        textColor=colors.black,
    )

    table_header = ParagraphStyle(
        "CCOriginalTableHeader",
        parent=table_cell,
        fontName="Times-Bold",
        textColor=colors.black,
    )

    table_total_lbl = ParagraphStyle(
        "CCOriginalTotalLbl",
        parent=table_cell,
        fontName="Times-Bold",
        alignment=2,  # Derecha
        textColor=colors.black,
    )

    table_total_val = ParagraphStyle(
        "CCOriginalTotalVal",
        parent=table_cell,
        fontName="Times-Bold",
        textColor=colors.black,
    )

    body_text_style = ParagraphStyle(
        "CCOriginalBodyText",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10,
        leading=14,
        textColor=colors.black,
    )

    story = []

    consecutivo = cuenta.consecutivo or f"{cuenta.fecha.year if cuenta.fecha else '2026'}-{cuenta.id}"
    dia, mes_mayus, anio = _fecha_partes(cuenta.fecha)

    # 1. Consecutivo centrado y subrayado
    story.append(Paragraph(f"<u><b>CUENTA DE COBRO No: {consecutivo}</b></u>", header_num_style))
    story.append(Spacer(1, 24))

    # 2. Fecha a la izquierda: "11 SEPTIEMBRE del 2026"
    fecha_linea = f"{dia} {mes_mayus} del {anio}" if dia and mes_mayus else str(cuenta.fecha or "")
    story.append(Paragraph(fecha_linea, date_style))
    story.append(Spacer(1, 22))

    # 3. Empresa centrada
    story.append(Paragraph("<b>GLOBAL SECURITY BANK<br/>Nit 830 057 616-3</b>", company_style))
    story.append(Spacer(1, 20))

    # 4. Debe a centrado
    titular_nom = (cuenta.titular_nombre or "TÉCNICO / PROVEEDOR").strip().upper()
    cedula_txt = cuenta.titular_cedula or cuenta.identificacion or "—"
    story.append(Paragraph(f"Debe a<br/><b>{titular_nom}</b><br/>OCC {cedula_txt}", debe_a_style))
    story.append(Spacer(1, 20))

    # 5. La suma de ... por [Concepto resaltado en rosa #FF66CC]
    monto_letras = numero_a_letras(cuenta.total)
    total_str = _format_cop(cuenta.total)
    concepto_txt = cuenta.concepto_servicio or "Servicio de viáticos y comisión"
    suma_html = (
        f"La suma de <b>{monto_letras} MCTE ({total_str})</b> por "
        f"<font backcolor='#FF66CC'>{concepto_txt}</font>"
    )
    story.append(Paragraph(suma_html, suma_style))
    story.append(Spacer(1, 16))

    # 6. Tabla clásica con bordes negros sólidos
    items_raw = cuenta.items
    items: List[Dict[str, Any]] = []
    if isinstance(items_raw, str):
        try:
            items = json.loads(items_raw)
        except Exception:
            items = []
    elif isinstance(items_raw, list):
        items = items_raw

    encabezados = [
        Paragraph("<b>ITEM</b>", table_header),
        Paragraph("<b>OFICINA</b>", table_header),
        Paragraph("<b>FECHA INICIO</b>", table_header),
        Paragraph("<b>FECHA FINAL</b>", table_header),
        Paragraph("<b>NO TECNICOS</b>", table_header),
        Paragraph("<b>VALOR DIARIO</b>", table_header),
        Paragraph("<b>VALOR TOTAL</b>", table_header),
    ]
    data_table = [encabezados]

    if not items:
        f_str = str(cuenta.fecha or "")
        data_table.append([
            Paragraph("1", table_cell),
            Paragraph(str(cuenta.ciudad or "SEDE PRINCIPAL"), table_cell),
            Paragraph(f_str, table_cell),
            Paragraph(f_str, table_cell),
            Paragraph("1", table_cell),
            Paragraph(total_str, table_cell),
            Paragraph(total_str, table_cell),
        ])
    else:
        for idx, it in enumerate(items, start=1):
            data_table.append([
                Paragraph(str(idx), table_cell),
                Paragraph(str(it.get("oficina", cuenta.ciudad or "SEDE")), table_cell),
                Paragraph(str(it.get("fecha_inicio", cuenta.fecha or "")), table_cell),
                Paragraph(str(it.get("fecha_fin", cuenta.fecha or "")), table_cell),
                Paragraph(str(it.get("num_tecnicos", 1)), table_cell),
                Paragraph(_format_cop(it.get("valor_diario", cuenta.total)), table_cell),
                Paragraph(_format_cop(it.get("valor_total", cuenta.total)), table_cell),
            ])

    # Fila de TOTAL: celdas 0-4 vacías, celda 5 'TOTAL', celda 6 el valor con fondo #FF66CC
    data_table.append([
        "", "", "", "", "",
        Paragraph("<b>TOTAL</b>", table_total_lbl),
        Paragraph(f"<b>{total_str}</b>", table_total_val),
    ])

    col_widths = [35, 120, 75, 75, 50, 78, 79]
    t = Table(data_table, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F2F2")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.75, colors.black),
        ("SPAN", (0, -1), (4, -1)),  # Unir celdas 0 a 4 de la última fila
        ("BACKGROUND", (-1, -1), (-1, -1), colors.HexColor("#FF66CC")),  # Fondo rosa en celda total
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 18))

    # 7. Información bancaria
    banco_nombre = cuenta.banco or "Banco"
    tipo_cta = cuenta.tipo_cuenta or "Ahorros"
    num_cta = cuenta.numero_cuenta or "—"
    titular_cta = cuenta.titular_nombre or "—"
    cedula_cta = cuenta.titular_cedula or cuenta.identificacion or "—"

    banco_par = (
        f"Por favor consignar a <b>{banco_nombre}</b> Cuenta {tipo_cta} N° <b>{num_cta}</b> "
        f"a nombre de <b>{titular_cta}</b> con No CC {cedula_cta}"
    )
    story.append(Paragraph(banco_par, body_text_style))
    story.append(Spacer(1, 14))

    # 8. Lugar y fecha de firma
    ciudad_firma = cuenta.ciudad or "Bogotá, D. C."
    firma_fecha_txt = f"Se firma en {ciudad_firma}, a los {dia} días del mes {mes_mayus} del {anio}"
    story.append(Paragraph(firma_fecha_txt, body_text_style))
    story.append(Spacer(1, 26))

    # 9. Bloque de firma
    firma_html = (
        f"Cordialmente<br/><br/><br/>"
        f"<b>Nombre:</b> {cuenta.titular_nombre or '—'}<br/>"
        f"<b>Cedula:</b> {cuenta.titular_cedula or cuenta.identificacion or '—'}<br/>"
        f"<b>Celular:</b> {cuenta.titular_celular or '—'}"
    )
    story.append(Paragraph(firma_html, body_text_style))

    doc.build(story)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data
