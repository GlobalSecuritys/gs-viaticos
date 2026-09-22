/**
 * VistaGlobal.jsx — Consolidado de las 3 uniones temporales (proceso IN).
 *
 * Diseño deliberado:
 *  · Sección 1: KPIs globales (items, unidades, técnicos reales, préstamos).
 *  · Sección 2: Tarjetas clicables por unión temporal → navegan a cada vista.
 *  · Sección 3: Despachos de RTC + Mantenimiento, por estado (EstadoDespacho).
 *  · Sección 4: Estado de entrega de Zeus — completamente separado y etiquetado.
 *
 * EstadoDespacho y estado_entrega de Zeus nunca se fusionan en ningún gráfico.
 *
 * Props:
 *   datosResumen  – objeto `resumen.global` (ResumenInventario del backend)
 *   onIrA(clave)  – función para navegar a 'rtc' | 'mantenimiento' | 'zeus'
 */

import './Global.css';

const ETIQUETAS_DESPACHO = {
    instalado: 'Instalado',
    pendiente_instalacion: 'Pendiente',
    alerta_seguimiento: 'Alerta',
    dañado: 'Dañado',
    suministro_oficina: 'Suministro',
};

const CLASES_DESPACHO = {
    instalado: 'inv-global-estado--instalado',
    pendiente_instalacion: 'inv-global-estado--pendiente',
    alerta_seguimiento: 'inv-global-estado--alerta',
    dañado: 'inv-global-estado--danado',
    suministro_oficina: 'inv-global-estado--suministro',
};

const UNIONES = [
    {
        clave: 'rtc',
        nombre: 'RTC American Global',
        icono: '📡',
        ut: 'RTC',
    },
    {
        clave: 'mantenimiento',
        nombre: 'Mant. GSB_SDSS',
        icono: '🔧',
        ut: 'MANTENIMIENTO',
    },
    {
        clave: 'zeus',
        nombre: 'Proyecto Zeus',
        icono: '⚡',
        ut: 'PROYECTO_ZEUS',
    },
];

function fmt(n) {
    if (n === undefined || n === null) return '—';
    return Number(n).toLocaleString('es-CO');
}

export default function VistaGlobal({ datosResumen, resumenUniones, onIrA }) {
    const d = datosResumen;

    // Mapear datos por unión temporal para las tarjetas
    const porUT = {};
    if (resumenUniones) {
        for (const u of resumenUniones) {
            porUT[u.union_temporal] = u;
        }
    }

    return (
        <div className="inv-global">
            {/* ── KPIs globales ── */}
            <section className="inv-global-kpis" aria-label="KPIs globales de inventario">
                <div className="inv-global-kpi">
                    <span className="inv-global-kpi-label">Ítems stock</span>
                    <strong className="inv-global-kpi-valor">{fmt(d?.total_items)}</strong>
                </div>
                <div className="inv-global-kpi">
                    <span className="inv-global-kpi-label">Unidades</span>
                    <strong className="inv-global-kpi-valor">{fmt(d?.total_unidades)}</strong>
                </div>
                <div className="inv-global-kpi inv-global-kpi--tecnicos">
                    <span className="inv-global-kpi-label">Técnicos (personas)</span>
                    <strong className="inv-global-kpi-valor">{fmt(d?.total_tecnicos)}</strong>
                </div>
                <div className="inv-global-kpi">
                    <span className="inv-global-kpi-label">Ítems en técnicos</span>
                    <strong className="inv-global-kpi-valor">{fmt(d?.total_items_tecnicos)}</strong>
                </div>
                <div className="inv-global-kpi">
                    <span className="inv-global-kpi-label">Despachos</span>
                    <strong className="inv-global-kpi-valor">{fmt(d?.total_despachos)}</strong>
                </div>
                <div className={`inv-global-kpi${(d?.pendientes > 0) ? ' inv-global-kpi--alerta' : ''}`}>
                    <span className="inv-global-kpi-label">Por revisar</span>
                    <strong className="inv-global-kpi-valor">{fmt(d?.pendientes)}</strong>
                </div>
                <div className="inv-global-kpi">
                    <span className="inv-global-kpi-label">Préstamos</span>
                    <strong className="inv-global-kpi-valor">{fmt(d?.total_prestamos)}</strong>
                </div>
            </section>

            {/* ── Tarjetas de acceso a cada unión temporal ── */}
            <section aria-label="Acceso por unión temporal">
                <h2 className="inv-global-seccion-titulo">Por unión temporal</h2>
                <div className="inv-global-uniones" style={{ marginTop: 12 }}>
                    {UNIONES.map(({ clave, nombre, icono, ut }) => {
                        const u = porUT[ut];
                        const esMant = clave === 'mantenimiento';
                        const esRTC = clave === 'rtc';
                        const esZeus = clave === 'zeus';
                        return (
                            <button
                                key={clave}
                                type="button"
                                className={`inv-global-tarjeta inv-global-tarjeta--${clave}`}
                                onClick={() => onIrA(clave)}
                                aria-label={`Abrir inventario de ${nombre}`}
                            >
                                <div className="inv-global-tarjeta-header">
                                    <span className="inv-global-tarjeta-icono" aria-hidden="true">
                                        {icono}
                                    </span>
                                    <span className="inv-global-tarjeta-nombre">{nombre}</span>
                                    <span className="inv-global-tarjeta-flecha" aria-hidden="true">→</span>
                                </div>

                                {esZeus ? (
                                    /* Zeus: muestra estado_entrega, no despachos */
                                    <div className="inv-global-tarjeta-cifras">
                                        <div className="inv-global-mini-kpi">
                                            <span className="inv-global-mini-kpi-label">Ítems</span>
                                            <span className="inv-global-mini-kpi-valor">{fmt(u?.total_items)}</span>
                                        </div>
                                        <div className="inv-global-mini-kpi">
                                            <span className="inv-global-mini-kpi-label">En stock</span>
                                            <span className="inv-global-mini-kpi-valor" style={{ color: '#059669' }}>
                                                {fmt(u?.zeus_en_stock)}
                                            </span>
                                        </div>
                                        <div className="inv-global-mini-kpi">
                                            <span className="inv-global-mini-kpi-label">En tránsito</span>
                                            <span className="inv-global-mini-kpi-valor" style={{ color: '#ea580c' }}>
                                                {fmt(u?.zeus_en_transito)}
                                            </span>
                                        </div>
                                        <div className="inv-global-mini-kpi">
                                            <span className="inv-global-mini-kpi-label">En proceso</span>
                                            <span className="inv-global-mini-kpi-valor" style={{ color: '#64748b' }}>
                                                {fmt(u?.zeus_en_proceso)}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    /* RTC y Mantenimiento: muestra despachos y técnicos */
                                    <div className="inv-global-tarjeta-cifras">
                                        <div className="inv-global-mini-kpi">
                                            <span className="inv-global-mini-kpi-label">Ítems</span>
                                            <span className="inv-global-mini-kpi-valor">{fmt(u?.total_items)}</span>
                                        </div>
                                        <div className="inv-global-mini-kpi">
                                            <span className="inv-global-mini-kpi-label">Despachos</span>
                                            <span className="inv-global-mini-kpi-valor">{fmt(u?.total_despachos)}</span>
                                        </div>
                                        <div className={`inv-global-mini-kpi${u?.pendientes > 0 ? ' inv-global-mini-kpi--alerta' : ''}`}>
                                            <span className="inv-global-mini-kpi-label">Por revisar</span>
                                            <span className="inv-global-mini-kpi-valor">{fmt(u?.pendientes)}</span>
                                        </div>
                                        <div className="inv-global-mini-kpi">
                                            <span className="inv-global-mini-kpi-label">Técnicos</span>
                                            <span className="inv-global-mini-kpi-valor" style={{ color: '#6366f1' }}>
                                                {fmt(u?.total_tecnicos)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* ── Desglose de despachos: RTC + Mantenimiento ── */}
            <section className="inv-global-seccion" aria-label="Estado de despachos RTC y Mantenimiento">
                <h2 className="inv-global-seccion-titulo">
                    Despachos · RTC + Mantenimiento
                </h2>
                <div className="inv-global-estados">
                    {d?.por_estado && Object.entries(d.por_estado).map(([estado, n]) => (
                        <div
                            key={estado}
                            className={`inv-global-estado ${CLASES_DESPACHO[estado] || ''}`}
                        >
                            <span className="inv-global-estado-valor">{fmt(n)}</span>
                            <span>{ETIQUETAS_DESPACHO[estado] || estado}</span>
                        </div>
                    ))}
                </div>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted, #94a3b8)', margin: 0 }}>
                    Solo RTC y Mantenimiento registran despachos. Proyecto Zeus no tiene movimientos de este tipo.
                </p>
            </section>

            {/* ── Estado de entrega de Zeus (sistema distinto, nunca mezclado) ── */}
            <section className="inv-global-seccion" aria-label="Estado de entrega Proyecto Zeus">
                <h2 className="inv-global-seccion-titulo">
                    Proyecto Zeus · Estado de entrega (ODC)
                </h2>
                <div className="inv-global-zeus-estados">
                    <div className="inv-global-zeus-estado inv-global-zeus-estado--en-stock">
                        <span className="inv-global-zeus-estado-valor">{fmt(d?.zeus_en_stock)}</span>
                        <span>En stock</span>
                    </div>
                    <div className="inv-global-zeus-estado inv-global-zeus-estado--en-transito">
                        <span className="inv-global-zeus-estado-valor">{fmt(d?.zeus_en_transito)}</span>
                        <span>En tránsito</span>
                    </div>
                    <div className="inv-global-zeus-estado inv-global-zeus-estado--en-proceso">
                        <span className="inv-global-zeus-estado-valor">{fmt(d?.zeus_en_proceso)}</span>
                        <span>En proceso</span>
                    </div>
                    {d?.zeus_sin_estado > 0 && (
                        <div className="inv-global-zeus-estado inv-global-zeus-estado--sin-estado">
                            <span className="inv-global-zeus-estado-valor">{fmt(d.zeus_sin_estado)}</span>
                            <span>Sin estado</span>
                        </div>
                    )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted, #94a3b8)', margin: 0 }}>
                    Estado de entrega (ODC178 · ODC179). Sistema independiente de los despachos de RTC y Mantenimiento.
                </p>
            </section>
        </div>
    );
}
