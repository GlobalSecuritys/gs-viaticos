# -*- coding: utf-8 -*-
"""
Importa proveedores desde el Excel ubicado en backend/data/proveedores/proveedores.xlsx
a la tabla `proveedores` en la base de datos.

Uso:
    cd c:\\gs-viaticos\\backend
    ..\\venv\\Scripts\\python.exe scripts/importar_proveedores.py

Columnas utilizadas del Excel:
    - "Identificación"  -> nit
    - "Nombre tercero"  -> nombre
    (el encabezado real está en la fila 7, índice 6 de pandas)

El script hace UPSERT: inserta el registro si el NIT no existe;
si ya existe, actualiza el nombre.
"""

import sys
import io
import os
import re

# Forzar UTF-8 en stdout para Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Añadir el directorio raíz del backend al path para importar app.*
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.proveedor import Proveedor

EXCEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "proovedores", "proveedores.xlsx"
)

# El encabezado del Excel está en la fila 7 (índice 6 para pandas)
HEADER_ROW = 6
COL_NIT = "Identificación"
COL_NOMBRE = "Nombre tercero"


def limpiar_nit(valor) -> str | None:
    """Convierte el NIT a string limpio, sin espacios ni guiones."""
    if pd.isna(valor):
        return None
    nit = str(valor).strip()
    # Eliminar caracteres no alfanuméricos (puntos, guiones, espacios)
    nit = re.sub(r"[\s.\-]", "", nit)
    return nit if nit else None


def limpiar_nombre(valor) -> str | None:
    if pd.isna(valor):
        return None
    nombre = str(valor).strip()
    return nombre if nombre else None


def importar(session: Session) -> None:
    print(f"Leyendo archivo: {os.path.abspath(EXCEL_PATH)}")
    df = pd.read_excel(EXCEL_PATH, header=HEADER_ROW, usecols=[COL_NIT, COL_NOMBRE], dtype=str)

    # Limpiar datos
    df[COL_NIT] = df[COL_NIT].apply(limpiar_nit)
    df[COL_NOMBRE] = df[COL_NOMBRE].apply(limpiar_nombre)

    # Eliminar filas sin NIT o sin nombre
    df = df.dropna(subset=[COL_NIT, COL_NOMBRE])
    df = df[df[COL_NIT] != ""]
    df = df[df[COL_NOMBRE] != ""]

    # Eliminar duplicados de NIT (conservar primera ocurrencia)
    df = df.drop_duplicates(subset=[COL_NIT], keep="first")

    total = len(df)
    print(f"Filas válidas a procesar: {total}")

    registros = [
        {"nit": row[COL_NIT], "nombre": row[COL_NOMBRE]}
        for _, row in df.iterrows()
    ]

    # UPSERT en lotes de 500
    BATCH = 500
    insertados = 0
    actualizados = 0

    for i in range(0, len(registros), BATCH):
        lote = registros[i : i + BATCH]
        stmt = pg_insert(Proveedor).values(lote)
        stmt = stmt.on_conflict_do_update(
            index_elements=["nit"],
            set_={"nombre": stmt.excluded.nombre},
        )
        result = session.execute(stmt)
        # rowcount en upsert de PG devuelve 1 por insert y 2 por update
        session.commit()

        lote_i = result.rowcount if result.rowcount >= 0 else len(lote)
        print(f"  Lote {i // BATCH + 1}: {len(lote)} registros procesados")

    print(f"\nOK Importacion completada. Total procesados: {total}")


def main():
    if not os.path.exists(EXCEL_PATH):
        print(f"ERROR: No se encontro el archivo: {os.path.abspath(EXCEL_PATH)}")
        sys.exit(1)

    session: Session = SessionLocal()
    try:
        importar(session)
    except Exception as e:
        session.rollback()
        print(f"ERROR durante la importacion: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
