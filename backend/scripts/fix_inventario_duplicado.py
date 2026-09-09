"""
Script de corrección puntual: Bug histórico nodo Inventario (IN) en Mapa SGC.

Problema:
  El nodo de Inventario en el grupo Misionales fue creado copiando el registro
  de Operaciones (OP), resultando en un registro con:
    - codigo = "OP" (incorrecto, debería ser "IN")
    - nombre = "Operaciones" (incorrecto, debería ser "Inventario")
    - responsable = Claudia Miranda (heredado de OP, debería ser "Sin asignar")
    - ícono = cubo (ya correcto, diferente al chip de OP)

Este script detecta y corrige la situación en los Casos A y B.

Uso:
    cd c:/gs-viaticos/backend
    python scripts/fix_inventario_duplicado.py

Requisitos: .env configurado con DATABASE_URL válida.
"""

import sys
import os

# Agrega el directorio backend al path para importar los módulos de la app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func
from app.database import SessionLocal
from app.models.calidad_procesos import ProcesoCalidad, ProcesoCalidadResponsable

_DESCRIPCION_INVENTARIO = (
    "Control de stock por planillas, kardex de entradas y salidas "
    "de material, y consolidado de bodega."
)


def fix_inventario():
    with SessionLocal() as db:
        print("=" * 60)
        print("  Fix: Nodo Inventario (IN) duplicado en Mapa SGC")
        print("=" * 60)

        # ── Estado actual ──────────────────────────────────────────────────
        todos = db.scalars(select(ProcesoCalidad)).all()
        print(f"\n📋 Total de procesos en BD: {len(todos)}")
        for p in sorted(todos, key=lambda x: (x.categoria, x.orden)):
            resps = db.scalars(
                select(ProcesoCalidadResponsable).where(
                    ProcesoCalidadResponsable.proceso_id == p.id
                )
            ).all()
            resp_names = [f"user_id={r.usuario_id}" for r in resps]
            print(
                f"  id={p.id:2d} | {p.categoria:<12} | orden={p.orden} "
                f"| codigo={p.codigo:<3} | nombre={p.nombre:<25} "
                f"| responsables={resp_names or 'Sin asignar'}"
            )

        # ── Caso A: Dos o más registros con codigo="OP" ────────────────────
        ops = db.scalars(
            select(ProcesoCalidad).where(ProcesoCalidad.codigo == "OP")
        ).all()

        if len(ops) >= 2:
            print(f"\n🔴 Caso A: Se encontraron {len(ops)} registros con codigo='OP'")
            op_real = next((p for p in ops if p.nombre == "Operaciones"), None)
            if op_real is None:
                op_real = min(ops, key=lambda p: p.id)
            print(f"   ✅ Operaciones real: id={op_real.id}, nombre='{op_real.nombre}', orden={op_real.orden}")

            duplicados = [p for p in ops if p.id != op_real.id]
            for dup in duplicados:
                print(f"\n   🔧 Corrigiendo duplicado id={dup.id}:")
                print(f"      Antes → codigo='{dup.codigo}', nombre='{dup.nombre}', orden={dup.orden}")
                dup.codigo = "IN"
                dup.nombre = "Inventario"
                dup.descripcion = _DESCRIPCION_INVENTARIO
                dup.orden = 3
                # Limpiar responsables heredados
                deleted = db.execute(
                    ProcesoCalidadResponsable.__table__.delete().where(
                        ProcesoCalidadResponsable.proceso_id == dup.id
                    )
                )
                print(f"      Después → codigo='IN', nombre='Inventario', orden=3")
                print(f"      Responsables eliminados: {deleted.rowcount}")
            db.commit()
            print("\n✅ Caso A corregido y guardado en BD.")

        # ── Caso B: Existe un registro IN con datos de Operaciones ─────────
        else:
            nodo_in = db.scalar(
                select(ProcesoCalidad).where(ProcesoCalidad.codigo == "IN")
            )
            if nodo_in:
                necesita = (
                    nodo_in.nombre != "Inventario"
                    or nodo_in.nombre == "Operaciones"
                    or "Operaciones" in (nodo_in.descripcion or "")
                )
                if necesita:
                    print(f"\n🟡 Caso B: Nodo IN (id={nodo_in.id}) tiene datos incorrectos:")
                    print(f"   nombre='{nodo_in.nombre}', descripcion='{nodo_in.descripcion[:60]}...'")
                    nodo_in.nombre = "Inventario"
                    nodo_in.descripcion = _DESCRIPCION_INVENTARIO
                    nodo_in.orden = 3
                    deleted = db.execute(
                        ProcesoCalidadResponsable.__table__.delete().where(
                            ProcesoCalidadResponsable.proceso_id == nodo_in.id
                        )
                    )
                    db.commit()
                    print(f"   ✅ Corregido. Responsables eliminados: {deleted.rowcount}")
                else:
                    print(f"\n✅ Caso B: Nodo IN (id={nodo_in.id}) ya tiene datos correctos.")
                    print(f"   nombre='{nodo_in.nombre}', orden={nodo_in.orden}")
            else:
                print("\n⚠️  No se encontró ningún registro con codigo='IN'.")
                print("    El nodo Inventario puede no existir aún o tener un código diferente.")

        # ── Verificación final ─────────────────────────────────────────────
        print("\n" + "=" * 60)
        print("  ESTADO FINAL — Procesos Misionales")
        print("=" * 60)
        misionales = db.scalars(
            select(ProcesoCalidad)
            .where(ProcesoCalidad.categoria == "misional")
            .order_by(ProcesoCalidad.orden)
        ).all()

        codigos_vistos = {}
        ok = True
        for p in misionales:
            resps = db.scalars(
                select(ProcesoCalidadResponsable).where(
                    ProcesoCalidadResponsable.proceso_id == p.id
                )
            ).all()
            resp_str = f"user_id={[r.usuario_id for r in resps]}" if resps else "Sin asignar"
            print(
                f"  orden={p.orden} | codigo={p.codigo:<3} | nombre={p.nombre:<25} | {resp_str}"
            )
            if p.codigo in codigos_vistos:
                print(f"  ❌ DUPLICADO detectado: codigo='{p.codigo}' aparece más de una vez!")
                ok = False
            codigos_vistos[p.codigo] = p.id

        print()
        if ok:
            print("✅ Sin duplicados. Verificación completada con éxito.")
            print("   Reiniciar el servidor aplicará la corrección al endpoint.")
        else:
            print("❌ Aún existen duplicados. Revise manualmente.")


if __name__ == "__main__":
    fix_inventario()
