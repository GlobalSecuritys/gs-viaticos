from datetime import date, datetime
import json
import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database import get_db
from app.models.evaluacion_desempeno import EvaluacionDesempeno
from app.models.usuario import Usuario
from app.schemas.evaluacion_desempeno import (
    AutoevaluacionSubmit,
    EvaluacionDesempenoResponse,
    EvaluacionSubmit,
)

router = APIRouter(prefix="/evaluaciones-desempeno", tags=["Evaluación de Desempeño"])

# Cargar plantilla estática para validar ítems requeridos sin consultar la BD
_PLANTILLAS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "plantillas_evaluacion.json")

def _obtener_items_requeridos(plantilla_id: str = "directivos") -> set[str]:
    try:
        with open(_PLANTILLAS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        plantilla = data.get(plantilla_id, {})
        items = set()
        for sec in plantilla.get("secciones", []):
            for it in sec.get("items", []):
                items.add(str(it["numero"]))
        return items
    except Exception:
        # Fallback de seguridad para directivos (25 items)
        return {
            "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9",
            "2.1", "2.2",
            "3.1", "3.2", "3.3",
            "4.1", "4.2", "4.3",
            "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8",
        }


# ── 1. Consultar evaluación del usuario ───────────────────────────────────────
@router.get("/mi-evaluacion", response_model=Optional[EvaluacionDesempenoResponse])
def obtener_mi_evaluacion(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Retorna la evaluación de desempeño del usuario actual para la plantilla 'directivos'.
    Consulta simple directa por índice, sin joins pesados.
    """
    stmt = (
        select(EvaluacionDesempeno)
        .where(
            EvaluacionDesempeno.usuario_evaluado_id == current_admin.id,
            EvaluacionDesempeno.plantilla == "directivos",
        )
        .order_by(EvaluacionDesempeno.id.desc())
        .limit(1)
    )
    return db.scalar(stmt)


# ── 2. Enviar Autoevaluación ──────────────────────────────────────────────────
@router.post("/autoevaluacion", response_model=EvaluacionDesempenoResponse)
def enviar_autoevaluacion(
    payload: AutoevaluacionSubmit,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Registra el paso de Autoevaluación. Valida que todos los ítems de la plantilla
    estén calificados entre 1 y 4. Registra cuenta de envío y fecha/hora.
    """
    items_requeridos = _obtener_items_requeridos("directivos")
    items_enviados = set(payload.autoevaluacion.keys())
    faltantes = items_requeridos - items_enviados
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Faltan {len(faltantes)} ítems por calificar en la autoevaluación: {', '.join(sorted(faltantes))}",
        )

    # Convertir a dict serializable
    auto_data = {
        k: v.model_dump() for k, v in payload.autoevaluacion.items()
    }

    # Buscar si ya existe registro para este usuario y plantilla
    stmt = (
        select(EvaluacionDesempeno)
        .where(
            EvaluacionDesempeno.usuario_evaluado_id == current_admin.id,
            EvaluacionDesempeno.plantilla == "directivos",
        )
        .order_by(EvaluacionDesempeno.id.desc())
        .limit(1)
    )
    evaluacion_reg = db.scalar(stmt)

    ahora = datetime.utcnow()
    cargo_default = payload.cargo or "DIRECTORA ADMINSITRATIVA "
    fecha_reg = payload.fecha or date.today()

    if not evaluacion_reg:
        evaluacion_reg = EvaluacionDesempeno(
            usuario_evaluado_id=current_admin.id,
            plantilla="directivos",
            cargo=cargo_default,
            fecha=fecha_reg,
            autoevaluacion=auto_data,
            estado="autoevaluado",
            autoevaluacion_enviada_por_id=current_admin.id,
            autoevaluacion_enviada_en=ahora,
        )
        db.add(evaluacion_reg)
    else:
        evaluacion_reg.autoevaluacion = auto_data
        evaluacion_reg.cargo = cargo_default
        evaluacion_reg.fecha = fecha_reg
        evaluacion_reg.autoevaluacion_enviada_por_id = current_admin.id
        evaluacion_reg.autoevaluacion_enviada_en = ahora
        if evaluacion_reg.estado == "borrador":
            evaluacion_reg.estado = "autoevaluado"

    db.commit()
    db.refresh(evaluacion_reg)
    return evaluacion_reg


# ── 3. Enviar Evaluación del Jefe/Evaluador ────────────────────────────────────
@router.post("/evaluacion", response_model=EvaluacionDesempenoResponse)
def enviar_evaluacion_jefe(
    payload: EvaluacionSubmit,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Registra el paso de Evaluación por parte del jefe/evaluador.
    Requiere que la autoevaluación ya haya sido enviada y que se indique el nombre del evaluador.
    """
    nombre_eval = payload.nombre_evaluador.strip()
    if not nombre_eval:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del evaluador es obligatorio para enviar la evaluación.",
        )

    items_requeridos = _obtener_items_requeridos("directivos")
    items_enviados = set(payload.evaluacion.keys())
    faltantes = items_requeridos - items_enviados
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Faltan {len(faltantes)} ítems por calificar en la evaluación: {', '.join(sorted(faltantes))}",
        )

    stmt = (
        select(EvaluacionDesempeno)
        .where(
            EvaluacionDesempeno.usuario_evaluado_id == current_admin.id,
            EvaluacionDesempeno.plantilla == "directivos",
        )
        .order_by(EvaluacionDesempeno.id.desc())
        .limit(1)
    )
    evaluacion_reg = db.scalar(stmt)

    if not evaluacion_reg or not evaluacion_reg.autoevaluacion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede enviar la evaluación sin haber completado y enviado previamente la autoevaluación.",
        )

    eval_data = {
        k: v.model_dump() for k, v in payload.evaluacion.items()
    }

    # Limpiar compromisos
    compromisos_limpios = [c.strip() for c in (payload.compromisos or []) if isinstance(c, str)]

    ahora = datetime.utcnow()
    evaluacion_reg.evaluacion = eval_data
    evaluacion_reg.nombre_evaluador = nombre_eval
    evaluacion_reg.compromisos = compromisos_limpios
    evaluacion_reg.evaluacion_enviada_por_id = current_admin.id
    evaluacion_reg.evaluacion_enviada_en = ahora
    evaluacion_reg.estado = "completado"

    db.commit()
    db.refresh(evaluacion_reg)
    return evaluacion_reg
