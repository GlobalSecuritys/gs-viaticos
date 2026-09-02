from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.cloudinary import upload_documento_talento_humano
from app.core.security import (
    get_current_admin,
    get_current_superadmin,
    get_current_user,
    hash_password,
    verificar_autoridad_sobre_usuario,
)
from app.database import get_db
from app.models.log_auditoria import LogAuditoria
from app.models.talento_humano import (
    EmpleadoDocumento,
    EmpleadoHistorial,
    EmpleadoPerfil,
    EmpleadoSolicitud,
)
from app.models.usuario import Usuario
from app.schemas.talento_humano import (
    EmpleadoCompletoAdminResponse,
    EmpleadoCompletoTecnicoResponse,
    EmpleadoCreateAdmin,
    EmpleadoDocumentoResponse,
    EmpleadoEstadoUpdate,
    EmpleadoHistorialResponse,
    EmpleadoListItemResponse,
    EmpleadoPerfilAdminResponse,
    EmpleadoPerfilTecnicoResponse,
    EmpleadoPerfilUpdate,
    EmpleadoSolicitudCreate,
    EmpleadoSolicitudResponse,
    EmpleadoSolicitudRespuesta,
)
from app.services.auditoria import registrar_auditoria
from app.services.excel_export import generar_excel_talento_humano

router = APIRouter(prefix="/talento-humano", tags=["Talento Humano"])

DOCUMENTOS_ESTANDAR = [
    ("cedula", "Cédula de ciudadanía"),
    ("hoja_vida", "Hoja de vida"),
    ("contrato", "Contrato laboral"),
    ("certificado_eps", "Certificado EPS"),
    ("certificado_arl", "Certificado ARL"),
    ("examen_medico", "Examen médico ocupacional"),
]


def _asegurar_perfil_y_documentos_por_defecto(db: Session, usuario: Usuario) -> EmpleadoPerfil:
    """
    Garantiza que el usuario tenga un registro en `empleados_perfiles`
    y los slots de documentación básica en `empleados_documentos`.
    """
    stmt = select(EmpleadoPerfil).where(EmpleadoPerfil.usuario_id == usuario.id)
    perfil = db.scalar(stmt)

    if not perfil:
        cargo_defecto = (
            "Super Administrador"
            if usuario.rol == "superadmin"
            else "Administrador"
            if usuario.rol == "admin"
            else "Técnico Instalador"
        )
        area_defecto = (
            "Dirección General"
            if usuario.rol == "superadmin"
            else "Administración"
            if usuario.rol == "admin"
            else "Instalaciones"
        )
        salario_defecto = Decimal("2350000.00") if usuario.rol == "tecnico" else Decimal("3500000.00")

        perfil = EmpleadoPerfil(
            usuario_id=usuario.id,
            cedula=usuario.codigo_empleado or ("1000" + str(usuario.id).zfill(6)),
            cargo=cargo_defecto,
            area=area_defecto,
            tipo_contrato="Término indefinido",
            fecha_ingreso=usuario.created_at.date() if usuario.created_at else date(2024, 2, 15),
            estado_laboral="activo" if usuario.activo else "inactivo",
            jefe_inmediato="Carlos Ramírez" if usuario.rol == "tecnico" else "Dirección General",
            salario=salario_defecto,
            dias_vacaciones_disponibles=12,
            dias_vacaciones_tomados=3,
            dias_vacaciones_programados=0,
            observaciones="Empleado registrado en el sistema GS Viáticos.",
            updated_by_nombre="Sistema",
        )
        db.add(perfil)
        db.commit()
        db.refresh(perfil)

    # Verificar documentos estándar
    stmt_docs = select(EmpleadoDocumento).where(EmpleadoDocumento.usuario_id == usuario.id)
    docs_existentes = {d.tipo_documento: d for d in db.scalars(stmt_docs).all()}

    nuevos_docs = False
    for tipo_doc, nombre_doc in DOCUMENTOS_ESTANDAR:
        if tipo_doc not in docs_existentes:
            doc = EmpleadoDocumento(
                usuario_id=usuario.id,
                tipo_documento=tipo_doc,
                nombre_documento=nombre_doc,
                estado="pendiente",
            )
            db.add(doc)
            nuevos_docs = True

    if nuevos_docs:
        db.commit()

    return perfil


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINTS ADMIN / SUPERADMIN
# ══════════════════════════════════════════════════════════════════════


@router.get("/empleados", response_model=List[EmpleadoListItemResponse])
def listar_empleados(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    query: Optional[str] = None,
    estado: Optional[str] = None,
):
    """
    Lista todos los empleados con su información básica y conteo de documentos.
    Disponible para Administradores y Super Administradores.
    """
    stmt = select(Usuario).order_by(Usuario.nombre.asc())
    usuarios = db.scalars(stmt).all()

    items = []
    for u in usuarios:
        perfil = _asegurar_perfil_y_documentos_por_defecto(db, u)

        # Filtro de búsqueda
        if query:
            q = query.strip().lower()
            nombre = (u.nombre or "").lower()
            correo = (u.correo or "").lower()
            codigo = (u.codigo_empleado or "").lower()
            cedula = (perfil.cedula or "").lower()
            cargo = (perfil.cargo or "").lower()
            if not (q in nombre or q in correo or q in codigo or q in cedula or q in cargo):
                continue

        # Filtro por estado laboral
        if estado and estado.lower() != "todos":
            if perfil.estado_laboral.lower() != estado.strip().lower():
                continue

        # Conteo de documentos
        stmt_docs = select(EmpleadoDocumento).where(EmpleadoDocumento.usuario_id == u.id)
        docs = db.scalars(stmt_docs).all()
        cargados = sum(1 for d in docs if d.estado == "cargado")

        items.append(
            EmpleadoListItemResponse(
                id=u.id,
                nombre=u.nombre,
                correo=u.correo,
                codigo_empleado=u.codigo_empleado,
                rol=u.rol,
                activo=u.activo,
                cedula=perfil.cedula,
                cargo=perfil.cargo,
                area=perfil.area,
                estado_laboral=perfil.estado_laboral,
                fecha_ingreso=perfil.fecha_ingreso,
                jefe_inmediato=perfil.jefe_inmediato,
                documentos_cargados=cargados,
                documentos_totales=len(docs),
            )
        )

    return items


@router.post("/empleados", response_model=EmpleadoCompletoAdminResponse, status_code=status.HTTP_201_CREATED)
def crear_empleado(
    datos: EmpleadoCreateAdmin,
    current_superadmin: Annotated[Usuario, Depends(get_current_superadmin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Crea un nuevo empleado en el sistema con su usuario y ficha de Talento Humano.
    Acción exclusiva de Super Administrador.
    """
    # Verificar correo
    stmt_correo = select(Usuario).where(func.lower(Usuario.correo) == datos.correo.strip().lower())
    if db.scalar(stmt_correo):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo electrónico ya se encuentra registrado",
        )

    # Verificar código de empleado
    if datos.codigo_empleado:
        stmt_cod = select(Usuario).where(Usuario.codigo_empleado == datos.codigo_empleado.strip())
        if db.scalar(stmt_cod):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El código de empleado ya se encuentra registrado",
            )

    # Crear Usuario
    password_plana = datos.password or "GSB2026*"
    nuevo_usuario = Usuario(
        nombre=datos.nombre.strip(),
        correo=datos.correo.strip().lower(),
        codigo_empleado=datos.codigo_empleado.strip() if datos.codigo_empleado else None,
        password_hash=hash_password(password_plana),
        rol="tecnico",
        activo=datos.estado_laboral != "inactivo",
        acceso_viaticos=True,
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    # Crear Perfil
    nuevo_perfil = EmpleadoPerfil(
        usuario_id=nuevo_usuario.id,
        cedula=datos.cedula or datos.codigo_empleado,
        telefono=datos.telefono,
        ciudad=datos.ciudad,
        direccion=datos.direccion,
        cargo=datos.cargo or "Técnico Instalador",
        area=datos.area or "Instalaciones",
        tipo_contrato=datos.tipo_contrato or "Término indefinido",
        fecha_ingreso=datos.fecha_ingreso or date.today(),
        estado_laboral=datos.estado_laboral or "activo",
        jefe_inmediato=datos.jefe_inmediato or "Carlos Ramírez",
        salario=datos.salario or Decimal("2350000.00"),
        contacto_emergencia_nombre=datos.contacto_emergencia_nombre,
        contacto_emergencia_parentesco=datos.contacto_emergencia_parentesco,
        contacto_emergencia_telefono=datos.contacto_emergencia_telefono,
        observaciones=datos.observaciones,
        dias_vacaciones_disponibles=12,
        dias_vacaciones_tomados=0,
        dias_vacaciones_programados=0,
        updated_by_id=current_superadmin.id,
        updated_by_nombre=current_superadmin.nombre,
    )
    db.add(nuevo_perfil)

    # Crear documentos estándar
    for tipo_doc, nombre_doc in DOCUMENTOS_ESTANDAR:
        db.add(
            EmpleadoDocumento(
                usuario_id=nuevo_usuario.id,
                tipo_documento=tipo_doc,
                nombre_documento=nombre_doc,
                estado="pendiente",
            )
        )

    # Historial de creación
    historial = EmpleadoHistorial(
        usuario_id=nuevo_usuario.id,
        actor_id=current_superadmin.id,
        actor_nombre=current_superadmin.nombre,
        actor_rol=current_superadmin.rol,
        campo_modificado="Creación de empleado",
        valor_anterior="—",
        valor_nuevo=f"Cargo: {nuevo_perfil.cargo}, Área: {nuevo_perfil.area}",
    )
    db.add(historial)
    db.commit()
    db.refresh(nuevo_perfil)

    registrar_auditoria(
        db,
        actor=current_superadmin,
        usuario_objetivo=nuevo_usuario,
        accion="crear_empleado_th",
        detalle=f"Creado empleado '{nuevo_usuario.nombre}' con cargo '{nuevo_perfil.cargo}'",
        resultado="exitoso",
    )

    # Cargar documentos creados
    stmt_docs = select(EmpleadoDocumento).where(EmpleadoDocumento.usuario_id == nuevo_usuario.id)
    documentos = db.scalars(stmt_docs).all()

    return EmpleadoCompletoAdminResponse(
        id=nuevo_usuario.id,
        nombre=nuevo_usuario.nombre,
        correo=nuevo_usuario.correo,
        codigo_empleado=nuevo_usuario.codigo_empleado,
        rol=nuevo_usuario.rol,
        activo=nuevo_usuario.activo,
        perfil=EmpleadoPerfilAdminResponse.model_validate(nuevo_perfil),
        documentos=[EmpleadoDocumentoResponse.model_validate(d) for d in documentos],
        historial=[EmpleadoHistorialResponse.model_validate(historial)],
    )


@router.get("/empleados/{usuario_id}", response_model=EmpleadoCompletoAdminResponse)
def obtener_empleado_admin(
    usuario_id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Retorna la ficha completa del empleado incluyendo salario, documentos e historial de cambios.
    """
    stmt_user = select(Usuario).where(Usuario.id == usuario_id)
    usuario = db.scalar(stmt_user)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado",
        )

    perfil = _asegurar_perfil_y_documentos_por_defecto(db, usuario)

    # Documentos
    stmt_docs = (
        select(EmpleadoDocumento)
        .where(EmpleadoDocumento.usuario_id == usuario.id)
        .order_by(EmpleadoDocumento.id.asc())
    )
    documentos = db.scalars(stmt_docs).all()

    # Historial
    stmt_hist = (
        select(EmpleadoHistorial)
        .where(EmpleadoHistorial.usuario_id == usuario.id)
        .order_by(EmpleadoHistorial.created_at.desc())
        .limit(30)
    )
    historial = db.scalars(stmt_hist).all()

    return EmpleadoCompletoAdminResponse(
        id=usuario.id,
        nombre=usuario.nombre,
        correo=usuario.correo,
        codigo_empleado=usuario.codigo_empleado,
        rol=usuario.rol,
        activo=usuario.activo,
        perfil=EmpleadoPerfilAdminResponse.model_validate(perfil),
        documentos=[EmpleadoDocumentoResponse.model_validate(d) for d in documentos],
        historial=[EmpleadoHistorialResponse.model_validate(h) for h in historial],
    )


@router.put("/empleados/{usuario_id}", response_model=EmpleadoCompletoAdminResponse)
def actualizar_empleado(
    usuario_id: int,
    datos: EmpleadoPerfilUpdate,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Actualiza la información personal, laboral, de emergencia y notas de un empleado.
    Registra automáticamente cada campo modificado en el historial.
    """
    stmt_user = select(Usuario).where(Usuario.id == usuario_id)
    usuario = db.scalar(stmt_user)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado",
        )

    # Verificar autoridad si el usuario objetivo es superadmin
    try:
        verificar_autoridad_sobre_usuario(current_admin, usuario)
    except HTTPException as exc:
        registrar_auditoria(
            db,
            actor=current_admin,
            usuario_objetivo=usuario,
            accion="editar_empleado_th",
            detalle="Intento bloqueado: admin sin autoridad sobre superadmin",
            resultado="fallido",
        )
        raise exc

    perfil = _asegurar_perfil_y_documentos_por_defecto(db, usuario)

    # Modificaciones en Usuario base
    cambios = []

    if datos.nombre is not None and datos.nombre.strip() != usuario.nombre:
        cambios.append(("Nombre", usuario.nombre, datos.nombre.strip()))
        usuario.nombre = datos.nombre.strip()

    if datos.correo is not None and datos.correo.strip().lower() != usuario.correo.lower():
        # Verificar unicidad
        stmt_c = select(Usuario).where(
            func.lower(Usuario.correo) == datos.correo.strip().lower(),
            Usuario.id != usuario.id,
        )
        if db.scalar(stmt_c):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El correo electrónico ya se encuentra registrado por otro usuario",
            )
        cambios.append(("Correo", usuario.correo, datos.correo.strip().lower()))
        usuario.correo = datos.correo.strip().lower()

    if datos.codigo_empleado is not None and datos.codigo_empleado.strip() != (usuario.codigo_empleado or ""):
        stmt_cod = select(Usuario).where(
            Usuario.codigo_empleado == datos.codigo_empleado.strip(),
            Usuario.id != usuario.id,
        )
        if db.scalar(stmt_cod):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El código de empleado ya se encuentra registrado por otro usuario",
            )
        cambios.append(("Código empleado", usuario.codigo_empleado or "—", datos.codigo_empleado.strip()))
        usuario.codigo_empleado = datos.codigo_empleado.strip()

    # Modificaciones en EmpleadoPerfil
    campos_mapeo = [
        ("cedula", "Cédula"),
        ("telefono", "Teléfono"),
        ("telefono_alternativo", "Teléfono alternativo"),
        ("fecha_nacimiento", "Fecha de nacimiento"),
        ("ciudad", "Ciudad"),
        ("direccion", "Dirección"),
        ("estado_civil", "Estado civil"),
        ("cargo", "Cargo"),
        ("area", "Área"),
        ("tipo_contrato", "Tipo de contrato"),
        ("fecha_ingreso", "Fecha de ingreso"),
        ("estado_laboral", "Estado laboral"),
        ("jefe_inmediato", "Jefe inmediato"),
        ("salario", "Salario"),
        ("contacto_emergencia_nombre", "Contacto de emergencia - Nombre"),
        ("contacto_emergencia_parentesco", "Contacto de emergencia - Parentesco"),
        ("contacto_emergencia_telefono", "Contacto de emergencia - Teléfono"),
        ("contacto_emergencia_telefono_alt", "Contacto de emergencia - Teléfono alt"),
        ("observaciones", "Observaciones"),
        ("dias_vacaciones_disponibles", "Vacaciones disponibles"),
        ("dias_vacaciones_tomados", "Vacaciones tomadas"),
        ("dias_vacaciones_programados", "Vacaciones programadas"),
    ]

    for attr, label in campos_mapeo:
        val_nuevo = getattr(datos, attr)
        if val_nuevo is not None:
            val_actual = getattr(perfil, attr)
            if str(val_actual) != str(val_nuevo):
                cambios.append((label, str(val_actual or "—"), str(val_nuevo)))
                setattr(perfil, attr, val_nuevo)

    # Actualizar metadatos de auditoría del perfil
    if cambios:
        perfil.updated_at = datetime.now()
        perfil.updated_by_id = current_admin.id
        perfil.updated_by_nombre = current_admin.nombre

        # Si cambió el estado laboral a inactivo, reflejarlo en usuario.activo
        if datos.estado_laboral:
            usuario.activo = datos.estado_laboral != "inactivo"

        for campo, val_ant, val_nue in cambios:
            db.add(
                EmpleadoHistorial(
                    usuario_id=usuario.id,
                    actor_id=current_admin.id,
                    actor_nombre=current_admin.nombre,
                    actor_rol=current_admin.rol,
                    campo_modificado=campo,
                    valor_anterior=val_ant,
                    valor_nuevo=val_nue,
                )
            )

        db.commit()
        db.refresh(usuario)
        db.refresh(perfil)

        registrar_auditoria(
            db,
            actor=current_admin,
            usuario_objetivo=usuario,
            accion="editar_empleado_th",
            detalle=f"Modificados {len(cambios)} campos: {', '.join(c[0] for c in cambios[:4])}",
            resultado="exitoso",
        )

    # Cargar documentos e historial
    stmt_docs = (
        select(EmpleadoDocumento)
        .where(EmpleadoDocumento.usuario_id == usuario.id)
        .order_by(EmpleadoDocumento.id.asc())
    )
    documentos = db.scalars(stmt_docs).all()

    stmt_hist = (
        select(EmpleadoHistorial)
        .where(EmpleadoHistorial.usuario_id == usuario.id)
        .order_by(EmpleadoHistorial.created_at.desc())
        .limit(30)
    )
    historial = db.scalars(stmt_hist).all()

    return EmpleadoCompletoAdminResponse(
        id=usuario.id,
        nombre=usuario.nombre,
        correo=usuario.correo,
        codigo_empleado=usuario.codigo_empleado,
        rol=usuario.rol,
        activo=usuario.activo,
        perfil=EmpleadoPerfilAdminResponse.model_validate(perfil),
        documentos=[EmpleadoDocumentoResponse.model_validate(d) for d in documentos],
        historial=[EmpleadoHistorialResponse.model_validate(h) for h in historial],
    )


@router.put("/empleados/{usuario_id}/estado", response_model=EmpleadoCompletoAdminResponse)
def cambiar_estado_empleado(
    usuario_id: int,
    datos: EmpleadoEstadoUpdate,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Cambia el estado laboral del empleado ('activo', 'inactivo', 'en_capacitacion').
    """
    stmt_user = select(Usuario).where(Usuario.id == usuario_id)
    usuario = db.scalar(stmt_user)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado",
        )

    verificar_autoridad_sobre_usuario(current_admin, usuario)

    perfil = _asegurar_perfil_y_documentos_por_defecto(db, usuario)
    estado_anterior = perfil.estado_laboral
    perfil.estado_laboral = datos.estado_laboral
    usuario.activo = datos.estado_laboral != "inactivo"
    perfil.updated_at = datetime.now()
    perfil.updated_by_id = current_admin.id
    perfil.updated_by_nombre = current_admin.nombre

    db.add(
        EmpleadoHistorial(
            usuario_id=usuario.id,
            actor_id=current_admin.id,
            actor_nombre=current_admin.nombre,
            actor_rol=current_admin.rol,
            campo_modificado="Estado laboral",
            valor_anterior=estado_anterior,
            valor_nuevo=datos.estado_laboral,
        )
    )
    db.commit()
    db.refresh(usuario)
    db.refresh(perfil)

    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=usuario,
        accion="cambiar_estado_laboral_th",
        detalle=f"Estado laboral: '{estado_anterior}' → '{datos.estado_laboral}'",
        resultado="exitoso",
    )

    stmt_docs = (
        select(EmpleadoDocumento)
        .where(EmpleadoDocumento.usuario_id == usuario.id)
        .order_by(EmpleadoDocumento.id.asc())
    )
    documentos = db.scalars(stmt_docs).all()

    stmt_hist = (
        select(EmpleadoHistorial)
        .where(EmpleadoHistorial.usuario_id == usuario.id)
        .order_by(EmpleadoHistorial.created_at.desc())
        .limit(30)
    )
    historial = db.scalars(stmt_hist).all()

    return EmpleadoCompletoAdminResponse(
        id=usuario.id,
        nombre=usuario.nombre,
        correo=usuario.correo,
        codigo_empleado=usuario.codigo_empleado,
        rol=usuario.rol,
        activo=usuario.activo,
        perfil=EmpleadoPerfilAdminResponse.model_validate(perfil),
        documentos=[EmpleadoDocumentoResponse.model_validate(d) for d in documentos],
        historial=[EmpleadoHistorialResponse.model_validate(h) for h in historial],
    )


@router.post("/empleados/{usuario_id}/documentos", response_model=EmpleadoDocumentoResponse)
async def subir_documento_empleado(
    usuario_id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
    tipo_documento: str = Form(...),
    nombre_documento: Optional[str] = Form(None),
):
    """
    Sube un documento (PDF, JPG, PNG) para un empleado y lo asocia a su expediente digital.
    """
    stmt_user = select(Usuario).where(Usuario.id == usuario_id)
    usuario = db.scalar(stmt_user)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado",
        )

    _asegurar_perfil_y_documentos_por_defecto(db, usuario)

    # Subir archivo a Cloudinary
    upload_res = await upload_documento_talento_humano(file)

    nombre_doc = nombre_documento or dict(DOCUMENTOS_ESTANDAR).get(tipo_documento, tipo_documento.replace("_", " ").title())

    # Buscar si ya existe el registro del documento
    stmt_doc = select(EmpleadoDocumento).where(
        EmpleadoDocumento.usuario_id == usuario.id,
        EmpleadoDocumento.tipo_documento == tipo_documento,
    )
    doc = db.scalar(stmt_doc)

    if doc:
        doc.nombre_documento = nombre_doc
        doc.url_archivo = upload_res.secure_url
        doc.public_id = upload_res.public_id
        doc.estado = "cargado"
        doc.fecha_carga = datetime.now()
        doc.cargado_por_id = current_admin.id
        doc.cargado_por_nombre = current_admin.nombre
    else:
        doc = EmpleadoDocumento(
            usuario_id=usuario.id,
            tipo_documento=tipo_documento,
            nombre_documento=nombre_doc,
            url_archivo=upload_res.secure_url,
            public_id=upload_res.public_id,
            estado="cargado",
            fecha_carga=datetime.now(),
            cargado_por_id=current_admin.id,
            cargado_por_nombre=current_admin.nombre,
        )
        db.add(doc)

    # Registrar en historial
    db.add(
        EmpleadoHistorial(
            usuario_id=usuario.id,
            actor_id=current_admin.id,
            actor_nombre=current_admin.nombre,
            actor_rol=current_admin.rol,
            campo_modificado=f"Documento: {nombre_doc}",
            valor_anterior="Pendiente",
            valor_nuevo="Cargado",
        )
    )

    db.commit()
    db.refresh(doc)

    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=usuario,
        accion="subir_documento_th",
        detalle=f"Documento '{nombre_doc}' cargado para {usuario.nombre}",
        resultado="exitoso",
    )

    return EmpleadoDocumentoResponse.model_validate(doc)


@router.delete("/empleados/{usuario_id}/documentos/{documento_id}")
def eliminar_documento_empleado(
    usuario_id: int,
    documento_id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Restaura el estado del documento a 'pendiente' y elimina la URL asociada,
    o elimina por completo el registro si es un documento personalizado.
    """
    stmt_doc = select(EmpleadoDocumento).where(
        EmpleadoDocumento.id == documento_id,
        EmpleadoDocumento.usuario_id == usuario_id,
    )
    doc = db.scalar(stmt_doc)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado",
        )

    nombre_doc = doc.nombre_documento
    tipo_estandar = dict(DOCUMENTOS_ESTANDAR)
    es_personalizado = doc.tipo_documento not in tipo_estandar

    db.add(
        EmpleadoHistorial(
            usuario_id=usuario_id,
            actor_id=current_admin.id,
            actor_nombre=current_admin.nombre,
            actor_rol=current_admin.rol,
            campo_modificado=f"Documento: {nombre_doc}",
            valor_anterior="Cargado",
            valor_nuevo="Eliminado" if es_personalizado else "Pendiente (Eliminado)",
        )
    )

    if es_personalizado:
        db.delete(doc)
        db.commit()
        return {
            "id": documento_id,
            "usuario_id": usuario_id,
            "tipo_documento": "personalizado",
            "nombre_documento": nombre_doc,
            "estado": "eliminado",
        }
    else:
        doc.url_archivo = None
        doc.public_id = None
        doc.estado = "pendiente"
        doc.fecha_carga = None
        doc.cargado_por_id = None
        doc.cargado_por_nombre = None
        db.commit()
        db.refresh(doc)
        return EmpleadoDocumentoResponse.model_validate(doc)


@router.get("/exportar-excel")
def exportar_excel_talento_humano(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Genera y descarga la planilla ejecutiva de Talento Humano en formato Excel (.xlsx).
    """
    stmt = select(Usuario).order_by(Usuario.nombre.asc())
    usuarios = db.scalars(stmt).all()

    data_empleados = []
    for u in usuarios:
        perfil = _asegurar_perfil_y_documentos_por_defecto(db, u)
        stmt_docs = select(EmpleadoDocumento).where(EmpleadoDocumento.usuario_id == u.id)
        docs = db.scalars(stmt_docs).all()
        cargados = sum(1 for d in docs if d.estado == "cargado")

        data_empleados.append({
            "nombre": u.nombre,
            "cedula": perfil.cedula or u.codigo_empleado,
            "codigo_empleado": u.codigo_empleado,
            "cargo": perfil.cargo,
            "area": perfil.area,
            "correo": u.correo,
            "telefono": perfil.telefono,
            "ciudad": perfil.ciudad,
            "fecha_ingreso": perfil.fecha_ingreso,
            "tipo_contrato": perfil.tipo_contrato,
            "jefe_inmediato": perfil.jefe_inmediato,
            "estado_laboral": perfil.estado_laboral,
            "salario": perfil.salario,
            "documentos_cargados": cargados,
            "documentos_totales": len(docs),
        })

    excel_stream = generar_excel_talento_humano(data_empleados)

    nombre_archivo = f"GSB_Talento_Humano_{date.today().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
    )


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINTS TÉCNICO / AUTOSERVICIO (CONSULTA SEGURA DE PROPIA FICHA)
# ══════════════════════════════════════════════════════════════════════


@router.get("/me", response_model=EmpleadoCompletoTecnicoResponse)
def obtener_mi_ficha_tecnico(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Retorna la ficha del propio usuario autenticado.
    GARANTÍA DE SEGURIDAD:
    - Excluye salario y notas internas confidenciales.
    - No permite consultar la ficha de ningún otro usuario.
    """
    perfil = _asegurar_perfil_y_documentos_por_defecto(db, current_user)

    stmt_docs = (
        select(EmpleadoDocumento)
        .where(EmpleadoDocumento.usuario_id == current_user.id)
        .order_by(EmpleadoDocumento.id.asc())
    )
    documentos = db.scalars(stmt_docs).all()

    stmt_sol = (
        select(EmpleadoSolicitud)
        .where(EmpleadoSolicitud.usuario_id == current_user.id)
        .order_by(EmpleadoSolicitud.created_at.desc())
    )
    solicitudes = db.scalars(stmt_sol).all()

    return EmpleadoCompletoTecnicoResponse(
        id=current_user.id,
        nombre=current_user.nombre,
        correo=current_user.correo,
        codigo_empleado=current_user.codigo_empleado,
        rol=current_user.rol,
        activo=current_user.activo,
        perfil=EmpleadoPerfilTecnicoResponse.model_validate(perfil),
        documentos=[EmpleadoDocumentoResponse.model_validate(d) for d in documentos],
        solicitudes=[EmpleadoSolicitudResponse.model_validate(s) for s in solicitudes],
    )


@router.get("/me/documentos", response_model=List[EmpleadoDocumentoResponse])
def listar_mis_documentos(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Lista los documentos disponibles para descarga por el empleado autenticado.
    """
    _asegurar_perfil_y_documentos_por_defecto(db, current_user)
    stmt_docs = (
        select(EmpleadoDocumento)
        .where(EmpleadoDocumento.usuario_id == current_user.id)
        .order_by(EmpleadoDocumento.id.asc())
    )
    docs = db.scalars(stmt_docs).all()
    return [EmpleadoDocumentoResponse.model_validate(d) for d in docs]


# ══════════════════════════════════════════════════════════════════════
#  SOLICITUDES DE TALENTO HUMANO (ACTUALIZACIÓN, CERTIFICADOS, PERMISOS)
# ══════════════════════════════════════════════════════════════════════


@router.post("/solicitudes", response_model=EmpleadoSolicitudResponse, status_code=status.HTTP_201_CREATED)
def crear_solicitud(
    datos: EmpleadoSolicitudCreate,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Permite al empleado enviar una solicitud formal a Talento Humano
    (ej: actualización de datos personales, certificado laboral, novedad, permiso, vacaciones).
    """
    solicitud = EmpleadoSolicitud(
        usuario_id=current_user.id,
        tipo=datos.tipo,
        asunto=datos.asunto.strip(),
        mensaje=datos.mensaje.strip(),
        estado="pendiente",
    )
    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)

    return EmpleadoSolicitudResponse.model_validate(solicitud)


@router.get("/solicitudes", response_model=List[EmpleadoSolicitudResponse])
def listar_solicitudes(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Lista solicitudes: Administradores ven todas las solicitudes; Técnicos solo las suyas.
    """
    if current_user.rol in ("admin", "superadmin"):
        stmt = select(EmpleadoSolicitud).order_by(EmpleadoSolicitud.created_at.desc())
    else:
        stmt = (
            select(EmpleadoSolicitud)
            .where(EmpleadoSolicitud.usuario_id == current_user.id)
            .order_by(EmpleadoSolicitud.created_at.desc())
        )
    solicitudes = db.scalars(stmt).all()
    return [EmpleadoSolicitudResponse.model_validate(s) for s in solicitudes]


@router.put("/solicitudes/{solicitud_id}/responder", response_model=EmpleadoSolicitudResponse)
def responder_solicitud(
    solicitud_id: int,
    datos: EmpleadoSolicitudRespuesta,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Permite a un administrador responder o cambiar el estado de una solicitud.
    """
    stmt = select(EmpleadoSolicitud).where(EmpleadoSolicitud.id == solicitud_id)
    solicitud = db.scalar(stmt)
    if not solicitud:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )

    solicitud.estado = datos.estado
    solicitud.respuesta_admin = datos.respuesta_admin
    solicitud.updated_at = datetime.now()
    db.commit()
    db.refresh(solicitud)

    return EmpleadoSolicitudResponse.model_validate(solicitud)
