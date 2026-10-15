"""
Escuela GSB — falencias detectadas en la evaluación AD-FR-06 y módulos didácticos.

Las falencias se calculan al vuelo (no hay tabla): ítems con calificación 1 o 2
en la evaluación del JEFE de evaluaciones en estado "completado". Este router
solo lee evaluaciones_desempeno; no modifica el flujo de evaluación.

Acceso (sin require_seccion, que deja pasar a cualquier superadmin):
  - /falencias: exclusivamente usuarios con encargado_escuela.
  - /mi-formacion: cualquier usuario autenticado, solo sus propias falencias.
  - /modulos/{clave}: la encargada, o quien tenga una falencia con ese módulo.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.escuela_modulos import (
    CALIFICACIONES_FALENCIA,
    FAMILIA_POR_PLANTILLA,
    catalogo_items,
    clave_modulo,
    registro_modulos,
)
from app.core.security import get_current_user
from app.database import get_db
from app.models.evaluacion_desempeno import EvaluacionDesempeno
from app.models.usuario import Usuario
from app.schemas.escuela import (
    FalenciaResponse,
    MiFormacionResponse,
    ModuloResponse,
    ModuloResumen,
)

router = APIRouter(prefix="/escuela", tags=["Escuela GSB"])

_SIN_MODULO = "Sin módulo"
_MODULO_DISPONIBLE = "Módulo disponible"


def get_encargado_escuela(
    current_user: Annotated[Usuario, Depends(get_current_user)],
) -> Usuario:
    if not current_user.encargado_escuela:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo la encargada de la Escuela GSB puede consultar las falencias.",
        )
    return current_user


def _detectar_falencias(db: Session, usuario_id: Optional[int] = None) -> list[FalenciaResponse]:
    stmt = (
        select(
            EvaluacionDesempeno.id,
            EvaluacionDesempeno.usuario_evaluado_id,
            EvaluacionDesempeno.plantilla,
            EvaluacionDesempeno.evaluacion,
            EvaluacionDesempeno.evaluacion_enviada_en,
            Usuario.nombre,
        )
        .join(Usuario, Usuario.id == EvaluacionDesempeno.usuario_evaluado_id)
        .where(
            EvaluacionDesempeno.estado == "completado",
            EvaluacionDesempeno.plantilla.in_(list(FAMILIA_POR_PLANTILLA)),
        )
        .order_by(EvaluacionDesempeno.evaluacion_enviada_en.desc(), Usuario.nombre)
    )
    if usuario_id is not None:
        stmt = stmt.where(EvaluacionDesempeno.usuario_evaluado_id == usuario_id)

    catalogo = catalogo_items()
    modulos = registro_modulos()
    falencias: list[FalenciaResponse] = []

    for eval_id, uid, plantilla, evaluacion, enviada_en, nombre in db.execute(stmt):
        items = catalogo.get(plantilla, {})
        for numero, dato in (evaluacion or {}).items():
            try:
                calificacion = int((dato or {}).get("calificacion"))
            except (TypeError, ValueError):
                continue
            if calificacion not in CALIFICACIONES_FALENCIA:
                continue
            clave = clave_modulo(plantilla, numero)
            disponible = clave in modulos
            falencias.append(FalenciaResponse(
                evaluacion_id=eval_id,
                usuario_id=uid,
                trabajador=nombre,
                plantilla=plantilla,
                item_numero=numero,
                item_texto=items.get(numero, f"Ítem {numero}"),
                calificacion=calificacion,
                fecha=enviada_en,
                clave_modulo=clave,
                modulo_disponible=disponible,
                estado_modulo=_MODULO_DISPONIBLE if disponible else _SIN_MODULO,
            ))
    return falencias


@router.get("/falencias", response_model=list[FalenciaResponse])
def listar_falencias(
    current_user: Annotated[Usuario, Depends(get_encargado_escuela)],
    db: Annotated[Session, Depends(get_db)],
    usuario_id: Optional[int] = Query(default=None),
    plantilla: Optional[str] = Query(default=None),
):
    """Panel de solo consulta de la encargada de la Escuela."""
    falencias = _detectar_falencias(db, usuario_id)
    if plantilla:
        falencias = [f for f in falencias if f.plantilla == plantilla]
    return falencias


@router.get("/mi-formacion", response_model=MiFormacionResponse)
def mi_formacion(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Falencias del propio usuario y los módulos disponibles para ellas."""
    falencias = _detectar_falencias(db, current_user.id)
    modulos = registro_modulos()
    claves = dict.fromkeys(f.clave_modulo for f in falencias if f.modulo_disponible)
    return MiFormacionResponse(
        falencias=falencias,
        modulos=[
            ModuloResumen(clave=c, titulo=str(modulos[c].get("titulo") or c))
            for c in claves
        ],
    )


@router.get("/modulos/{clave}", response_model=ModuloResponse)
def obtener_modulo(
    clave: str,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    modulo = registro_modulos().get(clave)
    if not modulo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Módulo no encontrado.")

    if not current_user.encargado_escuela:
        propias = {f.clave_modulo for f in _detectar_falencias(db, current_user.id)}
        if clave not in propias:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Este módulo no corresponde a tus falencias.",
            )
    return ModuloResponse(clave=clave, contenido=modulo)
