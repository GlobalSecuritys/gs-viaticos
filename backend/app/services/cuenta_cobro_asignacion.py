from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cloudinary import upload_cuenta_cobro
from app.models.asignacion import Asignacion
from app.models.cuenta_cobro_asignacion import CuentaCobroAsignacion
from app.models.usuario import Usuario


async def guardar_cuenta_cobro_asignacion(
    db: Session,
    asignacion_id: int,
    current_user: Usuario,
    file: UploadFile,
) -> CuentaCobroAsignacion:
    """
    Valida la asignación y sube la cuenta de cobro digital a Cloudinary,
    asociándola a la asignación y al técnico correspondiente.
    """
    stmt = select(Asignacion).where(Asignacion.id == asignacion_id)
    asignacion = db.scalar(stmt)

    if not asignacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asignación no encontrada.",
        )

    # Validar que pertenezca al técnico autenticado (a menos que sea admin/superadmin)
    if current_user.rol == "tecnico" and asignacion.tecnico_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta asignación no te pertenece.",
        )

    # Subir archivo a Cloudinary
    upload_result = await upload_cuenta_cobro(file)

    # Si ya existe una cuenta de cobro para esta asignación, actualizarla
    stmt_existente = select(CuentaCobroAsignacion).where(
        CuentaCobroAsignacion.asignacion_id == asignacion_id
    )
    cuenta_existente = db.scalar(stmt_existente)

    if cuenta_existente:
        cuenta_existente.secure_url = upload_result.secure_url
        cuenta_existente.public_id = upload_result.public_id
        cuenta_existente.tecnico_id = current_user.id
        db.commit()
        db.refresh(cuenta_existente)
        return cuenta_existente

    nueva_cuenta = CuentaCobroAsignacion(
        asignacion_id=asignacion.id,
        tecnico_id=current_user.id,
        secure_url=upload_result.secure_url,
        public_id=upload_result.public_id,
    )
    db.add(nueva_cuenta)
    db.commit()
    db.refresh(nueva_cuenta)
    return nueva_cuenta
