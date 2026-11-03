"""
Servicio de lógica de negocio para planillas app-managed (Comware y futuras).

Todas las operaciones usan UNA sola transacción. Si falla un ítem,
no se guarda nada (la excepción burbujea hasta el endpoint que hace rollback).

Convenciones:
  - serial siempre en MAYÚSCULAS y sin espacios al guardar.
  - tecnico y oficina en MAYÚSCULAS y sin espacios en extremos.
  - FIFO (fecha ASC) para despacho sin serial.
  - SELECT FOR UPDATE para evitar despachos concurrentes del mismo serial.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.inventario_registros import InventarioHistorialMovimiento, InventarioRegistro
from app.schemas.inventario_comware import (
    EntradaCreate,
    InstalacionCreate,
    SalidaCreate,
    ResumenPlanillaApp,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalizar_serial(s: str) -> str:
    return s.strip().upper()


def _normalizar_texto(s: str) -> str:
    return s.strip().upper()


def _generar_concatenado(serial: Optional[str], id_equipo: Optional[str]) -> Optional[str]:
    """Fórmula del Excel: GSB<serial>-SN<id_equipo>."""
    if serial:
        return f"GSB{serial}-SN{id_equipo or ''}"
    return None


def _hoy() -> date:
    return datetime.now().date()


# ─────────────────────────────────────────────────────────────────────────────
# Resumen
# ─────────────────────────────────────────────────────────────────────────────

def calcular_resumen_app(db: Session, planilla_id: int) -> ResumenPlanillaApp:
    """Calcula el resumen actual de la planilla desde inventario_registros."""
    rows = db.execute(
        text(
            "SELECT estado, COUNT(*) FROM inventario_registros "
            "WHERE planilla_id = :pid AND anulado_en IS NULL "
            "GROUP BY estado"
        ),
        {"pid": planilla_id},
    ).fetchall()

    conteos: Dict[str, int] = {r[0]: r[1] for r in rows}
    bodega = conteos.get("stock", 0)
    pendientes = conteos.get("pendiente", 0)
    instaladas = conteos.get("instalado", 0)
    salidas_totales = pendientes + instaladas
    total_registros = sum(conteos.values())

    # Último movimiento
    ult = db.execute(
        text(
            "SELECT MAX(fecha) FROM inventario_historial_movimientos "
            "WHERE planilla_id = :pid"
        ),
        {"pid": planilla_id},
    ).scalar()
    ultimo_movimiento = ult.isoformat() if ult else None

    return ResumenPlanillaApp(
        bodega=bodega,
        salidas_totales=salidas_totales,
        pendientes=pendientes,
        instaladas=instaladas,
        total_registros=total_registros,
        ultimo_movimiento=ultimo_movimiento,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Catálogo / Autocompletar
# ─────────────────────────────────────────────────────────────────────────────

def calcular_catalogo(db: Session, planilla_id: int) -> List[Dict[str, Any]]:
    """Descripciones únicas con stock y sugerencia de tipo serial."""
    rows = db.execute(
        text(
            """
            SELECT
                descripcion,
                COUNT(*) FILTER (WHERE estado = 'stock') AS en_stock,
                COUNT(*) FILTER (WHERE estado = 'stock' AND serial IS NOT NULL AND serial != '') AS con_serial
            FROM inventario_registros
            WHERE planilla_id = :pid AND anulado_en IS NULL
            GROUP BY descripcion
            ORDER BY descripcion
            """
        ),
        {"pid": planilla_id},
    ).fetchall()

    return [
        {
            "descripcion": r[0],
            "en_stock": r[1],
            "con_serial": r[2],
            "sin_serial": r[1] - r[2],
            "tipo_sugerido": "con_serial" if r[2] > 0 else "sin_serial",
        }
        for r in rows
    ]


def calcular_tecnicos(db: Session, planilla_id: int) -> List[str]:
    """Lista de técnicos únicos (normalizados) que han tenido salidas."""
    rows = db.execute(
        text(
            "SELECT DISTINCT UPPER(TRIM(tecnico)) FROM inventario_registros "
            "WHERE planilla_id = :pid AND tecnico IS NOT NULL AND tecnico != '' "
            "ORDER BY 1"
        ),
        {"pid": planilla_id},
    ).fetchall()
    return [r[0] for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# ENTRADA
# ─────────────────────────────────────────────────────────────────────────────

def registrar_entrada(
    db: Session,
    planilla_id: int,
    datos: EntradaCreate,
    usuario_id: int,
) -> Tuple[List[InventarioRegistro], ResumenPlanillaApp]:
    """
    Crea N filas en inventario_registros con estado='stock'.
    Con serial: 1 fila por serial. Sin serial: N filas con cantidad=1.
    Retorna (registros_creados, resumen_actualizado).
    """
    fecha = datos.fecha or _hoy()
    creados: List[InventarioRegistro] = []
    detalle_items_log: List[Dict] = []

    for item in datos.items:
        descripcion = item.descripcion.strip()

        if item.tipo_serial == "con_serial":
            seriales = [_normalizar_serial(s) for s in (item.seriales or []) if s.strip()]
            if not seriales:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Ítem '{descripcion}': debe tener al menos un serial.",
                )

            # Verificar seriales únicos en el lote
            if len(seriales) != len(set(seriales)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Ítem '{descripcion}': hay seriales repetidos en el formulario.",
                )

            # Verificar que no existan en la planilla
            existentes = db.execute(
                text(
                    "SELECT serial FROM inventario_registros "
                    "WHERE planilla_id = :pid AND serial = ANY(:seriales) AND anulado_en IS NULL"
                ),
                {"pid": planilla_id, "seriales": seriales},
            ).fetchall()
            if existentes:
                dup = [r[0] for r in existentes]
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Seriales ya registrados en la planilla: {', '.join(dup)}",
                )

            id_equipos = item.id_equipos or []
            for i, serial in enumerate(seriales):
                id_equipo = id_equipos[i].strip() if i < len(id_equipos) else None
                reg = InventarioRegistro(
                    planilla_id=planilla_id,
                    hoja="INVENTARIO GENERAL",
                    estado="stock",
                    fecha=fecha,
                    numero_orden=datos.numero_orden,
                    codigo_barras=datos.codigo_barras,
                    descripcion=descripcion,
                    cantidad=1,
                    id_equipo=id_equipo or None,
                    serial=serial,
                    concatenado=_generar_concatenado(serial, id_equipo),
                    creado_por_id=usuario_id,
                )
                db.add(reg)
                creados.append(reg)

            detalle_items_log.append(
                {"descripcion": descripcion, "seriales": seriales, "cantidad": len(seriales)}
            )

        else:  # sin_serial
            cantidad = item.cantidad or 0
            if cantidad <= 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Ítem '{descripcion}': la cantidad debe ser > 0.",
                )
            for _ in range(cantidad):
                reg = InventarioRegistro(
                    planilla_id=planilla_id,
                    hoja="INVENTARIO GENERAL",
                    estado="stock",
                    fecha=fecha,
                    numero_orden=datos.numero_orden,
                    codigo_barras=datos.codigo_barras,
                    descripcion=descripcion,
                    cantidad=1,
                    creado_por_id=usuario_id,
                )
                db.add(reg)
                creados.append(reg)

            detalle_items_log.append({"descripcion": descripcion, "cantidad": cantidad})

    db.flush()  # Obtener IDs antes del historial

    # Historial
    total_uds = len(creados)
    hist = InventarioHistorialMovimiento(
        planilla_id=planilla_id,
        tipo="entrada",
        usuario_id=usuario_id,
        fecha=datetime.now(),
        detalle_items=detalle_items_log,
        datos_despacho={"numero_orden": datos.numero_orden, "fecha": str(fecha)},
        resumen_texto=f"Entrada de {total_uds} unidad(es)",
    )
    db.add(hist)
    db.flush()

    resumen = calcular_resumen_app(db, planilla_id)
    return creados, resumen


# ─────────────────────────────────────────────────────────────────────────────
# SALIDA
# ─────────────────────────────────────────────────────────────────────────────

def registrar_salida(
    db: Session,
    planilla_id: int,
    datos: SalidaCreate,
    usuario_id: int,
) -> Tuple[List[InventarioRegistro], ResumenPlanillaApp]:
    """
    Mueve filas de estado='stock' a estado='pendiente'.
    Con serial: busca por serial exacto (+ SELECT FOR UPDATE).
    Sin serial: FIFO (fecha ASC), toma las más antiguas primero.
    """
    fecha_despacho = datos.fecha_despacho or _hoy()
    tecnico = _normalizar_texto(datos.tecnico)
    oficina = _normalizar_texto(datos.oficina)
    despachados: List[InventarioRegistro] = []
    detalle_items_log: List[Dict] = []

    for item in datos.items:
        if item.tipo_serial == "con_serial":
            serial = _normalizar_serial(item.serial or "")
            if not serial:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Serial vacío en ítem de salida.",
                )

            # SELECT FOR UPDATE – bloqueo de fila para concurrencia
            reg = db.execute(
                text(
                    "SELECT id FROM inventario_registros "
                    "WHERE planilla_id = :pid AND serial = :serial "
                    "AND estado = 'stock' AND anulado_en IS NULL "
                    "FOR UPDATE NOWAIT"
                ),
                {"pid": planilla_id, "serial": serial},
            ).fetchone()

            if not reg:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Serial '{serial}' no está en stock.",
                )

            registro = db.get(InventarioRegistro, reg[0])
            _aplicar_despacho(registro, tecnico, oficina, fecha_despacho, datos.observacion, datos.numero_orden)
            despachados.append(registro)
            detalle_items_log.append({"serial": serial, "descripcion": registro.descripcion})

        else:  # sin_serial
            descripcion = (item.descripcion or "").strip()
            cantidad = item.cantidad or 0
            if not descripcion or cantidad <= 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Descripción o cantidad inválida en ítem sin serial.",
                )

            # FIFO: fecha ASC, tomamos las cantidad más antiguas con FOR UPDATE SKIP LOCKED
            filas = db.execute(
                text(
                    "SELECT id FROM inventario_registros "
                    "WHERE planilla_id = :pid "
                    "AND UPPER(TRIM(descripcion)) = UPPER(TRIM(:desc)) "
                    "AND (serial IS NULL OR serial = '') "
                    "AND estado = 'stock' AND anulado_en IS NULL "
                    "ORDER BY fecha ASC NULLS LAST, id ASC "
                    "LIMIT :cant "
                    "FOR UPDATE SKIP LOCKED"
                ),
                {"pid": planilla_id, "desc": descripcion, "cant": cantidad},
            ).fetchall()

            if len(filas) < cantidad:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Stock insuficiente de '{descripcion}': "
                        f"se pidieron {cantidad} pero solo hay {len(filas)} disponibles."
                    ),
                )

            for fila in filas:
                registro = db.get(InventarioRegistro, fila[0])
                _aplicar_despacho(registro, tecnico, oficina, fecha_despacho, datos.observacion, datos.numero_orden)
                despachados.append(registro)

            detalle_items_log.append({"descripcion": descripcion, "cantidad": cantidad})

    db.flush()

    total_uds = len(despachados)
    hist = InventarioHistorialMovimiento(
        planilla_id=planilla_id,
        tipo="salida",
        usuario_id=usuario_id,
        fecha=datetime.now(),
        detalle_items=detalle_items_log,
        datos_despacho={
            "tecnico": tecnico,
            "oficina": oficina,
            "fecha_despacho": str(fecha_despacho),
            "observacion": datos.observacion,
            "numero_orden": datos.numero_orden,
        },
        resumen_texto=f"Salida de {total_uds} unidad(es) a {tecnico} / {oficina}",
    )
    db.add(hist)
    db.flush()

    resumen = calcular_resumen_app(db, planilla_id)
    return despachados, resumen


def _aplicar_despacho(
    reg: InventarioRegistro,
    tecnico: str,
    oficina: str,
    fecha_despacho: date,
    observacion: str,
    numero_orden: Optional[str],
) -> None:
    reg.estado = "pendiente"
    reg.hoja = "SALIDAS "
    reg.tecnico = tecnico
    reg.oficina = oficina
    reg.fecha_despacho = fecha_despacho
    reg.observacion = observacion
    reg.numero_orden_despacho = numero_orden
    reg.actualizado_en = datetime.now()


# ─────────────────────────────────────────────────────────────────────────────
# INSTALACIÓN
# ─────────────────────────────────────────────────────────────────────────────

def registrar_instalacion(
    db: Session,
    planilla_id: int,
    datos: InstalacionCreate,
    usuario_id: int,
) -> Tuple[List[InventarioRegistro], ResumenPlanillaApp]:
    """Marca varias salidas pendientes como instaladas."""
    fecha_inst = datos.fecha_instalacion or _hoy()
    oficina_instalada = datos.oficina_instalada.strip()
    actualizados: List[InventarioRegistro] = []

    for rid in datos.registro_ids:
        reg = db.get(InventarioRegistro, rid)
        if not reg or reg.planilla_id != planilla_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Registro {rid} no encontrado en esta planilla.",
            )
        if reg.estado != "pendiente":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Registro {rid} no está en estado 'pendiente' (estado actual: {reg.estado}).",
            )
        reg.estado = "instalado"
        reg.oficina_instalada = oficina_instalada
        reg.fecha_instalacion = fecha_inst
        reg.actualizado_en = datetime.now()
        actualizados.append(reg)

    db.flush()

    hist = InventarioHistorialMovimiento(
        planilla_id=planilla_id,
        tipo="instalacion",
        usuario_id=usuario_id,
        fecha=datetime.now(),
        detalle_items=[{"registro_id": r.id, "serial": r.serial, "descripcion": r.descripcion} for r in actualizados],
        datos_despacho={"oficina_instalada": oficina_instalada, "fecha_instalacion": str(fecha_inst)},
        resumen_texto=f"Instalación de {len(actualizados)} unidad(es) en {oficina_instalada}",
    )
    db.add(hist)
    db.flush()

    resumen = calcular_resumen_app(db, planilla_id)
    return actualizados, resumen


# ─────────────────────────────────────────────────────────────────────────────
# DEVOLUCIÓN (salida pendiente → stock)
# ─────────────────────────────────────────────────────────────────────────────

def devolver_a_bodega(
    db: Session,
    planilla_id: int,
    registro_id: int,
    motivo: str,
    usuario_id: int,
) -> Tuple[InventarioRegistro, ResumenPlanillaApp]:
    """Revierte una salida pendiente a stock."""
    reg = db.get(InventarioRegistro, registro_id)
    if not reg or reg.planilla_id != planilla_id:
        raise HTTPException(status_code=404, detail=f"Registro {registro_id} no encontrado.")
    if reg.estado != "pendiente":
        raise HTTPException(
            status_code=409,
            detail=f"Solo se pueden devolver registros en estado 'pendiente'. Estado actual: {reg.estado}.",
        )

    reg.estado = "stock"
    reg.hoja = "INVENTARIO GENERAL"
    reg.motivo_devolucion = motivo.strip()
    reg.tecnico = None
    reg.oficina = None
    reg.fecha_despacho = None
    reg.observacion = None
    reg.numero_orden_despacho = None
    reg.actualizado_en = datetime.now()

    db.flush()

    hist = InventarioHistorialMovimiento(
        planilla_id=planilla_id,
        tipo="devolucion",
        usuario_id=usuario_id,
        fecha=datetime.now(),
        detalle_items=[{"registro_id": reg.id, "serial": reg.serial, "descripcion": reg.descripcion}],
        motivo=motivo.strip(),
        resumen_texto=f"Devolución a bodega: registro #{registro_id}",
    )
    db.add(hist)
    db.flush()

    resumen = calcular_resumen_app(db, planilla_id)
    return reg, resumen


# ─────────────────────────────────────────────────────────────────────────────
# ANULACIÓN (entrada sin salida → anulado)
# ─────────────────────────────────────────────────────────────────────────────

def anular_entrada(
    db: Session,
    planilla_id: int,
    registro_id: int,
    motivo: str,
    usuario_id: int,
) -> Tuple[InventarioRegistro, ResumenPlanillaApp]:
    """Anula una entrada que todavía está en stock (soft-delete)."""
    reg = db.get(InventarioRegistro, registro_id)
    if not reg or reg.planilla_id != planilla_id:
        raise HTTPException(status_code=404, detail=f"Registro {registro_id} no encontrado.")
    if reg.estado != "stock":
        raise HTTPException(
            status_code=409,
            detail=f"Solo se pueden anular entradas en estado 'stock'. Estado actual: {reg.estado}.",
        )
    if reg.anulado_en:
        raise HTTPException(status_code=409, detail=f"Registro {registro_id} ya está anulado.")

    reg.anulado_en = datetime.now()
    reg.anulado_por_id = usuario_id
    reg.motivo_anulacion = motivo.strip()
    reg.actualizado_en = datetime.now()

    db.flush()

    hist = InventarioHistorialMovimiento(
        planilla_id=planilla_id,
        tipo="anulacion",
        usuario_id=usuario_id,
        fecha=datetime.now(),
        detalle_items=[{"registro_id": reg.id, "serial": reg.serial, "descripcion": reg.descripcion}],
        motivo=motivo.strip(),
        resumen_texto=f"Anulación de entrada: registro #{registro_id}",
    )
    db.add(hist)
    db.flush()

    resumen = calcular_resumen_app(db, planilla_id)
    return reg, resumen
