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

# ── Constantes de acceso ─────────────────────────────────────────────────────
# Solo Pilar puede enviar la evaluación del jefe (para cualquier evaluado)
_PILAR_CORREO = "pilaradmin@gsbank.com"

# Correos que solo pueden ver/enviar SU PROPIA autoevaluación (sin paso del jefe)
# y cuya plantilla se resuelve por correo
_CORREO_PLANTILLA = {
    "secretaria@gsbsecurity.com": "contable",
    "auxiliar.operaciones@gsbsecurity.com": "operaciones",
    "claudia@gsbank.com": "operaciones",
    "asistente@gsbank.com": "operaciones",
    "migueladmin@gsbank.com": "operaciones",
}

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

    # Fallback de seguridad – ítems comunes a contable y operaciones
    if plantilla_id in ("contable", "operaciones"):
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


def _correo_lower(usuario: Usuario) -> str:
    return (usuario.correo or "").lower()


def _es_pilar(usuario: Usuario) -> bool:
    return _correo_lower(usuario) == _PILAR_CORREO


def _plantilla_por_correo(usuario: Usuario) -> Optional[str]:
    """Devuelve la plantilla asignada a este correo, o None si no tiene asignada."""
    return _CORREO_PLANTILLA.get(_correo_lower(usuario))


def _es_evaluado_restringido(usuario: Usuario) -> bool:
    """True si el usuario solo puede ver/enviar SU PROPIA autoevaluación."""
    return _correo_lower(usuario) in _CORREO_PLANTILLA


# ── 1. Consultar evaluación del usuario ──────────────────────────────────────
@router.get("/mi-evaluacion", response_model=Optional[EvaluacionDesempenoResponse])
def obtener_mi_evaluacion(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    plantilla: Optional[str] = None,
    usuario_evaluado_id: Optional[int] = None,
):
    """
    Devuelve la evaluación de desempeño.

    Reglas de seguridad:
    - Los evaluados restringidos (Yeimy, los 4 de operaciones) solo pueden consultar
      su propia fila; el parámetro usuario_evaluado_id es ignorado para ellos.
    - Pilar puede consultar cualquier evaluado pasando usuario_evaluado_id.
    - Otros admin sin plantilla asignada solo ven su propia fila de "directivos".
    """
    correo = _correo_lower(current_admin)

    # Resolver plantilla
    target_plantilla = plantilla or _plantilla_por_correo(current_admin) or "directivos"

    # Resolver usuario evaluado
    if _es_evaluado_restringido(current_admin):
        # Siempre su propio ID; ignorar cualquier parámetro externo
        target_user_id = current_admin.id
    elif usuario_evaluado_id and usuario_evaluado_id != current_admin.id:
        # Solo Pilar puede consultar evaluados ajenos
        if not _es_pilar(current_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para consultar evaluaciones de otros usuarios.",
            )
        target_user_id = usuario_evaluado_id
    else:
        target_user_id = current_admin.id

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

    # Los evaluados restringidos NO reciben el JSON de evaluación del jefe mientras no esté completada
    if _es_evaluado_restringido(current_admin) and eval_row.estado != "completado":
        res.evaluacion = None
        res.nombre_evaluador = None

    return res


# ── 2. Enviar Autoevaluación ─────────────────────────────────────────────────
@router.post("/autoevaluacion", response_model=EvaluacionDesempenoResponse)
def enviar_autoevaluacion(
    payload: AutoevaluacionSubmit,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Registra el paso de Autoevaluación.
    El usuario evaluado siempre es el del token (nunca un parámetro del cliente).
    Valida que todos los ítems de la plantilla estén calificados entre 1 y 4.
    """
    # Validar que la plantilla enviada corresponda al usuario si tiene una asignada
    plantilla_esperada = _plantilla_por_correo(current_admin)
    if plantilla_esperada and payload.plantilla and payload.plantilla != plantilla_esperada:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La plantilla enviada '{payload.plantilla}' no corresponde a su perfil asignado ('{plantilla_esperada}').",
        )
    target_plantilla = plantilla_esperada or payload.plantilla or "directivos"

    items_requeridos = _obtener_items_requeridos(target_plantilla)
    items_enviados = set(payload.autoevaluacion.keys())
    faltantes = items_requeridos - items_enviados
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Faltan {len(faltantes)} ítems por calificar en la autoevaluación ({target_plantilla}): {', '.join(sorted(faltantes))}",
        )

    auto_data = {k: v.model_dump() for k, v in payload.autoevaluacion.items()}

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
        "AUXILIAR CONTABLE " if target_plantilla == "contable"
        else "AUXILIAR DE OPERACIONES" if target_plantilla == "operaciones"
        else "DIRECTORA ADMINSITRATIVA "
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


# ── 3. Enviar Evaluación del Jefe/Evaluador ──────────────────────────────────
@router.post("/evaluacion", response_model=EvaluacionDesempenoResponse)
def enviar_evaluacion_jefe(
    payload: EvaluacionSubmit,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Registra el paso de Evaluación por parte del jefe/evaluador.
    SOLO la cuenta de Pilar (pilaradmin@gsbank.com) puede ejecutar este endpoint.
    Los evaluados restringidos (Yeimy, los 4 de operaciones) son rechazados.
    Requiere que la autoevaluación del evaluado ya haya sido enviada.
    """
    # Solo Pilar puede enviar la evaluación del jefe
    if not _es_pilar(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para enviar la evaluación del jefe. Solo la Dirección Administrativa puede realizar este paso.",
        )

    nombre_eval = payload.nombre_evaluador.strip()
    if not nombre_eval:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del evaluador es obligatorio para enviar la evaluación.",
        )

    target_plantilla = payload.plantilla or "directivos"
    target_user_id = payload.usuario_evaluado_id if payload.usuario_evaluado_id is not None else current_admin.id

    evaluado_user = db.get(Usuario, target_user_id)
    if evaluado_user:
        plantilla_esperada = _plantilla_por_correo(evaluado_user)
        if plantilla_esperada and target_plantilla != plantilla_esperada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La plantilla '{target_plantilla}' no corresponde al perfil asignado del colaborador ('{plantilla_esperada}').",
            )

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

    # Verificar que la autoevaluación fue REALMENTE enviada
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

    eval_data = {k: v.model_dump() for k, v in payload.evaluacion.items()}

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
