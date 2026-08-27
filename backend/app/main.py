from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from app.routers.admin import router as admin_router
from app.routers.asignaciones import router as asignaciones_router
from app.routers.asignaciones import router_tecnico as asignaciones_tecnico_router
from app.routers.auth import router as auth_router
from app.routers.viaticos import router as viaticos_router
from app.routers.proveedores import router as proveedores_router
from app.routers.cuentas_cobro import router as cuentas_cobro_router
from app.routers.talento_humano import router as talento_humano_router

from sqlalchemy import text
from app.database import engine
from app.models.cuenta_cobro import CuentaCobro
from app.models.cuenta_cobro_asignacion import CuentaCobroAsignacion
from app.models.talento_humano import (
    EmpleadoPerfil,
    EmpleadoDocumento,
    EmpleadoHistorial,
    EmpleadoSolicitud,
)

app = FastAPI(
    title="GS Viáticos API",
    description="Sistema de gestión de viáticos y gastos operativos para Global Security",
    version="1.0.0",
)

@app.on_event("startup")
def startup_db_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE viaticos ADD COLUMN IF NOT EXISTS comentario_admin TEXT;"))
            conn.execute(text("ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP WITHOUT TIME ZONE;"))
            conn.commit()
        CuentaCobro.__table__.create(bind=engine, checkfirst=True)
        CuentaCobroAsignacion.__table__.create(bind=engine, checkfirst=True)
        EmpleadoPerfil.__table__.create(bind=engine, checkfirst=True)
        EmpleadoDocumento.__table__.create(bind=engine, checkfirst=True)
        EmpleadoHistorial.__table__.create(bind=engine, checkfirst=True)
        EmpleadoSolicitud.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        print(f"Startup DB check warning: {e}")

# Configuración de CORS para el frontend (React + Vite)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://gs-viaticos-frontend.onrender.com",
    "https://gs-viaticos-1.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(viaticos_router)
app.include_router(admin_router)
app.include_router(asignaciones_router)
app.include_router(asignaciones_tecnico_router)
app.include_router(proveedores_router)
app.include_router(cuentas_cobro_router)
app.include_router(talento_humano_router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")