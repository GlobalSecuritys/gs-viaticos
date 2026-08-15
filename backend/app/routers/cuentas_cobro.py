import json
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.cuenta_cobro import CuentaCobro
from app.models.usuario import Usuario
from app.schemas.cuenta_cobro import (
    CuentaCobroCreate,
    CuentaCobroResponse,
)

router = APIRouter(prefix="/cuentas-cobro", tags=["Cuentas de Cobro"])


@router.post("", response_model=CuentaCobroResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=CuentaCobroResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def crear_cuenta_cobro(
    cuenta_in: CuentaCobroCreate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    if not cuenta_in.autorizacion_datos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe autorizar el uso de sus datos bancarios para enviar la cuenta de cobro."
        )

    # Convertir lista de Pydantic items a string JSON para almacenamiento
    items_json = json.dumps([item.model_dump(mode="json") for item in cuenta_in.items])

    nueva_cuenta = CuentaCobro(
        usuario_id=current_user.id,
        fecha=cuenta_in.fecha,
        ciudad=cuenta_in.ciudad,
        tipo_identificacion=cuenta_in.tipo_identificacion,
        identificacion=cuenta_in.identificacion,
        concepto_servicio=cuenta_in.concepto_servicio,
        items=items_json,
        total=cuenta_in.total,
        banco=cuenta_in.banco,
        tipo_cuenta=cuenta_in.tipo_cuenta,
        numero_cuenta=cuenta_in.numero_cuenta,
        titular_nombre=cuenta_in.titular_nombre,
        titular_cedula=cuenta_in.titular_cedula,
        titular_celular=cuenta_in.titular_celular,
        autorizacion_datos=cuenta_in.autorizacion_datos,
        estado="pendiente"
    )
    db.add(nueva_cuenta)
    db.commit()
    db.refresh(nueva_cuenta)

    return nueva_cuenta


@router.get("", response_model=List[CuentaCobroResponse])
@router.get("/", response_model=List[CuentaCobroResponse], include_in_schema=False)
def listar_cuentas_cobro(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    if current_user.rol in ["admin", "superadmin"]:
        stmt = select(CuentaCobro).order_by(CuentaCobro.created_at.desc())
    else:
        stmt = (
            select(CuentaCobro)
            .where(CuentaCobro.usuario_id == current_user.id)
            .order_by(CuentaCobro.created_at.desc())
        )
    res = db.execute(stmt).scalars().all()
    return res


@router.get("/{id}", response_model=CuentaCobroResponse)
def obtener_cuenta_cobro(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    if current_user.rol in ["admin", "superadmin"]:
        stmt = select(CuentaCobro).where(CuentaCobro.id == id)
    else:
        stmt = select(CuentaCobro).where(CuentaCobro.id == id, CuentaCobro.usuario_id == current_user.id)
    
    cuenta = db.scalar(stmt)
    if not cuenta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cuenta de cobro no encontrada"
        )
    return cuenta
