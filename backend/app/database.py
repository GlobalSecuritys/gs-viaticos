from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from app.core.config import settings

# pool_pre_ping=True y pool_recycle=300 aseguran reconexión automática en servicios serverless como Neon
#
# Tamaño del pool: FastAPI ejecuta los endpoints síncronos (def) en un
# threadpool de 40 hilos, así que puede haber hasta 40 peticiones pidiendo
# conexión a la vez. Con el pool por defecto (5 + 10 = 15) las 25 restantes
# esperaban `pool_timeout` (30s) y fallaban con "QueuePool limit reached",
# que es lo que se veía como "se pierde la conexión" al navegar.
# Se dimensiona el pool para cubrir ese techo de concurrencia.
#
# Es seguro: la instancia de Neon admite max_connections=901 y se conecta a
# través del endpoint -pooler (pgbouncer), pensado para muchos clientes.
POOL_SIZE = 20
MAX_OVERFLOW = 20  # 20 + 20 = 40, el máximo de hilos del threadpool

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=30,
    # Permite identificar las conexiones de la app en pg_stat_activity.
    connect_args={"application_name": "gs_viaticos_api"},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
