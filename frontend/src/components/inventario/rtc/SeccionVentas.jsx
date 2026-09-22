import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import { listarDespachos } from '../../../services/inventario';
import AcordeonItem from '../mantenimiento/AcordeonItem';
import BadgesInventario from '../mantenimiento/BadgesInventario';
import Paginador from '../mantenimiento/Paginador';
import { normalizarObservacionRTC } from './rtcUtils';
import '../mantenimiento/Mantenimiento.css';

const LIMIT_PAGINA = 25;

/**
 * Botón 4 — Ventas (RTC American Global).
 * Lista exclusiva de movimientos donde el campo observacion normalizado es 'VENTA'.
 * Destino (oficina_destino) puede ser una entidad corporativa (SDS, GSB) o sede física.
 */
export default function SeccionVentas({ version }) {
    const [despachosVenta, setDespachosVenta] = useState([]);
    const [q, setQ] = useState('');
    const [destinoFiltro, setDestinoFiltro] = useState('');
    const [offset, setOffset] = useState(0);

    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Acordeón exclusivo
    const [itemAbiertoId, setItemAbiertoId] = useState(null);

    const cargarVentas = useCallback(async () => {
        setCargando(true);
        try {
            // Traemos los despachos de RTC
            const data = await listarDespachos({
                unionTemporal: 'RTC',
                limit: 1000,
            });

            // Filtro directo sobre observacion normalizada = 'VENTA'
            const ventas = (data?.despachos || []).filter(
                (d) => normalizarObservacionRTC(d.observacion) === 'VENTA'
            );

            setDespachosVenta(ventas);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar las ventas de RTC.'));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargarVentas();
    }, [cargarVentas, version]);

    // Lista única de destinos para el filtro
    const destinosDisponibles = useMemo(() => {
        const setD = new Set();
        for (const v of despachosVenta) {
            if (v.oficina_destino) setD.add(v.oficina_destino.trim());
        }
        return Array.from(setD).sort();
    }, [despachosVenta]);

    // Filtrar por texto q y destino
    const ventasFiltradas = useMemo(() => {
        return despachosVenta.filter((v) => {
            if (destinoFiltro && (v.oficina_destino || '').trim() !== destinoFiltro) {
                return false;
            }
            if (q.trim()) {
                const patron = q.trim().toLowerCase();
                const desc = (v.item_descripcion || '').toLowerCase();
                const tec = (v.tecnico_nombre || v.tecnico_nombre_origen || '').toLowerCase();
                const dest = (v.oficina_destino || '').toLowerCase();
                const orden = (v.numero_orden || '').toLowerCase();
                const serial = (v.item_serial_gsb || '').toLowerCase();
                const obs = (v.observacion || '').toLowerCase();
                if (
                    !desc.includes(patron) &&
                    !tec.includes(patron) &&
                    !dest.includes(patron) &&
                    !orden.includes(patron) &&
                    !serial.includes(patron) &&
                    !obs.includes(patron)
                ) {
                    return false;
                }
            }
            return true;
        });
    }, [despachosVenta, q, destinoFiltro]);

    const ventasPaginadas = useMemo(() => {
        return ventasFiltradas.slice(offset, offset + LIMIT_PAGINA);
    }, [ventasFiltradas, offset]);

    return (
        <section className="inv-seccion" aria-label="Ventas de RTC American Global">
            {/* Barra de Filtros */}
            <div className="inv-toolbar">
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Buscar por producto, destino (SDS/GSB), entidad u orden…"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Buscar en ventas"
                />

                <select
                    className="sgc-inv-select"
                    value={destinoFiltro}
                    onChange={(e) => {
                        setDestinoFiltro(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Filtrar por destino"
                >
                    <option value="">Todos los destinos / entidades</option>
                    {destinosDisponibles.map((dest) => (
                        <option key={dest} value={dest}>
                            {dest}
                        </option>
                    ))}
                </select>

                <div className="inv-toolbar-der">
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        {ventasFiltradas.length} venta(s) registrada(s)
                    </span>
                </div>
            </div>

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {cargando ? (
                <p className="sgc-inv-cargando">Cargando ventas de RTC…</p>
            ) : ventasPaginadas.length === 0 ? (
                <p className="sgc-inv-vacio">No se encontraron ventas con los filtros indicados.</p>
            ) : (
                <div className="inv-acordeon-lista" role="list">
                    {ventasPaginadas.map((v) => {
                        const abierto = itemAbiertoId === v.id;
                        const tecnicoOEntidad =
                            v.tecnico_nombre || v.tecnico_nombre_origen || 'Destinatario no especificado';

                        return (
                            <AcordeonItem
                                key={v.id}
                                id={v.id}
                                abierto={abierto}
                                onToggle={(abrir) => setItemAbiertoId(abrir ? v.id : null)}
                                titulo={v.item_descripcion || 'Artículo vendido'}
                                subtitulo={`Destino: ${v.oficina_destino || 'No especificado'} · ${
                                    v.fecha_despacho || 'Sin fecha'
                                }`}
                                badges={
                                    <>
                                        <BadgesInventario tipo="venta" />
                                        {v.estado && <BadgesInventario estado={v.estado} />}
                                    </>
                                }
                            >
                                <div className="inv-grid-detalles">
                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Destino / Entidad</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 700 }}>
                                            {v.oficina_destino || (
                                                <span className="inv-dato-valor--vacio">No especificado</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Técnico / Relacionado</span>
                                        <span className="inv-dato-valor">{tecnicoOEntidad}</span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Cantidad</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 700 }}>
                                            {v.cantidad} unidad(es)
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha de Venta / Despacho</span>
                                        <span className="inv-dato-valor">
                                            {v.fecha_despacho || (
                                                <span className="inv-dato-valor--vacio">Sin fecha</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Número de Orden</span>
                                        <span className="inv-dato-valor">
                                            {v.numero_orden ? (
                                                <span className="inv-dato-valor--mono">{v.numero_orden}</span>
                                            ) : (
                                                <span className="inv-dato-valor--vacio">Sin orden</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Serial GSB / Código</span>
                                        <span className="inv-dato-valor inv-dato-valor--mono">
                                            {v.item_serial_gsb || v.item_codigo_barras || 'N/A'}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Estado</span>
                                        <span className="inv-dato-valor">
                                            <BadgesInventario estado={v.estado} />
                                        </span>
                                    </div>

                                    {v.oficina_instalada && (
                                        <div className="inv-dato-item">
                                            <span className="inv-dato-label">Detalle Entrega</span>
                                            <span className="inv-dato-valor">{v.oficina_instalada}</span>
                                        </div>
                                    )}

                                    <div className="inv-dato-item" style={{ gridColumn: '1 / -1' }}>
                                        <span className="inv-dato-label">Observación Completa</span>
                                        <span className="inv-dato-valor">
                                            {v.observacion || 'VENTA'}
                                        </span>
                                    </div>
                                </div>
                            </AcordeonItem>
                        );
                    })}
                </div>
            )}

            <Paginador
                total={ventasFiltradas.length}
                limit={LIMIT_PAGINA}
                offset={offset}
                onCambiarOffset={(nuevo) => {
                    setOffset(nuevo);
                    setItemAbiertoId(null);
                }}
                cargando={cargando}
            />
        </section>
    );
}
