import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import {
    ESTADOS_DESPACHO,
    cambiarEstadoDespacho,
    listarDespachos,
    listarPrestamos,
    listarTecnicos,
} from '../../../services/inventario';
import AcordeonItem from './AcordeonItem';
import BadgesInventario from './BadgesInventario';
import Paginador from './Paginador';
import './Mantenimiento.css';

const LIMIT_PAGINA = 25;

/**
 * Botón 2 — Movimientos (Despachos + Préstamos unificados).
 * Permite filtrar por tipo de movimiento, técnico, estado, rango de fecha y texto libre.
 */
export default function SeccionMovimientos({
    puedeEditar,
    version,
    onNuevoDespacho,
    onEditarDespacho,
    onEditarPrestamo,
    avisar,
}) {
    const [tipoFiltro, setTipoFiltro] = useState('todos'); // 'todos' | 'salidas' | 'prestamos'
    const [tecnicoId, setTecnicoId] = useState('');
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [q, setQ] = useState('');
    const [filtroRango, setFiltroRango] = useState('todos');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const [tecnicos, setTecnicos] = useState([]);
    const [despachos, setDespachos] = useState([]);
    const [prestamos, setPrestamos] = useState([]);
    const [totalDespachos, setTotalDespachos] = useState(0);

    const [offset, setOffset] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Acordeón exclusivo
    const [movimientoAbiertoId, setMovimientoAbiertoId] = useState(null);
    const [cambiandoEstadoId, setCambiandoEstadoId] = useState(null);

    // Cargar técnicos para el selector de filtro
    useEffect(() => {
        listarTecnicos()
            .then(setTecnicos)
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

            // 1. Cargar despachos si no está filtrado solo a préstamos
            if (tipoFiltro !== 'prestamos') {
                promises.push(
                    listarDespachos({
                        unionTemporal: 'MANTENIMIENTO',
                        tecnicoId: tecnicoId || undefined,
                        estado: estadoFiltro || undefined,
                        fechaInicio: fechasCalculadas.inicio,
                        fechaFin: fechasCalculadas.fin,
                        q: q.trim(),
                        limit: tipoFiltro === 'salidas' ? LIMIT_PAGINA : 150,
                        offset: tipoFiltro === 'salidas' ? offset : 0,
                    })
                );
            } else {
                promises.push(Promise.resolve({ despachos: [], total: 0 }));
            }

            // 2. Cargar préstamos si no está filtrado solo a salidas
            if (tipoFiltro !== 'salidas' && !tecnicoId && !estadoFiltro) {
                promises.push(
                    listarPrestamos({
                        unionTemporal: 'MANTENIMIENTO',
                        q: q.trim(),
                    })
                );
            } else {
                promises.push(Promise.resolve([]));
            }

            const [resDespachos, resPrestamos] = await Promise.all(promises);

            setDespachos(resDespachos.despachos || []);
            setTotalDespachos(resDespachos.total || 0);
            setPrestamos(resPrestamos || []);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los movimientos.'));
        } finally {
            setCargando(false);
        }
    }, [tipoFiltro, tecnicoId, estadoFiltro, q, fechasCalculadas, offset]);

    useEffect(() => {
        const timer = setTimeout(cargarMovimientos, 200);
        return () => clearTimeout(timer);
    }, [cargarMovimientos, version]);

    // Unificación de la lista según el tipo
    const listaMovimientos = useMemo(() => {
        const unificados = [];

        if (tipoFiltro !== 'prestamos') {
            for (const d of despachos) {
                unificados.push({
                    idUnico: `despacho-${d.id}`,
                    tipo: 'salida',
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

        if (tipoFiltro !== 'salidas') {
            for (const p of prestamos) {
                unificados.push({
                    idUnico: `prestamo-${p.id}`,
                    tipo: 'prestamo',
                    id: p.id,
                    titulo: p.descripcion,
                    tecnico: 'Préstamo de inventario',
                    fecha: p.fecha_prestamo || p.creado_en?.slice(0, 10),
                    cantidad: p.cantidad,
                    raw: p,
                });
            }
        }

        // Si es 'todos', ordenamos por fecha descendente y paginamos localmente
        if (tipoFiltro === 'todos') {
            unificados.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        }

        return unificados;
    }, [despachos, prestamos, tipoFiltro]);

    const totalRegistros = tipoFiltro === 'salidas' ? totalDespachos : listaMovimientos.length;
    const movimientosPaginados = useMemo(() => {
        if (tipoFiltro === 'salidas') return listaMovimientos; // Ya viene paginado por backend
        return listaMovimientos.slice(offset, offset + LIMIT_PAGINA);
    }, [listaMovimientos, tipoFiltro, offset]);

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
        <section className="inv-seccion" aria-label="Movimientos de Mantenimiento">
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
                    aria-label="Buscar movimientos"
                />

                <select
                    className="sgc-inv-select"
                    value={tipoFiltro}
                    onChange={(e) => {
                        setTipoFiltro(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Tipo de movimiento"
                >
                    <option value="todos">Todos los tipos (Salidas y Préstamos)</option>
                    <option value="salidas">Solo Salidas (Despachos a técnicos)</option>
                    <option value="prestamos">Solo Préstamos</option>
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
                    disabled={tipoFiltro === 'prestamos'}
                >
                    <option value="">Cualquier estado</option>
                    {ESTADOS_DESPACHO.map((e) => (
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
                            + Nueva Salida
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {cargando && movimientosPaginados.length === 0 ? (
                <p className="sgc-inv-cargando">Cargando movimientos de Mantenimiento…</p>
            ) : movimientosPaginados.length === 0 ? (
                <p className="sgc-inv-vacio">No se encontraron movimientos con los filtros indicados.</p>
            ) : (
                <div className="inv-acordeon-lista" role="list">
                    {movimientosPaginados.map((mov) => {
                        const abierto = movimientoAbiertoId === mov.idUnico;

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
                                        <BadgesInventario
                                            tipo={mov.tipo}
                                            cantidad={mov.cantidad > 1 ? mov.cantidad : undefined}
                                        />
                                        {mov.estado && <BadgesInventario estado={mov.estado} />}
                                    </>
                                }
                            >
                                <div className="inv-grid-detalles">
                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Tipo de movimiento</span>
                                        <span className="inv-dato-valor" style={{ textTransform: 'capitalize' }}>
                                            {mov.tipo === 'salida' ? 'Salida / Despacho a técnico' : 'Préstamo'}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Técnico</span>
                                        <span className="inv-dato-valor">{mov.tecnico}</span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Cantidad</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 700 }}>
                                            {mov.cantidad} unidad(es)
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha del movimiento</span>
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
                                                        <span className="inv-dato-valor--vacio">Pendiente instalación</span>
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

                                            <div className="inv-dato-item">
                                                <span className="inv-dato-label">Asignación vinculada</span>
                                                <span className="inv-dato-valor">
                                                    {mov.asignacion || (
                                                        <span className="inv-dato-valor--vacio">Sin asignación</span>
                                                    )}
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
                                                        {ESTADOS_DESPACHO.map((est) => (
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
