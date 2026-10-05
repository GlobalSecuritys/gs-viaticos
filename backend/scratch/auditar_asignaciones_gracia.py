import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, r"c:\gs-viaticos\backend")

from app.database import SessionLocal
from app.models.asignacion import Asignacion

COT = ZoneInfo("America/Bogota")
ahora_utc = datetime.utcnow()
ahora_cot = datetime.now(COT)

print(f"Hora actual UTC: {ahora_utc}")
print(f"Hora actual COT: {ahora_cot}")

db = SessionLocal()
try:
    # Buscar asignaciones finalizadas donde cerrada_en >= ahora_utc - 24h o fecha_fin reciente
    asignaciones_finalizadas = db.query(Asignacion).filter(
        Asignacion.estado == "finalizada",
        Asignacion.eliminado_en.is_(None)
    ).all()

    en_gracia = []
    for a in asignaciones_finalizadas:
        fecha_cierre_utc = a.cerrada_en or a.updated_at
        if fecha_cierre_utc:
            limite_utc = fecha_cierre_utc + timedelta(hours=24)
            if limite_utc > ahora_utc:
                en_gracia.append((a, limite_utc))
        else:
            # Fin del día de fecha_fin en COT + 24h
            pass

    print(f"Total asignaciones finalizadas: {len(asignaciones_finalizadas)}")
    print(f"Asignaciones finalizadas hoy en período de gracia de 24h: {len(en_gracia)}")
    for a, lim in en_gracia:
        lim_cot = lim.replace(tzinfo=ZoneInfo("UTC")).astimezone(COT)
        print(f" - Asignación ID: {a.id} | Cliente: {a.cliente} | Técnico ID: {a.tecnico_id} | Cerrada en UTC: {a.cerrada_en} | Límite gracia COT: {lim_cot.strftime('%d/%m/%Y %I:%M %p')}")

finally:
    db.close()
