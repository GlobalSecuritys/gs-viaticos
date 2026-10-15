"""
Escuela GSB — falencias detectadas en la evaluación AD-FR-06 y módulos didácticos.

Las falencias se calculan al vuelo (no hay tabla): ítems con calificación 1 o 2
en la evaluación del JEFE de evaluaciones en estado "completado". Este router
solo lee evaluaciones_desempeno; no modifica el flujo de evaluación.

Acceso (sin require_seccion, que deja pasar a cualquier superadmin):
  - /falencias: exclusivamente usuarios con encargado_escuela.
  - /mi-formacion: cualquier usuario autenticado, solo sus propias falencias.
  - /modulos/{clave}: la encargada, o quien tenga una falencia con ese módulo.
  - /estudiantes...: exclusivamente encargado_escuela (fichas y material académico).

Estudiantes: usuarios activos con rol superadmin (Administrativos) o tecnico
(Técnicos), excepto las cuentas solo_inventario y la propia encargada.
"""
from datetime import datetime
from typing import Annotated, Optional

from cloudinary.exceptions import Error as CloudinaryError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.escuela_modulos import (
    CALIFICACIONES_FALENCIA,
    FAMILIA_POR_PLANTILLA,
    catalogo_items,
    clave_modulo,
    registro_modulos,
)
from app.core.escuela_archivos import (
    eliminar_material,
    enlace_firmado,
    subir_material,
)
from app.core.security import get_current_user
from app.database import get_db
from app.models.escuela_archivo import EscuelaArchivoEstudiante
from app.models.evaluacion_desempeno import EvaluacionDesempeno
from app.models.usuario import Usuario
from app.schemas.escuela import (
    ArchivoEstudianteResponse,
    EnlaceDescargaResponse,
    EstudianteResumen,
    FalenciaResponse,
    FichaEstudianteResponse,
    MiFormacionResponse,
    ModuloResponse,
    ModuloResumen,
)
from app.services.auditoria import registrar_auditoria

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


# ── Estudiantes y material académico (solo encargada) ───────────────────────
_GRUPO_POR_ROL = {"superadmin": "administrativos", "tecnico": "tecnicos"}


def _filtro_estudiantes(encargada: Usuario):
    return (
        Usuario.activo.is_(True),
        Usuario.solo_inventario.is_(False),
        Usuario.rol.in_(list(_GRUPO_POR_ROL)),
        Usuario.id != encargada.id,
    )


def _resumen(u: Usuario, falencias: list[FalenciaResponse], total_archivos: int) -> dict:
    return dict(
        id=u.id,
        nombre=u.nombre,
        correo=u.correo,
        grupo=_GRUPO_POR_ROL[u.rol],
        total_falencias=len(falencias),
        peor_calificacion=min((f.calificacion for f in falencias), default=None),
        total_archivos=total_archivos,
    )


def _obtener_estudiante(db: Session, encargada: Usuario, estudiante_id: int) -> Usuario:
    estudiante = db.scalar(
        select(Usuario).where(Usuario.id == estudiante_id, *_filtro_estudiantes(encargada))
    )
    if not estudiante:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado.")
    return estudiante


def _obtener_archivo(db: Session, estudiante_id: int, archivo_id: int) -> EscuelaArchivoEstudiante:
    archivo = db.get(EscuelaArchivoEstudiante, archivo_id)
    if not archivo or archivo.estudiante_id != estudiante_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado.")
    return archivo


@router.get("/estudiantes", response_model=list[EstudianteResumen])
def listar_estudiantes(
    current_user: Annotated[Usuario, Depends(get_encargado_escuela)],
    db: Annotated[Session, Depends(get_db)],
):
    """Una fila por estudiante con conteos; sin archivos ni URLs."""
    estudiantes = db.scalars(
        select(Usuario).where(*_filtro_estudiantes(current_user)).order_by(Usuario.nombre)
    ).all()
    archivos = dict(db.execute(
        select(EscuelaArchivoEstudiante.estudiante_id, func.count(EscuelaArchivoEstudiante.id))
        .group_by(EscuelaArchivoEstudiante.estudiante_id)
    ).all())
    por_usuario: dict[int, list[FalenciaResponse]] = {}
    for f in _detectar_falencias(db):
        por_usuario.setdefault(f.usuario_id, []).append(f)
    return [
        EstudianteResumen(**_resumen(u, por_usuario.get(u.id, []), archivos.get(u.id, 0)))
        for u in estudiantes
    ]


@router.get("/estudiantes/{estudiante_id}", response_model=FichaEstudianteResponse)
def ficha_estudiante(
    estudiante_id: int,
    current_user: Annotated[Usuario, Depends(get_encargado_escuela)],
    db: Annotated[Session, Depends(get_db)],
):
    """Ficha bajo demanda: falencias del estudiante y metadatos de su material."""
    estudiante = _obtener_estudiante(db, current_user, estudiante_id)
    falencias = _detectar_falencias(db, estudiante.id)
    archivos = db.scalars(
        select(EscuelaArchivoEstudiante)
        .where(EscuelaArchivoEstudiante.estudiante_id == estudiante.id)
        .order_by(EscuelaArchivoEstudiante.subido_en.desc())
    ).all()
    return FichaEstudianteResponse(
        **_resumen(estudiante, falencias, len(archivos)),
        falencias=falencias,
        archivos=[ArchivoEstudianteResponse.model_validate(a) for a in archivos],
    )


@router.post("/estudiantes/{estudiante_id}/archivos", response_model=ArchivoEstudianteResponse)
async def subir_archivo_estudiante(
    estudiante_id: int,
    current_user: Annotated[Usuario, Depends(get_encargado_escuela)],
    db: Annotated[Session, Depends(get_db)],
    archivo: UploadFile = File(...),
    descripcion: Optional[str] = Form(default=None, max_length=300),
):
    estudiante = _obtener_estudiante(db, current_user, estudiante_id)
    subido = await subir_material(archivo, estudiante.id)

    registro = EscuelaArchivoEstudiante(
        estudiante_id=estudiante.id,
        nombre_original=subido.nombre_original,
        descripcion=(descripcion or "").strip() or None,
        extension=subido.extension,
        tipo_mime=subido.tipo_mime,
        tamano_bytes=subido.tamano_bytes,
        cloudinary_public_id=subido.public_id,
        cloudinary_resource_type=subido.resource_type,
        subido_por_id=current_user.id,
        subido_por_nombre=current_user.nombre,
    )
    try:
        db.add(registro)
        db.commit()
        db.refresh(registro)
    except Exception:
        db.rollback()
        try:  # no dejar el archivo huérfano en Cloudinary
            eliminar_material(subido.public_id, subido.resource_type)
        except Exception:  # noqa: BLE001
            pass
        raise

    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=estudiante,
        accion="escuela_archivo_subido",
        detalle=f"Material '{registro.nombre_original}' ({registro.tamano_bytes} bytes), archivo #{registro.id}.",
        resultado="exitoso",
    )
    return ArchivoEstudianteResponse.model_validate(registro)


@router.get("/estudiantes/{estudiante_id}/archivos/{archivo_id}/descarga", response_model=EnlaceDescargaResponse)
def descargar_archivo_estudiante(
    estudiante_id: int,
    archivo_id: int,
    current_user: Annotated[Usuario, Depends(get_encargado_escuela)],
    db: Annotated[Session, Depends(get_db)],
):
    """Enlace firmado de Cloudinary que caduca a los 5 minutos."""
    estudiante = _obtener_estudiante(db, current_user, estudiante_id)
    archivo = _obtener_archivo(db, estudiante.id, archivo_id)
    url, expira = enlace_firmado(archivo.cloudinary_public_id, archivo.cloudinary_resource_type, archivo.extension)
    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=estudiante,
        accion="escuela_archivo_descargado",
        detalle=f"Material '{archivo.nombre_original}', archivo #{archivo.id}.",
        resultado="exitoso",
    )
    return EnlaceDescargaResponse(url=url, expira_en=datetime.utcfromtimestamp(expira))


@router.delete("/estudiantes/{estudiante_id}/archivos/{archivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_archivo_estudiante(
    estudiante_id: int,
    archivo_id: int,
    current_user: Annotated[Usuario, Depends(get_encargado_escuela)],
    db: Annotated[Session, Depends(get_db)],
):
    estudiante = _obtener_estudiante(db, current_user, estudiante_id)
    archivo = _obtener_archivo(db, estudiante.id, archivo_id)
    try:
        eliminar_material(archivo.cloudinary_public_id, archivo.cloudinary_resource_type)
    except CloudinaryError:
        # Se conserva la fila para no perder la referencia al archivo.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo eliminar el archivo en el almacenamiento. Intenta nuevamente.",
        )

    nombre, aid = archivo.nombre_original, archivo.id
    db.delete(archivo)
    db.commit()
    registrar_auditoria(
        db,
        actor=current_user,
        usuario_objetivo=estudiante,
        accion="escuela_archivo_eliminado",
        detalle=f"Material '{nombre}', archivo #{aid}.",
        resultado="exitoso",
    )
