import React, { useEffect, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import { ESTADOS_DESPACHO, obtenerResumen } from '../../../services/inventario';
import BadgesInventario from './BadgesInventario';
import './Mantenimiento.css';

/**
 * Botón 4 — Resumen Ejecutivo (Unión Temporal Mantenimiento GSB_SDSS).
 * Reutiliza GET /inventario/resumen para presentar un panel ejecutivo con KPIs y desglose de estados.
 */
export default function SeccionResumen({ onNavegarASeccion, version }) {
    const [resumen, setResumen] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let activo = true;
        async function cargar() {
            setCargando(true);
            try {
                const data = await obtenerResumen();
                if (!activo) return;
                const datosMantenimiento = data?.uniones?.find(
                    (u) => u.union_temporal === 'MANTENIMIENTO'
                );
                setResumen(datosMantenimiento);
                setError('');
            } catch (err) {
                if (activo) {
                    setError(formatApiError(err, 'No se pudo cargar el resumen ejecutivo de Mantenimiento.'));
                }
            } finally {
                if (activo) setCargando(false);
            }
        }
        cargar();
        return () => {
            activo = false;
        };
    }, [version]);

    if (cargando) {
        return <p className="sgc-inv-cargando">Cargando resumen ejecutivo de Mantenimiento…</p>;
    }

    if (error) {
        return <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>;
    }

    if (!resumen) {
        return <p className="sgc-inv-vacio">No hay datos disponibles para Mantenimiento.</p>;
    }

    const totalDespachos = resumen.total_despachos || 0;
    const porEstado = resumen.por_estado || {};

    return (
        <section className="inv-seccion" aria-label="Resumen Ejecutivo Mantenimiento">
            {/* Grid de KPIs principales */}
            <div className="inv-resumen-grid">
                <article
                    className="inv-resumen-kpi inv-resumen-kpi--destacado"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavegarASeccion && onNavegarASeccion('equipos')}
                    title="Ir a Equipos"
                >
                    <span className="inv-resumen-kpi-label">Unidades en stock</span>
                    <strong className="inv-resumen-kpi-valor">
                        {(resumen.total_unidades || 0).toLocaleString('es-CO')}
                    </strong>
                    <span style={{ fontSize: 12, color: 'var(--color-accent-blue)' }}>
                        {resumen.total_items || 0} referencias registradas →
                    </span>
                </article>

                <article
                    className="inv-resumen-kpi"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavegarASeccion && onNavegarASeccion('tecnicos')}
                    title="Ir a Técnicos"
                >
                    <span className="inv-resumen-kpi-label">En custodia de técnicos</span>
                    <strong className="inv-resumen-kpi-valor" style={{ color: '#10b981' }}>
                        {(resumen.total_items_tecnicos || 0).toLocaleString('es-CO')}
                    </strong>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Según hojas individuales de técnicos →
                    </span>
                </article>

                <article
                    className="inv-resumen-kpi"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavegarASeccion && onNavegarASeccion('movimientos')}
                    title="Ir a Movimientos"
                >
                    <span className="inv-resumen-kpi-label">Despachos / Salidas</span>
                    <strong className="inv-resumen-kpi-valor">
                        {totalDespachos.toLocaleString('es-CO')}
                    </strong>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Histórico completo de salidas →
                    </span>
                </article>

                <article
                    className={`inv-resumen-kpi ${resumen.pendientes > 0 ? 'inv-resumen-kpi--alerta' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavegarASeccion && onNavegarASeccion('movimientos')}
                    title="Ver despachos que requieren atención"
                >
                    <span className="inv-resumen-kpi-label">Despachos por revisar</span>
                    <strong className="inv-resumen-kpi-valor">
                        {resumen.pendientes || 0}
                    </strong>
                    <span style={{ fontSize: 12 }}>
                        {resumen.pendientes > 0 ? '⚠️ Requieren instalación o seguimiento' : '✓ Al día'}
                    </span>
                </article>

                <article className="inv-resumen-kpi">
                    <span className="inv-resumen-kpi-label">Préstamos registrados</span>
                    <strong className="inv-resumen-kpi-valor">
                        {resumen.total_prestamos || 0}
                    </strong>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Artículos en calidad de préstamo
                    </span>
                </article>
            </div>

            {/* Desglose de despachos por estado con barras visuales */}
            <div className="inv-resumen-estados">
                <h3 className="inv-resumen-estados-titulo">
                    Distribución de Salidas por Estado ({totalDespachos.toLocaleString('es-CO')} totales)
                </h3>

                <div className="inv-resumen-estados-lista">
                    {ESTADOS_DESPACHO.map((est) => {
                        const cant = porEstado[est.valor] || 0;
                        const porcentaje = totalDespachos > 0 ? Math.round((cant / totalDespachos) * 100) : 0;

                        let colorFill = 'var(--color-accent-blue)';
                        if (est.valor === 'instalado') colorFill = 'var(--color-aprobado)';
                        else if (est.valor === 'pendiente_instalacion') colorFill = 'var(--color-pendiente)';
                        else if (est.valor === 'alerta_seguimiento') colorFill = 'var(--color-rechazado)';
                        else if (est.valor === 'dañado') colorFill = 'var(--color-text-secondary)';

                        return (
                            <div key={est.valor} className="inv-estado-fila">
                                <div>
                                    <BadgesInventario estado={est.valor} />
                                </div>
                                <div className="inv-estado-barra-track">
                                    <div
                                        className="inv-estado-barra-fill"
                                        style={{ width: `${porcentaje}%`, backgroundColor: colorFill }}
                                    />
                                </div>
                                <div className="inv-estado-cifra">
                                    {cant} <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>({porcentaje}%)</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
