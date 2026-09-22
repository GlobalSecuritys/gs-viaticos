import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listarItems } from '../../../services/inventario';
import { formatApiError } from '../../../utils/formatError';
import AcordeonItem from '../mantenimiento/AcordeonItem';
import Paginador from '../mantenimiento/Paginador';
import '../mantenimiento/Mantenimiento.css';
import './Zeus.css';

// ── Constantes ────────────────────────────────────────────────────────────────

const LIMIT = 25;

const ORDENES_COMPRA = [
    { valor: '', etiqueta: 'Todos' },
    { valor: 'ODC178', etiqueta: 'ODC178' },
    { valor: 'ODC179', etiqueta: 'ODC179' },
];

const ESTADO_META = {
    en_stock: {
        clase: 'inv-badge zeus-badge inv-badge--zeus-en-stock',
        texto: 'En stock',
    },
    en_transito: {
        clase: 'inv-badge zeus-badge inv-badge--zeus-en-transito',
        texto: 'En tránsito',
    },
    en_proceso: {
        clase: 'inv-badge zeus-badge inv-badge--zeus-en-proceso',
        texto: 'En proceso',
    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function BadgeEstado({ estado, tiempoEntrega }) {
    if (!estado) return null;
    const meta = ESTADO_META[estado];
    if (!meta) return null;
    return (
        <span className={meta.clase}>
            {meta.texto}
            {estado === 'en_transito' && tiempoEntrega && (
                <small style={{ marginLeft: 4, fontWeight: 400, opacity: 0.85 }}>
                    · {tiempoEntrega}
                </small>
            )}
        </span>
    );
}

function Campo({ label, valor }) {
    if (!valor && valor !== 0) return null;
    return (
        <div className="zeus-detalle-campo">
            <span className="zeus-detalle-label">{label}</span>
            <span className="zeus-detalle-valor">{valor}</span>
        </div>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * Vista simplificada para Proyecto Zeus.
 * Un solo panel "Equipos" agrupable por orden de compra (ODC178 / ODC179),
 * con búsqueda y badges de estado de entrega.
 *
 * No tiene secciones de Movimientos, Técnicos ni Ventas porque Zeus no tiene
 * despachos reales aún.
 */
export default function VistaZeus({ datosResumen, puedeEditar, version, avisar }) {
    // ── Estado local ────────────────────────────────────────────────────────
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Filtros (client-side sobre la carga completa de Zeus, ≤ 29 ítems)
    const [q, setQ] = useState('');
    const [odcFiltro, setOdcFiltro] = useState('');    // '' | 'ODC178' | 'ODC179'
    const [offset, setOffset] = useState(0);

    // Acordeón exclusivo (uno abierto a la vez)
    const [abierto, setAbierto] = useState(null);

    const inputRef = useRef(null);

    // ── Carga de datos (todos los ítems Zeus de una vez, ≤ 29) ──────────────
    const cargar = useCallback(async () => {
        setCargando(true);
        setError('');
        try {
            // Pedimos hasta 500 ítems; Zeus tiene ≤ 29 actualmente.
            const data = await listarItems({
                unionTemporal: 'PROYECTO_ZEUS',
                limit: 500,
                offset: 0,
            });
            setItems(Array.isArray(data) ? data : (data.items ?? []));
            setTotal(Array.isArray(data) ? data.length : (data.total ?? 0));
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los equipos de Proyecto Zeus.'));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargar();
    }, [cargar, version]);

    // ── Filtrado y paginación en memoria ─────────────────────────────────────
    const itemsFiltrados = useMemo(() => {
        let lista = items;

        if (odcFiltro) {
            lista = lista.filter((it) => it.orden_compra === odcFiltro);
        }

        if (q.trim()) {
            const qLow = q.trim().toLowerCase();
            lista = lista.filter(
                (it) =>
                    (it.descripcion || '').toLowerCase().includes(qLow) ||
                    (it.numero_articulo || '').toLowerCase().includes(qLow)
            );
        }

        return lista;
    }, [items, odcFiltro, q]);

    // Resetear offset cuando cambian los filtros
    useEffect(() => {
        setOffset(0);
        setAbierto(null);
    }, [q, odcFiltro]);

    const itemsPagina = useMemo(
        () => itemsFiltrados.slice(offset, offset + LIMIT),
        [itemsFiltrados, offset]
    );

    // ── KPIs por estado ───────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const base = odcFiltro
            ? items.filter((it) => it.orden_compra === odcFiltro)
            : items;
        return {
            total: base.length,
            en_stock: base.filter((it) => it.estado_entrega === 'en_stock').length,
            en_transito: base.filter((it) => it.estado_entrega === 'en_transito').length,
            en_proceso: base.filter((it) => it.estado_entrega === 'en_proceso').length,
            sin_estado: base.filter((it) => !it.estado_entrega).length,
        };
    }, [items, odcFiltro]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (cargando) {
        return <div className="zeus-cargando">Cargando equipos Proyecto Zeus…</div>;
    }

    return (
        <div className="zeus-equipos">
            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {/* KPIs de estado */}
            <div className="zeus-kpis">
                <div className="zeus-kpi">
                    <span className="zeus-kpi-label">Total</span>
                    <strong className="zeus-kpi-valor">{kpis.total}</strong>
                </div>
                <div className="zeus-kpi zeus-kpi--en-stock">
                    <span className="zeus-kpi-label">En stock</span>
                    <strong className="zeus-kpi-valor">{kpis.en_stock}</strong>
                </div>
                <div className="zeus-kpi zeus-kpi--en-transito">
                    <span className="zeus-kpi-label">En tránsito</span>
                    <strong className="zeus-kpi-valor">{kpis.en_transito}</strong>
                </div>
                <div className="zeus-kpi zeus-kpi--en-proceso">
                    <span className="zeus-kpi-label">En proceso</span>
                    <strong className="zeus-kpi-valor">{kpis.en_proceso}</strong>
                </div>
                {kpis.sin_estado > 0 && (
                    <div className="zeus-kpi">
                        <span className="zeus-kpi-label">Sin estado</span>
                        <strong className="zeus-kpi-valor">{kpis.sin_estado}</strong>
                    </div>
                )}
            </div>

            {/* Barra de filtros */}
            <div className="zeus-filtros">
                <input
                    ref={inputRef}
                    className="zeus-filtros-q"
                    type="search"
                    placeholder="Buscar por descripción o número de artículo…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Buscar equipos Zeus"
                />
                <div className="zeus-filtros-odc" role="group" aria-label="Filtrar por orden de compra">
                    {ORDENES_COMPRA.map((odc) => (
                        <button
                            key={odc.valor}
                            type="button"
                            className={`zeus-odc-btn ${odcFiltro === odc.valor ? 'zeus-odc-btn--activo' : ''}`}
                            onClick={() => setOdcFiltro(odc.valor)}
                            aria-pressed={odcFiltro === odc.valor}
                        >
                            {odc.etiqueta}
                        </button>
                    ))}
                </div>
            </div>

            {/* Lista acordeón */}
            {itemsPagina.length === 0 ? (
                <div className="zeus-vacio">
                    {q || odcFiltro
                        ? 'No se encontraron equipos con los filtros aplicados.'
                        : 'No hay equipos registrados para Proyecto Zeus.'}
                </div>
            ) : (
                itemsPagina.map((item) => {
                    const itemId = `zeus-item-${item.id}`;
                    const isAbierto = abierto === item.id;

                    return (
                        <AcordeonItem
                            key={item.id}
                            id={itemId}
                            abierto={isAbierto}
                            onToggle={(nuevoEstado) =>
                                setAbierto(nuevoEstado ? item.id : null)
                            }
                            titulo={item.descripcion}
                            subtitulo={item.numero_articulo || undefined}
                            badges={
                                <BadgeEstado
                                    estado={item.estado_entrega}
                                    tiempoEntrega={item.tiempo_entrega}
                                />
                            }
                        >
                            <div className="zeus-detalle">
                                <Campo label="Número de artículo" valor={item.numero_articulo} />
                                <Campo label="Cantidad" valor={item.cantidad_stock} />
                                <Campo label="Orden de compra" valor={item.orden_compra} />
                                <Campo label="Tiempo de entrega" valor={item.tiempo_entrega} />
                                {item.estado_entrega && (
                                    <div className="zeus-detalle-campo">
                                        <span className="zeus-detalle-label">Estado</span>
                                        <BadgeEstado
                                            estado={item.estado_entrega}
                                            tiempoEntrega={item.tiempo_entrega}
                                        />
                                    </div>
                                )}
                            </div>
                        </AcordeonItem>
                    );
                })
            )}

            {/* Paginador */}
            <Paginador
                total={itemsFiltrados.length}
                limit={LIMIT}
                offset={offset}
                onCambiarOffset={setOffset}
                cargando={cargando}
            />
        </div>
    );
}
