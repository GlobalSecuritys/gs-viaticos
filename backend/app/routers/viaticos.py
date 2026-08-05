from typing import Annotated, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cloudinary import upload_evidencia_viatico
from app.core.security import get_current_user
from app.database import get_db
from app.models.evidencia_viatico import EvidenciaViatico
from app.models.usuario import Usuario
from app.models.viatico import Viatico
from app.schemas.viatico import (
    EvidenciaResponse,
    ViaticoCreate,
    ViaticoResponse,
    ViaticoUpdate,
)

router = APIRouter(prefix="/viaticos", tags=["Viáticos"])

MIN_EVIDENCIAS = 1
MAX_EVIDENCIAS = 5


# --- Endpoints de viáticos --------------------------------------------------

@router.post("", response_model=ViaticoResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ViaticoResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def crear_viatico(
    viatico_in: ViaticoCreate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    nuevo_viatico = Viatico(
        usuario_id=current_user.id,
        fecha=viatico_in.fecha,
        cliente=viatico_in.cliente,
        ciudad=viatico_in.ciudad,
        ot=viatico_in.ot,
        tipo_gasto=viatico_in.tipo_gasto,
        valor=viatico_in.valor,
        descripcion=viatico_in.descripcion,
        estado="pendiente"
    )
    db.add(nuevo_viatico)
    db.commit()
    db.refresh(nuevo_viatico)
    return nuevo_viatico


@router.get("", response_model=List[ViaticoResponse])
@router.get("/", response_model=List[ViaticoResponse], include_in_schema=False)
def listar_viaticos(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .where(Viatico.usuario_id == current_user.id)
        .order_by(Viatico.created_at.desc())
    )
    viaticos = db.scalars(stmt).all()
    return viaticos


@router.get("/{id}", response_model=ViaticoResponse)
def obtener_viatico(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Viatico).where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado"
        )
    return viatico


@router.put("/{id}", response_model=ViaticoResponse)
def actualizar_viatico(
    id: int,
    viatico_in: ViaticoUpdate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Viatico).where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado"
        )

    if viatico.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden editar viáticos en estado pendiente"
        )

    update_data = viatico_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(viatico, field, value)

    db.commit()
    db.refresh(viatico)
    return viatico


# --- Endpoint: subida de evidencias (Cloudinary) ----------------------------

@router.post(
    "/{id}/evidencias",
    response_model=List[EvidenciaResponse],
    status_code=status.HTTP_201_CREATED,
)
async def subir_evidencias_viatico(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    files: Annotated[List[UploadFile], File(description="Entre 1 y 5 fotografías")],
):
    stmt = select(Viatico).where(Viatico.id == id, Viatico.usuario_id == current_user.id)
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado",
        )

    if viatico.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden adjuntar evidencias a viáticos en estado pendiente",
        )

    evidencias_existentes = len(viatico.evidencias)
    if not (
        MIN_EVIDENCIAS <= evidencias_existentes + len(files) <= MAX_EVIDENCIAS
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El viático puede tener entre {MIN_EVIDENCIAS} y {MAX_EVIDENCIAS} "
                f"fotografías en total. Actualmente tiene {evidencias_existentes} "
                f"y se intentaron agregar {len(files)}."
            ),
        )

    nuevas_evidencias: List[EvidenciaViatico] = []
    for file in files:
        upload_result = await upload_evidencia_viatico(file)
        nuevas_evidencias.append(
            EvidenciaViatico(
                viatico_id=viatico.id,
                secure_url=upload_result.secure_url,
                public_id=upload_result.public_id,
            )
        )

    db.add_all(nuevas_evidencias)
    db.commit()
    for evidencia in nuevas_evidencias:
        db.refresh(evidencia)

    return nuevas_evidencias