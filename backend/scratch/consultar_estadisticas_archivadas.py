"""Consulta real de estadisticas_asignaciones_archivadas y asignaciones.
Solo LECTURA. No expone credenciales (usa config de la app)."""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


def q(db, sql):
    return db.execute(text(sql)).fetchall()


with engine.connect() as db:
    print("=== 1) COLUMNAS de estadisticas_asignaciones_archivadas ===")
    cols = q(db, """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'estadisticas_asignaciones_archivadas'
        ORDER BY ordinal_position;
    """)
    for c in cols:
        print(f"  {c[0]:26} {c[1]:<20} nullable={c[2]}")

    print("\n=== 2) COLUMNAS de asignaciones ===")
    cols = q(db, """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'asignaciones'
        ORDER BY ordinal_position;
    """)
    for c in cols:
        print(f"  {c[0]:26} {c[1]:<20} nullable={c[2]}")

    print("\n=== 3) COUNT(*) estadisticas_asignaciones_archivadas ===")
    print("  ", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas;")[0][0])

    print("\n=== 4) COUNT asignaciones (total / no-eliminada / soft-deleted / finalizadas) ===")
    print("   total        =", q(db, "SELECT COUNT(*) FROM asignaciones;")[0][0])
    print("   no_eliminada =", q(db, "SELECT COUNT(*) FROM asignaciones WHERE eliminado_en IS NULL;")[0][0])
    print("   soft_deleted =", q(db, "SELECT COUNT(*) FROM asignaciones WHERE eliminado_en IS NOT NULL;")[0][0])
    for estado in ("finalizada", "cancelada", "en_curso", "pendiente"):
        print(f"   estado={estado:10} =", q(db, f"SELECT COUNT(*) FROM asignaciones WHERE estado = '{estado}';")[0][0])

    print("\n=== 5) Sumas agregadas en estadisticas ===")
    print("  ", q(db, "SELECT COUNT(*), COALESCE(SUM(monto_anticipo),0), COALESCE(SUM(total_gastado),0), COALESCE(SUM(cantidad_viaticos),0) FROM estadisticas_asignaciones_archivadas;"))

    print("\n=== 6) Fila de ejemplo (3) en estadisticas (todas las columnas) ===")
    rows = q(db, """
        SELECT id, asignacion_id, tecnico_id, creado_por_id, cliente, empresa, ciudad,
               tipo, fecha_inicio, fecha_fin, cerrada_en, descargada_en, eliminada_en,
               eliminada_por_id, monto_anticipo, total_gastado, cantidad_viaticos,
               estado_legalizacion, total_hospedaje, total_transporte, total_alimentacion,
               total_materiales, total_alquiler_escalera, total_otros
        FROM estadisticas_asignaciones_archivadas
        ORDER BY id DESC LIMIT 3;
    """)
    cols_6 = ["id","asignacion_id","tecnico_id","creado_por_id","cliente","empresa","ciudad","tipo",
              "fecha_inicio","fecha_fin","cerrada_en","descargada_en","eliminada_en","eliminada_por_id",
              "monto_anticipo","total_gastado","cantidad_viaticos","estado_legalizacion","total_hospedaje",
              "total_transporte","total_alimentacion","total_materiales","total_alquiler_escalera","total_otros"]
    for r in rows:
        for n, v in zip(cols_6, r):
            print(f"   {n:24}= {v}")
        print("   ", "-" * 50)

    print("\n=== 7) desglose_viaticos de una fila (primera no-nula) ===")
    d = q(db, "SELECT id, desglose_viaticos FROM estadisticas_asignaciones_archivadas WHERE desglose_viaticos IS NOT NULL LIMIT 1;")
    for row in d:
        print(f"   id={row[0]} desglose_viaticos=")
        dv = row[1]
        if isinstance(dv, list):
            for it in dv[:3]:
                print("     ", it)
            print(f"     ... ({len(dv)} viáticos)")

    print("\n=== 8) Agregados de asignaciones NO borradas (fuente principal) ===")
    print("  ", q(db, """
        SELECT COUNT(*),
               COALESCE(SUM(monto_anticipo),0),
               (SELECT COALESCE(SUM(valor),0) FROM viaticos v WHERE v.estado <> 'rechazado' AND v.asignacion_id IS NOT NULL
                AND v.asignacion_id IN (SELECT id FROM asignaciones WHERE eliminado_en IS NULL))
        FROM asignaciones WHERE eliminado_en IS NULL;
    """))

    print("\n=== 9) Totales por tecnico en estadisticas (agrupado) ===")
    for r in q(db, """
        SELECT tecnico_id, COUNT(*), COALESCE(SUM(monto_anticipo),0), COALESCE(SUM(total_gastado),0), COALESCE(SUM(cantidad_viaticos),0)
        FROM estadisticas_asignaciones_archivadas GROUP BY tecnico_id ORDER BY tecnico_id;
    """):
        print("  ", r)

    print("\n=== 10) Viáticos huérfanos (asignacion_id NULL) — señal de purga individual ===")
    print("   huérfanos =", q(db, "SELECT COUNT(*) FROM viaticos WHERE asignacion_id IS NULL;")[0][0])

    print("\n=== 11) Log de auditoria de eliminaciones (evidencia indirecta hueco) ===")
    try:
        rows = q(db, """
            SELECT accion, COUNT(*)
            FROM log_auditoria
            WHERE accion IN ('ELIMINAR_ASIGNACION','eliminar_carpeta_finalizada')
            GROUP BY accion;
        """)
        for r in rows:
            print("  ", r)
    except Exception as e:
        print("   (no disponible)", e)