import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import {
    listarDespachos,
    listarItems,
    listarPrestamos,
} from '../../../services/inventario';
import AcordeonItem from '../mantenimiento/AcordeonItem';
import BadgesInventario, { BadgeStock } from '../mantenimiento/BadgesInventario';
import Paginador from '../mantenimiento/Paginador';
import { normalizarObservacionRTC } from './rtcUtils';
import '../mantenimiento/Mantenimiento.css';

const LIMIT_PAGINA = 25;

/**
 * Botón 1 — Equipos (Stock RTC American Global).
 * Lista de stock filtrada por union_temporal = 'RTC' con acordeón exclusivo,
 * paginación obligatoria y badge de VENTA derivado de la observación normalizada.
 */
export default function SeccionEquipos({
    puedeEditar,
    version,
    onDespachar,
    onNuevoItem,
    onEditarItem,
}) {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalUnidades, setTotalUnidades] = useState(0);
    const [offset, setOffset] = useState(0);
    const [q, setQ] = useState('');
    const [soloConStock, setSoloConStock] = useState(false);
    const [filtroRango, setFiltroRango] = useState('todos');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Acordeón exclusivo: solo un ID abierto
    const [itemAbiertoId, setItemAbiertoId] = useState(null);

    // Sets para badges híbridos inmediatos
    const [idsDespachoActivo, setIdsDespachoActivo] = useState(new Set());
    const [idsVenta, setIdsVenta] = useState(new Set());
    const [idsPrestamo, setIdsPrestamo] = useState(new Set());

    // Cargar relaciones para badges inmediatos
    useEffect(() => {
        let activo = true;
        async function cargarRelaciones() {
            try {
                const [despachosData, prestamosData] = await Promise.all([
                    listarDespachos({ unionTemporal: 'RTC', limit: 1000 }),
                    listarPrestamos({ unionTemporal: 'RTC' }),
                ]);

                if (!activo) return;

                const setActivos = new Set();
                const setVentas = new Set();
                const despachosList = despachosData?.despachos || [];

                for (const d of despachosList) {
                    if (d.item_id) {
                        const obsNorm = normalizarObservacionRTC(d.observacion);
                        if (obsNorm === 'VENTA') {
                            setVentas.add(d.item_id);
                        }
                        if (d.estado === 'pendiente_instalacion' || d.estado === 'alerta_seguimiento') {
                            setActivos.add(d.item_id);
                        }
                    }
                }
                setIdsDespachoActivo(setActivos);
                setIdsVenta(setVentas);

                const setPres = new Set();
                const prestamosList = prestamosData || [];
                for (const p of prestamosList) {
                    if (p.item_id) setPres.add(p.item_id);
                }
                setIdsPrestamo(setPres);
            } catch {
                // Silencioso
            }
        }
        cargarRelaciones();
        return () => {
            activo = false;
        };
    }, [version]);

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

    const cargarStock = useCallback(async () => {
        setCargando(true);
        try {
            const data = await listarItems({
                unionTemporal: 'RTC',
                q: q.trim(),
                soloConStock,
                fechaInicio: fechasCalculadas.inicio,
                fechaFin: fechasCalculadas.fin,
                limit: LIMIT_PAGINA,
                offset,
            });
            setItems(data.items || []);
            setTotal(data.total || 0);
            setTotalUnidades(data.total_unidades || 0);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el stock de equipos RTC.'));
        } finally {
            setCargando(false);
        }
    }, [q, soloConStock, fechasCalculadas, offset]);

    useEffect(() => {
        const timer = setTimeout(cargarStock, 200);
        return () => clearTimeout(timer);
    }, [cargarStock, version]);

    function handleCambiarOffset(nuevoOffset) {
        setOffset(nuevoOffset);
        setItemAbiertoId(null);
    }

    return (
        <section className="inv-seccion" aria-label="Equipos de RTC American Global">
            {/* Barra de filtros */}
            <div className="inv-toolbar">
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Buscar por descripción, serial, factura, código o N° SDS…"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Buscar equipos RTC"
                />

                <label className="inv-switch-label">
                    <input
                        type="checkbox"
                        className="inv-switch-input"
                        checked={soloConStock}
                        onChange={(e) => {
                            setSoloConStock(e.target.checked);
                            setOffset(0);
                        }}
                    />
                    <span>Solo con stock</span>
                </label>

                <select
                    className="sgc-inv-select"
                    value={filtroRango}
                    onChange={(e) => {
                        setFiltroRango(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Filtrar por fecha de compra"
                >
                    <option value="todos">Cualquier fecha</option>
                    <option value="hoy">Comprados hoy</option>
                    <option value="semana">Esta semana</option>
                    <option value="mes">Este mes</option>
                    <option value="custom">Rango personalizado</option>
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
                    {puedeEditar && onNuevoItem && (
                        <button
                            type="button"
                            className="sgc-inv-btn sgc-inv-btn--primario"
                            onClick={onNuevoItem}
                        >
                            + Nuevo Equipo RTC
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {cargando && items.length === 0 ? (
                <p className="sgc-inv-cargando">Cargando equipos de RTC…</p>
            ) : items.length === 0 ? (
                <p className="sgc-inv-vacio">No se encontraron equipos en RTC con los filtros indicados.</p>
            ) : (
                <div className="inv-acordeon-lista" role="list">
                    {items.map((item) => {
                        const abierto = itemAbiertoId === item.id;
                        const tieneVenta = idsVenta.has(item.id);
                        const tieneDespachoActivo = idsDespachoActivo.has(item.id);
                        const tienePrestamo = idsPrestamo.has(item.id);
                        const tieneSalidas = (item.total_despachos || 0) > 0;

                        return (
                            <AcordeonItem
                                key={item.id}
                                id={item.id}
                                abierto={abierto}
                                onToggle={(abrir) => setItemAbiertoId(abrir ? item.id : null)}
                                titulo={item.descripcion}
                                subtitulo={
                                    item.numero_articulo
                                        ? `Ref: ${item.numero_articulo}`
                                        : item.codigo_barras
                                        ? `Cód: ${item.codigo_barras}`
                                        : undefined
                                }
                                badges={
                                    <>
                                        {tieneVenta && <BadgesInventario tipo="venta" />}
                                        {tieneDespachoActivo && <BadgesInventario tipo="en_poder" />}
                                        {tieneSalidas && !tieneDespachoActivo && !tieneVenta && (
                                            <BadgesInventario
                                                tipo="salida"
                                                cantidad={item.total_despachos}
                                            />
                                        )}
                                        {tienePrestamo && <BadgesInventario tipo="prestamo" />}
                                        <BadgeStock cantidad={item.cantidad_stock} />
                                    </>
                                }
                            >
                                <div className="inv-grid-detalles">
                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha de compra</span>
                                        <span className="inv-dato-valor">
                                            {item.fecha_compra || (
                                                <span className="inv-dato-valor--vacio">Sin registrar</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Factura</span>
                                        <span className="inv-dato-valor">
                                            {item.factura ? (
                                                <span className="inv-dato-valor--mono">{item.factura}</span>
                                            ) : (
                                                <span className="inv-dato-valor--vacio">Sin factura</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Código de barras</span>
                                        <span className="inv-dato-valor">
                                            {item.codigo_barras ? (
                                                <span className="inv-dato-valor--mono">{item.codigo_barras}</span>
                                            ) : (
                                                <span className="inv-dato-valor--vacio">Sin código</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Cantidad en stock</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 700 }}>
                                            {item.cantidad_stock} unidad(es)
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">N° SDS</span>
                                        <span className="inv-dato-valor">
                                            {item.no_sds || <span className="inv-dato-valor--vacio">N/A</span>}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">ID Equipo</span>
                                        <span className="inv-dato-valor">
                                            {item.id_equipo ? (
                                                <span className="inv-dato-valor--mono">{item.id_equipo}</span>
                                            ) : (
                                                <span className="inv-dato-valor--vacio">Sin ID</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Seriales GSB</span>
                                        <span className="inv-dato-valor">
                                            {item.serial_gsb ? (
                                                <span className="inv-dato-valor--mono">{item.serial_gsb}</span>
                                            ) : (
                                                <span className="inv-dato-valor--vacio">Sin serial</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Tiempo de entrega</span>
                                        <span className="inv-dato-valor">
                                            {item.tiempo_entrega || (
                                                <span className="inv-dato-valor--vacio">No especificado</span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {puedeEditar && (
                                    <div className="inv-detalle-acciones">
                                        {onEditarItem && (
                                            <button
                                                type="button"
                                                className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                                                onClick={() => onEditarItem(item)}
                                            >
                                                ✏️ Editar Equipo
                                            </button>
                                        )}
                                        {onDespachar && item.cantidad_stock > 0 && (
                                            <button
                                                type="button"
                                                className="sgc-inv-btn sgc-inv-btn--primario sgc-inv-btn--sm"
                                                onClick={() => onDespachar(item)}
                                            >
                                                📤 Despachar
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
                total={total}
                limit={LIMIT_PAGINA}
                offset={offset}
                onCambiarOffset={handleCambiarOffset}
                cargando={cargando}
            />
        </section>
    );
}
