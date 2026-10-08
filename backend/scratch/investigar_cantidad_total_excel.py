"""Investigar la hoja CANTIDAD TOTAL en CI-FR- INVENTARIO MANTENIMIENTO 2026.xlsx"""
import openpyxl
import zipfile
import xml.etree.ElementTree as ET

ruta = r"c:\gs-viaticos\backend\data\migracion_inventario\CI-FR- INVENTARIO MANTENIMIENTO 2026.xlsx"

# 1. Inspeccionar XML interno del xlsx (es un ZIP)
with zipfile.ZipFile(ruta, 'r') as z:
    archivos = z.namelist()
    pivot_files = [f for f in archivos if 'pivot' in f.lower()]
    sheet_files = [f for f in archivos if 'sheet' in f.lower()]
    print("Archivos de tablas dinámicas en el ZIP:", pivot_files)
    print("Archivos de hojas:", sheet_files)

    # Ver qué hoja corresponde a CANTIDAD TOTAL
    wb_xml = z.read("xl/workbook.xml")
    root = ET.fromstring(wb_xml)
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    for sheet in root.findall('.//ns:sheet', ns):
        print(f"Sheet Name: '{sheet.attrib.get('name')}', Sheet ID: {sheet.attrib.get('sheetId')}, r:id: {sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')}")

    # Si hay pivot tables, ver su definición
    for pf in pivot_files:
        try:
            content = z.read(pf).decode('utf-8', errors='ignore')
            print(f"\n--- {pf} (primeros 500 chars) ---")
            print(content[:500])
        except Exception as e:
            print(f"Error leyendo {pf}: {e}")
