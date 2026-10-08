"""Prueba del algoritmo determinístico de lectura inteligente para planilla_id = 1"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

def analizar_inventario_mantenimiento():
    with engine.connect() as conn:
        # 1. Validar planilla objetivo
        pl = conn.execute(text("SELECT id, nombre, activa FROM inventario_planillas WHERE id = 1")).mappings().first()
        if not pl:
            return {"error": "Planilla 1 no encontrada"}

        # 2. Leer fuente Kardex / inventario_items
        items_nuevos = conn.execute(text("""
            SELECT id, codigo, descripcion, marca, stock_actual, eliminado_en
            FROM inventario_items
            WHERE planilla_id = 1 AND eliminado_en IS NULL
        """)).mappings().all()

        kardex_movs = conn.execute(text("""
            SELECT m.id, m.item_id, m.tipo, m.cantidad, m.origen, m.fecha
            FROM inventario_movimientos m
            JOIN inventario_items i ON i.id = m.item_id
            WHERE i.planilla_id = 1 AND i.eliminado_en IS NULL
        """)).mappings().all()

        # 3. Leer mapeo legacy
        mapeo = conn.execute(text("SELECT union_temporal FROM inventario_mapeo_legacy WHERE planilla_id = 1")).mappings().first()
        ut = mapeo['union_temporal'] if mapeo else None

        items_legacy = []
        if ut:
            items_legacy = conn.execute(text("""
                SELECT id, codigo_barras, descripcion, serial_gsb, cantidad_stock, fecha_compra, factura, no_sds, id_equipo
                FROM inventario_legacy_items_v2
                WHERE union_temporal::text = :ut
            """), {"ut": ut}).mappings().all()

        # 4. Calcular métricas determinísticas
        # 4.1 Fuente Kardex
        n_items_nuevos = len(items_nuevos)
        unidades_nuevas = sum(it['stock_actual'] for it in items_nuevos)
        con_stock_nuevo = sum(1 for it in items_nuevos if it['stock_actual'] > 0)
        sin_stock_nuevo = sum(1 for it in items_nuevos if it['stock_actual'] == 0)

        # 4.2 Fuente Legacy
        n_items_legacy = len(items_legacy)
        unidades_legacy = sum(it['cantidad_stock'] for it in items_legacy)
        con_stock_legacy = sum(1 for it in items_legacy if it['cantidad_stock'] > 0)
        sin_stock_legacy = sum(1 for it in items_legacy if it['cantidad_stock'] == 0)

        # 4.3 Referencias únicas de catálogo
        descripciones_legacy = set(it['descripcion'].strip().upper() for it in items_legacy if it['descripcion'])
        descripciones_nuevas = set(it['descripcion'].strip().upper() for it in items_nuevos if it['descripcion'])
        
        # 4.4 Cruce / Posibles duplicados entre fuentes
        coincidencias_entre_fuentes = descripciones_nuevas.intersection(descripciones_legacy)
        
        # 4.5 Totales consolidados
        total_registros = n_items_nuevos + n_items_legacy
        total_referencias_unicas = len(descripciones_nuevas.union(descripciones_legacy))
        total_unidades = unidades_nuevas + unidades_legacy
        total_con_stock = con_stock_nuevo + con_stock_legacy
        total_sin_stock = sin_stock_nuevo + sin_stock_legacy

        return {
            "inventario": pl['nombre'],
            "total_registros": total_registros,
            "total_referencias_unicas": total_referencias_unicas,
            "total_unidades": total_unidades,
            "elementos_con_stock": total_con_stock,
            "elementos_sin_stock": total_sin_stock,
            "fuentes": {
                "kardex_nuevo": {
                    "registros": n_items_nuevos,
                    "unidades": unidades_nuevas,
                    "con_stock": con_stock_nuevo,
                    "sin_stock": sin_stock_nuevo,
                    "movimientos": len(kardex_movs),
                    "detalle_items": [dict(it) for it in items_nuevos]
                },
                "legacy_v2": {
                    "union_temporal": ut,
                    "registros": n_items_legacy,
                    "referencias_unicas": len(descripciones_legacy),
                    "unidades": unidades_legacy,
                    "con_stock": con_stock_legacy,
                    "sin_stock": sin_stock_legacy
                }
            },
            "cruce_duplicados": {
                "solapamiento_entre_fuentes": len(coincidencias_entre_fuentes),
                "items_solapados": list(coincidencias_entre_fuentes)
            }
        }

if __name__ == "__main__":
    res = analizar_inventario_mantenimiento()
    import pprint
    pprint.pprint(res)
