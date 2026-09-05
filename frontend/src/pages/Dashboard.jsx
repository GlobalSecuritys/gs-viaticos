import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { obtenerMisAsignacionesActivas } from '../services/asignaciones';
import TecnicoLayout from '../components/TecnicoLayout';
import ModalSeleccionarTipoViatico from '../components/ModalSeleccionarTipoViatico';
import { obtenerNombreUsuario, obtenerPrimerNombre } from '../utils/personal';
import './Dashboard.css';

function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value);
}

function iniciales(nombre = '') {
    return nombre
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');
}

function formatFechaLarga() {
    const hoy = new Date();
    const opciones = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const str = hoy.toLocaleDateString('es-CO', opciones);
    return str.charAt(0).toUpperCase() + str.slice(1);
}

const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [viaticos, setViaticos] = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [mostrarModalTipoViatico, setMostrarModalTipoViatico] = useState(false);
    const [, setLoading] = useState(true);
    const [filtroSaldo, setFiltroSaldo] = useState('global');

    useEffect(() => {
        let activo = true;
        async function cargar() {
            try {
                const [resViaticos, resAsig] = await Promise.all([
                    api.get('/viaticos').catch(() => ({ data: [] })),
                    obtenerMisAsignacionesActivas().catch(() => ({ data: [] })),
                ]);
                if (activo) {
                    setViaticos(resViaticos.data || []);
                    setAsignaciones(resAsig.data || []);
                }
            } finally {
                if (activo) setLoading(false);
            }
        }
        cargar();
        return () => { activo = false; };
    }, []);

    const stats = useMemo(() => {
        const viaticosAprobados = viaticos.filter((v) => v.estado === 'aprobado');
        const totalGastado = viaticosAprobados.reduce((acc, v) => acc + Number(v.valor), 0);
        const pendientes = viaticos.filter((v) => v.estado === 'pendiente').length;

        return {
            asignacionesActivas: asignaciones.length,
            legalizacionesEnCurso: pendientes,
            totalGastado,
        };
    }, [viaticos, asignaciones]);

    // 1. Distribución por concepto
    const distribucionConcepto = useMemo(() => {
        const totales = { hospedaje: 0, transporte: 0, alimentacion: 0, materiales: 0, alquiler_escalera: 0, otros: 0 };
        viaticos.forEach((v) => {
            const cat = (v.tipo_gasto || '').toLowerCase();
            const val = Number(v.valor) || 0;
            if (cat.includes('hospedaj') || cat.includes('hotel')) totales.hospedaje += val;
            else if (cat.includes('transport') || cat.includes('pasaj') || cat.includes('peaj')) totales.transporte += val;
            else if (cat.includes('aliment') || cat.includes('comida') || cat.includes('restauran')) totales.alimentacion += val;
            else if (cat.includes('escalera')) totales.alquiler_escalera += val;
            else if (cat.includes('material')) totales.materiales += val;
            else totales.otros += val;
        });

        const sumaTotal = Object.values(totales).reduce((a, b) => a + b, 0) || 1;
        const lista = [
            { id: 'hospedaje', label: 'Hospedaje', color: '#1D63C8', val: totales.hospedaje, pct: Math.round((totales.hospedaje / sumaTotal) * 100) },
            { id: 'transporte', label: 'Transporte', color: '#F59E0B', val: totales.transporte, pct: Math.round((totales.transporte / sumaTotal) * 100) },
            { id: 'alimentacion', label: 'Alimentación', color: '#10B981', val: totales.alimentacion, pct: Math.round((totales.alimentacion / sumaTotal) * 100) },
            { id: 'materiales', label: 'Materiales', color: '#6366F1', val: totales.materiales, pct: Math.round((totales.materiales / sumaTotal) * 100) },
            { id: 'alquiler_escalera', label: 'Alquiler de escalera', color: '#EC4899', val: totales.alquiler_escalera, pct: Math.round((totales.alquiler_escalera / sumaTotal) * 100) },
            { id: 'otros', label: 'Otros', color: '#8B5CF6', val: totales.otros, pct: Math.round((totales.otros / sumaTotal) * 100) },
        ];
        return lista.filter((item) => item.val > 0 || ['hospedaje', 'transporte', 'alimentacion', 'materiales', 'alquiler_escalera'].includes(item.id));
    }, [viaticos]);

    // 2. Gastos por mes (este año)
    const gastosPorMes = useMemo(() => {
        const actualAno = new Date().getFullYear();
        const meses = Array(12).fill(0);

        viaticos.forEach((v) => {
            if (!v.fecha) return;
            const f = new Date(v.fecha + 'T00:00:00');
            if (f.getFullYear() === actualAno) {
                meses[f.getMonth()] += Number(v.valor) || 0;
            }
        });

        const maxVal = Math.max(...meses, 100000);
        return meses.map((val, idx) => ({
            mes: MESES_ABREV[idx],
            val,
            pct: Math.round((val / maxVal) * 100),
        }));
    }, [viaticos]);

    const primerNombre = obtenerPrimerNombre(user, 'Técnico');
    const nombreCompleto = obtenerNombreUsuario(user, 'Técnico Instalador');
    const codigoEmpleado = user?.codigo_empleado ? `CC ${user.codigo_empleado}` : 'CC 1.234.567.890';

    return (
        <TecnicoLayout>
            <div className="dash-tec-container">
                {/* ── TOP HEADER CARD ── */}
                <div className="dash-tec-header-card">
                    <div className="dash-tec-header-left">
                        <div className="dash-tec-avatar">{iniciales(nombreCompleto)}</div>
                        <div className="dash-tec-header-info">
                            <h1 className="dash-tec-greeting">¡Hola, {primerNombre}! 👋</h1>
                            <p className="dash-tec-user-meta">
                                <strong>{nombreCompleto}</strong> · {codigoEmpleado}
                            </p>
                        </div>
                    </div>
                    <div className="dash-tec-date-badge">
                        <span>📅 Hoy, {formatFechaLarga()}</span>
                    </div>
                </div>

                {/* ── SECCIÓN ESTADO DE SALDOS ── */}
                {(() => {
                    const asigConDatos = asignaciones.filter(a => Number(a.monto_anticipo || 0) > 0 || Number(a.total_gastado || 0) > 0);
                    const globalAnticipo = asigConDatos.reduce((s, a) => s + Number(a.monto_anticipo || 0), 0);
                    const globalGastado  = asigConDatos.reduce((s, a) => s + Number(a.total_gastado  || 0), 0);
                    const globalSaldo    = globalAnticipo - globalGastado;

                    let viewAnticipo, viewGastado, viewSaldo, viewLabel;
                    if (filtroSaldo === 'global' || asigConDatos.length === 0) {
                        viewAnticipo = globalAnticipo;
                        viewGastado  = globalGastado;
                        viewSaldo    = globalSaldo;
                        viewLabel    = `🌐 Balance Global (${asigConDatos.length} asignación${asigConDatos.length !== 1 ? 'es' : ''})`;
                    } else {
                        const sel = asigConDatos.find(a => String(a.id) === filtroSaldo);
                        viewAnticipo = Number(sel?.monto_anticipo || 0);
                        viewGastado  = Number(sel?.total_gastado  || 0);
                        viewSaldo    = viewAnticipo - viewGastado;
                        viewLabel    = `📋 ${sel?.cliente || `Asig. #${filtroSaldo}`} · ${sel?.ciudad || ''}`;
                    }

                    const esFavorTecnico = viewGastado > viewAnticipo;

                    return (
                        <div className="dash-saldo-section">
                            <div className="dash-saldo-header">
                                <div className="dash-saldo-title-row">
                                    <span className="dash-saldo-icon">💰</span>
                                    <h2 className="dash-saldo-title">Estado de Saldos y Reembolsos</h2>
                                </div>
                                <select
                                    className="dash-saldo-select"
                                    value={filtroSaldo}
                                    onChange={e => setFiltroSaldo(e.target.value)}
                                >
                                    <option value="global">🌐 Balance Global ({asigConDatos.length} asignaciones)</option>
                                    {asigConDatos.map(a => (
                                        <option key={a.id} value={String(a.id)}>
                                            📋 {a.cliente || `Asig. #${a.id}`} · {a.ciudad || ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <p className="dash-saldo-sublabel">{viewLabel}</p>

                            <div className="dash-saldo-metrics">
                                <div className="dash-saldo-metric">
                                    <span className="dash-saldo-metric-lbl">Anticipo</span>
                                    <span className="dash-saldo-metric-val">{formatCOP(viewAnticipo)}</span>
                                </div>
                                <div className="dash-saldo-metric">
                                    <span className="dash-saldo-metric-lbl">Gastado</span>
                                    <span className="dash-saldo-metric-val" style={{ color: '#0284C7' }}>{formatCOP(viewGastado)}</span>
                                </div>
                                <div className={`dash-saldo-metric ${esFavorTecnico ? 'dash-saldo-metric--warn' : 'dash-saldo-metric--ok'}`}>
                                    <span className="dash-saldo-metric-lbl">
                                        {esFavorTecnico ? '🚨 Saldo a Favor Técnico' : '✅ Saldo Restante Empresa'}
                                    </span>
                                    <span className="dash-saldo-metric-val">
                                        {formatCOP(Math.abs(viewSaldo))}
                                    </span>
                                </div>
                            </div>

                            {esFavorTecnico && (
                                <div className="dash-saldo-alert">
                                    ⚠️ Tienes un reembolso pendiente de <strong>{formatCOP(viewGastado - viewAnticipo)}</strong>.
                                    Contacta a tu administrador para el reintegro.
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ── KPI CARDS ROW ── */}
                <div className="dash-tec-kpi-grid">
                    <div className="dash-tec-kpi-card">
                        <div className="dash-tec-kpi-body">
                            <span className="dash-tec-kpi-label">Asignaciones activas</span>
                            <span className="dash-tec-kpi-val">{stats.asignacionesActivas}</span>
                            <button className="dash-tec-kpi-link" onClick={() => navigate('/mis-asignaciones')}>
                                Ver asignaciones →
                            </button>
                        </div>
                        <div className="dash-tec-kpi-icon dash-tec-kpi-icon--blue">💼</div>
                    </div>

                    <div className="dash-tec-kpi-card">
                        <div className="dash-tec-kpi-body">
                            <span className="dash-tec-kpi-label">Legalizaciones en curso</span>
                            <span className="dash-tec-kpi-val">{stats.legalizacionesEnCurso}</span>
                            <button className="dash-tec-kpi-link" onClick={() => navigate('/mis-viaticos')}>
                                Ver viáticos →
                            </button>
                        </div>
                        <div className="dash-tec-kpi-icon dash-tec-kpi-icon--orange">📦</div>
                    </div>

                    <div className="dash-tec-kpi-card">
                        <div className="dash-tec-kpi-body">
                            <span className="dash-tec-kpi-label">Total Viáticos Registrados</span>
                            <span className="dash-tec-kpi-val">{viaticos.length}</span>
                            <button className="dash-tec-kpi-link" onClick={() => navigate('/mis-viaticos')}>
                                Historial completo →
                            </button>
                        </div>
                        <div className="dash-tec-kpi-icon dash-tec-kpi-icon--green">📄</div>
                    </div>
                </div>

                {/* ── VISUAL ANALYTICS (3 CHARTS ROW) ── */}
                <div className="dash-tec-charts-grid">
                    {/* Widget 1: Donut chart */}
                    <div className="dash-chart-card">
                        <h3 className="dash-chart-title">Distribución de gastos por concepto</h3>
                        <div className="dash-donut-wrap">
                            {/* SVG Donut */}
                            <svg viewBox="0 0 100 100" className="dash-donut-svg">
                                <circle cx="50" cy="50" r="38" fill="none" stroke="#E2E8F0" strokeWidth="16" />
                                {distribucionConcepto.map((item, idx) => {
                                    const strokeDasharray = `${(item.pct * 2.38).toFixed(1)} 238.7`;
                                    let offset = 0;
                                    for (let i = 0; i < idx; i++) {
                                        offset += distribucionConcepto[i].pct * 2.38;
                                    }
                                    return (
                                        <circle
                                            key={item.id}
                                            cx="50"
                                            cy="50"
                                            r="38"
                                            fill="none"
                                            stroke={item.color}
                                            strokeWidth="16"
                                            strokeDasharray={strokeDasharray}
                                            strokeDashoffset={-offset}
                                            transform="rotate(-90 50 50)"
                                        />
                                    );
                                })}
                            </svg>
                            <div className="dash-donut-legend">
                                {distribucionConcepto.map((item) => (
                                    <div key={item.id} className="dash-legend-item">
                                        <span className="dash-legend-dot" style={{ backgroundColor: item.color }} />
                                        <span className="dash-legend-label">{item.label}</span>
                                        <span className="dash-legend-pct">{item.pct}%</span>
                                        <span className="dash-legend-val">{formatCOP(item.val)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Widget 2: Resumen de Asignaciones Activas */}
                    <div className="dash-chart-card">
                        <h3 className="dash-chart-title">Asignaciones en curso</h3>
                        <div className="dash-asig-widget-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', justifyContent: 'space-between' }}>
                            {asignaciones.length === 0 ? (
                                <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 'auto 0' }}>
                                    No tienes asignaciones activas en este momento.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '190px', overflowY: 'auto' }}>
                                    {asignaciones.map((a) => (
                                        <div key={a.id} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0.65rem 0.85rem', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1E293B', marginBottom: '0.2rem' }}>
                                                <span>{a.cliente} ({a.ciudad})</span>
                                                <span style={{ color: '#0EA5E9' }}>#{a.id}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.8rem' }}>
                                                <span>Anticipo: {formatCOP(Number(a.monto_anticipo || 0))}</span>
                                                <span>Gastado: {formatCOP(Number(a.total_gastado || 0))}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button
                                className="dash-tec-kpi-link"
                                style={{ alignSelf: 'flex-start', marginTop: '0.5rem', fontWeight: 600 }}
                                onClick={() => navigate('/mis-asignaciones')}
                            >
                                Gestionar misiones y viáticos →
                            </button>
                        </div>
                    </div>

                    {/* Widget 3: Gastos por mes */}
                    <div className="dash-chart-card">
                        <h3 className="dash-chart-title">Gastos por mes (este año)</h3>
                        <div className="dash-monthly-wrap">
                            <div className="dash-monthly-bars">
                                {gastosPorMes.map((m) => (
                                    <div key={m.mes} className="dash-monthly-col" title={`${m.mes}: ${formatCOP(m.val)}`}>
                                        <div className="dash-monthly-bar-track">
                                            <div
                                                className="dash-monthly-bar-fill"
                                                style={{ height: `${Math.max(5, m.pct)}%` }}
                                            />
                                        </div>
                                        <span className="dash-monthly-label">{m.mes}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── BOTÓN RÁPIDO PARA REGISTRAR ── */}
                <div className="dash-tec-action-banner">
                    <div>
                        <h2>¿Tienes un nuevo gasto de viaje?</h2>
                        <p>Registra tus facturas, recibos y pasajes de forma ultra rápida.</p>
                    </div>
                    <button className="dash-tec-btn-action" onClick={() => setMostrarModalTipoViatico(true)}>
                        📝 Registrar viáticos ahora →
                    </button>
                </div>

                {mostrarModalTipoViatico && (
                    <ModalSeleccionarTipoViatico onClose={() => setMostrarModalTipoViatico(false)} />
                )}
            </div>
        </TecnicoLayout>
    );
}
