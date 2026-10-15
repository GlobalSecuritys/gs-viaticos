from datetime import date, datetime
import json
import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.evaluacion_desempeno import (
    EvaluacionCompromiso,
    EvaluacionConfigCapa,
    EvaluacionDesempeno,
    EvaluacionPeriodoTecnico,
    EvaluacionTecnicoCapa,
    EvaluacionTecnicoResumen,
)
from app.models.configuracion_general import ConfiguracionGeneral
from app.models.log_auditoria import LogAuditoria
from app.models.usuario import Usuario
from app.schemas.evaluacion_tecnicos import (
    CapaBorradorUpdate,
    CapaEnviarSubmit,
    CapaItemResponse,
    CierreEvaluacionSubmit,
    ConfigCapaResponse,
    ConfigCapaUpdate,
    EvaluacionTecnicoDetailResponse,
    EvaluacionTecnicoListItem,
    PeriodoCreate,
    PeriodoResponse,
    PeriodoUpdate,
    ResumenResponse,
    TituloPanelResponse,
    TituloPanelUpdate,
)

router = APIRouter(prefix="/evaluaciones-tecnicos", tags=["Evaluación de Técnicos AD-FR-35"])

_PILAR_CORREO = "pilaradmin@gsbank.com"
_CRITERIOS_ADFR35 = [
    "1.1", "1.2", "1.3", "1.4", "1.5",
    "2.1", "2.2", "2.3", "2.4", "2.5",
    "3.1",
]
_CAPAS_VALIDAS = ("auto", "viaticos", "asistente_oper")
_CLAVE_TITULO_PANEL = "titulo_panel_tecnicos"
_TITULO_PANEL_DEFAULT = "Evaluacion de Tecnicos Contratistas"

# Umbrales únicos de nivel de desempeño
UMBRALES_NIVEL = [
    (1.0, "MUY BUENO"),
    (0.70, "BUENO"),
    (0.40, "ACEPTABLE"),
    (0.0, "DEFICIENTE"),
]


def _determinar_nivel(porcentaje: float) -> str:
    for umbral, etiqueta in UMBRALES_NIVEL:
        if porcentaje >= umbral - 1e-9:
            return etiqueta
    return "DEFICIENTE"


def _determinar_resultado(calificacion_final: float) -> str:
    return "APRUEBA" if (calificacion_final >= 3.0 - 1e-9) else "NO APRUEBA"


def _correo_lower(u: Usuario) -> str:
    return (u.correo or "").lower().strip()


def _es_pilar_o_admin(u: Usuario) -> bool:
    return u.rol == "superadmin" or _correo_lower(u) == _PILAR_CORREO


def _registrar_auditoria_tecnico(
    db: Session,
    actor: Usuario,
    accion: str,
    detalle: str,
    usuario_objetivo: Optional[Usuario] = None,
) -> None:
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
    except Exception:
        pass


def _obtener_config_capas_dict(db: Session) -> dict[str, Optional[int]]:
    stmt = select(EvaluacionConfigCapa)
    rows = db.scalars(stmt).all()
    config = {"viaticos": None, "asistente_oper": None}
    for r in rows:
        config[r.capa] = r.usuario_id
    return config


def _verificar_permiso_capa(
    capa: str,
    evaluacion: EvaluacionDesempeno,
    current_user: Usuario,
    config_capas: dict[str, Optional[int]],
) -> bool:
    """Verifica si current_user tiene potestad para editar/enviar esta capa."""
    if _es_pilar_o_admin(current_user):
        return True
    if capa == "auto":
        return current_user.id == evaluacion.usuario_evaluado_id
    if capa == "viaticos":
        return config_capas.get("viaticos") == current_user.id
    if capa == "asistente_oper":
        return config_capas.get("asistente_oper") == current_user.id
    return False


# ── 1. CONFIGURACIÓN DE EVALUADORAS DE CAPAS ────────────────────────────────
@router.get("/configuracion-capas", response_model=list[ConfigCapaResponse])
def obtener_configuracion_capas(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Retorna la configuración de evaluadoras asignadas a viaticos y asistente_oper."""
    stmt = select(EvaluacionConfigCapa).order_by(EvaluacionConfigCapa.id.asc())
    rows = db.scalars(stmt).all()

    # Asegurar que existan ambas capas en BD
    existentes = {r.capa: r for r in rows}
    modificado = False
    for c in ("viaticos", "asistente_oper"):
        if c not in existentes:
            nueva = EvaluacionConfigCapa(capa=c, usuario_id=None)
            db.add(nueva)
            modificado = True
    if modificado:
        db.commit()
        rows = db.scalars(stmt).all()

    resultado = []
    for r in rows:
        u = db.get(Usuario, r.usuario_id) if r.usuario_id else None
        resultado.append(
            ConfigCapaResponse(
                id=r.id,
                capa=r.capa,
                usuario_id=r.usuario_id,
                usuario_nombre=u.nombre if u else None,
                usuario_correo=u.correo if u else None,
                actualizado_en=r.actualizado_en,
            )
        )
    return resultado


@router.put("/configuracion-capas", response_model=ConfigCapaResponse)
def actualizar_configuracion_capa(
    payload: ConfigCapaUpdate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Pilar o superadmin asignan el usuario evaluador de una capa."""
    if not _es_pilar_o_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo la Dirección Administrativa puede configurar las evaluadoras de capa.",
        )

    if payload.usuario_id:
        target_u = db.get(Usuario, payload.usuario_id)
        if not target_u:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario asignado no encontrado.")
    else:
        target_u = None

    stmt = select(EvaluacionConfigCapa).where(EvaluacionConfigCapa.capa == payload.capa)
    config = db.scalar(stmt)
    if not config:
        config = EvaluacionConfigCapa(
            capa=payload.capa,
            usuario_id=payload.usuario_id,
            actualizado_por_id=current_user.id,
        )
        db.add(config)
    else:
        config.usuario_id = payload.usuario_id
        config.actualizado_por_id = current_user.id
        config.actualizado_en = datetime.utcnow()

    _registrar_auditoria_tecnico(
        db,
        actor=current_user,
        accion="configuracion_capa_actualizada",
        detalle=f"Capa '{payload.capa}' asignada a usuario_id={payload.usuario_id} ({target_u.nombre if target_u else 'Sin asignar'})",
        usuario_objetivo=target_u,
    )

    db.commit()
    db.refresh(config)

    return ConfigCapaResponse(
        id=config.id,
        capa=config.capa,
        usuario_id=config.usuario_id,
        usuario_nombre=target_u.nombre if target_u else None,
        usuario_correo=target_u.correo if target_u else None,
        actualizado_en=config.actualizado_en,
    )


# ── 2. GESTIÓN DE PERIODOS SEMESTRALES ──────────────────────────────────────
@router.get("/periodos", response_model=list[PeriodoResponse])
def listar_periodos(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Lista todos los periodos semestrales de evaluación técnica."""
    stmt = select(EvaluacionPeriodoTecnico).order_by(EvaluacionPeriodoTecnico.id.desc())
    periodos = db.scalars(stmt).all()

    res = []
    for p in periodos:
        total = db.scalar(
            select(func.count(EvaluacionDesempeno.id)).where(EvaluacionDesempeno.periodo_id == p.id)
        )
        p_res = PeriodoResponse.model_validate(p)
        p_res.total_evaluaciones = total or 0
        res.append(p_res)
    return res


@router.post("/periodos", response_model=PeriodoResponse)
def abrir_periodo(
    payload: PeriodoCreate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Pilar abre un periodo semestral.
    Crea las filas de EvaluacionDesempeno para todos los técnicos activos con sus 3 capas en blanco.
    """
    if not _es_pilar_o_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo la Dirección Administrativa puede abrir nuevos periodos de evaluación.",
        )

    nombre = payload.nombre.strip()
    stmt_exist = select(EvaluacionPeriodoTecnico).where(
        func.lower(EvaluacionPeriodoTecnico.nombre) == nombre.lower()
    )
    if db.scalar(stmt_exist):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un periodo registrado con el nombre '{nombre}'.",
        )

    # Crear periodo
    periodo = EvaluacionPeriodoTecnico(
        nombre=nombre,
        activo=True,
        creado_por_id=current_user.id,
    )
    db.add(periodo)
    db.flush()

    # Buscar técnicos activos
    stmt_tecnicos = select(Usuario).where(
        Usuario.rol == "tecnico",
        Usuario.activo.is_(True),
    )
    tecnicos = db.scalars(stmt_tecnicos).all()

    for t in tecnicos:
        eval_reg = EvaluacionDesempeno(
            usuario_evaluado_id=t.id,
            plantilla="tecnico_adfr35",
            cargo="TECNICO CONTRATISTA",
            fecha=date.today(),
            periodo_id=periodo.id,
            estado="pendiente",
        )
        db.add(eval_reg)
        db.flush()

        # Crear las 3 capas en blanco (borrador)
        for c in _CAPAS_VALIDAS:
            capa_reg = EvaluacionTecnicoCapa(
                evaluacion_id=eval_reg.id,
                capa=c,
                respuestas={},
                estado="borrador",
                version=1,
            )
            db.add(capa_reg)

    _registrar_auditoria_tecnico(
        db,
        actor=current_user,
        accion="periodo_abierto",
        detalle=f"Periodo '{nombre}' abierto con {len(tecnicos)} técnicos inicializados.",
    )

    db.commit()
    db.refresh(periodo)

    res = PeriodoResponse.model_validate(periodo)
    res.total_evaluaciones = len(tecnicos)
    return res


@router.put("/periodos/{periodo_id}", response_model=PeriodoResponse)
def renombrar_periodo(
    periodo_id: int,
    payload: PeriodoUpdate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Pilar o superadmin cambian el nombre visible de un periodo."""
    if not _es_pilar_o_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No autorizado.")

    periodo = db.get(EvaluacionPeriodoTecnico, periodo_id)
    if not periodo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Periodo no encontrado.")

    nombre = payload.nombre.strip()
    duplicado = db.scalar(
        select(EvaluacionPeriodoTecnico.id).where(
            func.lower(EvaluacionPeriodoTecnico.nombre) == nombre.lower(),
            EvaluacionPeriodoTecnico.id != periodo_id,
        )
    )
    if duplicado:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un periodo registrado con el nombre '{nombre}'.",
        )

    anterior = periodo.nombre
    periodo.nombre = nombre
    _registrar_auditoria_tecnico(
        db,
        actor=current_user,
        accion="periodo_renombrado",
        detalle=f"Periodo '{anterior}' → '{nombre}'.",
    )
    db.commit()
    db.refresh(periodo)

    res = PeriodoResponse.model_validate(periodo)
    res.total_evaluaciones = db.scalar(
        select(func.count(EvaluacionDesempeno.id)).where(EvaluacionDesempeno.periodo_id == periodo.id)
    ) or 0
    return res


@router.get("/titulo-panel", response_model=TituloPanelResponse)
def obtener_titulo_panel(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Título visible del panel AD-FR-35 (editable por Pilar / superadmin)."""
    valor = db.scalar(
        select(ConfiguracionGeneral.valor).where(ConfiguracionGeneral.clave == _CLAVE_TITULO_PANEL)
    )
    return TituloPanelResponse(titulo=valor or _TITULO_PANEL_DEFAULT)


@router.put("/titulo-panel", response_model=TituloPanelResponse)
def actualizar_titulo_panel(
    payload: TituloPanelUpdate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if not _es_pilar_o_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No autorizado.")

    titulo = payload.titulo.strip()
    config = db.get(ConfiguracionGeneral, _CLAVE_TITULO_PANEL)
    anterior = config.valor if config else _TITULO_PANEL_DEFAULT
    if config:
        config.valor = titulo
        config.actualizado_por_id = current_user.id
    else:
        db.add(ConfiguracionGeneral(
            clave=_CLAVE_TITULO_PANEL, valor=titulo, actualizado_por_id=current_user.id
        ))
    _registrar_auditoria_tecnico(
        db,
        actor=current_user,
        accion="titulo_panel_tecnicos_actualizado",
        detalle=f"'{anterior}' → '{titulo}'.",
    )
    db.commit()
    return TituloPanelResponse(titulo=titulo)


@router.post("/periodos/{periodo_id}/agregar-tecnico/{usuario_id}", response_model=EvaluacionTecnicoListItem)
def agregar_tecnico_a_periodo(
    periodo_id: int,
    usuario_id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Permite a Pilar agregar un técnico a un periodo ya abierto."""
    if not _es_pilar_o_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No autorizado.")

    periodo = db.get(EvaluacionPeriodoTecnico, periodo_id)
    if not periodo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Periodo no encontrado.")

    tecnico = db.get(Usuario, usuario_id)
    if not tecnico or tecnico.rol != "tecnico":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El usuario especificado no es un técnico válido.")

    stmt_exist = select(EvaluacionDesempeno).where(
        EvaluacionDesempeno.periodo_id == periodo.id,
        EvaluacionDesempeno.usuario_evaluado_id == tecnico.id,
    )
    existente = db.scalar(stmt_exist)
    if existente:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El técnico ya se encuentra incluido en este periodo.")

    eval_reg = EvaluacionDesempeno(
        usuario_evaluado_id=tecnico.id,
        plantilla="tecnico_adfr35",
        cargo="TECNICO CONTRATISTA",
        fecha=date.today(),
        periodo_id=periodo.id,
        estado="pendiente",
    )
    db.add(eval_reg)
    db.flush()

    for c in _CAPAS_VALIDAS:
        capa_reg = EvaluacionTecnicoCapa(
            evaluacion_id=eval_reg.id,
            capa=c,
            respuestas={},
            estado="borrador",
            version=1,
        )
        db.add(capa_reg)

    db.commit()
    db.refresh(eval_reg)

    return EvaluacionTecnicoListItem(
        id=eval_reg.id,
        usuario_evaluado_id=tecnico.id,
        tecnico_nombre=tecnico.nombre,
        tecnico_cedula=getattr(tecnico, "cedula", None),
        tecnico_correo=tecnico.correo,
        cargo=eval_reg.cargo,
        periodo_id=periodo.id,
        periodo_nombre=periodo.nombre,
        estado=eval_reg.estado,
        estado_auto="borrador",
        estado_viaticos="borrador",
        estado_asistente_oper="borrador",
    )


# ── 3. LISTADO Y DETALLE DE EVALUACIONES TÉCNICAS ─────────────────────────────
@router.get("/listado", response_model=list[EvaluacionTecnicoListItem])
def listar_evaluaciones_tecnicos(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    periodo_id: Optional[int] = None,
):
    """
    Lista las evaluaciones del periodo.
    - Pilar / Superadmin: ve todos los técnicos con estados de las 3 capas.
    - Evaluadoras asignadas: ven los técnicos del periodo con el estado de su propia capa.
    - Técnico: solo ve su propia fila.
    """
    config_capas = _obtener_config_capas_dict(db)
    es_admin = _es_pilar_o_admin(current_user)
    es_eval_viaticos = (config_capas.get("viaticos") == current_user.id)
    es_eval_asistente = (config_capas.get("asistente_oper") == current_user.id)
    es_tecnico = (current_user.rol == "tecnico")

    if not (es_admin or es_eval_viaticos or es_eval_asistente or es_tecnico):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para acceder a las evaluaciones de técnicos.",
        )

    # Determinar periodo a consultar (el especificado o el último activo)
    target_periodo_id = periodo_id
    if not target_periodo_id:
        stmt_p = select(EvaluacionPeriodoTecnico.id).order_by(
            EvaluacionPeriodoTecnico.activo.desc(),
            EvaluacionPeriodoTecnico.id.desc(),
        ).limit(1)
        target_periodo_id = db.scalar(stmt_p)

    if not target_periodo_id:
        return []

    stmt = select(EvaluacionDesempeno).where(
        EvaluacionDesempeno.periodo_id == target_periodo_id,
        EvaluacionDesempeno.plantilla == "tecnico_adfr35",
    )
    if es_tecnico and not es_admin:
        stmt = stmt.where(EvaluacionDesempeno.usuario_evaluado_id == current_user.id)

    evaluaciones = db.scalars(stmt).all()
    periodo = db.get(EvaluacionPeriodoTecnico, target_periodo_id)

    resultado = []
    for ev in evaluaciones:
        tecnico = db.get(Usuario, ev.usuario_evaluado_id)
        if not tecnico:
            continue

        # Estados de capas
        capas_stmt = select(EvaluacionTecnicoCapa).where(EvaluacionTecnicoCapa.evaluacion_id == ev.id)
        capas_rows = db.scalars(capas_stmt).all()
        mapa_capas = {cr.capa: cr.estado for cr in capas_rows}

        # Snapshot si existe
        resumen_stmt = select(EvaluacionTecnicoResumen).where(EvaluacionTecnicoResumen.evaluacion_id == ev.id)
        resumen = db.scalar(resumen_stmt)

        item = EvaluacionTecnicoListItem(
            id=ev.id,
            usuario_evaluado_id=tecnico.id,
            tecnico_nombre=tecnico.nombre,
            tecnico_cedula=getattr(tecnico, "cedula", None),
            tecnico_correo=tecnico.correo,
            cargo=ev.cargo,
            periodo_id=target_periodo_id,
            periodo_nombre=periodo.nombre if periodo else None,
            estado=ev.estado,
            estado_auto=mapa_capas.get("auto", "pendiente"),
            estado_viaticos=mapa_capas.get("viaticos", "pendiente"),
            estado_asistente_oper=mapa_capas.get("asistente_oper", "pendiente"),
            calificacion_final=resumen.calificacion_final if resumen else None,
            resultado=resumen.resultado if resumen else None,
        )
        resultado.append(item)

    return resultado


@router.get("/evaluacion/{evaluacion_id}", response_model=EvaluacionTecnicoDetailResponse)
def obtener_detalle_evaluacion(
    evaluacion_id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Retorna el detalle completo de una evaluación técnica según permisos:
    - Técnico evaluado: solo ve 'auto' hasta que estado sea 'completado'.
    - Evaluadora: solo ve su capa asignada mientras estado != 'completado'.
    - Pilar / Superadmin: ve todas las capas en todo momento.
    """
    evaluacion = db.get(EvaluacionDesempeno, evaluacion_id)
    if not evaluacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada.")

    if evaluacion.plantilla != "tecnico_adfr35":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta evaluación no corresponde al formato AD-FR-35.")

    config_capas = _obtener_config_capas_dict(db)
    es_admin = _es_pilar_o_admin(current_user)
    es_propietario = (current_user.id == evaluacion.usuario_evaluado_id)
    es_eval_viaticos = (config_capas.get("viaticos") == current_user.id)
    es_eval_asistente = (config_capas.get("asistente_oper") == current_user.id)

    if not (es_admin or es_propietario or es_eval_viaticos or es_eval_asistente):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene autorización para consultar esta evaluación técnica.",
        )

    tecnico = db.get(Usuario, evaluacion.usuario_evaluado_id)
    periodo = db.get(EvaluacionPeriodoTecnico, evaluacion.periodo_id) if evaluacion.periodo_id else None

    # Consultar capas
    capas_stmt = select(EvaluacionTecnicoCapa).where(EvaluacionTecnicoCapa.evaluacion_id == evaluacion.id)
    capas_rows = db.scalars(capas_stmt).all()
    mapa_filas = {cr.capa: cr for cr in capas_rows}

    # Filtrar capas visibles según reglas de aislamiento
    capas_visibles = {}
    puede_editar = []

    for c in _CAPAS_VALIDAS:
        cr = mapa_filas.get(c)
        if not cr:
            continue

        # ¿Puede ver esta capa?
        visible = False
        if es_admin or evaluacion.estado == "completado":
            visible = True
        elif c == "auto" and es_propietario:
            visible = True
        elif c == "viaticos" and es_eval_viaticos:
            visible = True
        elif c == "asistente_oper" and es_eval_asistente:
            visible = True

        if visible:
            enviado_por_u = db.get(Usuario, cr.enviado_por_id) if cr.enviado_por_id else None
            capas_visibles[c] = CapaItemResponse(
                id=cr.id,
                capa=cr.capa,
                respuestas=cr.respuestas or {},
                observacion=cr.observacion,
                estado=cr.estado,
                enviado_en=cr.enviado_en,
                enviado_por_id=cr.enviado_por_id,
                enviado_por_nombre=enviado_por_u.nombre if enviado_por_u else None,
                version=cr.version,
            )

        # ¿Puede editar esta capa?
        if cr.estado == "borrador" and evaluacion.estado != "completado":
            if c == "auto" and (es_propietario or es_admin):
                puede_editar.append(c)
            elif c == "viaticos" and (es_eval_viaticos or es_admin):
                puede_editar.append(c)
            elif c == "asistente_oper" and (es_eval_asistente or es_admin):
                puede_editar.append(c)

    # Resumen si completado o si es admin
    resumen_data = None
    if evaluacion.estado == "completado" or es_admin:
        resumen_stmt = select(EvaluacionTecnicoResumen).where(EvaluacionTecnicoResumen.evaluacion_id == evaluacion.id)
        res_row = db.scalar(resumen_stmt)
        if res_row:
            cerrador_u = db.get(Usuario, res_row.cerrado_por_id) if res_row.cerrado_por_id else None
            resumen_data = ResumenResponse(
                id=res_row.id,
                evaluacion_id=res_row.evaluacion_id,
                calificacion_auto=res_row.calificacion_auto,
                calificacion_viaticos=res_row.calificacion_viaticos,
                calificacion_asistente_oper=res_row.calificacion_asistente_oper,
                calificacion_final=res_row.calificacion_final,
                porcentaje=res_row.porcentaje,
                nivel=res_row.nivel,
                resultado=res_row.resultado,
                observacion_final=res_row.observacion_final,
                cerrado_por_id=res_row.cerrado_por_id,
                cerrado_por_nombre=cerrador_u.nombre if cerrador_u else None,
                cerrado_en=res_row.cerrado_en,
            )

    return EvaluacionTecnicoDetailResponse(
        id=evaluacion.id,
        usuario_evaluado_id=evaluacion.usuario_evaluado_id,
        tecnico_nombre=tecnico.nombre if tecnico else "Técnico",
        tecnico_cedula=getattr(tecnico, "cedula", None),
        tecnico_correo=tecnico.correo if tecnico else "",
        cargo=evaluacion.cargo,
        fecha=evaluacion.fecha,
        periodo_id=evaluacion.periodo_id,
        periodo_nombre=periodo.nombre if periodo else None,
        estado=evaluacion.estado,
        nombre_evaluador=evaluacion.nombre_evaluador,
        capas=capas_visibles,
        resumen=resumen_data,
        puede_editar_capas=puede_editar,
    )


# ── 4. GUARDADO DE BORRADOR Y ENVÍO DE CAPA ──────────────────────────────────
@router.put("/evaluacion/{evaluacion_id}/capa/{capa}", response_model=CapaItemResponse)
def guardar_borrador_capa(
    evaluacion_id: int,
    capa: str,
    payload: CapaBorradorUpdate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Guarda borrador de una capa con control de concurrencia optimista (version).
    Solo la persona autorizada para esa capa puede guardar.
    """
    if capa not in _CAPAS_VALIDAS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Capa '{capa}' no válida.")

    evaluacion = db.get(EvaluacionDesempeno, evaluacion_id)
    if not evaluacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada.")

    if evaluacion.estado == "completado":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La evaluación está completada y en solo lectura.")

    config_capas = _obtener_config_capas_dict(db)
    if not _verificar_permiso_capa(capa, evaluacion, current_user, config_capas):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos para modificar esta capa.")

    stmt = select(EvaluacionTecnicoCapa).where(
        EvaluacionTecnicoCapa.evaluacion_id == evaluacion_id,
        EvaluacionTecnicoCapa.capa == capa,
    )
    capa_row = db.scalar(stmt)
    if not capa_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de capa no encontrado.")

    if capa_row.estado == "enviado":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta capa ya fue enviada y se encuentra en solo lectura.")

    # Control de concurrencia optimista
    if capa_row.version != payload.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflicto de concurrencia: la información fue modificada por otro proceso. Recargue la página.",
        )

    capa_row.respuestas = payload.respuestas
    capa_row.observacion = payload.observacion
    capa_row.version = capa_row.version + 1
    capa_row.actualizado_en = datetime.utcnow()

    db.commit()
    db.refresh(capa_row)

    return CapaItemResponse(
        id=capa_row.id,
        capa=capa_row.capa,
        respuestas=capa_row.respuestas,
        observacion=capa_row.observacion,
        estado=capa_row.estado,
        enviado_en=capa_row.enviado_en,
        enviado_por_id=capa_row.enviado_por_id,
        version=capa_row.version,
    )


@router.post("/evaluacion/{evaluacion_id}/capa/{capa}/enviar", response_model=CapaItemResponse)
def enviar_capa(
    evaluacion_id: int,
    capa: str,
    payload: CapaEnviarSubmit,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Envía definitivamente una capa.
    Valida:
    - 11 criterios presentes (1 a 4 o 'N/A').
    - Al menos un criterio numérico (no se admite que todos sean N/A).
    - La capa no esté ya enviada.
    - Concurrencia optimista con version (409).
    Actualiza el estado general de la evaluación:
    - Primer envío -> 'en_evaluacion'.
    - 3 capas enviadas -> 'listo_para_cierre'.
    """
    if capa not in _CAPAS_VALIDAS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Capa '{capa}' no válida.")

    evaluacion = db.get(EvaluacionDesempeno, evaluacion_id)
    if not evaluacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada.")

    if evaluacion.estado == "completado":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La evaluación está completada.")

    config_capas = _obtener_config_capas_dict(db)
    if not _verificar_permiso_capa(capa, evaluacion, current_user, config_capas):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos para enviar esta capa.")

    stmt = select(EvaluacionTecnicoCapa).where(
        EvaluacionTecnicoCapa.evaluacion_id == evaluacion_id,
        EvaluacionTecnicoCapa.capa == capa,
    )
    capa_row = db.scalar(stmt)
    if not capa_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de capa no encontrado.")

    if capa_row.estado == "enviado":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta capa ya fue enviada previamente.")

    if capa_row.version != payload.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflicto de concurrencia: la capa fue actualizada previamente. Recargue antes de enviar.",
        )

    # Validar que los 11 criterios existan
    enviados = payload.respuestas
    faltantes = [c for c in _CRITERIOS_ADFR35 if c not in enviados or enviados[c] is None or str(enviados[c]).strip() == ""]
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Faltan {len(faltantes)} criterios por responder en la capa '{capa}': {', '.join(sorted(faltantes))}",
        )

    # Validar valores permitidos y que haya al menos un numérico
    numericos = []
    for c in _CRITERIOS_ADFR35:
        val = str(enviados[c]).strip().upper()
        if val in ("N/A", "NA"):
            continue
        try:
            num = float(val)
            if num not in (1.0, 2.0, 3.0, 4.0):
                raise ValueError()
            numericos.append(num)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El valor '{enviados[c]}' para el criterio {c} no es válido. Debe ser 1, 2, 3, 4 o N/A.",
            )

    if not numericos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La capa no puede contener exclusivamente valores 'N/A'. Debe incluir al menos una calificación numérica.",
        )

    ahora = datetime.utcnow()
    capa_row.respuestas = payload.respuestas
    capa_row.observacion = payload.observacion
    capa_row.estado = "enviado"
    capa_row.enviado_en = ahora
    capa_row.enviado_por_id = current_user.id
    capa_row.version = capa_row.version + 1
    capa_row.actualizado_en = ahora

    # Verificar estados de las demás capas para actualizar evaluacion.estado
    todas_capas = db.scalars(
        select(EvaluacionTecnicoCapa).where(EvaluacionTecnicoCapa.evaluacion_id == evaluacion_id)
    ).all()

    enviadas_count = sum(1 for c in todas_capas if (c.estado == "enviado" or c.id == capa_row.id))
    if enviadas_count == 3:
        evaluacion.estado = "listo_para_cierre"
    elif evaluacion.estado == "pendiente":
        evaluacion.estado = "en_evaluacion"

    tecnico = db.get(Usuario, evaluacion.usuario_evaluado_id)
    _registrar_auditoria_tecnico(
        db,
        actor=current_user,
        accion="capa_enviada",
        detalle=f"Capa '{capa}' enviada para la evaluación #{evaluacion.id} de {tecnico.nombre if tecnico else 'técnico'}.",
        usuario_objetivo=tecnico,
    )

    db.commit()
    db.refresh(capa_row)

    return CapaItemResponse(
        id=capa_row.id,
        capa=capa_row.capa,
        respuestas=capa_row.respuestas,
        observacion=capa_row.observacion,
        estado=capa_row.estado,
        enviado_en=capa_row.enviado_en,
        enviado_por_id=capa_row.enviado_por_id,
        enviado_por_nombre=current_user.nombre,
        version=capa_row.version,
    )


# ── 5. CIERRE DE EVALUACIÓN (EXCLUSIVO DE PILAR) ──────────────────────────────
@router.post("/evaluacion/{evaluacion_id}/cerrar", response_model=ResumenResponse)
def cerrar_evaluacion_tecnico(
    evaluacion_id: int,
    payload: CierreEvaluacionSubmit,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Cierre formal de la evaluación técnica por parte de Pilar.
    - Requiere las 3 capas en estado 'enviado'.
    - Requiere observación final obligatoria.
    - Calcula promedios por área sin redondear, final, porcentaje, nivel y resultado.
    - Guarda snapshot en evaluaciones_tecnicos_resumen.
    - Actualiza EvaluacionDesempeno (estado='completado', nombre_evaluador='PILAR ARISTIZABAL GIL').
    - Inicializa EvaluacionCompromiso en estado 'abierto' (8 compromisos) para reutilizar módulo existente.
    """
    if not _es_pilar_o_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo la Dirección Administrativa (Pilar) tiene autorización para cerrar la evaluación de técnicos.",
        )

    evaluacion = db.get(EvaluacionDesempeno, evaluacion_id)
    if not evaluacion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada.")

    if evaluacion.estado == "completado":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La evaluación ya se encuentra cerrada y completada.")

    obs_final = payload.observacion_final.strip()
    if not obs_final:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La observación final de la Dirección Administrativa es obligatoria para cerrar la evaluación.",
        )

    # Verificar que las 3 capas estén enviadas
    capas = db.scalars(
        select(EvaluacionTecnicoCapa).where(EvaluacionTecnicoCapa.evaluacion_id == evaluacion_id)
    ).all()
    mapa_capas = {c.capa: c for c in capas}

    for c in _CAPAS_VALIDAS:
        if c not in mapa_capas or mapa_capas[c].estado != "enviado":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No se puede cerrar la evaluación: la capa '{c.upper()}' aún no ha sido enviada.",
            )

    # Cálculos exactos según Especificación §5
    promedios_area = {}
    for c in _CAPAS_VALIDAS:
        resp = mapa_capas[c].respuestas or {}
        nums = []
        for crit in _CRITERIOS_ADFR35:
            val = str(resp.get(crit, "")).strip().upper()
            if val not in ("N/A", "NA", ""):
                nums.append(float(val))
        if not nums:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"La capa {c} no tiene valores numéricos válidos.")
        promedios_area[c] = sum(nums) / len(nums)

    c_auto = promedios_area["auto"]
    c_viaticos = promedios_area["viaticos"]
    c_asistente = promedios_area["asistente_oper"]

    # Calificación final = promedio de las 3 calificaciones por área (promedio de promedios)
    calificacion_final = (c_auto + c_viaticos + c_asistente) / 3.0
    porcentaje = calificacion_final / 4.0
    nivel = _determinar_nivel(porcentaje)
    resultado = _determinar_resultado(calificacion_final)

    ahora = datetime.utcnow()

    # Guardar o actualizar snapshot en evaluaciones_tecnicos_resumen
    stmt_res = select(EvaluacionTecnicoResumen).where(EvaluacionTecnicoResumen.evaluacion_id == evaluacion_id)
    resumen_reg = db.scalar(stmt_res)
    if not resumen_reg:
        resumen_reg = EvaluacionTecnicoResumen(
            evaluacion_id=evaluacion_id,
            calificacion_auto=c_auto,
            calificacion_viaticos=c_viaticos,
            calificacion_asistente_oper=c_asistente,
            calificacion_final=calificacion_final,
            porcentaje=porcentaje,
            nivel=nivel,
            resultado=resultado,
            observacion_final=obs_final,
            cerrado_por_id=current_user.id,
            cerrado_en=ahora,
        )
        db.add(resumen_reg)
    else:
        resumen_reg.calificacion_auto = c_auto
        resumen_reg.calificacion_viaticos = c_viaticos
        resumen_reg.calificacion_asistente_oper = c_asistente
        resumen_reg.calificacion_final = calificacion_final
        resumen_reg.porcentaje = porcentaje
        resumen_reg.nivel = nivel
        resumen_reg.resultado = resultado
        resumen_reg.observacion_final = obs_final
        resumen_reg.cerrado_por_id = current_user.id
        resumen_reg.cerrado_en = ahora

    # Actualizar estado del padre en evaluaciones_desempeno
    evaluacion.estado = "completado"
    evaluacion.nombre_evaluador = "PILAR ARISTIZABAL GIL"
    evaluacion.fecha = date.today()

    # Inicializar fila de compromisos para que funcione el módulo existente de compromisos
    stmt_comp = select(EvaluacionCompromiso).where(EvaluacionCompromiso.evaluacion_id == evaluacion.id)
    comp_reg = db.scalar(stmt_comp)
    if not comp_reg:
        comp_reg = EvaluacionCompromiso(
            evaluacion_id=evaluacion.id,
            compromisos=[""] * 8,
            estado="abierto",
            nombre_evaluador="PILAR ARISTIZABAL GIL",
            version=1,
        )
        db.add(comp_reg)

    tecnico = db.get(Usuario, evaluacion.usuario_evaluado_id)
    _registrar_auditoria_tecnico(
        db,
        actor=current_user,
        accion="evaluacion_cerrada",
        detalle=f"Evaluación #{evaluacion.id} de {tecnico.nombre if tecnico else 'técnico'} cerrada por Pilar. Calificación: {calificacion_final:.2f} ({resultado})",
        usuario_objetivo=tecnico,
    )

    db.commit()
    db.refresh(resumen_reg)

    return ResumenResponse(
        id=resumen_reg.id,
        evaluacion_id=resumen_reg.evaluacion_id,
        calificacion_auto=resumen_reg.calificacion_auto,
        calificacion_viaticos=resumen_reg.calificacion_viaticos,
        calificacion_asistente_oper=resumen_reg.calificacion_asistente_oper,
        calificacion_final=resumen_reg.calificacion_final,
        porcentaje=resumen_reg.porcentaje,
        nivel=resumen_reg.nivel,
        resultado=resumen_reg.resultado,
        observacion_final=resumen_reg.observacion_final,
        cerrado_por_id=resumen_reg.cerrado_por_id,
        cerrado_por_nombre=current_user.nombre,
        cerrado_en=resumen_reg.cerrado_en,
    )
