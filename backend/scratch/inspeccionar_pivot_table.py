"""Inspeccionar campos y fuente de la Pivot Table 'CANTIDAD TOTAL'"""
import zipfile
import xml.etree.ElementTree as ET

ruta = r"c:\gs-viaticos\backend\data\migracion_inventario\CI-FR- INVENTARIO MANTENIMIENTO 2026.xlsx"
with zipfile.ZipFile(ruta, 'r') as z:
    pt_xml = z.read("xl/pivotTables/pivotTable1.xml")
    root_pt = ET.fromstring(pt_xml)
    print("Root tag:", root_pt.tag)
    print("Attribs:", root_pt.attrib)
    for elem in root_pt:
        print(f"Child: {elem.tag}, attrib: {elem.attrib}")

    # Ver pivotFields
    for pf in root_pt.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}pivotField'):
        name = pf.attrib.get('name')
        axis = pf.attrib.get('axis')
        dataField = pf.attrib.get('dataField')
        print(f"  Field: name='{name}', axis='{axis}', dataField='{dataField}'")

    # Ver dataFields
    for df in root_pt.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}dataField'):
        print(f"  DataField: name='{df.attrib.get('name')}', fld='{df.attrib.get('fld')}', subtotal='{df.attrib.get('subtotal')}'")

    # Ver rowFields
    for rf in root_pt.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}rowFields/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}field'):
        print(f"  RowField: x='{rf.attrib.get('x')}'")

    # Ver la fuente en pivotCacheDefinition1.xml
    cache_xml = z.read("xl/pivotCache/pivotCacheDefinition1.xml")
    root_cache = ET.fromstring(cache_xml)
    print("\n--- Cache Source ---")
    for ws_source in root_cache.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}worksheetSource'):
        print("Worksheet Source attribs:", ws_source.attrib)
