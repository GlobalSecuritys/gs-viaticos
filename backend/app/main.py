from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from app.routers.admin import router as admin_router
from app.routers.asignaciones import router as asignaciones_router
from app.routers.asignaciones import router_tecnico as asignaciones_tecnico_router
from app.routers.auth import router as auth_router
from app.routers.panel_viaticos import router as panel_viaticos_router
from app.routers.viaticos import router as viaticos_router
from app.routers.proveedores import router as proveedores_router
from app.routers.cuentas_cobro import router as cuentas_cobro_router
from app.routers.talento_humano import router as talento_humano_router
from app.routers.calidad_procesos import router as calidad_procesos_router, seed_procesos_calidad_si_vacio
from app.routers.bitacora_backup import router as bitacora_backup_router
from app.routers.inventario import router as inventario_router

from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models.cuenta_cobro import CuentaCobro
from app.models.cuenta_cobro_asignacion import CuentaCobroAsignacion
from app.models.talento_humano import (
    EmpleadoPerfil,
    EmpleadoDocumento,
    EmpleadoHistorial,
    EmpleadoSolicitud,
    EmpleadoDotacion,
    EmpleadoEvaluacion,
)
from app.services.inventario_esquema import asegurar_esquema_inventario
from app.models.calidad_procesos import (
    ProcesoCalidad,
    ProcesoCalidadResponsable,
    ProcesoCalidadDocumento,
    ProcesoCalidadAccesoAdmin,
)
from app.models.bitacora_backup import BitacoraBackup
from app.models.estadistica_asignacion_archivada import EstadisticaAsignacionArchivada
from app.models.inventario import InventarioPlanilla, InventarioItem, InventarioMovimiento

app = FastAPI(
    title="GS Viáticos API",
    description="Sistema de gestión de viáticos y gastos operativos para Global Security",
    version="1.0.0",
)

@app.on_event("startup")
def startup_db_check():
    # ── 1. Migraciones CORE (tablas que siempre existen) ─────────────────────
    # Se ejecutan en una única transacción; si algo falla aquí sí es grave.
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE viaticos ADD COLUMN IF NOT EXISTS comentario_admin TEXT;"))
            conn.execute(text("ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP WITHOUT TIME ZONE;"))
            conn.execute(text("ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS cerrada_en TIMESTAMP WITHOUT TIME ZONE;"))
            conn.execute(text("ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS descargada_en TIMESTAMP WITHOUT TIME ZONE;"))
            conn.execute(text("ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS orden_trabajo VARCHAR(50);"))
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_admin_calidad BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS acceso_mapa BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_mapa VARCHAR(20) DEFAULT 'lector';"))
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS solo_inventario BOOLEAN NOT NULL DEFAULT FALSE;"))
            conn.execute(text("UPDATE usuarios SET rol_mapa = 'lector' WHERE rol_mapa IS NULL OR rol_mapa = '';"))
            conn.execute(text("UPDATE usuarios SET es_admin_calidad = TRUE, rol_mapa = 'editor' WHERE LOWER(TRIM(correo)) = 'pilaradmin@gsbank.com';"))
            conn.commit()
    except Exception as e:
        print(f"[STARTUP] Advertencia migraciones core: {e}")

    # ── 2. Migraciones OPCIONALES (tablas legacy que pueden no existir) ───────
    # Cada sentencia corre en su propia conexión/transacción para que un error
    # de "tabla no existe" no aborte las demás ni la secuencia del startup.
    _sql_opcionales = [
        # inventario_planillas
        "ALTER TABLE inventario_planillas ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 1;",
        # inventario_items
        "ALTER TABLE inventario_items ADD COLUMN IF NOT EXISTS numero_articulo VARCHAR(60);",
        "ALTER TABLE inventario_items ADD COLUMN IF NOT EXISTS tiempo_entrega VARCHAR(80);",
        # inventario_mapeo_legacy: mapeo union_temporal → planilla_id para conteo legacy
        """
        CREATE TABLE IF NOT EXISTS inventario_mapeo_legacy (
            id SERIAL PRIMARY KEY,
            union_temporal VARCHAR(50) NOT NULL UNIQUE,
            planilla_id INTEGER NOT NULL UNIQUE
                REFERENCES inventario_planillas(id) ON DELETE CASCADE
        );
        """,
        "CREATE INDEX IF NOT EXISTS ix_inventario_mapeo_legacy_planilla_id ON inventario_mapeo_legacy(planilla_id);",
        # Semillas del mapeo (idempotente con ON CONFLICT DO NOTHING)
        """
        INSERT INTO inventario_mapeo_legacy (union_temporal, planilla_id) VALUES
            ('PROYECTO_ZEUS', 4),
            ('MANTENIMIENTO', 1),
            ('RTC', 3)
        ON CONFLICT DO NOTHING;
        """,
    ]
    for sql_alt in _sql_opcionales:
        try:
            with engine.connect() as _c:
                _c.execute(text(sql_alt))
                _c.commit()
        except Exception:
            # Silencioso: la tabla o columna no existe aún; se ignorará.
            pass

    # ── 3. ENUM PROYECTO_ZEUS (requiere AUTOCOMMIT fuera de transacción) ──────
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn_ac:
            conn_ac.execute(text("ALTER TYPE inventario_union_temporal ADD VALUE IF NOT EXISTS 'PROYECTO_ZEUS';"))
    except Exception as e_enum:
        print(f"[STARTUP] Enum PROYECTO_ZEUS (puede ya existir o tabla no existe aún): {e_enum}")

    # ── 4. Creación de tablas (checkfirst=True → idempotente) ─────────────────
    try:
        CuentaCobro.__table__.create(bind=engine, checkfirst=True)
        CuentaCobroAsignacion.__table__.create(bind=engine, checkfirst=True)
        EstadisticaAsignacionArchivada.__table__.create(bind=engine, checkfirst=True)
        EmpleadoPerfil.__table__.create(bind=engine, checkfirst=True)
        EmpleadoDocumento.__table__.create(bind=engine, checkfirst=True)
        EmpleadoHistorial.__table__.create(bind=engine, checkfirst=True)
        EmpleadoSolicitud.__table__.create(bind=engine, checkfirst=True)
        EmpleadoDotacion.__table__.create(bind=engine, checkfirst=True)
        EmpleadoEvaluacion.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidad.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidadResponsable.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidadDocumento.__table__.create(bind=engine, checkfirst=True)
        ProcesoCalidadAccesoAdmin.__table__.create(bind=engine, checkfirst=True)
        BitacoraBackup.__table__.create(bind=engine, checkfirst=True)
        InventarioPlanilla.__table__.create(bind=engine, checkfirst=True)
        InventarioItem.__table__.create(bind=engine, checkfirst=True)
        InventarioMovimiento.__table__.create(bind=engine, checkfirst=True)
        _asegurar_inventario()
    except Exception as e:
        print(f"[STARTUP] Advertencia al crear/verificar tablas: {e}")

    # ── 5. Seeds y migraciones de datos ──────────────────────────────────────
    try:
        with SessionLocal() as db:
            seed_procesos_calidad_si_vacio(db)
            _migrar_rol_admin_a_superadmin(db)
            _migrar_y_sembrar_planillas(db)
    except Exception as e:
        print(f"[STARTUP] Advertencia en seeds/migraciones de datos: {e}")




def _migrar_y_sembrar_planillas(db) -> None:
    """Migración idempotente y siembra de las 5 planillas independientes."""
    from sqlalchemy import select, func
    from app.models.inventario import InventarioPlanilla, InventarioItem

    planillas_config = [
        (1, "RTC - Comware"),
        (2, "RTC - American Global 2026"),
        (3, "Mantenimiento 2026"),
        (4, "Zeus"),
        (5, "Inventario general Global Security Bank SAS"),
    ]

    try:
        # Renombrar MANTENIMIENTO -> Mantenimiento 2026
        stmt_mant = select(InventarioPlanilla).where(
            func.upper(func.trim(InventarioPlanilla.nombre)).in_(["MANTENIMIENTO", "MANTENIMIENTO 2026"])
        )
        p_mant = db.scalar(stmt_mant)
        if p_mant:
            p_mant.nombre = "Mantenimiento 2026"
            p_mant.orden = 3
            db.flush()
            mant_id = p_mant.id
        else:
            p_mant = InventarioPlanilla(nombre="Mantenimiento 2026", orden=3, activa=True)
            db.add(p_mant)
            db.flush()
            mant_id = p_mant.id

        # Renombrar RTC -> RTC - Comware
        stmt_rtc = select(InventarioPlanilla).where(
            func.upper(func.trim(InventarioPlanilla.nombre)) == "RTC"
        )
        p_rtc = db.scalar(stmt_rtc)
        if p_rtc:
            p_rtc.nombre = "RTC - Comware"
            p_rtc.orden = 1
            db.flush()

        # Sembrar las 5 planillas con su orden exacto
        for orden_num, nombre in planillas_config:
            p_row = db.scalar(select(InventarioPlanilla).where(InventarioPlanilla.nombre == nombre))
            if not p_row:
                p_nueva = InventarioPlanilla(nombre=nombre, orden=orden_num, activa=True)
                db.add(p_nueva)
            else:
                p_row.orden = orden_num
                p_row.activa = True

        # Asegurar que ítems huérfanos se asignen a Mantenimiento 2026
        db.query(InventarioItem).filter(
            (InventarioItem.planilla_id.is_(None))
            | (~InventarioItem.planilla_id.in_(select(InventarioPlanilla.id)))
        ).update({InventarioItem.planilla_id: mant_id}, synchronize_session=False)

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[STARTUP] Advertencia al migrar y sembrar planillas: {e}")


def _asegurar_inventario() -> None:
    """Asegura el esquema canónico de inventario."""
    try:
        renombradas = asegurar_esquema_inventario(engine)
        if renombradas:
            print(f"[STARTUP] Esquema inventario asegurado: {renombradas}")
    except Exception as e:
        print(f"[STARTUP] Advertencia al preparar las tablas de inventario: {e}")

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
app.include_router(panel_viaticos_router)
app.include_router(asignaciones_router)
app.include_router(asignaciones_tecnico_router)
app.include_router(proveedores_router)
app.include_router(cuentas_cobro_router)
app.include_router(talento_humano_router)
app.include_router(calidad_procesos_router)
app.include_router(inventario_router)
app.include_router(bitacora_backup_router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")