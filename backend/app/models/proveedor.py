from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nit: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
