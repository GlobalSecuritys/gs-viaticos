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

                                {/* 2. CONCEPTO */}
                                <div className="aud-panel-card">
                                    <div className="aud-panel-header">
                                        <div>
                                            <h2 className="aud-panel-title">🧾 Gasto por concepto</h2>
                                            <p className="aud-panel-sub">
                                                Histórico{periodo !== 'historico' && ` vs ${etiquetaPeriodo}`}
                                            </p>
                                        </div>
                                    </div>
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
                                    <p className="dv-nota">
                                        En carpetas archivadas el concepto solo existe por carpeta: si una carpeta cruza de mes, su gasto por concepto se reparte entre los meses en proporción al gasto de cada mes.
                                    </p>
                                </div>

                                <div className="aud-donuts-grid">
                                    {/* 3. TÉCNICO */}
                                    <div className="aud-panel-card">
                                        <div className="aud-panel-header">
                                            <div>
                                                <h2 className="aud-panel-title">👷 Gasto por técnico</h2>
                                                <p className="aud-panel-sub">Top 10 · {etiquetaPeriodo}</p>
                                            </div>
                                        </div>
                                        <GraficoTop datos={vista.tecnicos} color="#2563EB" />
                                    </div>

                                    {/* 4. CIUDAD */}
                                    <div className="aud-panel-card">
                                        <div className="aud-panel-header">
                                            <div>
                                                <h2 className="aud-panel-title">📍 Gasto por ciudad</h2>
                                                <p className="aud-panel-sub">Top 10 · {etiquetaPeriodo}</p>
                                            </div>
                                        </div>
                                        <GraficoTop datos={vista.ciudades} color="#7C3AED" />
                                        <p className="dv-nota">
                                            En viáticos en vivo es la ciudad del gasto; en carpetas archivadas es la ciudad de la carpeta, no la de cada gasto.
                                        </p>
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
