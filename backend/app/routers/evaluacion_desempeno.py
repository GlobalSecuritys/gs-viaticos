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
        if items:
            return items
    except Exception:
        pass

    # Fallback de seguridad
    if plantilla_id == "contable":
        return {
            "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9",
            "2.1", "2.2",
            "3.1",
            "4.1", "4.2",
            "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8",
        }
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
    plantilla: Optional[str] = None,
    usuario_evaluado_id: Optional[int] = None,
):
    """
    Retorna la evaluación de desempeño para la plantilla indicada.
    Si el usuario es secretaria@gsbsecurity.com, está estrictamente restringido a su propio ID.
    Si otro administrador consulta y proporciona usuario_evaluado_id, se consulta dicho usuario.
    """
    target_plantilla = plantilla
    if not target_plantilla:
        if current_admin.correo and current_admin.correo.lower() == "secretaria@gsbsecurity.com":
            target_plantilla = "contable"
        else:
            target_plantilla = "directivos"

    target_user_id = current_admin.id
    if (
        usuario_evaluado_id
        and current_admin.correo
        and current_admin.correo.lower() != "secretaria@gsbsecurity.com"
    ):
        target_user_id = usuario_evaluado_id

    stmt = (
        select(EvaluacionDesempeno)
        .where(
            EvaluacionDesempeno.usuario_evaluado_id == target_user_id,
            EvaluacionDesempeno.plantilla == target_plantilla,
        )
        .order_by(EvaluacionDesempeno.id.desc())
        .limit(1)
    )
    eval_row = db.scalar(stmt)
    if not eval_row:
        return None

    res = EvaluacionDesempenoResponse.model_validate(eval_row)
    if current_admin.correo and current_admin.correo.lower() == "secretaria@gsbsecurity.com":
        res.evaluacion = None
        res.nombre_evaluador = None
    return res


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
    target_plantilla = payload.plantilla or (
        "contable" if current_admin.correo and current_admin.correo.lower() == "secretaria@gsbsecurity.com" else "directivos"
    )

    items_requeridos = _obtener_items_requeridos(target_plantilla)
    items_enviados = set(payload.autoevaluacion.keys())
    faltantes = items_requeridos - items_enviados
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Faltan {len(faltantes)} ítems por calificar en la autoevaluación ({target_plantilla}): {', '.join(sorted(faltantes))}",
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
            EvaluacionDesempeno.plantilla == target_plantilla,
        )
        .order_by(EvaluacionDesempeno.id.desc())
        .limit(1)
    )
    evaluacion_reg = db.scalar(stmt)

    ahora = datetime.utcnow()
    cargo_default = payload.cargo or (
        "AUXILIAR CONTABLE " if target_plantilla == "contable" else "DIRECTORA ADMINSITRATIVA "
    )
    fecha_reg = payload.fecha or date.today()

    compromisos_limpios = None
    if payload.compromisos is not None:
        compromisos_limpios = [c.strip() for c in payload.compromisos if isinstance(c, str)]

    if not evaluacion_reg:
        evaluacion_reg = EvaluacionDesempeno(
            usuario_evaluado_id=current_admin.id,
            plantilla=target_plantilla,
            cargo=cargo_default,
            fecha=fecha_reg,
            autoevaluacion=auto_data,
            compromisos=compromisos_limpios,
            estado="autoevaluado",
            autoevaluacion_enviada_por_id=current_admin.id,
            autoevaluacion_enviada_en=ahora,
        )
        db.add(evaluacion_reg)
    else:
        evaluacion_reg.autoevaluacion = auto_data
        evaluacion_reg.cargo = cargo_default
        evaluacion_reg.fecha = fecha_reg
        if compromisos_limpios is not None:
            evaluacion_reg.compromisos = compromisos_limpios
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
    # Permiso: la cuenta de Yeimy no puede llamar a este endpoint ni para su propia fila
    if current_admin.correo and current_admin.correo.lower() == "secretaria@gsbsecurity.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para enviar la evaluación del jefe.",
        )

    nombre_eval = payload.nombre_evaluador.strip()
    if not nombre_eval:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del evaluador es obligatorio para enviar la evaluación.",
        )

    target_plantilla = payload.plantilla or "directivos"
    target_user_id = payload.usuario_evaluado_id if payload.usuario_evaluado_id is not None else current_admin.id

    items_requeridos = _obtener_items_requeridos(target_plantilla)
    items_enviados = set(payload.evaluacion.keys())
    faltantes = items_requeridos - items_enviados
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Faltan {len(faltantes)} ítems por calificar en la evaluación ({target_plantilla}): {', '.join(sorted(faltantes))}",
        )

    stmt = (
        select(EvaluacionDesempeno)
        .where(
            EvaluacionDesempeno.usuario_evaluado_id == target_user_id,
            EvaluacionDesempeno.plantilla == target_plantilla,
        )
        .order_by(EvaluacionDesempeno.id.desc())
        .limit(1)
    )
    evaluacion_reg = db.scalar(stmt)

    # La evaluación del jefe solo procede si la autoevaluación de ESTE evaluado
    # (usuario_evaluado_id + plantilla) fue realmente ENVIADA: requiere datos de
    # envío registrados (fecha/hora + cuenta), no la mera existencia del JSON.
    if (
        not evaluacion_reg
        or not evaluacion_reg.autoevaluacion
        or not evaluacion_reg.autoevaluacion_enviada_en
        or not evaluacion_reg.autoevaluacion_enviada_por_id
    ):
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
    if compromisos_limpios:
        evaluacion_reg.compromisos = compromisos_limpios
    evaluacion_reg.evaluacion_enviada_por_id = current_admin.id
    evaluacion_reg.evaluacion_enviada_en = ahora
    evaluacion_reg.estado = "completado"

    db.commit()
    db.refresh(evaluacion_reg)
    return evaluacion_reg
