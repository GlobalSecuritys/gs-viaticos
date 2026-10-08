"""Consulta adicional (2): cobertura, ejemplos con montos, auditoría. Solo LECTURA."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from app.database import engine


def q(db, sql):
    return db.execute(text(sql)).fetchall()


with engine.connect() as db:
    print("=== 12) COBERTURA del dato archivado ===")
    print("   con_anticipo>0       =", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas WHERE monto_anticipo > 0;")[0][0])
    print("   con_gastado>0        =", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas WHERE total_gastado > 0;")[0][0])
    print("   con_viaticos>0       =", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas WHERE cantidad_viaticos > 0;")[0][0])
    print("   con_desglose         =", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas WHERE desglose_viaticos IS NOT NULL;")[0][0])
    print("   con_cliente          =", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas WHERE cliente IS NOT NULL AND cliente <> '';")[0][0])
    print("   con_ciudad           =", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas WHERE ciudad IS NOT NULL AND ciudad <> '';")[0][0])
    print("   con_oficina(empresa) =", q(db, "SELECT COUNT(*) FROM estadisticas_asignaciones_archivadas WHERE empresa IS NOT NULL AND empresa <> '';")[0][0])
    print("   estado_legalizacion:", q(db, "SELECT estado_legalizacion, COUNT(*) FROM estadisticas_asignaciones_archivadas GROUP BY estado_legalizacion ORDER BY 2 DESC;"))

    print("\n=== 13) Filas con total_gastado>0 (4) ===")
    cols = ["id","asignacion_id","tecnico_id","cliente","empresa","ciudad","tipo","fecha_inicio","fecha_fin",
            "monto_anticipo","total_gastado","cantidad_viaticos","estado_legalizacion","total_hospedaje",
            "total_transporte","total_alimentacion","total_materiales","total_alquiler_escalera","total_otros"]
    for r in q(db, """
        SELECT id, asignacion_id, tecnico_id, cliente, empresa, ciudad, tipo, fecha_inicio, fecha_fin,
               monto_anticipo, total_gastado, cantidad_viaticos, estado_legalizacion, total_hospedaje,
               total_transporte, total_alimentacion, total_materiales, total_alquiler_escalera, total_otros
        FROM estadisticas_asignaciones_archivadas
        WHERE total_gastado > 0 ORDER BY total_gastado DESC LIMIT 4;
    """):
        for n, v in zip(cols, r):
            print(f"   {n:22}= {v}")
        print("   ", "-" * 55)

    print("\n=== 14) Agregado por oficina (empresa) en archivo ===")
    for r in q(db, """
        SELECT COALESCE(empresa,'(sin oficina)') oficina, COUNT(*), COALESCE(SUM(monto_anticipo),0), COALESCE(SUM(total_gastado),0)
        FROM estadisticas_asignaciones_archivadas GROUP BY 1 ORDER BY 4 DESC;
    """):
        print("  ", r)

    print("\n=== 15) Auditorias de eliminacion (evidencia indirecta del hueco) ===")
    try:
        print("   por accion:", q(db, """
            SELECT accion, COUNT(*) FROM logs_auditoria
            WHERE accion IN ('ELIMINAR_ASIGNACION','eliminar_carpeta_finalizada') GROUP BY accion;
        """))
        print("   detalle por dia:")
        for r in q(db, """
            SELECT to_char(created_at, 'YYYY-MM-DD') f, accion, COUNT(*) FROM logs_auditoria
            WHERE accion IN ('ELIMINAR_ASIGNACION','eliminar_carpeta_finalizada') GROUP BY 1,2 ORDER BY 1;
        """):
            print("  ", r)
    except Exception as e:
        print("   (no disponible)", e)

    print("\n=== 16) Viaticos huerfanos (asignacion_id NULL) ===")
    for r in q(db, """
        SELECT v.id, v.usuario_id, v.fecha, v.valor, v.tipo_gasto FROM viaticos v
        WHERE v.asignacion_id IS NULL ORDER BY v.id LIMIT 10;
    """):
        print("  ", r)