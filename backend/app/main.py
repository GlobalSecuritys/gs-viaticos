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
from app.routers.calidad_procesos import router as calidad_procesos_router, seed_procesos_calidad_si_vacio

from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models.cuenta_cobro import CuentaCobro
from app.models.cuenta_cobro_asignacion import CuentaCobroAsignacion
from app.models.talento_humano import (
    EmpleadoPerfil,
    EmpleadoDocumento,
    EmpleadoHistorial,
    EmpleadoSolicitud,
)
from app.models.calidad_procesos import (
    ProcesoCalidad,
    ProcesoCalidadResponsable,
    ProcesoCalidadDocumento,
    ProcesoCalidadAccesoAdmin,
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
            conn.execute(text("ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS cerrada_en TIMESTAMP WITHOUT TIME ZONE;"))
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_admin_calidad BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS acceso_mapa BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_mapa VARCHAR(20) DEFAULT 'lector';"))
            conn.execute(text("UPDATE usuarios SET acceso_mapa = TRUE;"))
            conn.execute(text("UPDATE usuarios SET rol_mapa = 'lector' WHERE rol_mapa IS NULL OR rol_mapa = '';"))
            conn.execute(text("UPDATE usuarios SET es_admin_calidad = TRUE, acceso_mapa = TRUE, rol_mapa = 'editor' WHERE LOWER(TRIM(correo)) = 'pilaradmin@gsbank.com';"))
            conn.commit()
        CuentaCobro.__table__.create(bind=engine, checkfirst=True)
        CuentaCobroAsignacion.__table__.create(bind=engine, checkfirst=True)
        EmpleadoPerfil.__table__.create(bind=engine, checkfirst=True)
        EmpleadoDocumento.__table__.create(bind=engine, checkfirst=True)
        EmpleadoHistorial.__table__.create(bind=engine, checkfirst=True)
        EmpleadoSolicitud.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidad.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidadResponsable.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidadDocumento.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidadAccesoAdmin.__table__.create(bind=engine, checkfirst=True)

        with SessionLocal() as db:
            seed_procesos_calidad_si_vacio(db)
            _migrar_rol_admin_a_superadmin(db)
    except Exception as e:
        print(f"Startup DB check warning: {e}")

def _migrar_rol_admin_a_superadmin(db) -> None:
    """
    Migración automática de seguridad: eleva cualquier usuario con rol='admin' (rol intermedio
    eliminado) a 'superadmin' (Administrador). Registra cada elevación en log_auditoria.
    Se ejecuta en cada inicio del servidor; es idempotente (no afecta a usuarios ya migrados).
    """
    from sqlalchemy import select, update
    from app.models.usuario import Usuario
    try:
        stmt = select(Usuario).where(Usuario.rol == 'admin')
        usuarios_admin = db.scalars(stmt).all()
        for u in usuarios_admin:
            u.rol = 'superadmin'
            # Registro en logs_auditoria
            try:
                from app.services.auditoria import registrar_auditoria
                registrar_auditoria(
                    db,
                    actor=u,
                    usuario_objetivo=u,
                    accion="CAMBIO_ROL",
                    detalle=(
                        f"Elevación de privilegios automática: Usuario '{u.nombre}' ({u.correo}) "
                        f"migrado de rol intermedio 'admin' a 'Administrador' (superadmin) "
                        f"durante startup del servidor."
                    ),
                    resultado="exitoso",
                )
            except Exception:
                pass  # No bloquear si la tabla de auditoria no existe aún
            print(f"[STARTUP] ✅ Migrado {u.correo}: admin -> superadmin")
        if usuarios_admin:
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[STARTUP] Advertencia al migrar roles: {e}")


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
app.include_router(calidad_procesos_router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")