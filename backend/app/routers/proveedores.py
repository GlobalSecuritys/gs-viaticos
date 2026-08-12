from typing import Annotated, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.proveedor import Proveedor
from app.models.usuario import Usuario
from pydantic import BaseModel


class ProveedorResponse(BaseModel):
    nit: str
    nombre: str


router = APIRouter(prefix="/proveedores", tags=["Proveedores"])


@router.get("/buscar", response_model=List[ProveedorResponse])
def buscar_proveedores(
    q: Annotated[str, Query(description="Texto a buscar en nit o nombre")] = "",
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Busca proveedores por NIT o nombre de forma case-insensitive.
    Requiere al menos 3 caracteres; si no, devuelve lista vacía.
    Retorna máximo 15 resultados ordenados alfabéticamente por nombre.
    """
    q = q.strip()
    if len(q) < 3:
        return []

    like_expr = f"%{q}%"
    stmt = (
        select(Proveedor)
        .where(
            or_(
                Proveedor.nit.ilike(like_expr),
                Proveedor.nombre.ilike(like_expr),
            )
        )
        .order_by(Proveedor.nombre.asc())
        .limit(15)
    )
    proveedores = db.scalars(stmt).all()
    return [ProveedorResponse(nit=p.nit, nombre=p.nombre) for p in proveedores]
