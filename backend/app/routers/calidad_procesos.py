from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.cloudinary import eliminar_archivo_cloudinary, upload_documento_calidad_procesos
from app.core.security import (
    get_current_admin_calidad,
    get_current_pilar_admin,
    get_current_user,
)
from app.database import get_db
from app.models.calidad_procesos import (
    ProcesoCalidad,
    ProcesoCalidadDocumento,
    ProcesoCalidadResponsable,
    ProcesoCalidadAccesoAdmin,
)
from app.models.usuario import Usuario
from app.schemas.calidad_procesos import (
    AdminPermisoMapaItem,
    AdminPermisoMapaUpdate,
    AdminProcesoAccesoItem,
    ProcesosAccesosOverviewResponse,
    ProcesoInfoSimple,
    UsuarioProcesoAccesoUpdate,
    ProcesoCalidadDetailResponse,
    ProcesoCalidadDocumentoResponse,
    ProcesoCalidadDocumentoUpdate,
    ProcesoCalidadListResponse,
    ProcesoCalidadResponsableCreate,
    ProcesoCalidadResponsableResponse,
    ProcesoCalidadUpdate,
    ResponsableUsuarioSimple,
)

router = APIRouter(prefix="/calidad-procesos", tags=["Calidad de Procesos (SGC)"])


# -----------------------------------------------------------------------------
# SEED DE PROCESOS POR DEFECTO
# -----------------------------------------------------------------------------
PROCESOS_INICIALES = [
    # Dirección
    {
        "nombre": "Gerencia",
        "codigo": "GR",
        "categoria": "direccion",
        "descripcion": "Direccionamiento estratégico, políticas corporativas y toma de decisiones gerenciales.",
        "color_hex": "#F59E0B",
        "orden": 1,
    },
    {
        "nombre": "Mejora Continua",
        "codigo": "MC",
        "categoria": "direccion",
        "descripcion": "Auditorías internas, acciones correctivas, gestión del SGC y aseguramiento de la calidad.",
        "color_hex": "#F59E0B",
        "orden": 2,
    },
    # Misionales
    {
        "nombre": "Comercial",
        "codigo": "CO",
        "categoria": "misional",
        "descripcion": "Gestión de ventas, relaciones comerciales con clientes, cotizaciones y propuestas.",
        "color_hex": "#3B82F6",
        "orden": 1,
    },
    {
        "nombre": "Compras",
        "codigo": "CI",
        "categoria": "misional",
        "descripcion": "Adquisiciones de suministros, gestión de proveedores y logística de materiales.",
        "color_hex": "#3B82F6",
        "orden": 2,
    },
    {
        "nombre": "Inventario",
        "codigo": "IN",
        "categoria": "misional",
        "descripcion": "Control de stock por planillas, kardex de entradas y salidas de material, y consolidado de bodega.",
        "color_hex": "#3B82F6",
        "orden": 3,
    },
    {
        "nombre": "Operaciones",
        "codigo": "OP",
        "categoria": "misional",
        "descripcion": "Ejecución de servicios técnicos en campo, mantenimiento, instalaciones y seguridad física.",
        "color_hex": "#3B82F6",
        "orden": 4,
    },
    # Apoyo
    {
        "nombre": "Ambiental",
        "codigo": "SA",
        "categoria": "apoyo",
        "descripcion": "Gestión ambiental, manejo de residuos, sostenibilidad y cumplimiento de normatividad ecológica.",
        "color_hex": "#10B981",
        "orden": 1,
    },
    {
        "nombre": "Administrativo",
        "codigo": "AD",
        "categoria": "apoyo",
        "descripcion": "Gestión financiera, contabilidad, talento humano, infraestructura y soporte administrativo.",
        "color_hex": "#10B981",
        "orden": 2,
    },
    {
        "nombre": "SG - SST",
        "codigo": "SS",
        "categoria": "apoyo",
        "descripcion": "Sistema de gestión de seguridad y salud en el trabajo, prevención de riesgos laborales.",
        "color_hex": "#10B981",
        "orden": 3,
    },
]


def seed_procesos_calidad_si_vacio(db: Session) -> None:
    """Verifica si la tabla procesos_calidad tiene registros; si no, inserta los 9 iniciales.
    Si ya tiene datos, corrige el registro duplicado del bug histórico:
    el nodo Inventario fue creado copiando Operaciones (codigo='OP', nombre='Operaciones',
    responsable heredado). Se detecta y corrige en tres capas de seguridad.
    """
    count = db.scalar(select(func.count(ProcesoCalidad.id)))
    if count == 0:
        for p in PROCESOS_INICIALES:
            proceso = ProcesoCalidad(
                nombre=p["nombre"],
                codigo=p["codigo"],
                categoria=p["categoria"],
                descripcion=p["descripcion"],
                color_hex=p["color_hex"],
                orden=p["orden"],
            )
            db.add(proceso)
        db.commit()
        return

    _DESCRIPCION_INVENTARIO = (
        "Control de stock por planillas, kardex de entradas y salidas "
        "de material, y consolidado de bodega."
    )

    # ── Caso A: Existen DOS o más registros con codigo="OP" ──────────────────
    # El real de Operaciones tiene nombre="Operaciones" y/o es el de menor id.
    ops = db.scalars(
        select(ProcesoCalidad).where(ProcesoCalidad.codigo == "OP")
    ).all()

    if len(ops) >= 2:
        # Primero buscamos el que tiene nombre="Operaciones" como el real
        op_real = next((p for p in ops if p.nombre == "Operaciones"), None)
        # Si no, el real es el de menor id (el primero insertado)
        if op_real is None:
            op_real = min(ops, key=lambda p: p.id)

        duplicados = [p for p in ops if p.id != op_real.id]
        for dup in duplicados:
            dup.codigo = "IN"
            dup.nombre = "Inventario"
            dup.descripcion = _DESCRIPCION_INVENTARIO
            dup.orden = 3
            # Eliminar responsables heredados de Operaciones
            db.execute(
                ProcesoCalidadResponsable.__table__.delete().where(
                    ProcesoCalidadResponsable.proceso_id == dup.id
                )
            )
        db.commit()
        return  # Corrección de duplicados Caso A aplicada

    # ── Caso B: Existe un registro con codigo="IN" pero datos de Operaciones ─
    # Detecta si el nodo IN tiene nombre o descripción heredados del bug.
    nodo_in = db.scalar(
        select(ProcesoCalidad).where(ProcesoCalidad.codigo == "IN")
    )
    if nodo_in:
        necesita_correccion = (
            nodo_in.nombre != "Inventario"
            or nodo_in.nombre == "Operaciones"
            or "Operaciones" in (nodo_in.descripcion or "")
        )
        if necesita_correccion:
            nodo_in.nombre = "Inventario"
            nodo_in.descripcion = _DESCRIPCION_INVENTARIO
            nodo_in.orden = 3
            # Limpiar responsables heredados
            db.execute(
                ProcesoCalidadResponsable.__table__.delete().where(
                    ProcesoCalidadResponsable.proceso_id == nodo_in.id
                )
            )
            db.commit()
        return  # nodo_in existe y está (o quedó) correcto

    # ── Caso C: No existe ningún registro con codigo="IN" ────────────────────
    # La tabla tiene datos pero el proceso Inventario no fue creado.
    # Se inserta y se ajusta el orden de Operaciones si es necesario.
    nuevo_in = ProcesoCalidad(
        nombre="Inventario",
        codigo="IN",
        categoria="misional",
        descripcion=_DESCRIPCION_INVENTARIO,
        color_hex="#3B82F6",
        orden=3,
    )
    db.add(nuevo_in)
    # Si OP tiene orden=3 (ocupaba el lugar de IN), lo mueve a orden=4
    op_misional = db.scalar(
        select(ProcesoCalidad).where(
            ProcesoCalidad.codigo == "OP",
            ProcesoCalidad.orden == 3,
        )
    )
    if op_misional:
        op_misional.orden = 4
    db.commit()


# -----------------------------------------------------------------------------
# ENDPOINTS DE LECTURA (Requieren autorización de acceso al mapa)
# -----------------------------------------------------------------------------
@router.get("", response_model=List[ProcesoCalidadListResponse])
def listar_procesos(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Usuario, Depends(get_current_user)],
):
    """Devuelve todos los procesos de calidad ordenados por categoría y orden, con sus responsables y total de documentos."""
    seed_procesos_calidad_si_vacio(db)

    stmt = (
        select(ProcesoCalidad)
        .options(
            selectinload(ProcesoCalidad.responsables).selectinload(ProcesoCalidadResponsable.usuario),
            selectinload(ProcesoCalidad.documentos),
        )
        .order_by(ProcesoCalidad.categoria, ProcesoCalidad.orden, ProcesoCalidad.id)
    )
    procesos = db.scalars(stmt).all()

    resultado = []
    for proc in procesos:
        resp_list = [
            ProcesoCalidadResponsableResponse(
                id=r.id,
                proceso_id=r.proceso_id,
                usuario_id=r.usuario_id,
                rol_en_proceso=r.rol_en_proceso,
                asignado_por=r.asignado_por,
                created_at=r.created_at,
                usuario=r.usuario,
            )
            for r in proc.responsables
        ]

        resultado.append(
            ProcesoCalidadListResponse(
                id=proc.id,
                nombre=proc.nombre,
                codigo=proc.codigo,
                categoria=proc.categoria,
                descripcion=proc.descripcion,
                color_hex=proc.color_hex,
                orden=proc.orden,
                created_at=proc.created_at,
                updated_at=proc.updated_at,
                total_documentos=len(proc.documentos),
                responsables=resp_list,
            )
        )

    return resultado


@router.get("/categoria/{categoria}", response_model=List[ProcesoCalidadListResponse])
def listar_procesos_por_categoria(
    categoria: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Usuario, Depends(get_current_user)],
):
    """Devuelve los procesos filtrados por categoría ('direccion', 'misional', 'apoyo')."""
    cat_limpia = categoria.strip().lower()
    stmt = (
        select(ProcesoCalidad)
        .where(func.lower(ProcesoCalidad.categoria) == cat_limpia)
        .options(
            selectinload(ProcesoCalidad.responsables).selectinload(ProcesoCalidadResponsable.usuario),
            selectinload(ProcesoCalidad.documentos),
        )
        .order_by(ProcesoCalidad.orden, ProcesoCalidad.id)
    )
    procesos = db.scalars(stmt).all()

    resultado = []
    for proc in procesos:
        resp_list = [
            ProcesoCalidadResponsableResponse(
                id=r.id,
                proceso_id=r.proceso_id,
                usuario_id=r.usuario_id,
                rol_en_proceso=r.rol_en_proceso,
                asignado_por=r.asignado_por,
                created_at=r.created_at,
                usuario=r.usuario,
            )
            for r in proc.responsables
        ]

        resultado.append(
            ProcesoCalidadListResponse(
                id=proc.id,
                nombre=proc.nombre,
                codigo=proc.codigo,
                categoria=proc.categoria,
                descripcion=proc.descripcion,
                color_hex=proc.color_hex,
                orden=proc.orden,
                created_at=proc.created_at,
                updated_at=proc.updated_at,
                total_documentos=len(proc.documentos),
                responsables=resp_list,
            )
        )

    return resultado


@router.get("/usuarios-disponibles", response_model=List[ResponsableUsuarioSimple])
def listar_usuarios_disponibles(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Usuario, Depends(get_current_user)],
):
    """Devuelve la lista de usuarios activos para asignar como responsables en Calidad de Procesos."""
    stmt = select(Usuario).where(Usuario.activo == True).order_by(Usuario.nombre)
    usuarios = db.scalars(stmt).all()
    return [
        ResponsableUsuarioSimple(
            id=u.id,
            nombre=u.nombre,
            correo=u.correo,
            codigo_empleado=u.codigo_empleado,
        )
        for u in usuarios
    ]


# -----------------------------------------------------------------------------
# CONTROL EXCLUSIVO DE ACCESOS Y ROLES DEL MAPA (Solo PilarAdmin@gsbank.com)
# -----------------------------------------------------------------------------
@router.get("/permisos-admins", response_model=List[AdminPermisoMapaItem])
def listar_permisos_admins(
    db: Annotated[Session, Depends(get_db)],
    current_pilar: Annotated[Usuario, Depends(get_current_pilar_admin)],
):
    """[Exclusivo PilarAdmin] Devuelve la lista de todos los administradores del sistema con su estado de acceso y rol en el mapa."""
    stmt = (
        select(Usuario)
        .where(Usuario.rol == "superadmin")  # Solo 'superadmin' (rol 'admin' fue eliminado)
        .order_by(Usuario.nombre)
    )
    admins = db.scalars(stmt).all()

    items = []
    for a in admins:
        correo_clean = (a.correo or "").strip().lower()
        es_pilar = correo_clean == "pilaradmin@gsbank.com"
        items.append(
            AdminPermisoMapaItem(
                id=a.id,
                nombre=a.nombre,
                correo=a.correo,
                codigo_empleado=a.codigo_empleado,
                rol=a.rol,
                activo=a.activo,
                acceso_mapa=True,
                rol_mapa="editor" if es_pilar else "lector",
                es_pilar=es_pilar,
            )
        )

    items.sort(key=lambda x: (not x.es_pilar, x.nombre.lower()))
    return items


@router.put("/permisos-admins/{usuario_id}", response_model=AdminPermisoMapaItem)
def actualizar_permiso_admin_mapa(
    usuario_id: int,
    payload: AdminPermisoMapaUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_pilar: Annotated[Usuario, Depends(get_current_pilar_admin)],
):
    """[Exclusivo PilarAdmin] Actualiza el acceso al mapa y el rol SGC de un administrador."""
    target_user = db.get(Usuario, usuario_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    correo_target = (target_user.correo or "").strip().lower()
    if correo_target == "pilaradmin@gsbank.com":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden alterar los permisos de la Administradora Principal del Mapa (PilarAdmin).",
        )

    rol_limpio = payload.rol_mapa.strip().lower()
    if rol_limpio not in ("lector", "editor"):
        rol_limpio = "lector"

    target_user.acceso_mapa = payload.acceso_mapa
    target_user.rol_mapa = rol_limpio

    if target_user.acceso_mapa and target_user.rol_mapa == "editor":
        target_user.es_admin_calidad = True
    else:
        target_user.es_admin_calidad = False

    db.commit()
    db.refresh(target_user)

    return AdminPermisoMapaItem(
        id=target_user.id,
        nombre=target_user.nombre,
        correo=target_user.correo,
        codigo_empleado=target_user.codigo_empleado,
        rol=target_user.rol,
        activo=target_user.activo,
        acceso_mapa=target_user.acceso_mapa,
        rol_mapa=target_user.rol_mapa,
        es_pilar=False,
    )


# -----------------------------------------------------------------------------
# GESTIÓN DE ACCESOS OPERATIVOS POR PROCESO (Solo PilarAdmin@gsbank.com)
# Tabla: procesos_calidad_accesos_admin
# Niveles: 'admin' = Administrador de Sección, 'lector' = Lector de Sección, 'ninguno' = Sin acceso
# Nota de arquitectura: INDEPENDIENTE del acceso al mapa SGC.
# -----------------------------------------------------------------------------

# Mapa de procesos del SGC (código, nombre, categoría, módulo operativo activo)
PROCESOS_ACCESO_MAP = [
    # PROCESOS DE DIRECCIÓN
    {"codigo": "GR", "nombre": "Gerencia",            "categoria": "direccion", "tiene_modulo": False, "modulo_nombre": None},
    {"codigo": "MC", "nombre": "Mejora Continua",      "categoria": "direccion", "tiene_modulo": False, "modulo_nombre": None},
    # PROCESOS MISIONALES
    {"codigo": "CO", "nombre": "Comercial",   "categoria": "misional",  "tiene_modulo": False, "modulo_nombre": None},
    {"codigo": "CI", "nombre": "Compras",     "categoria": "misional",  "tiene_modulo": False, "modulo_nombre": None},
    {"codigo": "IN", "nombre": "Inventario",  "categoria": "misional",  "tiene_modulo": True,  "modulo_nombre": "Inventario"},
    {"codigo": "OP", "nombre": "Operaciones", "categoria": "misional",  "tiene_modulo": True,  "modulo_nombre": "Viáticos"},
    # PROCESOS DE APOYO
    {"codigo": "SA", "nombre": "Ambiental",            "categoria": "apoyo",     "tiene_modulo": False, "modulo_nombre": None},
    {"codigo": "AD", "nombre": "Administrativo",       "categoria": "apoyo",     "tiene_modulo": False, "modulo_nombre": None},
    {"codigo": "SS", "nombre": "SG - SST",             "categoria": "apoyo",     "tiene_modulo": False, "modulo_nombre": None},
]

NIVELES_VALIDOS = {"admin", "lector", "ninguno"}


@router.get("/accesos-proceso", response_model=ProcesosAccesosOverviewResponse)
def listar_accesos_proceso(
    db: Annotated[Session, Depends(get_db)],
    current_pilar: Annotated[Usuario, Depends(get_current_pilar_admin)],
):
    """
    [Exclusivo PilarAdmin] Devuelve la lista de todos los administradores (superadmin) con sus
    niveles de acceso asignados por proceso del Mapa SGC (tabla procesos_calidad_accesos_admin).
    Agrupa los procesos en: Dirección (GR, MC), Misionales (CO, CI, IN, OP) y Apoyo (SA, AD, SS).
    Procesos con módulo operativo activo: OP (Viáticos), IN (Inventario).
    """
    # Obtener todos los administradores (superadmin)
    stmt_admins = (
        select(Usuario)
        .where(Usuario.rol == "superadmin", Usuario.activo == True)
        .order_by(Usuario.nombre)
    )
    admins = db.scalars(stmt_admins).all()

    # Obtener todos los accesos existentes para estos admins
    admin_ids = [a.id for a in admins]
    stmt_accesos = select(ProcesoCalidadAccesoAdmin).where(
        ProcesoCalidadAccesoAdmin.usuario_id.in_(admin_ids)
    )
    accesos_raw = db.scalars(stmt_accesos).all()

    # Construir mapa: usuario_id -> {proceso_codigo: nivel_acceso}
    accesos_map: dict[int, dict[str, str]] = {a.id: {} for a in admins}
    for acc in accesos_raw:
        if acc.usuario_id in accesos_map:
            accesos_map[acc.usuario_id][acc.proceso_codigo] = acc.nivel_acceso

    # Construir lista de administradores con sus accesos
    administradores = []
    for a in admins:
        correo_clean = (a.correo or "").strip().lower()
        es_pilar = correo_clean == "pilaradmin@gsbank.com"
        accesos_admin = accesos_map.get(a.id, {})
        # Para PilarAdmin, nivel_acceso = 'admin' en todos los procesos
        if es_pilar:
            accesos_admin = {p["codigo"]: "admin" for p in PROCESOS_ACCESO_MAP}
        administradores.append(
            AdminProcesoAccesoItem(
                id=a.id,
                nombre=a.nombre,
                correo=a.correo,
                codigo_empleado=a.codigo_empleado,
                rol=a.rol,
                es_pilar=es_pilar,
                accesos=accesos_admin,
            )
        )
    # Ordenar: Pilar primero
    administradores.sort(key=lambda x: (not x.es_pilar, x.nombre.lower()))

    # Construir lista de info de procesos
    procesos = [
        ProcesoInfoSimple(
            codigo=p["codigo"],
            nombre=p["nombre"],
            categoria=p["categoria"],
            tiene_modulo_operativo=p["tiene_modulo"],
            modulo_nombre=p["modulo_nombre"],
        )
        for p in PROCESOS_ACCESO_MAP
    ]

    return ProcesosAccesosOverviewResponse(procesos=procesos, administradores=administradores)


@router.put("/accesos-proceso", response_model=AdminProcesoAccesoItem)
def actualizar_acceso_proceso(
    payload: UsuarioProcesoAccesoUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_pilar: Annotated[Usuario, Depends(get_current_pilar_admin)],
):
    """
    [Exclusivo PilarAdmin] Actualiza el nivel de acceso de un administrador a un proceso operativo.
    - nivel_acceso 'admin'  -> Administrador de Sección (acceso total al módulo operativo).
    - nivel_acceso 'lector' -> Lector de Sección (solo vista general, sin edición ni tarjetas).
    - nivel_acceso 'ninguno'-> Sin acceso (bloquea entrada al módulo).
    Si el proceso es 'OP' (Operaciones), sincroniza automáticamente usuario.acceso_viaticos.
    Registra el cambio en log_auditoria.
    """
    from sqlalchemy import text as sql_text

    # Validaciones
    codigo = (payload.proceso_codigo or "").strip().upper()
    nivel = (payload.nivel_acceso or "ninguno").strip().lower()
    if codigo not in {p["codigo"] for p in PROCESOS_ACCESO_MAP}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Código de proceso inválido: '{codigo}'. Valores permitidos: {', '.join(p['codigo'] for p in PROCESOS_ACCESO_MAP)}"
        )
    if nivel not in NIVELES_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nivel de acceso inválido: '{nivel}'. Valores permitidos: admin, lector, ninguno"
        )

    # Bloquear modificación de la propia Pilar
    target_user = db.get(Usuario, payload.usuario_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    correo_target = (target_user.correo or "").strip().lower()
    if correo_target == "pilaradmin@gsbank.com":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden modificar los accesos de la Administradora Master (PilarAdmin)."
        )
    if target_user.rol != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden asignar accesos a usuarios con rol de Administrador."
        )

    # Upsert del acceso
    stmt_exist = select(ProcesoCalidadAccesoAdmin).where(
        ProcesoCalidadAccesoAdmin.usuario_id == payload.usuario_id,
        ProcesoCalidadAccesoAdmin.proceso_codigo == codigo,
    )
    acceso_row = db.scalar(stmt_exist)
    if acceso_row:
        acceso_row.nivel_acceso = nivel
    else:
        acceso_row = ProcesoCalidadAccesoAdmin(
            usuario_id=payload.usuario_id,
            proceso_codigo=codigo,
            nivel_acceso=nivel,
        )
        db.add(acceso_row)

    # Sincronizar acceso_viaticos si es proceso OP
    if codigo == "OP":
        target_user.acceso_viaticos = nivel in ("admin", "lector")

    db.commit()

    # Construir respuesta con todos los accesos del usuario
    stmt_all = select(ProcesoCalidadAccesoAdmin).where(
        ProcesoCalidadAccesoAdmin.usuario_id == payload.usuario_id
    )
    all_accesos = db.scalars(stmt_all).all()
    accesos_dict = {a.proceso_codigo: a.nivel_acceso for a in all_accesos}

    # Registro en auditoría (usando el servicio oficial logs_auditoria)
    nombre_nivel = {"admin": "Administrador de Sección", "lector": "Lector de Sección", "ninguno": "Sin acceso"}.get(nivel, nivel)
    nombre_proceso = next((p["nombre"] for p in PROCESOS_ACCESO_MAP if p["codigo"] == codigo), codigo)
    try:
        from app.services.auditoria import registrar_auditoria
        detalle = (
            f"PilarAdmin asignó acceso '{nombre_nivel}' a '{target_user.nombre}' "
            f"({target_user.correo}) en proceso '{nombre_proceso}' ({codigo})."
            + (f" [Sincronizado: acceso_viaticos={'True' if target_user.acceso_viaticos else 'False'}]" if codigo == "OP" else "")
        )
        registrar_auditoria(
            db,
            actor=current_pilar,
            usuario_objetivo=target_user,
            accion="CAMBIO_ACCESO_PROCESO",
            detalle=detalle,
            resultado="exitoso",
        )
    except Exception:
        db.rollback()  # No romper respuesta si auditoría falla

    return AdminProcesoAccesoItem(
        id=target_user.id,
        nombre=target_user.nombre,
        correo=target_user.correo,
        codigo_empleado=target_user.codigo_empleado,
        rol=target_user.rol,
        es_pilar=False,
        accesos=accesos_dict,
    )


@router.get("/{id}", response_model=ProcesoCalidadDetailResponse)
def obtener_detalle_proceso(
    id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Usuario, Depends(get_current_user)],
):
    """Devuelve la información completa de un proceso puntual: metadatos, responsables y documentos cargados."""
    stmt = (
        select(ProcesoCalidad)
        .where(ProcesoCalidad.id == id)
        .options(
            selectinload(ProcesoCalidad.responsables).selectinload(ProcesoCalidadResponsable.usuario),
            selectinload(ProcesoCalidad.documentos).selectinload(ProcesoCalidadDocumento.usuario_subio),
        )
    )
    proceso = db.scalar(stmt)
    if not proceso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proceso de calidad no encontrado")

    resp_list = [
        ProcesoCalidadResponsableResponse(
            id=r.id,
            proceso_id=r.proceso_id,
            usuario_id=r.usuario_id,
            rol_en_proceso=r.rol_en_proceso,
            asignado_por=r.asignado_por,
            created_at=r.created_at,
            usuario=r.usuario,
        )
        for r in proceso.responsables
    ]

    doc_list = [
        ProcesoCalidadDocumentoResponse(
            id=d.id,
            proceso_id=d.proceso_id,
            nombre_documento=d.nombre_documento,
            descripcion=d.descripcion,
            categoria_documento=d.categoria_documento,
            cloudinary_public_id=d.cloudinary_public_id,
            cloudinary_secure_url=d.cloudinary_secure_url,
            version=d.version,
            subido_por=d.subido_por,
            created_at=d.created_at,
            usuario_subio=d.usuario_subio,
        )
        for d in proceso.documentos
    ]

    return ProcesoCalidadDetailResponse(
        id=proceso.id,
        nombre=proceso.nombre,
        codigo=proceso.codigo,
        categoria=proceso.categoria,
        descripcion=proceso.descripcion,
        color_hex=proceso.color_hex,
        orden=proceso.orden,
        created_at=proceso.created_at,
        updated_at=proceso.updated_at,
        responsables=resp_list,
        documentos=doc_list,
    )


# -----------------------------------------------------------------------------
# ENDPOINTS DE ESCRITURA (Exclusivo para PilarAdmin / SuperAdmin / es_admin_calidad)
# -----------------------------------------------------------------------------
@router.put("/{id}", response_model=ProcesoCalidadDetailResponse)
def actualizar_proceso(
    id: int,
    payload: ProcesoCalidadUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_admin: Annotated[Usuario, Depends(get_current_admin_calidad)],
):
    """[Admin Calidad] Actualiza el nombre, código, categoría, color, descripción u orden del proceso."""
    proceso = db.get(ProcesoCalidad, id)
    if not proceso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proceso no encontrado")

    if payload.nombre is not None:
        proceso.nombre = payload.nombre.strip()
    if payload.codigo is not None:
        proceso.codigo = payload.codigo.strip().upper()
    if payload.categoria is not None:
        proceso.categoria = payload.categoria.strip().lower()
    if payload.descripcion is not None:
        proceso.descripcion = payload.descripcion.strip()
    if payload.color_hex is not None:
        proceso.color_hex = payload.color_hex.strip()
    if payload.orden is not None:
        proceso.orden = payload.orden

    try:
        db.commit()
        db.refresh(proceso)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al actualizar: {e}")

    return obtener_detalle_proceso(id=proceso.id, db=db, current_user=current_admin)


@router.post("/{id}/asignaciones", response_model=ProcesoCalidadResponsableResponse, status_code=status.HTTP_201_CREATED)
def asignar_responsable_a_proceso(
    id: int,
    payload: ProcesoCalidadResponsableCreate,
    db: Annotated[Session, Depends(get_db)],
    current_admin: Annotated[Usuario, Depends(get_current_admin_calidad)],
):
    """[Admin Calidad] Asigna un usuario como responsable/colaborador de un proceso."""
    proceso = db.get(ProcesoCalidad, id)
    if not proceso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proceso no encontrado")

    usuario_target = db.get(Usuario, payload.usuario_id)
    if not usuario_target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    # Verificar si ya está asignado
    stmt_exist = select(ProcesoCalidadResponsable).where(
        ProcesoCalidadResponsable.proceso_id == id,
        ProcesoCalidadResponsable.usuario_id == payload.usuario_id,
    )
    existente = db.scalar(stmt_exist)
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario ya se encuentra asignado a este proceso",
        )

    nueva_asignacion = ProcesoCalidadResponsable(
        proceso_id=id,
        usuario_id=payload.usuario_id,
        rol_en_proceso=payload.rol_en_proceso or "Responsable",
        asignado_por=current_admin.id,
    )

    try:
        db.add(nueva_asignacion)
        db.commit()
        db.refresh(nueva_asignacion)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al asignar responsable: {e}")

    return ProcesoCalidadResponsableResponse(
        id=nueva_asignacion.id,
        proceso_id=nueva_asignacion.proceso_id,
        usuario_id=nueva_asignacion.usuario_id,
        rol_en_proceso=nueva_asignacion.rol_en_proceso,
        asignado_por=nueva_asignacion.asignado_por,
        created_at=nueva_asignacion.created_at,
        usuario=usuario_target,
    )


@router.delete("/{id}/asignaciones/{asignacion_id}", status_code=status.HTTP_200_OK)
def remover_responsable_de_proceso(
    id: int,
    asignacion_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_admin: Annotated[Usuario, Depends(get_current_admin_calidad)],
):
    """[Admin Calidad] Remueve una asignación de responsable de un proceso."""
    asignacion = db.get(ProcesoCalidadResponsable, asignacion_id)
    if not asignacion or asignacion.proceso_id != id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignación no encontrada")

    try:
        db.delete(asignacion)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al desasignar: {e}")

    return {"ok": True, "mensaje": "Responsable desasignado exitosamente"}


@router.post("/{id}/documentos", response_model=ProcesoCalidadDocumentoResponse, status_code=status.HTTP_201_CREATED)
async def subir_documento_proceso(
    id: int,
    file: UploadFile,
    nombre_documento: Annotated[str, Form()],
    categoria_documento: Annotated[str, Form()],
    version: Annotated[str, Form()] = "v1",
    descripcion: Annotated[Optional[str], Form()] = None,
    db: Session = Depends(get_db),
    current_admin: Usuario = Depends(get_current_admin_calidad),
):
    """[Admin Calidad] Sube un documento (PDF, imagen, formato) a Cloudinary y lo registra en la BD."""
    proceso = db.get(ProcesoCalidad, id)
    if not proceso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proceso no encontrado")

    # Subida a Cloudinary
    upload_result = await upload_documento_calidad_procesos(file)

    nuevo_documento = ProcesoCalidadDocumento(
        proceso_id=id,
        nombre_documento=nombre_documento.strip(),
        descripcion=(descripcion or "").strip() or None,
        categoria_documento=categoria_documento.strip() or "Procedimiento",
        cloudinary_public_id=upload_result.public_id,
        cloudinary_secure_url=upload_result.secure_url,
        version=(version or "v1").strip(),
        subido_por=current_admin.id,
    )

    try:
        db.add(nuevo_documento)
        db.commit()
        db.refresh(nuevo_documento)
    except Exception as e:
        db.rollback()
        # Intentar limpiar en Cloudinary si falla la BD
        await eliminar_archivo_cloudinary(upload_result.public_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al guardar registro en BD: {e}")

    return ProcesoCalidadDocumentoResponse(
        id=nuevo_documento.id,
        proceso_id=nuevo_documento.proceso_id,
        nombre_documento=nuevo_documento.nombre_documento,
        descripcion=nuevo_documento.descripcion,
        categoria_documento=nuevo_documento.categoria_documento,
        cloudinary_public_id=nuevo_documento.cloudinary_public_id,
        cloudinary_secure_url=nuevo_documento.cloudinary_secure_url,
        version=nuevo_documento.version,
        subido_por=nuevo_documento.subido_por,
        created_at=nuevo_documento.created_at,
        usuario_subio=current_admin,
    )


@router.put("/documentos/{doc_id}", response_model=ProcesoCalidadDocumentoResponse)
def actualizar_documento_proceso(
    doc_id: int,
    payload: ProcesoCalidadDocumentoUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_admin: Annotated[Usuario, Depends(get_current_admin_calidad)],
):
    """[Admin Calidad] Edita los metadatos de un documento (nombre, categoría, versión o descripción)."""
    documento = db.get(ProcesoCalidadDocumento, doc_id)
    if not documento:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    if payload.nombre_documento is not None:
        documento.nombre_documento = payload.nombre_documento.strip()
    if payload.descripcion is not None:
        documento.descripcion = payload.descripcion.strip()
    if payload.categoria_documento is not None:
        documento.categoria_documento = payload.categoria_documento.strip()
    if payload.version is not None:
        documento.version = payload.version.strip()

    try:
        db.commit()
        db.refresh(documento)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al actualizar documento: {e}")

    stmt_usuario = select(Usuario).where(Usuario.id == documento.subido_por)
    usuario_subio = db.scalar(stmt_usuario) if documento.subido_por else None

    return ProcesoCalidadDocumentoResponse(
        id=documento.id,
        proceso_id=documento.proceso_id,
        nombre_documento=documento.nombre_documento,
        descripcion=documento.descripcion,
        categoria_documento=documento.categoria_documento,
        cloudinary_public_id=documento.cloudinary_public_id,
        cloudinary_secure_url=documento.cloudinary_secure_url,
        version=documento.version,
        subido_por=documento.subido_por,
        created_at=documento.created_at,
        usuario_subio=usuario_subio,
    )


@router.delete("/documentos/{doc_id}", status_code=status.HTTP_200_OK)
async def eliminar_documento_proceso(
    doc_id: int,
    db: Session = Depends(get_db),
    current_admin: Usuario = Depends(get_current_admin_calidad),
):
    """[Admin Calidad] Elimina un documento de la base de datos y de Cloudinary."""
    documento = db.get(ProcesoCalidadDocumento, doc_id)
    if not documento:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    public_id = documento.cloudinary_public_id

    try:
        db.delete(documento)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al eliminar de BD: {e}")

    # Eliminar en segundo plano de Cloudinary
    await eliminar_archivo_cloudinary(public_id)

    return {"ok": True, "mensaje": "Documento eliminado correctamente"}
