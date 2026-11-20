import openpyxl
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

wb = openpyxl.load_workbook('data/migracion_inventario/INVENTARIO GSB_COMWARE  RTC 2026.xlsx', data_only=False)
print("Sheet count:", len(wb.sheetnames))
for i, name in enumerate(wb.sheetnames):
    ws = wb[name]
    print(f"[{i}] repr: {repr(name)} (hidden={ws.sheet_state})")

ws_gen = wb['INVENTARIO GENERAL']
print("\n--- INVENTARIO GENERAL ---")
print("max_row:", ws_gen.max_row, "max_column:", ws_gen.max_column)
gen_headers = [ws_gen.cell(1, col).value for col in range(1, ws_gen.max_column + 1)]
print("Headers:", gen_headers)
for r in range(2, 5):
    row_vals = [(ws_gen.cell(r, c).value, ws_gen.cell(r, c).number_format) for c in range(1, ws_gen.max_column + 1)]
    print(f"Row {r}:", row_vals)

salidas_name = [s for s in wb.sheetnames if 'SALIDA' in s.upper()][0]
ws_sal = wb[salidas_name]
print(f"\n--- {repr(salidas_name)} ---")
print("max_row:", ws_sal.max_row, "max_column:", ws_sal.max_column)
sal_headers = [ws_sal.cell(1, col).value for col in range(1, ws_sal.max_column + 1)]
print("Headers:", sal_headers)
for r in range(2, 5):
    row_vals = [(ws_sal.cell(r, c).value, ws_sal.cell(r, c).number_format, ws_sal.cell(r, c).fill.fill_type, ws_sal.cell(r, c).fill.start_color.rgb if ws_sal.cell(r, c).fill and hasattr(ws_sal.cell(r, c).fill.start_color, 'rgb') else None) for c in range(1, ws_sal.max_column + 1)]
    print(f"Row {r}:", row_vals[:4])

print("\nLast rows of SALIDAS:")
for r in range(ws_sal.max_row - 10, ws_sal.max_row + 1):
    vals = [ws_sal.cell(r, c).value for c in range(1, 16)]
    print(f"Row {r}: {vals[:5]}")

