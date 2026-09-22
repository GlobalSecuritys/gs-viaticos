import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import {
    cambiarEstadoDespacho,
    listarDespachos,
    listarPrestamos,
    listarTecnicos,
} from '../../../services/inventario';
import AcordeonItem from '../mantenimiento/AcordeonItem';
import BadgesInventario from '../mantenimiento/BadgesInventario';
import Paginador from '../mantenimiento/Paginador';
import { esEntidadCorporativa, normalizarObservacionRTC } from './rtcUtils';
import '../mantenimiento/Mantenimiento.css';

const LIMIT_PAGINA = 25;

// Estados de despacho reales para RTC (RTC no usa dañado ni suministro de oficina)
const ESTADOS_DESPACHO_RTC = [
    { valor: 'instalado', etiqueta: 'Instalado' },
    { valor: 'pendiente_instalacion', etiqueta: 'Pendiente instalación' },
    { valor: 'alerta_seguimiento', etiqueta: 'Alerta / seguimiento' },
];

/**
 * Botón 2 — Movimientos (RTC American Global).
 * Unifica despachos y préstamos. El selector de tipo de movimiento se deriva
 * del campo observacion normalizado (RTC, MANTENIMIENTO, VENTA).
 */
export default function SeccionMovimientos({
    puedeEditar,
    version,
    onNuevoDespacho,
    onEditarDespacho,
    onEditarPrestamo,
    avisar,
}) {
    // Tipos de movimiento: 'todos' | 'RTC' | 'MANTENIMIENTO' | 'VENTA' | 'prestamos'
    const [tipoMovimiento, setTipoMovimiento] = useState('todos');
    const [tecnicoId, setTecnicoId] = useState('');
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [q, setQ] = useState('');
    const [filtroRango, setFiltroRango] = useState('todos');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const [tecnicos, setTecnicos] = useState([]);
    const [despachos, setDespachos] = useState([]);
    const [prestamos, setPrestamos] = useState([]);

    const [offset, setOffset] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Acordeón exclusivo
    const [movimientoAbiertoId, setMovimientoAbiertoId] = useState(null);
    const [cambiandoEstadoId, setCambiandoEstadoId] = useState(null);

    // Cargar técnicos para el filtro
    useEffect(() => {
        listarTecnicos()
            .then((lista) => {
                // Filtrar entidades corporativas del selector de técnicos
                setTecnicos((lista || []).filter((t) => !esEntidadCorporativa(t.nombre)));
            })
            .catch(() => {});
    }, []);

    const fechasCalculadas = useMemo(() => {
        if (filtroRango === 'todos') return { inicio: null, fin: null };
        const hoy = new Date();
        const hoyStr = hoy.toISOString().slice(0, 10);
        if (filtroRango === 'hoy') return { inicio: hoyStr, fin: hoyStr };
        if (filtroRango === 'semana') {
            const diaSemana = hoy.getDay() || 7;
            const primerDia = new Date(hoy);
            primerDia.setDate(hoy.getDate() - diaSemana + 1);
            return { inicio: primerDia.toISOString().slice(0, 10), fin: hoyStr };
        }
        if (filtroRango === 'mes') {
            const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            return { inicio: primerDia.toISOString().slice(0, 10), fin: hoyStr };
        }
        if (filtroRango === 'custom') {
            return { inicio: fechaDesde || null, fin: fechaHasta || null };
        }
        return { inicio: null, fin: null };
    }, [filtroRango, fechaDesde, fechaHasta]);

    const cargarMovimientos = useCallback(async () => {
        setCargando(true);
        try {
            const promises = [];

            // Cargar despachos RTC (traemos lote suficiente para filtrar por observacion normalizada)
            if (tipoMovimiento !== 'prestamos') {
                promises.push(
                    listarDespachos({
                        unionTemporal: 'RTC',
                        tecnicoId: tecnicoId || undefined,
                        estado: estadoFiltro || undefined,
                        fechaInicio: fechasCalculadas.inicio,
                        fechaFin: fechasCalculadas.fin,
                        q: q.trim(),
                        limit: 600,
                        offset: 0,
                    })
                );
            } else {
                promises.push(Promise.resolve({ despachos: [], total: 0 }));
            }

            // Cargar préstamos RTC
            if (
                (tipoMovimiento === 'todos' || tipoMovimiento === 'prestamos') &&
                !tecnicoId &&
                !estadoFiltro
            ) {
                promises.push(
                    listarPrestamos({
                        unionTemporal: 'RTC',
                        q: q.trim(),
                    })
                );
            } else {
                promises.push(Promise.resolve([]));
            }

            const [resDespachos, resPrestamos] = await Promise.all(promises);

            setDespachos(resDespachos.despachos || []);
            setPrestamos(resPrestamos || []);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los movimientos de RTC.'));
        } finally {
            setCargando(false);
        }
    }, [tipoMovimiento, tecnicoId, estadoFiltro, q, fechasCalculadas]);

    useEffect(() => {
        const timer = setTimeout(cargarMovimientos, 200);
        return () => clearTimeout(timer);
    }, [cargarMovimientos, version]);

    // Unificación y filtrado por observación normalizada
    const listaMovimientos = useMemo(() => {
        const unificados = [];

        if (tipoMovimiento !== 'prestamos') {
            for (const d of despachos) {
                const tipoNormalizado = normalizarObservacionRTC(d.observacion);

                // Filtrar según el tipo seleccionado (RTC, MANTENIMIENTO, VENTA)
                if (
                    tipoMovimiento !== 'todos' &&
                    tipoMovimiento !== tipoNormalizado
                ) {
                    continue;
                }

                unificados.push({
                    idUnico: `despacho-${d.id}`,
                    tipo: 'salida',
                    subtipoRTC: tipoNormalizado, // 'RTC' | 'MANTENIMIENTO' | 'VENTA'
                    id: d.id,
                    titulo: d.item_descripcion || 'Equipo sin descripción',
                    tecnico: d.tecnico_nombre || d.tecnico_nombre_origen || 'Sin técnico asignado',
                    fecha: d.fecha_despacho,
                    fechaInstalacion: d.fecha_instalacion,
                    estado: d.estado,
                    cantidad: d.cantidad,
                    oficinaDestino: d.oficina_destino,
                    oficinaInstalada: d.oficina_instalada,
                    numeroOrden: d.numero_orden,
                    observacion: d.observacion,
                    codigoBarras: d.item_codigo_barras,
                    serialGsb: d.item_serial_gsb,
                    asignacion: d.asignacion_etiqueta,
                    raw: d,
                });
            }
        }

        if (tipoMovimiento === 'todos' || tipoMovimiento === 'prestamos') {
            for (const p of prestamos) {
                unificados.push({
                    idUnico: `prestamo-${p.id}`,
                    tipo: 'prestamo',
                    subtipoRTC: 'PRESTAMO',
                    id: p.id,
                    titulo: p.descripcion,
                    tecnico: 'Préstamo de inventario RTC',
                    fecha: p.fecha_prestamo || p.creado_en?.slice(0, 10),
                    cantidad: p.cantidad,
                    raw: p,
                });
            }
        }

        // Ordenar por fecha descendente
        unificados.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        return unificados;
    }, [despachos, prestamos, tipoMovimiento]);

    const totalRegistros = listaMovimientos.length;
    const movimientosPaginados = useMemo(() => {
        return listaMovimientos.slice(offset, offset + LIMIT_PAGINA);
    }, [listaMovimientos, offset]);

    async function handleCambiarEstado(despachoId, nuevoEstado) {
        setCambiandoEstadoId(despachoId);
        try {
            const fechaInst = nuevoEstado === 'instalado' ? new Date().toISOString().slice(0, 10) : null;
            await cambiarEstadoDespacho(despachoId, nuevoEstado, fechaInst);
            avisar(`Despacho #${despachoId} actualizado a ${nuevoEstado}.`);
            cargarMovimientos();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo actualizar el estado del despacho.'));
        } finally {
            setCambiandoEstadoId(null);
        }
    }

    return (
        <section className="inv-seccion" aria-label="Movimientos de RTC American Global">
            {/* Barra de Filtros */}
            <div className="inv-toolbar">
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Buscar por ítem, técnico, orden o serial…"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Buscar movimientos RTC"
                />

                {/* Selector de tipo derivado de observacion normalizada */}
                <select
                    className="sgc-inv-select"
                    value={tipoMovimiento}
                    onChange={(e) => {
                        setTipoMovimiento(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Tipo de movimiento RTC"
                >
                    <option value="todos">Todos los tipos de movimiento</option>
                    <option value="RTC">Salidas RTC</option>
                    <option value="MANTENIMIENTO">Salidas Mantenimiento</option>
                    <option value="VENTA">Ventas</option>
                    <option value="prestamos">Préstamos</option>
                </select>

                <select
                    className="sgc-inv-select"
                    value={tecnicoId}
                    onChange={(e) => {
                        setTecnicoId(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Filtrar por técnico"
                >
                    <option value="">Todos los técnicos</option>
                    {tecnicos.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.nombre}
                        </option>
                    ))}
                </select>

                <select
                    className="sgc-inv-select"
                    value={estadoFiltro}
                    onChange={(e) => {
                        setEstadoFiltro(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Filtrar por estado"
                    disabled={tipoMovimiento === 'prestamos'}
                >
                    <option value="">Cualquier estado</option>
                    {ESTADOS_DESPACHO_RTC.map((e) => (
                        <option key={e.valor} value={e.valor}>
                            {e.etiqueta}
                        </option>
                    ))}
                </select>

                <select
                    className="sgc-inv-select"
                    value={filtroRango}
                    onChange={(e) => {
                        setFiltroRango(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Filtrar por fecha"
                >
                    <option value="todos">Cualquier fecha</option>
                    <option value="hoy">Hoy</option>
                    <option value="semana">Esta semana</option>
                    <option value="mes">Este mes</option>
                    <option value="custom">Personalizado</option>
                </select>

                {filtroRango === 'custom' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                            type="date"
                            className="sgc-inv-input"
                            style={{ padding: '6px 8px', fontSize: 12 }}
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                        />
                        <span>a</span>
                        <input
                            type="date"
                            className="sgc-inv-input"
                            style={{ padding: '6px 8px', fontSize: 12 }}
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                        />
                    </div>
                )}

                <div className="inv-toolbar-der">
                    {puedeEditar && onNuevoDespacho && (
                        <button
                            type="button"
                            className="sgc-inv-btn sgc-inv-btn--primario"
                            onClick={onNuevoDespacho}
                        >
                            + Nueva Salida RTC
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {cargando && movimientosPaginados.length === 0 ? (
                <p className="sgc-inv-cargando">Cargando movimientos de RTC…</p>
            ) : movimientosPaginados.length === 0 ? (
                <p className="sgc-inv-vacio">No se encontraron movimientos con los filtros indicados.</p>
            ) : (
                <div className="inv-acordeon-lista" role="list">
                    {movimientosPaginados.map((mov) => {
                        const abierto = movimientoAbiertoId === mov.idUnico;
                        const esVenta = mov.subtipoRTC === 'VENTA';

                        return (
                            <AcordeonItem
                                key={mov.idUnico}
                                id={mov.idUnico}
                                abierto={abierto}
                                onToggle={(abrir) => setMovimientoAbiertoId(abrir ? mov.idUnico : null)}
                                titulo={mov.titulo}
                                subtitulo={`${mov.tecnico} ${mov.fecha ? `· ${mov.fecha}` : ''}`}
                                badges={
                                    <>
                                        {esVenta ? (
                                            <BadgesInventario tipo="venta" />
                                        ) : mov.tipo === 'salida' ? (
                                            <BadgesInventario
                                                tipo="salida"
                                                etiqueta={mov.subtipoRTC || 'Salida'}
                                                cantidad={mov.cantidad > 1 ? mov.cantidad : undefined}
                                            />
                                        ) : (
                                            <BadgesInventario tipo="prestamo" />
                                        )}
                                        {mov.estado && <BadgesInventario estado={mov.estado} />}
                                    </>
                                }
                            >
                                <div className="inv-grid-detalles">
                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Tipo de movimiento</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 600 }}>
                                            {mov.tipo === 'salida'
                                                ? `Salida (${mov.subtipoRTC || 'RTC'})`
                                                : 'Préstamo'}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Técnico / Entidad</span>
                                        <span className="inv-dato-valor">{mov.tecnico}</span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Cantidad</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 700 }}>
                                            {mov.cantidad} unidad(es)
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha</span>
                                        <span className="inv-dato-valor">
                                            {mov.fecha || <span className="inv-dato-valor--vacio">Sin fecha</span>}
                                        </span>
                                    </div>

                                    {mov.tipo === 'salida' && (
                                        <>
                                            <div className="inv-dato-item">
                                                <span className="inv-dato-label">Oficina Destino</span>
                                                <span className="inv-dato-valor">
                                                    {mov.oficinaDestino || (
                                                        <span className="inv-dato-valor--vacio">No especificada</span>
                                                    )}
                                                </span>
                                            </div>

                                            <div className="inv-dato-item">
                                                <span className="inv-dato-label">Oficina Instalada</span>
                                                <span className="inv-dato-valor">
                                                    {mov.oficinaInstalada || (
                                                        <span className="inv-dato-valor--vacio">No instalada</span>
                                                    )}
                                                </span>
                                            </div>

                                            <div className="inv-dato-item">
                                                <span className="inv-dato-label">Fecha de instalación</span>
                                                <span className="inv-dato-valor">
                                                    {mov.fechaInstalacion || (
                                                        <span className="inv-dato-valor--vacio">Pendiente</span>
                                                    )}
                                                </span>
                                            </div>

                                            <div className="inv-dato-item">
                                                <span className="inv-dato-label">N° de Orden</span>
                                                <span className="inv-dato-valor">
                                                    {mov.numeroOrden ? (
                                                        <span className="inv-dato-valor--mono">{mov.numeroOrden}</span>
                                                    ) : (
                                                        <span className="inv-dato-valor--vacio">Sin orden</span>
                                                    )}
                                                </span>
                                            </div>

                                            <div className="inv-dato-item">
                                                <span className="inv-dato-label">Serial GSB / Código</span>
                                                <span className="inv-dato-valor inv-dato-valor--mono">
                                                    {mov.serialGsb || mov.codigoBarras || 'N/A'}
                                                </span>
                                            </div>
                                        </>
                                    )}

                                    {mov.observacion && (
                                        <div className="inv-dato-item" style={{ gridColumn: '1 / -1' }}>
                                            <span className="inv-dato-label">Observación</span>
                                            <span className="inv-dato-valor">{mov.observacion}</span>
                                        </div>
                                    )}
                                </div>

                                {puedeEditar && (
                                    <div className="inv-detalle-acciones">
                                        {mov.tipo === 'salida' && (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                                        Cambiar estado:
                                                    </span>
                                                    <select
                                                        className="sgc-inv-select"
                                                        style={{ padding: '4px 8px', fontSize: 12 }}
                                                        value={mov.estado}
                                                        onChange={(e) => handleCambiarEstado(mov.id, e.target.value)}
                                                        disabled={cambiandoEstadoId === mov.id}
                                                    >
                                                        {ESTADOS_DESPACHO_RTC.map((est) => (
                                                            <option key={est.valor} value={est.valor}>
                                                                {est.etiqueta}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {onEditarDespacho && (
                                                    <button
                                                        type="button"
                                                        className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                                                        onClick={() => onEditarDespacho(mov.raw)}
                                                    >
                                                        ✏️ Editar Salida
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        {mov.tipo === 'prestamo' && onEditarPrestamo && (
                                            <button
                                                type="button"
                                                className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                                                onClick={() => onEditarPrestamo(mov.raw)}
                                            >
                                                ✏️ Editar Préstamo
                                            </button>
                                        )}
                                    </div>
                                )}
                            </AcordeonItem>
                        );
                    })}
                </div>
            )}

            <Paginador
                total={totalRegistros}
                limit={LIMIT_PAGINA}
                offset={offset}
                onCambiarOffset={(nuevo) => {
                    setOffset(nuevo);
                    setMovimientoAbiertoId(null);
                }}
                cargando={cargando}
            />
        </section>
    );
}
