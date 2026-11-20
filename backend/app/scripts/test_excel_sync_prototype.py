import openpyxl
import datetime
import os
import sys
from openpyxl.styles import Font, PatternFill

os.makedirs('data/test_sync', exist_ok=True)
wb = openpyxl.load_workbook('data/migracion_inventario/INVENTARIO GSB_COMWARE  RTC 2026.xlsx')
ws_gen = wb['INVENTARIO GENERAL']
ws_gen.delete_rows(2, ws_gen.max_row - 1)

font_narrow = Font(name='Arial Narrow', size=11)
fill_green = PatternFill(fill_type='solid', start_color='D9EAD3', end_color='D9EAD3')

# Write 1 dummy row to test
ws_gen.cell(2, 1, datetime.date(2026, 10, 19)).number_format = 'd/m/yyyy'
ws_gen.cell(2, 2, '11455')
ws_gen.cell(2, 3, 'N/A')
ws_gen.cell(2, 4, 'PRODUCTO TEST')
ws_gen.cell(2, 5, 1)
ws_gen.cell(2, 6, 'EQ-01')
ws_gen.cell(2, 7, 'SN-01')
ws_gen.cell(2, 8, '=CONCATENATE("GSB",G2,"-","SN",F2)')

for c in range(1, 9):
    ws_gen.cell(2, c).font = font_narrow

ws_sal = wb['SALIDAS ']
ws_sal.delete_rows(2, ws_sal.max_row - 1)

ws_sal.cell(2, 1, datetime.date(2026, 10, 19)).number_format = 'd/m/yyyy'
ws_sal.cell(2, 2, '11455')
ws_sal.cell(2, 3, 'N/A')
ws_sal.cell(2, 4, 'PRODUCTO TEST')
ws_sal.cell(2, 5, 1)
ws_sal.cell(2, 6, 'EQ-01')
ws_sal.cell(2, 7, 'SN-01')
ws_sal.cell(2, 8, '=CONCATENATE("GSB",G2,"-","SN",F2)')
ws_sal.cell(2, 9, 'OFICINA')
ws_sal.cell(2, 10, 'TECNICO')
ws_sal.cell(2, 11, datetime.date(2026, 10, 20)).number_format = 'd/m/yyyy'
ws_sal.cell(2, 12, 'UT-GBSCOM')
ws_sal.cell(2, 13, 'ORD-01')
ws_sal.cell(2, 14, 'OFICINA INST')
ws_sal.cell(2, 15, datetime.date(2026, 10, 25)).number_format = 'd/m/yyyy'

for c in range(1, 16):
    ws_sal.cell(2, c).font = font_narrow
    if c <= 11:
        ws_sal.cell(2, c).fill = fill_green

# Write blank row (row 3) and 3 email rows (row 4, 5, 6)
ws_sal.cell(4, 4, 'yuly.gonzalez@comware.com.co').font = font_narrow
ws_sal.cell(5, 4, 'july.melendez@comware.com.co').font = font_narrow
ws_sal.cell(6, 4, 'daniel.correa@comware.com.co').font = font_narrow

test_out = 'data/test_sync/test_delete_and_write.xlsx'
wb.save(test_out)
print('Saved test file successfully to', test_out)

