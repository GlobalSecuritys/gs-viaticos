"""
Bitácora de Descargas del módulo de Backup y Respaldo de Comprobantes.

Las anotaciones viven en base de datos y se leen siempre desde ahí, para que
no se pierdan al navegar, recargar o realizar otras acciones en la pantalla.

Ningún endpoint borra filas: ocultar una anotación es un cambio de `estado`.
"""

from datetime import datetime
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database import get_db
from app.models.bitacora_backup import BitacoraBackup
from app.models.usuario import Usuario
from app.schemas.bitacora_backup import (
    BitacoraBackupCompletarResponse,
    BitacoraBackupCrear,
    BitacoraBackupResponse,
)

router = APIRouter(prefix="/admin/bitacora-backup", tags=["Bitácora Backup"])


@router.get("", response_model=List[BitacoraBackupResponse])
def listar_bitacora(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Anotaciones ACTIVAS (estado 'pendiente'), de la más reciente a la más antigua."""
    stmt = (
        select(BitacoraBackup)
        .where(BitacoraBackup.estado == "pendiente")
        .order_by(BitacoraBackup.created_at.desc(), BitacoraBackup.id.desc())
    )
    return db.scalars(stmt).all()


@router.get("/historial", response_model=List[BitacoraBackupResponse])
def listar_historial_bitacora(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Historial COMPLETO, incluidas las anotaciones archivadas. Permite comprobar
    que las anotaciones ocultas siguen existiendo en la base de datos.
    """
    stmt = select(BitacoraBackup).order_by(
        BitacoraBackup.created_at.desc(), BitacoraBackup.id.desc()
    )
    return db.scalars(stmt).all()


@router.post("", response_model=BitacoraBackupResponse, status_code=status.HTTP_201_CREATED)
def crear_anotacion(
    datos: BitacoraBackupCrear,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    texto = datos.texto.strip()
    if not texto:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La anotación no puede estar vacía.",
        )

    anotacion = BitacoraBackup(
        texto=texto,
        estado="pendiente",
        usuario_id=current_admin.id,
        usuario_nombre=current_admin.nombre,
    )
    db.add(anotacion)
    db.commit()
    db.refresh(anotacion)
    return anotacion


@router.post("/completar-pendientes", response_model=BitacoraBackupCompletarResponse)
def completar_pendientes(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Marca como 'completado' todas las anotaciones pendientes: se ejecuta cuando
    se carga un CSV (backup completado). Las filas se conservan en la base de
    datos, solo dejan de mostrarse en la bitácora activa.
    """
    stmt = (
        update(BitacoraBackup)
        .where(BitacoraBackup.estado == "pendiente")
        .values(estado="completado", completado_en=datetime.utcnow())
    )
    resultado = db.execute(stmt)
    db.commit()
    return BitacoraBackupCompletarResponse(completadas=resultado.rowcount or 0)


@router.delete("/{id}", response_model=BitacoraBackupResponse)
def ocultar_anotacion(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Oculta una anotación de la vista activa. NO borra la fila: solo cambia su
    estado a 'eliminado' para conservar la trazabilidad.
    """
    anotacion = db.scalar(select(BitacoraBackup).where(BitacoraBackup.id == id))
    if not anotacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anotación no encontrada",
        )

    anotacion.estado = "eliminado"
    anotacion.completado_en = datetime.utcnow()
    db.commit()
    db.refresh(anotacion)
    return anotacion
