from datetime import date, datetime
import json
import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.evaluacion_desempeno import EvaluacionCompromiso, EvaluacionDesempeno
from app.models.log_auditoria import LogAuditoria
from app.models.usuario import Usuario
from app.schemas.evaluacion_desempeno import (
    AutoevaluacionSubmit,
    CompromisosResponse,
    CompromisosUpdate,
    EvaluacionDesempenoResponse,
    EvaluacionSubmit,
)

router = APIRouter(prefix="/evaluaciones-desempeno", tags=["Evaluación de Desempeño"])

# ── Constantes de acceso ─────────────────────────────────────────────────────
# Pilar administra y evalúa a todos los colaboradores internos
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


def get_current_evaluacion_usuario(
    current_user: Annotated[Usuario, Depends(get_current_user)]
) -> Usuario:
    """
    Permite acceso a:
    - superadmin / evaluador_externo  (acceso completo o evaluación de Pilar)
    - tecnico                         (solo su propia autoevaluación y compromisos)
    """
    if current_user.rol not in ("superadmin", "evaluador_externo", "tecnico"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para acceder al módulo de evaluación de desempeño.",
        )
    return current_user


def _correo_lower(usuario: Usuario) -> str:
    return (usuario.correo or "").lower().strip()


def _es_pilar(usuario: Usuario) -> bool:
    return _correo_lower(usuario) == _PILAR_CORREO


def _es_evaluador_externo(usuario: Usuario) -> bool:
    return usuario.rol == "evaluador_externo"


def _es_tecnico(usuario: Usuario) -> bool:
    """True si el usuario es un técnico de planta (rol='tecnico')."""
    return usuario.rol == "tecnico"


def _plantilla_por_correo(usuario: Usuario) -> Optional[str]:
    """Devuelve la plantilla asignada a este correo, o None si no tiene asignada."""
    return _CORREO_PLANTILLA.get(_correo_lower(usuario))


def _es_evaluado_restringido(usuario: Usuario) -> bool:
    """True si el usuario solo puede ver/enviar SU PROPIA autoevaluación.

    Cubre dos grupos:
    1. Administrativos con correo en _CORREO_PLANTILLA (Yeimy, Luisa, Claudia…)
    2. Técnicos de planta (rol='tecnico') — plantilla resuelta por rol, no por correo.
    """
    return _correo_lower(usuario) in _CORREO_PLANTILLA or _es_tecnico(usuario)


def _plantilla_para_usuario(usuario: Usuario) -> Optional[str]:
    """Resuelve la plantilla de un usuario evaluado restringido.

    - Técnicos: plantilla 'tecnico' (sin consultar BD, solo por rol).
    - Administrativos con correo hardcodeado: desde _CORREO_PLANTILLA.
    """
    if _es_tecnico(usuario):
        return "tecnico"
    return _plantilla_por_correo(usuario)


def _registrar_auditoria(
    db: Session,
    actor: Usuario,
    accion: str,
    detalle: str,
    usuario_objetivo: Optional[Usuario] = None,
) -> None:
    """Escribe una entrada en logs_auditoria de forma no bloqueante (best-effort)."""
    try:
        log = LogAuditoria(
            actor_id=actor.id,
            actor_nombre=actor.nombre,
            actor_rol=actor.rol,
            usuario_objetivo_id=usuario_objetivo.id if usuario_objetivo else None,
            usuario_objetivo_nombre=usuario_objetivo.nombre if usuario_objetivo else None,
            accion=accion,
            detalle=detalle,
            resultado="ok",
        )
        db.add(log)
        # No commit aquí — se consolida junto con la transacción principal
    except Exception:
        pass  # El log nunca debe bloquear la operación real


def _get_pilar_user_id(db: Session) -> Optional[int]:
    stmt = select(Usuario.id).where(func.lower(func.trim(Usuario.correo)) == _PILAR_CORREO)
    return db.scalar(stmt)


# ── 1. Consultar evaluación del usuario ──────────────────────────────────────
@router.get("/mi-evaluacion", response_model=Optional[EvaluacionDesempenoResponse])
def obtener_mi_evaluacion(
    current_admin: Annotated[Usuario, Depends(get_current_evaluacion_usuario)],
    db: Annotated[Session, Depends(get_db)],
    plantilla: Optional[str] = None,
    usuario_evaluado_id: Optional[int] = None,
):
    """
    Devuelve la evaluación de desempeño.

    Reglas de seguridad:
    - Evaluador externo: SOLO puede consultar la evaluación de Pilar (directivos).
    - Evaluados restringidos (Yeimy, operaciones): solo pueden consultar su propia fila.
    - Pilar: puede consultar cualquier evaluado pasando usuario_evaluado_id.
    """
    pilar_id = _get_pilar_user_id(db)

    # 1. Caso Evaluador Externo
    if _es_evaluador_externo(current_admin):
        if not pilar_id:
            return None
        if usuario_evaluado_id and usuario_evaluado_id != pilar_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El evaluador externo únicamente tiene autorización para consultar la evaluación de la Dirección Administrativa.",
            )
        target_user_id = pilar_id
        target_plantilla = "directivos"
    # 2. Caso Evaluado Restringido (administrativos por correo + tecnicos por rol)
    elif _es_evaluado_restringido(current_admin):
        target_user_id = current_admin.id
        target_plantilla = _plantilla_para_usuario(current_admin) or "operaciones"
    # 3. Caso Pilar consultando a otro evaluado
    elif usuario_evaluado_id and usuario_evaluado_id != current_admin.id:
        if not _es_pilar(current_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para consultar evaluaciones de otros usuarios.",
            )
        target_user_id = usuario_evaluado_id
        target_plantilla = plantilla or "operaciones"
    # 4. Caso propio (Pilar u otro usuario)
    else:
        target_user_id = current_admin.id
        target_plantilla = plantilla or _plantilla_por_correo(current_admin) or "directivos"

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
    current_admin: Annotated[Usuario, Depends(get_current_evaluacion_usuario)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Registra el paso de Autoevaluación.
    El usuario evaluado siempre es el del token.
    El evaluador externo no tiene autoevaluación propia.
    """
    if _es_evaluador_externo(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta de evaluador externo no diligencia autoevaluación propia.",
        )

    plantilla_esperada = _plantilla_para_usuario(current_admin)
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
        else "TECNICO DE PLANTA" if target_plantilla == "tecnico"
        else "DIRECTORA ADMINSITRATIVA "
    )
    fecha_reg = payload.fecha or date.today()

    if not evaluacion_reg:
        evaluacion_reg = EvaluacionDesempeno(
            usuario_evaluado_id=current_admin.id,
            plantilla=target_plantilla,
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

    # Registro en auditoría para técnicos
    if _es_tecnico(current_admin) or _es_evaluado_restringido(current_admin):
        _registrar_auditoria(
            db,
            actor=current_admin,
            accion="autoevaluacion_enviada",
            detalle=f"Plantilla '{target_plantilla}' — evaluacion_id={evaluacion_reg.id}",
            usuario_objetivo=current_admin,
        )
        db.commit()

    return evaluacion_reg


# ── 3. Enviar Evaluación del Jefe/Evaluador ──────────────────────────────────
@router.post("/evaluacion", response_model=EvaluacionDesempenoResponse)
def enviar_evaluacion_jefe(
    payload: EvaluacionSubmit,
    current_admin: Annotated[Usuario, Depends(get_current_evaluacion_usuario)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Registra el paso de Evaluación por parte del jefe/evaluador.
    - Pilar evalúa a los colaboradores internos.
    - El evaluador externo evalúa exclusivamente a Pilar.
    - Al completarse, crea automáticamente la sección independiente de compromisos en estado 'abierto'.
    """
    pilar_id = _get_pilar_user_id(db)
    target_plantilla = payload.plantilla or "directivos"
    target_user_id = payload.usuario_evaluado_id if payload.usuario_evaluado_id is not None else current_admin.id

    # Los técnicos no pueden enviar la evaluación del jefe (solo autoevaluación)
    if _es_tecnico(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Los técnicos solo pueden diligenciar su autoevaluación. La evaluación del jefe la realiza la Dirección Administrativa.",
        )

    # Validar permisos según quién evalúa a quién:
    if target_user_id == pilar_id:
        # Pilar como evaluada: puede ser evaluada por el evaluador externo o por Pilar misma
        if not (_es_evaluador_externo(current_admin) or _es_pilar(current_admin)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el evaluador externo asignado (o la Dirección) puede evaluar este perfil.",
            )
    else:
        # Colaboradores evaluados: SOLO Pilar puede evaluarlos
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

    evaluado_user = db.get(Usuario, target_user_id)
    if evaluado_user:
        plantilla_esperada = _plantilla_para_usuario(evaluado_user)
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
    ahora = datetime.utcnow()

    evaluacion_reg.evaluacion = eval_data
    evaluacion_reg.nombre_evaluador = nombre_eval
    evaluacion_reg.evaluacion_enviada_por_id = current_admin.id
    evaluacion_reg.evaluacion_enviada_en = ahora
    evaluacion_reg.estado = "completado"

    # Creación automática de la sección de compromisos independiente si no existe aún
    stmt_comp = select(EvaluacionCompromiso).where(EvaluacionCompromiso.evaluacion_id == evaluacion_reg.id)
    comp_reg = db.scalar(stmt_comp)
    if not comp_reg:
        comp_reg = EvaluacionCompromiso(
            evaluacion_id=evaluacion_reg.id,
            compromisos=[""] * 8,
            estado="abierto",
            nombre_evaluador=nombre_eval,
            version=1,
        )
        db.add(comp_reg)

    db.commit()
    db.refresh(evaluacion_reg)
    return evaluacion_reg


# ── 4. Endpoints de Sección Independiente de Compromisos ────────────────────
def _verificar_acceso_compromisos(
    evaluacion: EvaluacionDesempeno,
    current_user: Usuario,
    db: Session,
) -> tuple[bool, bool]:
    """
    Retorna (es_evaluado, es_evaluador_autorizado).
    Lanza 403 si el usuario no tiene ninguna relación con la evaluación.
    """
    pilar_id = _get_pilar_user_id(db)
    es_evaluado = (current_user.id == evaluacion.usuario_evaluado_id)

    if evaluacion.usuario_evaluado_id == pilar_id:
        es_evaluador_autorizado = _es_evaluador_externo(current_user) or _es_pilar(current_user)
    else:
        es_evaluador_autorizado = _es_pilar(current_user)

    if not (es_evaluado or es_evaluador_autorizado):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para acceder a los compromisos de esta evaluación.",
        )
    return es_evaluado, es_evaluador_autorizado


@router.get("/compromisos/{evaluacion_id}", response_model=CompromisosResponse)
def obtener_compromisos(
    evaluacion_id: int,
    current_user: Annotated[Usuario, Depends(get_current_evaluacion_usuario)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Obtiene los compromisos de una evaluación completada.
    Habilitado para evaluador y evaluado.
    """
    evaluacion = db.get(EvaluacionDesempeno, evaluacion_id)
    if not evaluacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada.")

    if evaluacion.estado != "completado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La sección de compromisos solo se habilita cuando la evaluación está completada.",
        )

    _, es_evaluador = _verificar_acceso_compromisos(evaluacion, current_user, db)

    stmt = select(EvaluacionCompromiso).where(EvaluacionCompromiso.evaluacion_id == evaluacion_id)
    comp_reg = db.scalar(stmt)
    if not comp_reg:
        comp_reg = EvaluacionCompromiso(
            evaluacion_id=evaluacion.id,
            compromisos=[""] * 8,
            estado="abierto",
            nombre_evaluador=evaluacion.nombre_evaluador,
            version=1,
        )
        db.add(comp_reg)
        db.commit()
        db.refresh(comp_reg)

    res = CompromisosResponse.model_validate(comp_reg)
    res.puede_editar = (comp_reg.estado == "abierto")
    res.puede_cerrar = (comp_reg.estado == "abierto" and es_evaluador)
    return res


@router.put("/compromisos/{evaluacion_id}", response_model=CompromisosResponse)
def guardar_compromisos(
    evaluacion_id: int,
    payload: CompromisosUpdate,
    current_user: Annotated[Usuario, Depends(get_current_evaluacion_usuario)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Guarda los compromisos con control de concurrencia optimista (version).
    Evaluador y evaluado pueden guardar mientras el estado sea 'abierto'.
    Si otra persona guardó antes (versión desactualizada), responde 409 Conflict.
    """
    evaluacion = db.get(EvaluacionDesempeno, evaluacion_id)
    if not evaluacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada.")

    if evaluacion.estado != "completado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La sección de compromisos solo admite ediciones en evaluaciones completadas.",
        )

    _, es_evaluador = _verificar_acceso_compromisos(evaluacion, current_user, db)

    stmt_sel = select(EvaluacionCompromiso).where(EvaluacionCompromiso.evaluacion_id == evaluacion_id)
    comp_reg = db.scalar(stmt_sel)
    if not comp_reg:
        comp_reg = EvaluacionCompromiso(
            evaluacion_id=evaluacion.id,
            compromisos=[""] * 8,
            estado="abierto",
            nombre_evaluador=evaluacion.nombre_evaluador,
            version=1,
        )
        db.add(comp_reg)
        db.commit()
        db.refresh(comp_reg)

    if comp_reg.estado != "abierto":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La sección de compromisos está cerrada y se encuentra en modo de solo lectura.",
        )

    # Actualización atómica condicionada a version y estado abierto
    stmt_update = (
        update(EvaluacionCompromiso)
        .where(
            EvaluacionCompromiso.evaluacion_id == evaluacion_id,
            EvaluacionCompromiso.version == payload.version,
            EvaluacionCompromiso.estado == "abierto",
        )
        .values(
            compromisos=payload.compromisos,
            version=EvaluacionCompromiso.version + 1,
            actualizado_en=func.now(),
        )
    )
    result = db.execute(stmt_update)
    db.commit()

    if result.rowcount == 0:
        db.refresh(comp_reg)
        if comp_reg.estado != "abierto":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La sección de compromisos fue cerrada por el evaluador y ya no admite modificaciones.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflicto de concurrencia: la sección fue editada por la otra persona. Por favor recarga para ver los cambios recientes.",
        )

    db.refresh(comp_reg)
    res = CompromisosResponse.model_validate(comp_reg)
    res.puede_editar = (comp_reg.estado == "abierto")
    res.puede_cerrar = (comp_reg.estado == "abierto" and es_evaluador)
    return res


@router.post("/compromisos/{evaluacion_id}/cerrar", response_model=CompromisosResponse)
def cerrar_compromisos(
    evaluacion_id: int,
    current_user: Annotated[Usuario, Depends(get_current_evaluacion_usuario)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Cierra la sección de compromisos.
    Solo el evaluador asignado (Pilar para colaboradores, evaluador externo para Pilar)
    puede cerrar la sección. Queda en solo lectura definitiva.
    """
    evaluacion = db.get(EvaluacionDesempeno, evaluacion_id)
    if not evaluacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada.")

    if evaluacion.estado != "completado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La evaluación debe estar completada para cerrar la sección de compromisos.",
        )

    _, es_evaluador = _verificar_acceso_compromisos(evaluacion, current_user, db)

    if not es_evaluador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el evaluador asignado tiene la potestad de cerrar la sección de compromisos.",
        )

    stmt_sel = select(EvaluacionCompromiso).where(EvaluacionCompromiso.evaluacion_id == evaluacion_id)
    comp_reg = db.scalar(stmt_sel)
    if not comp_reg:
        comp_reg = EvaluacionCompromiso(
            evaluacion_id=evaluacion.id,
            compromisos=[""] * 8,
            estado="abierto",
            nombre_evaluador=evaluacion.nombre_evaluador,
            version=1,
        )
        db.add(comp_reg)
        db.flush()

    if comp_reg.estado == "cerrado":
        res = CompromisosResponse.model_validate(comp_reg)
        res.puede_editar = False
        res.puede_cerrar = False
        return res

    comp_reg.estado = "cerrado"
    comp_reg.cerrado_por_id = current_user.id
    comp_reg.cerrado_en = datetime.utcnow()
    comp_reg.version = comp_reg.version + 1

    # Registro en auditoría (técnicos y administrativos evaluados)
    evaluado_user = db.get(Usuario, evaluacion.usuario_evaluado_id)
    _registrar_auditoria(
        db,
        actor=current_user,
        accion="compromisos_cerrados",
        detalle=f"Evaluación ID {evaluacion.id} — compromisos cerrados definitivamente",
        usuario_objetivo=evaluado_user,
    )

    db.commit()
    db.refresh(comp_reg)

    res = CompromisosResponse.model_validate(comp_reg)
    res.puede_editar = False
    res.puede_cerrar = False
    return res
