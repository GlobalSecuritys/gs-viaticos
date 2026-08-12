from datetime import date
from decimal import Decimal
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.viatico import Viatico
from app.schemas.viatico import (
    ViaticoResponse,
    ViaticoAdminResponse,
    ViaticoPresupuestoUpdate,
    ViaticoEstadoUpdate,
    AsignacionResumenViatico,
)
from app.services.excel_export import generar_excel_viaticos_independientes
from app.core.config import settings
from app.core.security import get_current_admin, get_current_superadmin
from app.database import get_db
from app.models.log_auditoria import LogAuditoria
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.schemas.log_auditoria import LogAuditoriaResponse
from app.schemas.notificacion import NotificacionResponse
from app.services.auditoria import registrar_auditoria
# reemplazar:
from app.schemas.usuario import AdminBootstrap, UsuarioResponse, UsuarioRolUpdate

# por:
from app.core.security import hash_password, verificar_autoridad_sobre_usuario
from app.schemas.usuario import (
    AdminBootstrap,
    UsuarioCreateAdmin,
    UsuarioEstadoUpdate,
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



def _hacer_viatico_admin_response(v: Viatico) -> ViaticoAdminResponse:
    asig_res = None
    if v.asignacion:
        viaticos_asig = v.asignacion.viaticos if hasattr(v.asignacion, "viaticos") and v.asignacion.viaticos else []
        total_gastado = sum(item.valor for item in viaticos_asig if item.estado != "rechazado") if viaticos_asig else Decimal("0.00")
        anticipo = v.asignacion.monto_anticipo if v.asignacion.monto_anticipo is not None else Decimal("0.00")
        saldo_restante = max(Decimal("0.00"), anticipo - total_gastado)
        asig_res = AsignacionResumenViatico(
            id=v.asignacion.id,
            cliente=v.asignacion.cliente,
            ciudad=v.asignacion.ciudad,
            monto_anticipo=anticipo,
            total_gastado=total_gastado,
            saldo_restante=saldo_restante,
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
    db.refresh(viatico)
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
    db.refresh(viatico)
    return viatico

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