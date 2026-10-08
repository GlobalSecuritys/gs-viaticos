from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status

from app.models.asignacion import Asignacion

# Zona horaria legal de Colombia (UTC-5, sin horario de verano)
COT = ZoneInfo("America/Bogota")


def format_cot_datetime(dt: datetime) -> str:
    """Formatea un datetime a hora legal de Colombia: 'DD/MM/YYYY a las HH:MM p. m.'"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc).astimezone(COT)
    else:
        dt = dt.astimezone(COT)
    p = "a. m." if dt.hour < 12 else "p. m."
    h = dt.hour % 12 or 12
    return f"{dt.strftime('%d/%m/%Y')} a las {h}:{dt.strftime('%M')} {p}"


def obtener_fecha_min_viatico(asignacion: Asignacion) -> date:
    """
    Retorna la fecha mínima permitida para los viáticos de una asignación.
    Los técnicos pueden registrar viáticos desde el día en que se crea la asignación
    (o desde fecha_inicio si ésta fuera anterior).
    """
    if getattr(asignacion, "created_at", None):
        dt = asignacion.created_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc).astimezone(COT)
        else:
            dt = dt.astimezone(COT)
        fecha_creacion = dt.date()
        return min(fecha_creacion, asignacion.fecha_inicio)
    return asignacion.fecha_inicio



def asignacion_abierta(
    asignacion: Asignacion, ahora_cot: datetime | None = None
) -> tuple[bool, str, datetime, bool]:
    """
    Determina si una asignación está abierta para operaciones de viáticos
    (crear, editar, eliminar viáticos o evidencias, y subir cuenta de cobro).

    Regla:
    - Abierta desde su creación hasta 23:59:59 COT de fecha_fin.
    - Si gracia_activada es False (defecto): al cerrarse (expirar fecha_fin o finalizarse),
      el técnico queda bloqueado inmediatamente el mismo día a las 11:59 PM (o al momento de finalizar).
    - Si gracia_activada es True (control explícito admin): se concede un período de gracia de 24 horas
      adicionales tras el cierre efectivo.

    Retorna: (puede_subir: bool, motivo_o_tiempo: str, cierre_cot: datetime, en_periodo_gracia: bool)
    """
    if ahora_cot is None:
        ahora_cot = datetime.now(COT)
    elif ahora_cot.tzinfo is None:
        ahora_cot = ahora_cot.replace(tzinfo=COT)

    estado = (asignacion.estado or "").lower()

    # Límite natural: 23:59:59 COT de fecha_fin
    fin_cot = datetime.combine(asignacion.fecha_fin, datetime.min.time(), tzinfo=COT) + timedelta(
        hours=23, minutes=59, seconds=59
    )

    gracia_activada = getattr(asignacion, "gracia_activada", False) is True

    # 1. Cancelada
    if estado == "cancelada":
        return False, "La asignación se encuentra cancelada.", fin_cot, False

    # 2. Finalizada manualmente por el administrador
    if estado == "finalizada" or asignacion.cerrada_en is not None:
        cierre_efectivo = asignacion.cerrada_en or asignacion.updated_at
        if cierre_efectivo:
            if cierre_efectivo.tzinfo is None:
                cierre_cot = cierre_efectivo.replace(tzinfo=timezone.utc).astimezone(COT)
            else:
                cierre_cot = cierre_efectivo.astimezone(COT)
        else:
            cierre_cot = fin_cot

        if gracia_activada:
            limite_gracia = cierre_cot + timedelta(hours=24)
            if ahora_cot <= limite_gracia:
                delta = limite_gracia - ahora_cot
                h = int(delta.total_seconds() // 3600)
                m = int((delta.total_seconds() % 3600) // 60)
                tiempo_str = f"Período de gracia (quedan {h}h {m}m)" if h > 0 else f"Período de gracia (quedan {m} min)"
                return True, tiempo_str, limite_gracia, True
            else:
                return (
                    False,
                    f"La asignación fue finalizada y el período de gracia de 24 horas concluyó el {format_cot_datetime(limite_gracia)} (hora Colombia).",
                    limite_gracia,
                    False,
                )
        else:
            return (
                False,
                f"La asignación fue finalizada el {format_cot_datetime(cierre_cot)} (hora Colombia).",
                cierre_cot,
                False,
            )

    # 3. Expiró fecha_fin
    if ahora_cot > fin_cot:
        if gracia_activada:
            limite_gracia = fin_cot + timedelta(hours=24)
            if ahora_cot <= limite_gracia:
                delta = limite_gracia - ahora_cot
                h = int(delta.total_seconds() // 3600)
                m = int((delta.total_seconds() % 3600) // 60)
                tiempo_str = f"Período de gracia (quedan {h}h {m}m)" if h > 0 else f"Período de gracia (quedan {m} min)"
                return True, tiempo_str, limite_gracia, True
            else:
                return (
                    False,
                    f"La asignación cerró el {format_cot_datetime(fin_cot)} y el período de gracia de 24 horas concluyó el {format_cot_datetime(limite_gracia)} (hora Colombia).",
                    limite_gracia,
                    False,
                )
        else:
            return (
                False,
                f"La asignación cerró el {format_cot_datetime(fin_cot)} (hora Colombia).",
                fin_cot,
                False,
            )

    # 4. Abierta y vigente
    delta = fin_cot - ahora_cot
    horas_restantes = delta.total_seconds() / 3600.0
    if horas_restantes <= 24:
        h = int(horas_restantes)
        m = int((delta.total_seconds() % 3600) // 60)
        tiempo_str = f"Cierra hoy en {h}h {m}m" if h > 0 else f"Cierra hoy en {m} min"
    else:
        dias = int(horas_restantes // 24)
        tiempo_str = f"Abierta (quedan {dias} día{'s' if dias > 1 else ''})"

    return True, tiempo_str, fin_cot, False


def verificar_asignacion_abierta(asignacion: Asignacion) -> None:
    """Lanza HTTPException 400 con motivo claro en hora Colombia si la asignación no está abierta."""
    abierta, motivo, _, _ = asignacion_abierta(asignacion)
    if not abierta:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=motivo,
        )
