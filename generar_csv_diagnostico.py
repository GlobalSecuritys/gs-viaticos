# -*- coding: utf-8 -*-
import openpyxl, csv, os
from collections import defaultdict, Counter
PATH = r"c:\Users\Global Security Bank\Documents\plataforma\gs-viaticos\backend\data\migracion_inventario\INVENTARIO GSB_COMWARE  RTC 2026.xlsx"
OUTDIR = r"c:\Users\Global Security Bank\Documents\plataforma\gs-viaticos\backend\data\migracion_inventario\diagnostico_comware"
os.makedirs(OUTDIR, exist_ok=True)
wb = openpyxl.load_workbook(PATH, data_only=True)
ws_g = wb["INVENTARIO GENERAL"]
ws_s = wb["SALIDAS "]
def normalize(desc):
    if desc is None: return ""
    return ' '.join(str(desc).strip().split()).upper()
gen_rows = []
for r in range(2, 8635):
    desc = ws_g.cell(row=r, column=4).value
    if desc is None or str(desc).strip() == "": continue
    gen_rows.append({'fila': r, 'desc_orig': str(desc), 'desc_norm': normalize(desc),
        'serial': ws_g.cell(row=r, column=7).value, 'orden': ws_g.cell(row=r, column=2).value,
        'cols': tuple(ws_g.cell(row=r, column=c).value for c in range(1, 16))})
sal_rows = []
for r in range(2, 852):
    desc = ws_s.cell(row=r, column=4).value
    if desc is None or str(desc).strip() == "": continue
    oi = ws_s.cell(row=r, column=14).value; fi = ws_s.cell(row=r, column=15).value
    estado = "instalada" if (oi not in (None, "") or fi not in (None, "")) else "pendiente"
    sal_rows.append({'fila': r, 'desc_orig': str(desc), 'desc_norm': normalize(desc),
        'serial': ws_s.cell(row=r, column=7).value,
        'sede': str(ws_s.cell(row=r, column=9).value).strip() if ws_s.cell(row=r, column=9).value not in (None, "") else "",
        'tecnico': str(ws_s.cell(row=r, column=10).value).strip() if ws_s.cell(row=r, column=10).value not in (None, "") else "",
        'estado': estado})
gen_desc_count = Counter(x['desc_norm'] for x in gen_rows)
sal_desc_count = Counter(x['desc_norm'] for x in sal_rows)
all_desc_norm = set(gen_desc_count.keys()) | set(sal_desc_count.keys())
desc_to_orig = {}
for x in gen_rows + sal_rows:
    if x['desc_norm'] not in desc_to_orig: desc_to_orig[x['desc_norm']] = x['desc_orig']
primera_palabra = defaultdict(set)
for dn in all_desc_norm:
    if dn: primera_palabra[dn.split()[0]].add(dn)
grupo_map = {}
for pw, descs in primera_palabra.items():
    if len(descs) >= 2:
        for dn in descs: grupo_map[dn] = pw

with open(os.path.join(OUTDIR, "catalogo_descripciones.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["descripcion_original", "descripcion_normalizada", "filas_general", "filas_salidas", "grupo_sugerido"])
    for dn in sorted(all_desc_norm):
        w.writerow([desc_to_orig.get(dn, dn), dn, gen_desc_count.get(dn, 0), sal_desc_count.get(dn, 0), grupo_map.get(dn, "")])
serial_to_rows = defaultdict(list)
for x in gen_rows:
    s = x['serial']
    if isinstance(s, (int, float)) and not isinstance(s, bool): serial_to_rows[int(s)].append(x)
duplicados = {s: rows for s, rows in serial_to_rows.items() if len(rows) > 1}
with open(os.path.join(OUTDIR, "seriales_duplicados_general.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["serial", "fila", "descripcion", "numero_de_orden", "filas_idénticas"])
    for s in sorted(duplicados):
        rows = duplicados[s]
        all_identical = all(r['cols'] == rows[0]['cols'] for r in rows)
        flag = "SI" if all_identical else "NO"
        for r in rows: w.writerow([s, r['fila'], r['desc_orig'], r['orden'], flag])
gen_serial_first = {}
for x in gen_rows:
    s = x['serial']
    if isinstance(s, (int, float)) and not isinstance(s, bool):
        key = int(s)
        if key not in gen_serial_first: gen_serial_first[key] = x
sal_serial_first = {}
for x in sal_rows:
    s = x['serial']
    if isinstance(s, (int, float)) and not isinstance(s, bool):
        key = int(s)
        if key not in sal_serial_first: sal_serial_first[key] = x
common_serials = sorted(set(gen_serial_first.keys()) & set(sal_serial_first.keys()))
with open(os.path.join(OUTDIR, "seriales_en_ambas_hojas.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["serial", "fila_general", "desc_general", "fila_salidas", "desc_salidas", "sede", "tecnico", "estado", "descripcion_coincide"])
    for s in common_serials:
        g = gen_serial_first[s]; sa = sal_serial_first[s]
        coincide = "SI" if normalize(g['desc_orig']) == normalize(sa['desc_orig']) else "NO"
        w.writerow([s, g['fila'], g['desc_orig'], sa['fila'], sa['desc_orig'], sa['sede'], sa['tecnico'], sa['estado'], coincide])
n_desc = len(all_desc_norm); n_grupos = len(set(grupo_map.values()))
grupo_unidades_gen = Counter(); grupo_unidades_sal = Counter()
for dn in all_desc_norm:
    g = grupo_map.get(dn, dn); grupo_unidades_gen[g] += gen_desc_count.get(dn, 0); grupo_unidades_sal[g] += sal_desc_count.get(dn, 0)
print(f"DESCRIPCIONES NORMALIZADAS ÚNICAS: {n_desc}"); print(f"GRUPOS SUGERIDOS: {n_grupos}")
print("\nTOP 15 GRUPOS (grupo, unidades_GENERAL, unidades_SALIDAS):")
for g, cnt in grupo_unidades_gen.most_common(15): print(f"{g}, {cnt}, {grupo_unidades_sal.get(g, 0)}")
filas_dup = 0; filas_identicas = 0; filas_diferentes = 0; gid = 0; gd = 0
for s, rows in duplicados.items():
    filas_dup += len(rows)
    if all(r['cols'] == rows[0]['cols'] for r in rows): filas_identicas += len(rows); gid += 1
    else: filas_diferentes += len(rows); gd += 1
print(f"\nDUPLICADOS: {len(duplicados)} seriales, {filas_dup} filas involucradas | idénticas: {filas_identicas}, difieren: {filas_diferentes} | grupos idénticos: {gid}, diferentes: {gd}")
mismo_desc = 0; distinto_desc = 0
for s in common_serials:
    if normalize(gen_serial_first[s]['desc_orig']) == normalize(sal_serial_first[s]['desc_orig']): mismo_desc += 1
    else: distinto_desc += 1
print(f"\nCRUZADOS: {len(common_serials)} seriales | misma desc: {mismo_desc}, desc distinta: {distinto_desc}")
wb.close(); print("\nCSV generados en:", OUTDIR)

