"""
cargar_zeus.py
==============
Carga los ítems del archivo "EQUIPOS PROYECTO ZEUS.xlsx" en la tabla
`inventario_items` con union_temporal = 'PROYECTO_ZEUS'.

• Hoja ODC178  → ítems con cantidad_stock = cantidad del Excel.
• Hoja ODC179  → ítems con cantidad_stock = cantidad del Excel + tiempo_entrega
                 y observación guardada en `no_sds` (campo libre existente).

Estrategia de idempotencia: se usa una clave compuesta
  (union_temporal, numero_articulo, descripcion[0:255], hoja_origen)
guardada en `id_equipo` con formato "zeus:ODC178:<n>" para detectar duplicados
sin afectar el índice único existente.

Uso:
    python scripts/cargar_zeus.py
    python scripts/cargar_zeus.py --dry-run   # solo muestra lo que haría
"""

import argparse
import sys
import os

# Asegurar que el módulo `app` esté en el path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import openpyxl
from sqlalchemy import select
from app.database import SessionLocal
from app.models.inventario import InventarioItem, UnionTemporal

EXCEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "migracion_inventario",
    "EQUIPOS PROYECTO ZEUS.xlsx",
)

HOJAS = {
    "ODC178": {"col_articulo": 1, "col_descripcion": 2, "col_cantidad": 3, "col_tiempo": None, "col_obs": None},
    "ODC 179": {"col_articulo": 1, "col_descripcion": 2, "col_cantidad": 3, "col_tiempo": 4, "col_obs": 5},
}


def limpiar(val) -> str:
    if val is None:
        return ""
    return str(val).strip()


def cargar(dry_run: bool = False):
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    db = SessionLocal()

    insertados = 0
    omitidos = 0
    errores = []

    try:
        for nombre_hoja, cols in HOJAS.items():
            if nombre_hoja not in wb.sheetnames:
                print(f"⚠️  Hoja '{nombre_hoja}' no encontrada en el Excel — se omite.")
                continue

            ws = wb[nombre_hoja]
            hoja_clave = nombre_hoja.replace(" ", "")  # "ODC178" / "ODC179"

            fila_n = 0
            for row in ws.iter_rows(values_only=True):
                # Fila de encabezado o vacía
                if row[cols["col_articulo"]] is None or limpiar(row[cols["col_articulo"]]) in ("", "Número de artículo"):
                    continue

                fila_n += 1
                numero_articulo = limpiar(row[cols["col_articulo"]])
                descripcion     = limpiar(row[cols["col_descripcion"]])[:255]
                try:
                    cantidad = int(row[cols["col_cantidad"]] or 0)
                except (TypeError, ValueError):
                    cantidad = 0

                tiempo_entrega = ""
                observacion    = ""
                if cols["col_tiempo"] is not None:
                    tiempo_entrega = limpiar(row[cols["col_tiempo"]])
                if cols["col_obs"] is not None:
                    observacion = limpiar(row[cols["col_obs"]])

                # Clave de idempotencia almacenada en id_equipo
                clave = f"zeus:{hoja_clave}:{fila_n}"

                # Verificar si ya existe
                existe = db.scalar(
                    select(InventarioItem).where(InventarioItem.id_equipo == clave)
                )
                if existe:
                    print(f"  ⏭  [{hoja_clave} f{fila_n}] Ya existe — omitiendo: {numero_articulo}")
                    omitidos += 1
                    continue

                # Combinar tiempo + observación en no_sds para tener trazabilidad
                nota_partes = []
                if tiempo_entrega:
                    nota_partes.append(f"Entrega: {tiempo_entrega}")
                if observacion:
                    nota_partes.append(observacion)
                nota_extra_full = " | ".join(nota_partes) if nota_partes else None
                # no_sds es VARCHAR(60) -- truncar a 59 chars si es necesario
                nota_extra_short = nota_extra_full[:59] if nota_extra_full else None

                item = InventarioItem(
                    union_temporal=UnionTemporal.PROYECTO_ZEUS,
                    numero_articulo=numero_articulo if numero_articulo else None,
                    descripcion=descripcion,
                    cantidad_stock=cantidad,
                    tiempo_entrega=(tiempo_entrega + (" | " + observacion if observacion else ""))[:79] if tiempo_entrega else (observacion[:79] if observacion else None),
                    no_sds=nota_extra_short,
                    id_equipo=clave,    # clave de idempotencia
                )

                print(
                    f"  {'[DRY-RUN] ' if dry_run else ''}✅ [{hoja_clave} f{fila_n}] "
                    f"{numero_articulo} — {descripcion[:60]}... ×{cantidad}"
                )

                if not dry_run:
                    db.add(item)
                insertados += 1

        if not dry_run:
            db.commit()
            print(f"\n🎉 Carga completada: {insertados} insertados, {omitidos} ya existían.")
        else:
            print(f"\n🔍 Dry-run: {insertados} se insertarían, {omitidos} ya existen.")

    except Exception as exc:
        db.rollback()
        print(f"\n❌ Error durante la carga: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Carga EQUIPOS PROYECTO ZEUS al inventario")
    parser.add_argument("--dry-run", action="store_true", help="No hace commit, solo muestra lo que haría")
    args = parser.parse_args()
    cargar(dry_run=args.dry_run)
