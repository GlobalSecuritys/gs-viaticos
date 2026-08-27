from datetime import date
from decimal import Decimal
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.viatico import Viatico
from app.models.evidencia_viatico import EvidenciaViatico
from app.models.cuenta_cobro import CuentaCobro  # noqa: F401 – necesario para eager load
from app.models.asignacion import Asignacion
from app.models.cuenta_cobro_asignacion import CuentaCobroAsignacion
from app.models.talento_humano import (
    EmpleadoPerfil,
    EmpleadoDocumento,
    EmpleadoHistorial,
    EmpleadoSolicitud,
)
from app.schemas.viatico import (
    ViaticoResponse,
    ViaticoAdminResponse,
    ViaticoPresupuestoUpdate,
    ViaticoEstadoUpdate,
    AsignacionResumenViatico,
    EvidenciaResponse,
)
from app.services.excel_export import generar_excel_viaticos_independientes
from app.core.cloudinary import upload_evidencia_viatico
from app.core.config import settings
from app.core.security import get_current_admin, get_current_superadmin, get_current_master_admin, hash_password, verificar_autoridad_sobre_usuario
from app.database import get_db
from app.models.log_auditoria import LogAuditoria
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.schemas.log_auditoria import LogAuditoriaResponse
from app.schemas.notificacion import NotificacionResponse
from app.services.auditoria import registrar_auditoria
from app.schemas.usuario import (
    AdminBootstrap,
    UsuarioCreateAdmin,
    UsuarioEstadoUpdate,
    UsuarioAccesoViaticosUpdate,
    UsuarioInfoUpdate,
    UsuarioResponse,
    UsuarioRolUpdate,
)

router = APIRouter(prefix="/admin", tags=["Administración"])


@router.post("/bootstrap", response_model=UsuarioResponse)
def bootstrap_admin(
    datos: AdminBootstrap,
    db: Annotated[Session, Depends(get_db)]
):
    if datos.master_key != settings.MASTER_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clave maestra incorrecta"
        )

    stmt = select(Usuario).where(Usuario.correo == datos.correo)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    usuario.rol = "admin"
    db.commit()
    db.refresh(usuario)
    return usuario

@router.post("/usuarios", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    datos: UsuarioCreateAdmin,
    current_superadmin: Annotated[Usuario, Depends(get_current_superadmin)],
    db: Annotated[Session, Depends(get_db)]
):
    """Creación de técnicos/admins por Super Admin. NO reemplaza /auth/registro
    (que sigue creando técnicos vía autoregistro público). El schema
    UsuarioCreateAdmin ya impide 'superadmin' como valor de rol."""
    stmt = select(Usuario).where(Usuario.correo == datos.correo)
    if db.scalar(stmt):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo electrónico ya se encuentra registrado"
        )

    stmt_codigo = select(Usuario).where(Usuario.codigo_empleado == datos.codigo_empleado)
    if db.scalar(stmt_codigo):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El código de empleado ya se encuentra registrado."
        )

    nuevo_usuario = Usuario(
        nombre=datos.nombre,
        correo=datos.correo,
        codigo_empleado=datos.codigo_empleado,
        password_hash=hash_password(datos.password),
        rol=datos.rol,
        activo=True
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    registrar_auditoria(
        db,
        actor=current_superadmin,
        usuario_objetivo=nuevo_usuario,
        accion="crear_usuario",
        detalle=f"rol asignado: {nuevo_usuario.rol}",
        resultado="exitoso",
    )

    return nuevo_usuario

@router.put("/usuarios/{id}", response_model=UsuarioResponse)
def editar_usuario(
    id: int,
    datos: UsuarioInfoUpdate,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    """Editar nombre/correo/código de empleado. Mismo patrón de protección
    que el resto de acciones sobre otro usuario: get_current_admin +
    verificar_autoridad_sobre_usuario (un admin normal no puede editar a un
    superadmin). Sí se puede usar sobre la propia cuenta."""
    stmt = select(Usuario).where(Usuario.id == id)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    try:
        verificar_autoridad_sobre_usuario(current_admin, usuario)
    except HTTPException as exc:
        registrar_auditoria(
            db,
            actor=current_admin,
            usuario_objetivo=usuario,
            accion="editar_usuario",
            detalle="Intento bloqueado: admin sin autoridad sobre superadmin",
            resultado="fallido",
        )
        raise exc

    stmt_correo = select(Usuario).where(
        Usuario.correo == datos.correo, Usuario.id != id
    )
    if db.scalar(stmt_correo):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo electrónico ya se encuentra registrado"
        )

    if datos.codigo_empleado is not None:
        stmt_codigo = select(Usuario).where(
            Usuario.codigo_empleado == datos.codigo_empleado, Usuario.id != id
        )
        if db.scalar(stmt_codigo):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El código de empleado ya se encuentra registrado."
            )

    usuario.nombre = datos.nombre
    usuario.correo = datos.correo
    usuario.codigo_empleado = datos.codigo_empleado
    db.commit()
    db.refresh(usuario)

    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=usuario,
        accion="editar_usuario",
        detalle=f"nombre='{usuario.nombre}', correo='{usuario.correo}'",
        resultado="exitoso",
    )

    return usuario

@router.put("/usuarios/{id}/rol", response_model=UsuarioResponse)
def cambiar_rol_usuario(
    id: int,
    datos: UsuarioRolUpdate,
    current_superadmin: Annotated[Usuario, Depends(get_current_superadmin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Usuario).where(Usuario.id == id)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if usuario.id == current_superadmin.id and datos.rol != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes quitarte el rol de superadministrador."
        )

    rol_anterior = usuario.rol
    usuario.rol = datos.rol
    db.commit()
    db.refresh(usuario)

    registrar_auditoria(
        db,
        actor=current_superadmin,
        usuario_objetivo=usuario,
        accion="cambiar_rol",
        detalle=f"rol: '{rol_anterior}' → '{usuario.rol}'",
        resultado="exitoso",
    )

    return usuario

@router.put("/usuarios/{id}/estado", response_model=UsuarioResponse)
def cambiar_estado_usuario(
    id: int,
    datos: UsuarioEstadoUpdate,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    """Activar/desactivar usuario. Mismo patrón de protección que
    aprobar_viatico/rechazar_viatico: get_current_admin (admin o superadmin)
    + verificar_autoridad_sobre_usuario (bloquea que un admin normal actúe
    sobre un superadmin). Además nadie puede desactivarse a sí mismo, para
    no dejar el sistema sin ningún admin activo que pueda revertirlo."""
    stmt = select(Usuario).where(Usuario.id == id)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    try:
        verificar_autoridad_sobre_usuario(current_admin, usuario)
    except HTTPException as exc:
        registrar_auditoria(
            db,
            actor=current_admin,
            usuario_objetivo=usuario,
            accion="cambiar_estado",
            detalle="Intento bloqueado: admin sin autoridad sobre superadmin",
            resultado="fallido",
        )
        raise exc

    if usuario.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes activar o desactivar tu propia cuenta."
        )

    usuario.activo = datos.activo
    db.commit()
    db.refresh(usuario)

    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=usuario,
        accion="cambiar_estado",
        detalle=f"activo={usuario.activo}",
        resultado="exitoso",
    )

    return usuario


@router.put("/usuarios/{id}/acceso-viaticos", response_model=UsuarioResponse)
def cambiar_acceso_viaticos_usuario(
    id: int,
    datos: UsuarioAccesoViaticosUpdate,
    current_master_admin: Annotated[Usuario, Depends(get_current_master_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    """Permite otorgar o quitar acceso a viáticos a un usuario.
    Exclusivo para el usuario cuyo correo es 'admin@gsbank.com'.
    Cualquier otro usuario (incluidos otros superadmins) recibe un 403.
    """
    stmt = select(Usuario).where(Usuario.id == id)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    valor_anterior = usuario.acceso_viaticos
    usuario.acceso_viaticos = datos.acceso_viaticos
    db.commit()
    db.refresh(usuario)

    registrar_auditoria(
        db,
        actor=current_master_admin,
        usuario_objetivo=usuario,
        accion="cambiar_acceso_viaticos",
        detalle=f"acceso_viaticos: {valor_anterior} → {usuario.acceso_viaticos}",
        resultado="exitoso",
    )

    return usuario


@router.delete("/usuarios/{id}", status_code=status.HTTP_200_OK)
def eliminar_usuario_definitivo(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Eliminación permanente y definitiva de un usuario y toda su información relacionada:
    - Cuentas de cobro independientes y de asignaciones
    - Viáticos y evidencias asociadas
    - Asignaciones donde es el técnico asignado
    - Reasignación de 'creado_por_id' si el usuario creó asignaciones para otros
    - Datos de Talento Humano (perfil, documentos, historial, solicitudes)
    - Registro inmutable en logs de auditoría
    - Registro del usuario en base de datos
    """
    stmt = select(Usuario).where(Usuario.id == id)
    usuario = db.scalar(stmt)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if usuario.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propia cuenta."
        )

    try:
        verificar_autoridad_sobre_usuario(current_admin, usuario)
    except HTTPException as exc:
        registrar_auditoria(
            db,
            actor=current_admin,
            usuario_objetivo=usuario,
            accion="eliminar_usuario",
            detalle="Intento bloqueado: admin sin autoridad sobre superadmin",
            resultado="fallido",
        )
        raise exc

    # 1. Eliminar Cuentas de Cobro independientes del usuario
    db.query(CuentaCobro).filter(CuentaCobro.usuario_id == id).delete(synchronize_session=False)

    # 2. Obtener y eliminar viáticos del usuario y sus evidencias
    viaticos_usuario = db.query(Viatico).filter(Viatico.usuario_id == id).all()
    viatico_ids = [v.id for v in viaticos_usuario]
    if viatico_ids:
        # Cuentas de cobro ligadas a estos viáticos
        db.query(CuentaCobro).filter(CuentaCobro.viatico_id.in_(viatico_ids)).delete(synchronize_session=False)
        # Evidencias de los viáticos
        db.query(EvidenciaViatico).filter(EvidenciaViatico.viatico_id.in_(viatico_ids)).delete(synchronize_session=False)
        # Viáticos
        db.query(Viatico).filter(Viatico.id.in_(viatico_ids)).delete(synchronize_session=False)

    # 3. Asignaciones donde el usuario es el técnico asignado
    asignaciones_tecnico = db.query(Asignacion).filter(Asignacion.tecnico_id == id).all()
    asig_ids = [a.id for a in asignaciones_tecnico]
    if asig_ids:
        # Cuentas de cobro de asignación
        db.query(CuentaCobroAsignacion).filter(CuentaCobroAsignacion.asignacion_id.in_(asig_ids)).delete(synchronize_session=False)
        # Viáticos vinculados a estas asignaciones (si hubiera de otros)
        viaticos_asig = db.query(Viatico).filter(Viatico.asignacion_id.in_(asig_ids)).all()
        v_asig_ids = [v.id for v in viaticos_asig]
        if v_asig_ids:
            db.query(CuentaCobro).filter(CuentaCobro.viatico_id.in_(v_asig_ids)).delete(synchronize_session=False)
            db.query(EvidenciaViatico).filter(EvidenciaViatico.viatico_id.in_(v_asig_ids)).delete(synchronize_session=False)
            db.query(Viatico).filter(Viatico.id.in_(v_asig_ids)).delete(synchronize_session=False)
        # Eliminar asignaciones del técnico
        db.query(Asignacion).filter(Asignacion.id.in_(asig_ids)).delete(synchronize_session=False)

    # 4. Cuentas de cobro de asignación donde tecnico_id sea este usuario
    db.query(CuentaCobroAsignacion).filter(CuentaCobroAsignacion.tecnico_id == id).delete(synchronize_session=False)

    # 5. Si el usuario creó asignaciones para otros técnicos, reasignar creado_por_id al admin actual
    db.query(Asignacion).filter(Asignacion.creado_por_id == id).update(
        {Asignacion.creado_por_id: current_admin.id}, synchronize_session=False
    )

    # 6. Tablas de Talento Humano
    db.query(EmpleadoDocumento).filter(EmpleadoDocumento.usuario_id == id).delete(synchronize_session=False)
    db.query(EmpleadoHistorial).filter(EmpleadoHistorial.usuario_id == id).delete(synchronize_session=False)
    db.query(EmpleadoSolicitud).filter(EmpleadoSolicitud.usuario_id == id).delete(synchronize_session=False)
    db.query(EmpleadoPerfil).filter(EmpleadoPerfil.usuario_id == id).delete(synchronize_session=False)

    # 7. Registrar auditoría con snapshot antes de borrar el usuario
    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=usuario,
        accion="eliminar_usuario",
        detalle=f"Eliminación definitiva de usuario '{usuario.nombre}' ({usuario.correo}, rol: {usuario.rol}) y todos sus datos asociados.",
        resultado="exitoso",
    )

    # 8. Eliminar el usuario
    db.delete(usuario)
    db.commit()

    return {"detail": f"Usuario '{usuario.nombre}' y todos sus datos han sido eliminados permanentemente."}



def _hacer_viatico_admin_response(v: Viatico) -> ViaticoAdminResponse:
    asig_res = None
    if v.asignacion:
        viaticos_asig = v.asignacion.viaticos if hasattr(v.asignacion, "viaticos") and v.asignacion.viaticos else []
        total_gastado = sum(item.valor for item in viaticos_asig if item.estado != "rechazado") if viaticos_asig else Decimal("0.00")
        anticipo = v.asignacion.monto_anticipo if v.asignacion.monto_anticipo is not None else Decimal("0.00")
        saldo_restante = max(Decimal("0.00"), anticipo - total_gastado)
        saldo_favor_tecnico = max(Decimal("0.00"), total_gastado - anticipo)
        asig_res = AsignacionResumenViatico(
            id=v.asignacion.id,
            cliente=v.asignacion.cliente,
            empresa=v.asignacion.empresa,
            tipo=v.asignacion.tipo,
            ciudad=v.asignacion.ciudad,
            monto_anticipo=anticipo,
            total_gastado=total_gastado,
            saldo_restante=saldo_restante,
            saldo_favor_tecnico=saldo_favor_tecnico,
        )

    return ViaticoAdminResponse(
        id=v.id,
        fecha=v.fecha,
        cliente=v.cliente,
        ciudad=v.ciudad,
        ot=v.ot,
        tipo_gasto=v.tipo_gasto,
        valor=v.valor,
        monto_presupuesto=v.monto_presupuesto,
        comentario_admin=v.comentario_admin,
        descripcion=v.descripcion,
        tipo_identificacion=v.tipo_identificacion,
        nit_identificacion=v.nit_identificacion,
        usuario_id=v.usuario_id,
        asignacion_id=v.asignacion_id,
        estado=v.estado,
        created_at=v.created_at,
        updated_at=v.updated_at,
        evidencias=v.evidencias,
        codigo_empleado=v.usuario.codigo_empleado,
        nombre=v.usuario.nombre,
        correo=v.usuario.correo,
        asignacion_resumen=asig_res,
        cuenta_cobro=v.cuenta_cobro if hasattr(v, 'cuenta_cobro') else None,
    )


@router.get("/viaticos", response_model=List[ViaticoAdminResponse])
def listar_todos_los_viaticos(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.usuario),
            joinedload(Viatico.evidencias),
            joinedload(Viatico.asignacion),
            joinedload(Viatico.cuenta_cobro),
        )
        .order_by(
            (Viatico.estado == "pendiente").desc(),
            Viatico.created_at.desc()
        )
    )

    viaticos = db.execute(stmt).unique().scalars().all()
    return [_hacer_viatico_admin_response(v) for v in viaticos]


@router.get("/viaticos/exportar")
def exportar_viaticos_independientes(
    usuario_id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
):
    """
    Exporta a Excel (.xlsx) los viáticos independientes (asignacion_id IS NULL)
    del usuario especificado, filtrados opcionalmente por rango de fechas.
    """
    usuario = db.scalar(select(Usuario).where(Usuario.id == usuario_id))
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    stmt = (
        select(Viatico)
        .options(joinedload(Viatico.evidencias))
        .where(
            Viatico.usuario_id == usuario_id,
            Viatico.asignacion_id.is_(None),
        )
    )

    if fecha_inicio is not None:
        stmt = stmt.where(Viatico.fecha >= fecha_inicio)
    if fecha_fin is not None:
        stmt = stmt.where(Viatico.fecha <= fecha_fin)

    stmt = stmt.order_by(Viatico.fecha.asc(), Viatico.id.asc())
    viaticos = db.execute(stmt).unique().scalars().all()

    excel_stream = generar_excel_viaticos_independientes(
        usuario=usuario,
        viaticos=viaticos,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )

    filename = f"viaticos_independientes_{usuario_id}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.put("/viaticos/{id}/presupuesto", response_model=ViaticoAdminResponse)
def definir_presupuesto_viatico(
    id: int,
    datos: ViaticoPresupuestoUpdate,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.usuario),
            joinedload(Viatico.evidencias),
            joinedload(Viatico.asignacion),
            joinedload(Viatico.cuenta_cobro),
        )
        .where(Viatico.id == id)
    )
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viático no encontrado")

    verificar_autoridad_sobre_usuario(current_admin, viatico.usuario)

    viatico.monto_presupuesto = datos.monto_presupuesto
    db.commit()
    db.refresh(viatico)

    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=viatico.usuario,
        accion="definir_presupuesto_viatico",
        detalle=f"viático #{viatico.id}, presupuesto={datos.monto_presupuesto}",
        resultado="exitoso",
    )

    return _hacer_viatico_admin_response(viatico)


@router.put("/viaticos/{id}/aprobar", response_model=ViaticoResponse)
def aprobar_viatico(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    datos: ViaticoEstadoUpdate | None = None,
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.usuario),
            joinedload(Viatico.asignacion),
        )
        .where(Viatico.id == id)
    )
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viático no encontrado")

    verificar_autoridad_sobre_usuario(current_admin, viatico.usuario)

    if viatico.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Este viático ya fue procesado (estado actual: {viatico.estado})"
        )

    viatico.estado = "aprobado"
    if datos and datos.comentario_admin is not None:
        viatico.comentario_admin = datos.comentario_admin
    db.commit()

    # Re-fetch con eager load para serializar correctamente ViaticoResponse
    viatico = db.scalar(
        select(Viatico)
        .options(
            joinedload(Viatico.usuario),
            joinedload(Viatico.evidencias),
            joinedload(Viatico.asignacion),
            joinedload(Viatico.cuenta_cobro),
        )
        .where(Viatico.id == id)
    )
    return viatico


@router.put("/viaticos/{id}/rechazar", response_model=ViaticoResponse)
def rechazar_viatico(
    id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
    datos: ViaticoEstadoUpdate | None = None,
):
    stmt = (
        select(Viatico)
        .options(
            joinedload(Viatico.usuario),
            joinedload(Viatico.asignacion),
        )
        .where(Viatico.id == id)
    )
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viático no encontrado")

    verificar_autoridad_sobre_usuario(current_admin, viatico.usuario)

    if viatico.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Este viático ya fue procesado (estado actual: {viatico.estado})"
        )

    viatico.estado = "rechazado"
    if datos and datos.comentario_admin is not None:
        viatico.comentario_admin = datos.comentario_admin
    db.commit()

    # Re-fetch con eager load para serializar correctamente ViaticoResponse
    viatico = db.scalar(
        select(Viatico)
        .options(
            joinedload(Viatico.usuario),
            joinedload(Viatico.evidencias),
            joinedload(Viatico.asignacion),
            joinedload(Viatico.cuenta_cobro),
        )
        .where(Viatico.id == id)
    )
    return viatico


@router.post(
    "/viaticos/{id}/evidencias",
    response_model=EvidenciaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def subir_evidencia_admin(
    id: int,
    file: Annotated[UploadFile, File(description="Fotografía de soporte administrativo")],
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Permite al administrador subir una fotografía adicional de soporte
    para un viático específico, registrada con origen='admin'.
    Reutiliza exactamente la misma validación de tipo de archivo y tamaño
    de upload_evidencia_viatico.
    """
    stmt = (
        select(Viatico)
        .options(joinedload(Viatico.usuario))
        .where(Viatico.id == id)
    )
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado",
        )

    verificar_autoridad_sobre_usuario(current_admin, viatico.usuario)

    upload_result = await upload_evidencia_viatico(file)

    nueva_evidencia = EvidenciaViatico(
        viatico_id=viatico.id,
        secure_url=upload_result.secure_url,
        public_id=upload_result.public_id,
        origen="admin",
    )
    db.add(nueva_evidencia)
    db.commit()
    db.refresh(nueva_evidencia)

    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=viatico.usuario,
        accion="subir_evidencia_admin",
        detalle=f"viático #{viatico.id}, evidencia_id={nueva_evidencia.id}",
        resultado="exitoso",
    )

    return nueva_evidencia


@router.delete(
    "/viaticos/{id}/evidencias/{evidencia_id}",
    status_code=status.HTTP_200_OK,
)
def eliminar_evidencia_admin(
    id: int,
    evidencia_id: int,
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Permite al administrador eliminar una fotografía de evidencia/soporte
    asociada a un viático (por ejemplo, si se subió una foto incorrecta).
    """
    stmt = (
        select(Viatico)
        .options(joinedload(Viatico.usuario))
        .where(Viatico.id == id)
    )
    viatico = db.scalar(stmt)
    if not viatico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viático no encontrado",
        )

    verificar_autoridad_sobre_usuario(current_admin, viatico.usuario)

    stmt_ev = select(EvidenciaViatico).where(
        EvidenciaViatico.id == evidencia_id,
        EvidenciaViatico.viatico_id == id,
    )
    evidencia = db.scalar(stmt_ev)
    if not evidencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidencia no encontrada para este viático",
        )

    origen_borrado = evidencia.origen
    db.delete(evidencia)
    db.commit()

    registrar_auditoria(
        db,
        actor=current_admin,
        usuario_objetivo=viatico.usuario,
        accion="eliminar_evidencia_admin",
        detalle=f"viático #{viatico.id}, evidencia_id={evidencia_id}, origen={origen_borrado}",
        resultado="exitoso",
    )

    return {"detail": "Evidencia eliminada correctamente"}


@router.get("/usuarios", response_model=List[UsuarioResponse])
def listar_usuarios(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Usuario).order_by(Usuario.id.asc())
    usuarios = db.scalars(stmt).all()
    return usuarios


@router.get("/auditoria", response_model=List[LogAuditoriaResponse])
def listar_auditoria(
    current_superadmin: Annotated[Usuario, Depends(get_current_superadmin)],
    db: Annotated[Session, Depends(get_db)],
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    actor_id: Optional[int] = None,
    usuario_objetivo_id: Optional[int] = None,
    accion: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """Exclusivo SuperAdmin. Filtros básicos + paginación limit/offset."""
    stmt = select(LogAuditoria)

    if fecha_desde is not None:
        stmt = stmt.where(LogAuditoria.created_at >= fecha_desde)
    if fecha_hasta is not None:
        stmt = stmt.where(LogAuditoria.created_at < fecha_hasta)
    if actor_id is not None:
        stmt = stmt.where(LogAuditoria.actor_id == actor_id)
    if usuario_objetivo_id is not None:
        stmt = stmt.where(LogAuditoria.usuario_objetivo_id == usuario_objetivo_id)
    if accion is not None:
        stmt = stmt.where(LogAuditoria.accion == accion)

    stmt = stmt.order_by(LogAuditoria.created_at.desc()).limit(limit).offset(offset)

    return db.scalars(stmt).all()


@router.get("/notificaciones", response_model=List[NotificacionResponse])
def listar_notificaciones(
    current_admin: Annotated[Usuario, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)]
):
    stmt = select(Notificacion).order_by(Notificacion.created_at.desc())
    return db.scalars(stmt).all()