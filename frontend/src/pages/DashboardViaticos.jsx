import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Legend,
    Line,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { obtenerDashboardViaticos } from '../services/dashboardViaticos';
import {
    construirVista,
    etiquetaMes,
    formatCOP,
    formatCOPCompact,
    formatFecha,
    mesAnterior,
    prepararDatosTorta,
} from '../utils/dashboardViaticos';
import logoGSB from '../assets/logo-gsb.png';
import InstallPwaPrompt from '../components/InstallPwaPrompt';
import '../pages/AdminDashboard.css';
import './Auditoria.css';
import './DashboardViaticos.css';


function TooltipCOP({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="dv-tooltip">
            <p className="dv-tooltip-label">{label}</p>
            {payload
                .filter((p) => p.value !== null && p.value !== undefined)
                .map((p) => (
                    <p key={p.dataKey} className="dv-tooltip-row">
                        <span style={{ color: p.color }}>{p.name}:</span>{' '}
                        {Array.isArray(p.value)
                            ? `${formatCOP(p.value[0])} – ${formatCOP(p.value[1])}`
                            : formatCOP(p.value)}
                    </p>
                ))}
        </div>
    );
}


/* ─────────────────────────── Página ─────────────────────────── */

export default function DashboardViaticos() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [data, setData] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [periodo, setPeriodo] = useState('historico');
    const [sidebarAbierto, setSidebarAbierto] = useState(false);

    // Tipo de visualización independiente por gráfica ('barras' | 'torta')
    const [tipoConcepto, setTipoConcepto] = useState('barras');
    const [tipoTecnico, setTipoTecnico] = useState('barras');
    const [tipoCiudad, setTipoCiudad] = useState('barras');

    async function cargar() {
        setCargando(true);
        setError('');
        try {
            const { data: payload } = await obtenerDashboardViaticos();
            setData(payload);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo cargar el dashboard de viáticos.');
        } finally {
            setCargando(false);
        }
    }

    // Una sola petición al abrir; después solo el botón "Actualizar".
    useEffect(() => {
        if (user?.rol === 'superadmin') cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const vista = useMemo(() => construirVista(data, periodo), [data, periodo]);

    const datosConceptoTorta = useMemo(() => {
        return (vista?.conceptos || []).map((c) => ({
            nombre: c.concepto,
            monto: periodo === 'historico' ? c.historico : c.periodo,
        }));
    }, [vista?.conceptos, periodo]);

    if (user && user.rol !== 'superadmin') {
        return <Navigate to="/seleccion-modulo" replace />;
    }

    const NAV_ITEMS_GLOBAL = [
        { id: 'usuarios', label: 'Usuarios & Roles', icon: '👥', action: () => navigate('/admin/usuarios') },
        { id: 'auditoria', label: 'Auditoría del Sistema', icon: '📊', action: () => navigate('/admin/auditoria') },
        { id: 'dashboard-viaticos', label: 'Dashboard de Viáticos', icon: '📈', action: () => {}, active: true },
        { id: 'perfil', label: 'Mi Perfil', icon: '⚙️', action: () => user?.id && navigate(`/admin/personal/${user.id}`) },
    ];

    const p = data?.proyeccion;
    const etiquetaPeriodo = periodo === 'historico' ? 'Histórico' : etiquetaMes(periodo);

    return (
        <div className="gsb-app-layout">
            {/* ── SIDEBAR — ADMINISTRACIÓN GLOBAL ── */}
            <aside className={`gsb-sidebar ${sidebarAbierto ? 'gsb-sidebar--open' : ''}`}>
                <div className="gsb-sidebar-header" onClick={() => navigate('/seleccion-modulo')} style={{ cursor: 'pointer' }} title="Regresar al Hub de Módulos">
                    <div className="gsb-sidebar-logo-wrap">
                        <img src={logoGSB} alt="Global Security Bank" className="gsb-sidebar-logo" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="gsb-sidebar-brand-name">ADMIN GLOBAL</span>
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>‹ Hub de Módulos</span>
                    </div>
                </div>

                <nav className="gsb-sidebar-nav">
                    {NAV_ITEMS_GLOBAL.map((item) => (
                        <button
                            key={item.id}
                            className={`gsb-nav-item ${item.active ? 'gsb-nav-item--active' : ''}`}
                            onClick={() => {
                                item.action();
                                setSidebarAbierto(false);
                            }}
                        >
                            <span className="gsb-nav-icon">{item.icon}</span>
                            <span className="gsb-nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>
            </aside>

            {sidebarAbierto && <div className="gsb-sidebar-backdrop" onClick={() => setSidebarAbierto(false)} />}

            <div className="gsb-main-wrapper">
                <header className="gsb-topbar">
                    <div className="gsb-topbar-left">
                        <button className="gsb-menu-toggle" onClick={() => setSidebarAbierto(!sidebarAbierto)} aria-label="Abrir menú">
                            ☰
                        </button>
                        <div className="aud-header-title-wrap">
                            <h1 className="gsb-topbar-title">📈 Dashboard de Viáticos</h1>
                            <span className="gsb-topbar-subtitle">Histórico desde el día cero (vivo + archivado) y proyección</span>
                        </div>
                    </div>
                    <div className="gsb-topbar-right">
                        <InstallPwaPrompt />
                    </div>
                </header>

                <main className="gsb-content-body aud-page-content">
                    <div className="dv-toolbar">
                        <label className="dv-periodo">
                            <span>Periodo</span>
                            <select
                                className="aud-mini-select"
                                value={periodo}
                                onChange={(e) => setPeriodo(e.target.value)}
                                disabled={!data}
                            >
                                <option value="historico">Histórico</option>
                                {data?.meses.slice().reverse().map((m) => (
                                    <option key={m.mes} value={m.mes}>{etiquetaMes(m.mes)}</option>
                                ))}
                            </select>
                        </label>
                        <div className="dv-toolbar-right">
                            {data && (
                                <span className="dv-generado">
                                    Datos de {new Date(data.generado_en).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                            )}
                            <button type="button" className="dv-btn-actualizar" onClick={cargar} disabled={cargando}>
                                {cargando ? 'Cargando…' : '↻ Actualizar'}
                            </button>
                        </div>
                    </div>

                    {error && <div className="dv-error">{error}</div>}

                    {cargando && !data && (
                        <div className="aud-loading-card"><span>Cargando dashboard de viáticos…</span></div>
                    )}

                    {vista && (
                        <>
                            {/* ── KPIs ── */}
                            <div className="aud-kpi-row">
                                <div className="aud-kpi-card aud-kpi-card--dark">
                                    <span className="aud-kpi-label">GASTO TOTAL DESDE EL DÍA CERO</span>
                                    <h3 className="aud-kpi-value">{formatCOP(data.total_gasto)}</h3>
                                    <span className="aud-kpi-sub">Desde {etiquetaMes(data.meses[0]?.mes || data.mes_actual)} · sin rechazados</span>
                                </div>

                                <div className="aud-kpi-card">
                                    <span className="aud-kpi-label">MES EN CURSO</span>
                                    <h3 className="aud-kpi-value">{formatCOP(vista.actual)}</h3>
                                    <span className="aud-kpi-sub">
                                        {vista.variacion === null
                                            ? 'Sin mes anterior para comparar'
                                            : `${vista.variacion >= 0 ? '▲' : '▼'} ${Math.abs(vista.variacion).toFixed(1)} % vs ${etiquetaMes(mesAnterior(data.mes_actual))} (${formatCOP(vista.previo)})`}
                                        {p && ` · día ${p.dias_transcurridos} de ${p.dias_mes}`}
                                    </span>
                                </div>

                                <div className="aud-kpi-card">
                                    <span className="aud-kpi-label">PENDIENTES POR APROBAR</span>
                                    <h3 className="aud-kpi-value">{data.pendientes.cantidad}</h3>
                                    <span className="aud-kpi-sub">{formatCOP(data.pendientes.monto)} · solo viáticos en vivo</span>
                                </div>

                                <div className="aud-kpi-card">
                                    <span className="aud-kpi-label">PROYECCIÓN CIERRE DEL MES</span>
                                    {p ? (
                                        <>
                                            <h3 className="aud-kpi-value">{formatCOP(p.cierre_mes.central)}</h3>
                                            <span className="aud-kpi-sub">
                                                Rango {formatCOPCompact(p.cierre_mes.minimo)} – {formatCOPCompact(p.cierre_mes.maximo)}
                                                {vista.previo > 0 && ` · ${p.cierre_mes.central >= vista.previo ? '+' : ''}${(((p.cierre_mes.central - vista.previo) / vista.previo) * 100).toFixed(1)} % vs mes anterior`}
                                                {' · '}confianza {p.confianza}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="aud-kpi-sub">Sin datos suficientes</span>
                                    )}
                                </div>
                            </div>

                            <div className="aud-charts-stack">
                                {/* 1. EVOLUCIÓN MENSUAL + PROYECCIÓN */}
                                <div className="aud-panel-card">
                                    <div className="aud-panel-header">
                                        <div>
                                            <h2 className="aud-panel-title">📅 Evolución mensual desde el día cero</h2>
                                            <p className="aud-panel-sub">
                                                Gasto por mes de la fecha de cada viático · la línea punteada es la proyección con su banda mínimo/máximo
                                            </p>
                                        </div>
                                        {p && <span className={`dv-confianza dv-confianza--${p.confianza}`}>Confianza {p.confianza}</span>}
                                    </div>
                                    <div className="aud-chart-container">
                                        <ResponsiveContainer width="100%" height={300}>
                                            <ComposedChart data={vista.evolucion} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} />
                                                <YAxis tickFormatter={formatCOPCompact} tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} width={62} />
                                                <Tooltip content={<TooltipCOP />} />
                                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                                <Area dataKey="banda" name="Banda proyección" stroke="none" fill="#93C5FD" fillOpacity={0.35} connectNulls />
                                                <Line dataKey="real" name="Gasto real" stroke="#1D63C8" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
                                                <Line dataKey="proyeccion" name="Proyección" stroke="#1D63C8" strokeDasharray="6 4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                    {p && (
                                        <div className="dv-metodo">
                                            <p>
                                                <strong>Cómo se calcula:</strong> ritmo diario de cada mes (gasto del mes ÷ días con datos).
                                                Central = 60 % del ritmo del mes en curso ({formatCOP(p.ritmo_diario_actual)}/día) + 40 % del mes anterior
                                                ({p.ritmo_diario_mes_anterior ? `${formatCOP(p.ritmo_diario_mes_anterior)}/día` : 'sin datos'}).
                                                La banda va del menor al mayor de esos ritmos, con un ancho mínimo de ±{p.margen_minimo_pct} %.
                                                {p.tendencia_pct !== null && ` Tendencia: ${p.tendencia_pct >= 0 ? '+' : ''}${p.tendencia_pct} % frente al mes anterior.`}
                                            </p>
                                            <p>
                                                Se usa el ritmo por mes y no por semana porque las carpetas archivadas solo conservan el gasto mensual.
                                                {p.confianza === 'baja' && ` Confianza baja: hay ${p.dias_historia} días de historia (menos de 3 meses).`}
                                                {' '}El mes en curso puede subir aún por viáticos que se cargan con retraso.
                                            </p>
                                            <div className="dv-semanas">
                                                {p.semanas.map((s) => (
                                                    <div key={s.desde} className="dv-semana">
                                                        <span className="dv-semana-fechas">{formatFecha(s.desde)} – {formatFecha(s.hasta)}</span>
                                                        <span className="dv-semana-rango">{formatCOPCompact(s.minimo)} – {formatCOPCompact(s.maximo)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ── BANNER RESUMEN DE GASTOS ── */}
                                <div className="dv-section-banner">
                                    <div className="dv-section-banner-info">
                                        <div className="dv-section-banner-icon">
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="20" x2="18" y2="10" />
                                                <line x1="12" y1="20" x2="12" y2="4" />
                                                <line x1="6" y1="20" x2="6" y2="14" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h2 className="dv-section-banner-title">Resumen de Gastos</h2>
                                            <p className="dv-section-banner-sub">Análisis por concepto, técnico y ciudad</p>
                                        </div>
                                    </div>
                                    <div className="dv-chart-switcher dv-chart-switcher--dark">
                                        <button
                                            type="button"
                                            className={`dv-chart-btn ${tipoConcepto === 'barras' && tipoTecnico === 'barras' && tipoCiudad === 'barras' ? 'dv-chart-btn--active' : ''}`}
                                            onClick={() => {
                                                setTipoConcepto('barras');
                                                setTipoTecnico('barras');
                                                setTipoCiudad('barras');
                                            }}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="20" x2="18" y2="10" />
                                                <line x1="12" y1="20" x2="12" y2="4" />
                                                <line x1="6" y1="20" x2="6" y2="14" />
                                            </svg>
                                            Barras
                                        </button>
                                        <button
                                            type="button"
                                            className={`dv-chart-btn ${tipoConcepto === 'torta' && tipoTecnico === 'torta' && tipoCiudad === 'torta' ? 'dv-chart-btn--active' : ''}`}
                                            onClick={() => {
                                                setTipoConcepto('torta');
                                                setTipoTecnico('torta');
                                                setTipoCiudad('torta');
                                            }}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                                <path d="M22 12A10 10 0 0 0 12 2v10z" />
                                            </svg>
                                            Torta
                                        </button>
                                    </div>
                                </div>

                                {/* 2. CONCEPTO */}
                                <div className="aud-panel-card">
                                    <div className="aud-panel-header">
                                        <div className="dv-header-with-badge">
                                            <div className="dv-header-badge dv-header-badge--blue">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h2 className="aud-panel-title">Gasto por concepto</h2>
                                                <p className="aud-panel-sub">
                                                    Distribución del gasto total por concepto{periodo !== 'historico' && ` · ${etiquetaPeriodo}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="dv-chart-switcher">
                                            <button
                                                type="button"
                                                className={`dv-chart-btn ${tipoConcepto === 'barras' ? 'dv-chart-btn--active' : ''}`}
                                                onClick={() => setTipoConcepto('barras')}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="20" x2="18" y2="10" />
                                                    <line x1="12" y1="20" x2="12" y2="4" />
                                                    <line x1="6" y1="20" x2="6" y2="14" />
                                                </svg>
                                                Barras
                                            </button>
                                            <button
                                                type="button"
                                                className={`dv-chart-btn ${tipoConcepto === 'torta' ? 'dv-chart-btn--active' : ''}`}
                                                onClick={() => setTipoConcepto('torta')}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                                                </svg>
                                                Torta
                                            </button>
                                        </div>
                                    </div>
                                    {tipoConcepto === 'barras' ? (
                                        <ResponsiveContainer width="100%" height={280}>
                                            <BarChart data={vista.conceptos} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis dataKey="concepto" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} interval={0} />
                                                <YAxis tickFormatter={formatCOPCompact} tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} width={62} />
                                                <Tooltip content={<TooltipCOP />} />
                                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                                <Bar dataKey="historico" name="Histórico" fill="#1D63C8" radius={[4, 4, 0, 0]} />
                                                {periodo !== 'historico' && (
                                                    <Bar dataKey="periodo" name={etiquetaPeriodo} fill="#D97706" radius={[4, 4, 0, 0]} />
                                                )}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <GraficoTorta
                                            datos={datosConceptoTorta}
                                            mostrarResumen={true}
                                            resumenPeriodoTexto={
                                                periodo === 'historico'
                                                    ? 'El gráfico muestra la distribución del gasto histórico por concepto.'
                                                    : `El gráfico muestra la distribución del gasto por concepto con base en el total de ${etiquetaPeriodo}.`
                                            }
                                        />
                                    )}
                                    <p className="dv-nota">
                                        En carpetas archivadas el concepto solo existe por carpeta: si una carpeta cruza de mes, su gasto por concepto se reparte entre los meses en proporción al gasto de cada mes.
                                    </p>
                                </div>

                                <div className="aud-donuts-grid">
                                    {/* 3. TÉCNICO */}
                                    <div className="aud-panel-card">
                                        <div className="aud-panel-header">
                                            <div className="dv-header-with-badge">
                                                <div className="dv-header-badge dv-header-badge--blue">
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                                        <circle cx="12" cy="7" r="4" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h2 className="aud-panel-title">Gasto por técnico</h2>
                                                    <p className="aud-panel-sub">Distribución del gasto por técnico · {etiquetaPeriodo}</p>
                                                </div>
                                            </div>
                                            <div className="dv-chart-switcher">
                                                <button
                                                    type="button"
                                                    className={`dv-chart-btn ${tipoTecnico === 'barras' ? 'dv-chart-btn--active' : ''}`}
                                                    onClick={() => setTipoTecnico('barras')}
                                                >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="20" x2="18" y2="10" />
                                                        <line x1="12" y1="20" x2="12" y2="4" />
                                                        <line x1="6" y1="20" x2="6" y2="14" />
                                                    </svg>
                                                    Barras
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`dv-chart-btn ${tipoTecnico === 'torta' ? 'dv-chart-btn--active' : ''}`}
                                                    onClick={() => setTipoTecnico('torta')}
                                                >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                                                    </svg>
                                                    Torta
                                                </button>
                                            </div>
                                        </div>
                                        {tipoTecnico === 'barras' ? (
                                            <GraficoTop datos={vista.tecnicos} color="#2563EB" />
                                        ) : (
                                            <GraficoTorta datos={vista.tecnicos} />
                                        )}
                                    </div>

                                    {/* 4. CIUDAD */}
                                    <div className="aud-panel-card">
                                        <div className="aud-panel-header">
                                            <div className="dv-header-with-badge">
                                                <div className="dv-header-badge dv-header-badge--rose">
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E11D48" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                                        <circle cx="12" cy="10" r="3" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h2 className="aud-panel-title">Gasto por ciudad</h2>
                                                    <p className="aud-panel-sub">Distribución del gasto por ciudad · {etiquetaPeriodo}</p>
                                                </div>
                                            </div>
                                            <div className="dv-chart-switcher">
                                                <button
                                                    type="button"
                                                    className={`dv-chart-btn ${tipoCiudad === 'barras' ? 'dv-chart-btn--active' : ''}`}
                                                    onClick={() => setTipoCiudad('barras')}
                                                >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="20" x2="18" y2="10" />
                                                        <line x1="12" y1="20" x2="12" y2="4" />
                                                        <line x1="6" y1="20" x2="6" y2="14" />
                                                    </svg>
                                                    Barras
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`dv-chart-btn ${tipoCiudad === 'torta' ? 'dv-chart-btn--active' : ''}`}
                                                    onClick={() => setTipoCiudad('torta')}
                                                >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                                                    </svg>
                                                    Torta
                                                </button>
                                            </div>
                                        </div>
                                        {tipoCiudad === 'barras' ? (
                                            <GraficoTop datos={vista.ciudades} color="#7C3AED" />
                                        ) : (
                                            <GraficoTorta datos={vista.ciudades} />
                                        )}
                                        <div className="dv-callout-note">
                                            <div className="dv-callout-icon">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <line x1="12" y1="16" x2="12" y2="12" />
                                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                                </svg>
                                            </div>
                                            <span>En viáticos en vivo es la ciudad del gasto; en carpetas archivadas es la ciudad de la carpeta, no la de cada gasto.</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 5. ESTADOS Y TASA DE RECHAZO */}
                                <div className="aud-panel-card">
                                    <div className="aud-panel-header">
                                        <div>
                                            <h2 className="aud-panel-title">📋 Estados de viáticos y tasa de rechazo</h2>
                                            <p className="aud-panel-sub">Monto por estado · {etiquetaPeriodo}</p>
                                        </div>
                                        <div className="dv-tasa">
                                            <span className="dv-tasa-valor">
                                                {vista.tasaRechazo === null ? '—' : `${vista.tasaRechazo.toFixed(1)} %`}
                                            </span>
                                            <span className="dv-tasa-label">
                                                tasa de rechazo (por monto) · {vista.cantRechazados} rechazado(s), {formatCOP(vista.rechazado)}
                                            </span>
                                        </div>
                                    </div>
                                    <ResponsiveContainer width="100%" height={Math.max(160, vista.estados.length * 46)}>
                                        <BarChart data={vista.estados} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                            <XAxis type="number" tickFormatter={formatCOPCompact} tick={{ fontSize: 11, fill: '#64748B' }} />
                                            <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11, fill: '#334155' }} />
                                            <Tooltip content={<TooltipCOP />} />
                                            <Bar dataKey="monto" name="Monto" radius={[0, 4, 4, 0]}>
                                                {vista.estados.map((e) => <Cell key={e.id} fill={e.color} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                    <p className="dv-nota">
                                        Rechazados registrados desde {formatFecha(data.fecha_inicio_estado_archivo)} de {data.fecha_inicio_estado_archivo.slice(0, 4)}; antes no se guardaba el estado.
                                        {data.gasto_archivo_estado_desconocido > 0 && (
                                            <> {formatCOP(data.gasto_archivo_estado_desconocido)} del gasto archivado no tiene estado registrado y puede incluir rechazados; no entra en la tasa de rechazo.</>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}

function GraficoTop({ datos, color }) {
    if (!datos.length) {
        return <p className="dv-vacio">Sin gasto en el periodo.</p>;
    }
    return (
        <ResponsiveContainer width="100%" height={Math.max(180, datos.length * 34)}>
            <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" tickFormatter={formatCOPCompact} tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip content={<TooltipCOP />} />
                <Bar dataKey="monto" name="Gasto" fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

const RADIAN = Math.PI / 180;

function renderLabelPie({ cx, cy, midAngle, innerRadius, outerRadius, percent, payload }) {
    const pct = payload?.porcentaje ?? (percent * 100);
    const labelText = payload?.pctStr || `${pct.toFixed(1)}%`;

    if (pct < 4) return null;

    const radius = (innerRadius || 0) + (outerRadius - (innerRadius || 0)) * 0.52;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text
            x={x}
            y={y}
            fill="#FFFFFF"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={700}
            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }}
        >
            {labelText}
        </text>
    );
}

function TooltipTorta({ active, payload }) {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const dataObj = item.payload || {};
    const nombre = dataObj.nombre || item.name;
    const monto = dataObj.monto ?? item.value;
    const pct = dataObj.pctStr || (typeof dataObj.porcentaje === 'number' ? `${dataObj.porcentaje.toFixed(1)}%` : '');
    const color = item.color || dataObj.color || '#1D63C8';

    return (
        <div className="dv-tooltip">
            <p className="dv-tooltip-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', backgroundColor: color }} />
                <span>{nombre}</span>
            </p>
            <p className="dv-tooltip-row">
                <strong>{formatCOP(monto)}</strong>
                {pct && <span style={{ color: '#64748B', marginLeft: '6px' }}>({pct})</span>}
            </p>
        </div>
    );
}

function GraficoTorta({ datos, mostrarResumen = false, resumenPeriodoTexto = '' }) {
    const datosTorta = useMemo(() => prepararDatosTorta(datos), [datos]);

    if (!datosTorta.length) {
        return <p className="dv-vacio">Sin gasto en el periodo.</p>;
    }

    const totalCOP = useMemo(() => {
        return datosTorta.reduce((acc, d) => acc + (d.monto || 0), 0);
    }, [datosTorta]);

    return (
        <div className={`dv-donut-layout ${mostrarResumen ? 'dv-donut-layout--3col' : 'dv-donut-layout--2col'}`}>
            {/* 1. Dona con Total 100% en el centro */}
            <div className="dv-donut-chart-container">
                <ResponsiveContainer width="100%" height={230}>
                    <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <Tooltip content={<TooltipTorta />} />
                        <Pie
                            data={datosTorta}
                            dataKey="monto"
                            nameKey="nombre"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={88}
                            paddingAngle={1.5}
                            label={renderLabelPie}
                            labelLine={false}
                        >
                            {datosTorta.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    stroke="#FFFFFF"
                                    strokeWidth={2}
                                />
                            ))}
                        </Pie>
                        <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fill="#64748B" fontSize="12" fontWeight="500">
                            Total
                        </text>
                        <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" fill="#0F172A" fontSize="18" fontWeight="800">
                            100%
                        </text>
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* 2. Leyenda vertical limpia y ordenada */}
            <div className="dv-donut-legend-list">
                {datosTorta.map((item) => (
                    <div key={item.nombre} className="dv-donut-legend-item">
                        <span className="dv-donut-legend-dot" style={{ backgroundColor: item.color }} />
                        <span className="dv-donut-legend-name" title={item.nombre}>{item.nombre}</span>
                        <span className="dv-donut-legend-pct">{item.pctStr}</span>
                    </div>
                ))}
            </div>

            {/* 3. Tarjeta de Resumen (lateral derecha) */}
            {mostrarResumen && (
                <div className="dv-donut-summary-card">
                    <div className="dv-donut-summary-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                    </div>
                    <span className="dv-donut-summary-title">Total de gastos</span>
                    <span className="dv-donut-summary-pct">100%</span>
                    {totalCOP > 0 && (
                        <span className="dv-donut-summary-cop">{formatCOP(totalCOP)}</span>
                    )}
                    <p className="dv-donut-summary-desc">
                        {resumenPeriodoTexto || 'El gráfico muestra la distribución del gasto por concepto, con base en el total de cada mes.'}
                    </p>
                </div>
            )}
        </div>
    );
}
