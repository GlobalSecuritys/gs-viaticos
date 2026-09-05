import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listarAuditoria } from '../services/auditoria';
import api from '../services/api';
import { obtenerNombreUsuario } from '../utils/personal';
import logoGSB from '../assets/logo-gsb.png';
import NotificationBell from '../components/NotificationBell';
import InstallPwaPrompt from '../components/InstallPwaPrompt';
import {
    BarChart,
    Bar,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import '../pages/AdminDashboard.css';
import './Auditoria.css';

/* ─────────────────────────── Constants & Labels ─────────────────────────── */

const LABEL_ACCION = {
    crear_usuario: 'Crear usuario',
    editar_usuario: 'Editar información',
    cambiar_rol: 'Cambiar rol',
    cambiar_estado: 'Activar / Desactivar',
};

const ICONO_ACCION = {
    crear_usuario: '👤',
    editar_usuario: '✏️',
    cambiar_rol: '🔑',
    cambiar_estado: '🔄',
};

const LABEL_ROL = {
    superadmin: 'Super Admin',
    admin: 'Administrador',
    tecnico: 'Técnico',
};

const LABEL_TIPO_GASTO = {
    alimentacion: 'Alimentación',
    transporte: 'Transporte',
    hotel: 'Hotel',
    peajes: 'Peajes',
    parqueadero: 'Parqueadero',
    materiales: 'Materiales',
    alquiler_escalera: 'Alquiler de escalera',
    otros: 'Otros',
};

const LABEL_ESTADO = {
    aprobado: 'Aprobado',
    pendiente: 'Pendiente',
    rechazado: 'Rechazado',
};

const COLORES_ESTADO = {
    aprobado: '#059669',
    pendiente: '#D97706',
    rechazado: '#DC2626',
};

const COLORES_TIPO = [
    '#1D63C8', '#7C3AED', '#059669', '#D97706', '#0284C7', '#64748B',
];

/* ─────────────────────────── Format Helpers ─────────────────────────── */

function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value || 0);
}

function formatCOPCompact(value) {
    if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
        return `$${Math.round(value / 1000)}k`;
    }
    return `$${value}`;
}

function formatFechaHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function iniciales(nombre = '') {
    return nombre
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');
}

/* Tooltips Recharts */
function TooltipCOP({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="aud-chart-tooltip">
            <p className="aud-chart-tooltip-label">{label}</p>
            <p className="aud-chart-tooltip-value">{formatCOP(payload[0].value)}</p>
        </div>
    );
}

function TooltipPie({ active, payload }) {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
        <div className="aud-chart-tooltip">
            <p className="aud-chart-tooltip-label">{name}</p>
            <p className="aud-chart-tooltip-value">{formatCOP(value)}</p>
        </div>
    );
}

/* ─────────────────────────── Compute Chart Data ─────────────────────────── */

function computeChartData(viaticos, usuarios) {
    const usuariosMap = new Map(usuarios.map((u) => [u.id, u]));

    // 1. Gasto total por técnico
    const gastoTecnico = {};
    const nombreTecnico = {};
    for (const v of viaticos) {
        if (!v.usuario_id) continue;
        const uid = v.usuario_id;
        gastoTecnico[uid] = (gastoTecnico[uid] || 0) + Number(v.valor || 0);
        if (!nombreTecnico[uid]) {
            const u = usuariosMap.get(uid);
            nombreTecnico[uid] = u
                ? u.nombre_completo || u.nombre || u.correo
                : `Usuario #${uid}`;
        }
    }
    const porTecnico = Object.entries(gastoTecnico)
        .map(([uid, total]) => ({ nombre: nombreTecnico[uid], total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    // 2. Distribución por estado
    const cuentaEstado = { aprobado: 0, pendiente: 0, rechazado: 0 };
    for (const v of viaticos) {
        if (v.estado in cuentaEstado) cuentaEstado[v.estado]++;
    }
    const porEstado = Object.entries(cuentaEstado).map(([estado, count]) => ({
        name: LABEL_ESTADO[estado] || estado,
        value: count,
        estado,
    }));

    // 3. Gasto por tipo_gasto
    const gastoTipo = {};
    for (const v of viaticos) {
        const tipo = v.tipo_gasto || 'otros';
        gastoTipo[tipo] = (gastoTipo[tipo] || 0) + Number(v.valor || 0);
    }
    const porTipo = Object.entries(gastoTipo).map(([tipo, total]) => ({
        name: LABEL_TIPO_GASTO[tipo] || tipo,
        value: total,
    }));

    // 4. Gasto por ciudad
    const gastoCiudad = {};
    for (const v of viaticos) {
        const ciudad = v.ciudad || 'Sin ciudad';
        gastoCiudad[ciudad] = (gastoCiudad[ciudad] || 0) + Number(v.valor || 0);
    }
    const porCiudad = Object.entries(gastoCiudad)
        .map(([ciudad, total]) => ({ ciudad, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

    // 5. Evolución mensual (12 meses o dinámico)
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const anioActual = new Date().getFullYear();
    
    // Inicializar los 12 meses
    const mesesMap = {};
    mesesNombres.forEach((m, idx) => {
        mesesMap[idx] = 0;
    });

    for (const v of viaticos) {
        if (!v.fecha) continue;
        const [yearStr, monthStr] = v.fecha.split('-');
        const y = Number(yearStr);
        const mIdx = Number(monthStr) - 1;
        if (y === anioActual && mIdx >= 0 && mIdx < 12) {
            mesesMap[mIdx] += Number(v.valor || 0);
        }
    }

    const porMes = mesesNombres.map((mes, idx) => ({
        mes,
        total: mesesMap[idx],
    }));

    return { porTecnico, porEstado, porTipo, porCiudad, porMes };
}

/* ─────────────────────────── Main Auditoria Component ─────────────────────────── */

export default function Auditoria() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    // Timeline state (Actividad administrativa)
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [errorLogs, setErrorLogs] = useState('');
    const [accionFiltro, setAccionFiltro] = useState('');
    const [modalActividadAbierto, setModalActividadAbierto] = useState(false);

    // Analytics state
    const [viaticos, setViaticos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [loadingAnalytics, setLoadingAnalytics] = useState(true);
    const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
    const [sidebarAbierto, setSidebarAbierto] = useState(false);

    // Filtros de período visuales
    const [filtroPeriodoTecnicos, setFiltroPeriodoTecnicos] = useState('mes');
    const [filtroPeriodoMeses, setFiltroPeriodoMeses] = useState('anio');

    async function cargarActividad() {
        setLoadingLogs(true);
        setErrorLogs('');
        try {
            const { data } = await listarAuditoria({
                accion: accionFiltro || undefined,
                limit: 100,
            });
            setLogs(data || []);
        } catch (err) {
            setErrorLogs(err.response?.data?.detail || 'No se pudo cargar la actividad administrativa.');
        } finally {
            setLoadingLogs(false);
        }
    }

    async function cargarAnalytics() {
        setLoadingAnalytics(true);
        try {
            const [resV, resU] = await Promise.all([
                api.get('/admin/viaticos'),
                api.get('/admin/usuarios'),
            ]);
            setViaticos(resV.data || []);
            setUsuarios(resU.data || []);
        } catch {
            // fallback
        } finally {
            setLoadingAnalytics(false);
        }
    }

    useEffect(() => {
        cargarActividad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accionFiltro]);

    useEffect(() => {
        cargarAnalytics();
    }, []);

    const chartData = useMemo(
        () => computeChartData(viaticos, usuarios),
        [viaticos, usuarios]
    );

    const stats = useMemo(() => {
        const totalGastado = viaticos.reduce((acc, v) => acc + Number(v.valor || 0), 0);
        return {
            totalGastado,
            pendientes: viaticos.filter((v) => v.estado === 'pendiente').length,
            aprobados: viaticos.filter((v) => v.estado === 'aprobado').length,
            rechazados: viaticos.filter((v) => v.estado === 'rechazado').length,
        };
    }, [viaticos]);

    const totalViaticos = viaticos.length || 1;
    const pctAprobados = Math.round((stats.aprobados / totalViaticos) * 100);
    const pctPendientes = Math.round((stats.pendientes / totalViaticos) * 100);
    const pctRechazados = Math.round((stats.rechazados / totalViaticos) * 100);

    if (user && user.rol !== 'superadmin') {
        return <Navigate to="/admin" replace />;
    }

    const NAV_ITEMS_GLOBAL = [
        { id: 'usuarios', label: 'Usuarios & Roles', icon: '👥', action: () => navigate('/admin/usuarios'), active: false },
        { id: 'auditoria', label: 'Auditoría del Sistema', icon: '📊', action: () => {}, active: true },
        { id: 'perfil', label: 'Mi Perfil', icon: '⚙️', action: () => user?.id && navigate(`/admin/personal/${user.id}`), active: false },
    ];

    const nombreMostrado = obtenerNombreUsuario(user, 'Admin GSB');

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

                <div style={{ padding: '0.6rem 0.75rem 0.2rem', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Administración Global
                </div>

                <nav className="gsb-sidebar-nav">
                    {NAV_ITEMS_GLOBAL.map((item) => (
                        <button
                            key={item.id}
                            className={`gsb-nav-item ${item.active ? 'gsb-nav-item--active' : ''}`}
                            onClick={() => {
                                if (item.action) item.action();
                                setSidebarAbierto(false);
                            }}
                        >
                            <span className="gsb-nav-icon">{item.icon}</span>
                            <span className="gsb-nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="gsb-sidebar-footer">
                    <button
                        type="button"
                        onClick={() => navigate('/seleccion-modulo')}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                            padding: '0.6rem 0.8rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#F4F1EC',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            fontFamily: 'inherit',
                            marginBottom: '0.5rem',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <span>🔲</span>
                        <span>Hub de Módulos</span>
                    </button>
                    <div className="gsb-trust-badge">
                        <img src={logoGSB} alt="Shield" className="gsb-trust-icon" />
                        <div className="gsb-trust-text">
                            <span>Seguridad</span>
                            <span>Tecnología</span>
                            <span>Confianza</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Backdrop móvil */}
            {sidebarAbierto && (
                <div className="gsb-sidebar-backdrop" onClick={() => setSidebarAbierto(false)} />
            )}

            {/* ── CONTENIDO PRINCIPAL ── */}
            <div className="gsb-main-wrapper">
                {/* ── TOPBAR HEADER ── */}
                <header className="gsb-topbar">
                    <div className="gsb-topbar-left">
                        <button
                            className="gsb-menu-toggle"
                            onClick={() => setSidebarAbierto(!sidebarAbierto)}
                            aria-label="Abrir menú"
                        >
                            ☰
                        </button>
                        <div className="aud-header-title-wrap">
                            <h1 className="gsb-topbar-title">🛡️ Auditoría</h1>
                            <span className="gsb-topbar-subtitle">Análisis financiero y operativo de los viáticos</span>
                        </div>
                    </div>

                    <div className="gsb-topbar-right">
                        {/* Selector de rango de fechas de referencia */}
                        <div className="aud-date-badge">
                            <span>📅 13/08/2026 - 15/08/2026 ▾</span>
                        </div>

                        <InstallPwaPrompt />
                        <NotificationBell />

                        <div className="gsb-user-menu-wrap">
                            <button
                                className="gsb-user-pill"
                                onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
                            >
                                <span className="gsb-user-avatar">
                                    {iniciales(nombreMostrado) || 'AG'}
                                </span>
                                <div className="gsb-user-meta">
                                    <span className="gsb-user-email">
                                        {user?.correo || 'Admin@gsbank.com'}
                                    </span>
                                    <span className="gsb-user-role">Super Administrador</span>
                                </div>
                                <span className="gsb-user-chevron">▾</span>
                            </button>

                            {menuUsuarioAbierto && (
                                <div className="gsb-user-dropdown" onClick={() => setMenuUsuarioAbierto(false)}>
                                    <div className="gsb-user-dropdown-header">
                                        <strong>{nombreMostrado}</strong>
                                        <span>{user?.correo}</span>
                                    </div>
                                    <button
                                        className="gsb-dropdown-item"
                                        onClick={() => navigate('/admin')}
                                    >
                                        🏠 Panel Principal
                                    </button>
                                    <button
                                        className="gsb-dropdown-item"
                                        onClick={() => navigate('/admin/usuarios')}
                                    >
                                        👥 Gestión de usuarios
                                    </button>
                                    <hr className="gsb-dropdown-divider" />
                                    <button
                                        className="gsb-dropdown-item gsb-dropdown-item--danger"
                                        onClick={() => {
                                            logout();
                                            navigate('/login');
                                        }}
                                    >
                                        🚪 Cerrar sesión
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="gsb-content-body aud-page-content">
                    {/* ── 4 KPIS SUPERIORES (MATCHING REFERENCE IMAGE) ── */}
                    <div className="aud-kpi-row">
                        {/* KPI 1: Total Gastado (Dark Navy Card) */}
                        <div className="aud-kpi-card aud-kpi-card--dark">
                            <div className="aud-kpi-top">
                                <div className="aud-kpi-icon-wrap aud-kpi-icon--gold">
                                    <span>💼</span>
                                </div>
                            </div>
                            <span className="aud-kpi-label">TOTAL GASTADO</span>
                            <h3 className="aud-kpi-value">{formatCOP(stats.totalGastado)}</h3>
                            <span className="aud-kpi-sub">Este mes</span>

                            <div className="aud-kpi-wave-wrap">
                                <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="aud-kpi-wave">
                                    <defs>
                                        <linearGradient id="audBlueWave" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#1D63C8" stopOpacity="0.3" />
                                            <stop offset="100%" stopColor="#1D63C8" stopOpacity="0.0" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M0 24 Q 30 6, 60 18 T 120 12 L 120 28 L 0 28 Z" fill="url(#audBlueWave)" />
                                    <path d="M0 24 Q 30 6, 60 18 T 120 12" fill="none" stroke="#1D63C8" strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                            </div>
                        </div>

                        {/* KPI 2: Pendientes */}
                        <div className="aud-kpi-card">
                            <div className="aud-kpi-top">
                                <div className="aud-kpi-icon-wrap aud-kpi-icon--amber">
                                    <span>⏳</span>
                                </div>
                            </div>
                            <span className="aud-kpi-label">PENDIENTES</span>
                            <h3 className="aud-kpi-value">{stats.pendientes}</h3>
                            <span className="aud-kpi-sub">Por aprobar</span>

                            <div className="aud-kpi-wave-wrap">
                                <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="aud-kpi-wave">
                                    <defs>
                                        <linearGradient id="audAmberWave" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#D97706" stopOpacity="0.25" />
                                            <stop offset="100%" stopColor="#D97706" stopOpacity="0.0" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M0 22 Q 35 25, 65 14 T 120 16 L 120 28 L 0 28 Z" fill="url(#audAmberWave)" />
                                    <path d="M0 22 Q 35 25, 65 14 T 120 16" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                            </div>
                        </div>

                        {/* KPI 3: Aprobados */}
                        <div className="aud-kpi-card">
                            <div className="aud-kpi-top">
                                <div className="aud-kpi-icon-wrap aud-kpi-icon--emerald">
                                    <span>✓</span>
                                </div>
                            </div>
                            <span className="aud-kpi-label">APROBADOS</span>
                            <h3 className="aud-kpi-value">{stats.aprobados}</h3>
                            <span className="aud-kpi-sub">Este mes</span>

                            <div className="aud-kpi-wave-wrap">
                                <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="aud-kpi-wave">
                                    <defs>
                                        <linearGradient id="audEmeraldWave" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                                            <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M0 26 Q 30 8, 60 22 T 120 10 L 120 28 L 0 28 Z" fill="url(#audEmeraldWave)" />
                                    <path d="M0 26 Q 30 8, 60 22 T 120 10" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                            </div>
                        </div>

                        {/* KPI 4: Rechazados */}
                        <div className="aud-kpi-card">
                            <div className="aud-kpi-top">
                                <div className="aud-kpi-icon-wrap aud-kpi-icon--crimson">
                                    <span>✕</span>
                                </div>
                            </div>
                            <span className="aud-kpi-label">RECHAZADOS</span>
                            <h3 className="aud-kpi-value">{stats.rechazados}</h3>
                            <span className="aud-kpi-sub">Este mes</span>

                            <div className="aud-kpi-wave-wrap">
                                <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="aud-kpi-wave">
                                    <defs>
                                        <linearGradient id="audCrimsonWave" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#DC2626" stopOpacity="0.25" />
                                            <stop offset="100%" stopColor="#DC2626" stopOpacity="0.0" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M0 16 Q 40 26, 75 12 T 120 20 L 120 28 L 0 28 Z" fill="url(#audCrimsonWave)" />
                                    <path d="M0 16 Q 40 26, 75 12 T 120 20" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* ── LOS 5 ANÁLISIS FINANCIEROS Y OPERATIVOS ── */}
                    {loadingAnalytics ? (
                        <div className="aud-loading-card">
                            <span>Cargando análisis y estadísticas financieras...</span>
                        </div>
                    ) : (
                        <div className="aud-charts-stack">
                            {/* 1. GASTO TOTAL POR TÉCNICO (FULL WIDTH) */}
                            <div className="aud-panel-card">
                                <div className="aud-panel-header">
                                    <div>
                                        <h2 className="aud-panel-title">💰 Gasto total por técnico</h2>
                                        <p className="aud-panel-sub">Top 10 · de mayor a menor</p>
                                    </div>
                                    <div className="aud-panel-controls">
                                        <select
                                            className="aud-mini-select"
                                            value={filtroPeriodoTecnicos}
                                            onChange={(e) => setFiltroPeriodoTecnicos(e.target.value)}
                                        >
                                            <option value="mes">Este mes ▾</option>
                                            <option value="anio">Este año ▾</option>
                                            <option value="todos">Histórico ▾</option>
                                        </select>
                                        <button className="aud-dots-btn">⋮</button>
                                    </div>
                                </div>

                                <div className="aud-chart-container">
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart
                                            data={chartData.porTecnico}
                                            margin={{ top: 15, right: 20, left: 10, bottom: 40 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis
                                                dataKey="nombre"
                                                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                                                axisLine={{ stroke: '#CBD5E1' }}
                                                tickLine={false}
                                                interval={0}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: '#64748B' }}
                                                axisLine={{ stroke: '#CBD5E1' }}
                                                tickLine={false}
                                                tickFormatter={formatCOPCompact}
                                                width={65}
                                            />
                                            <Tooltip content={<TooltipCOP />} />
                                            <Bar
                                                dataKey="total"
                                                fill="#2563EB"
                                                radius={[4, 4, 0, 0]}
                                                maxBarSize={480}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* FILA DE 2 DONUTS (VIÁTICOS POR ESTADO + GASTO POR TIPO) */}
                            <div className="aud-donuts-grid">
                                {/* 2. VIÁTICOS POR ESTADO */}
                                <div className="aud-panel-card">
                                    <div className="aud-panel-header">
                                        <div>
                                            <h2 className="aud-panel-title">📋 Viáticos por estado</h2>
                                            <p className="aud-panel-sub">Distribución del total</p>
                                        </div>
                                        <button className="aud-dots-btn">⋮</button>
                                    </div>

                                    <div className="aud-donut-with-legend">
                                        <div className="aud-donut-wrap">
                                            <ResponsiveContainer width="100%" height={170}>
                                                <PieChart>
                                                    <Pie
                                                        data={chartData.porEstado}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={52}
                                                        outerRadius={75}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                    >
                                                        {chartData.porEstado.map((entry) => (
                                                            <Cell
                                                                key={entry.estado}
                                                                fill={COLORES_ESTADO[entry.estado] || '#94A3B8'}
                                                            />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip formatter={(val) => [`${val} viáticos`, 'Cantidad']} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div className="aud-custom-legend">
                                            <div className="aud-legend-item">
                                                <span className="aud-legend-dot aud-legend-dot--emerald" />
                                                <span className="aud-legend-name">Aprobado</span>
                                                <strong className="aud-legend-val">{pctAprobados}%</strong>
                                            </div>
                                            <div className="aud-legend-item">
                                                <span className="aud-legend-dot aud-legend-dot--amber" />
                                                <span className="aud-legend-name">Pendiente</span>
                                                <strong className="aud-legend-val">{pctPendientes}%</strong>
                                            </div>
                                            <div className="aud-legend-item">
                                                <span className="aud-legend-dot aud-legend-dot--crimson" />
                                                <span className="aud-legend-name">Rechazado</span>
                                                <strong className="aud-legend-val">{pctRechazados}%</strong>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3 mini badges resumen inferiores */}
                                    <div className="aud-estado-counters">
                                        <div className="aud-counter-badge aud-counter-badge--green">
                                            <span className="aud-counter-num">{stats.aprobados}</span>
                                            <span className="aud-counter-lbl">Aprobados</span>
                                        </div>
                                        <div className="aud-counter-badge aud-counter-badge--amber">
                                            <span className="aud-counter-num">{stats.pendientes}</span>
                                            <span className="aud-counter-lbl">Pendientes</span>
                                        </div>
                                        <div className="aud-counter-badge aud-counter-badge--red">
                                            <span className="aud-counter-num">{stats.rechazados}</span>
                                            <span className="aud-counter-lbl">Rechazados</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 3. GASTO POR TIPO */}
                                <div className="aud-panel-card">
                                    <div className="aud-panel-header">
                                        <div>
                                            <h2 className="aud-panel-title">🗂️ Gasto por tipo</h2>
                                            <p className="aud-panel-sub">Distribución del monto total</p>
                                        </div>
                                        <button className="aud-dots-btn">⋮</button>
                                    </div>

                                    <div className="aud-donut-with-legend">
                                        <div className="aud-donut-wrap">
                                            <ResponsiveContainer width="100%" height={170}>
                                                <PieChart>
                                                    <Pie
                                                        data={chartData.porTipo}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={52}
                                                        outerRadius={75}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                    >
                                                        {chartData.porTipo.map((entry, i) => (
                                                            <Cell
                                                                key={entry.name}
                                                                fill={COLORES_TIPO[i % COLORES_TIPO.length]}
                                                            />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip content={<TooltipPie />} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div className="aud-custom-legend">
                                            {chartData.porTipo.map((item, idx) => {
                                                const totalGasto = stats.totalGastado || 1;
                                                const pct = Math.round((item.value / totalGasto) * 100);
                                                return (
                                                    <div className="aud-legend-item" key={item.name}>
                                                        <span
                                                            className="aud-legend-box"
                                                            style={{ backgroundColor: COLORES_TIPO[idx % COLORES_TIPO.length] }}
                                                        />
                                                        <span className="aud-legend-name">{item.name}</span>
                                                        <strong className="aud-legend-val">{pct}%</strong>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* 2 mini badges resumen inferiores */}
                                    <div className="aud-tipo-counters">
                                        <div className="aud-counter-box">
                                            <span className="aud-counter-box-val">{formatCOP(stats.totalGastado)}</span>
                                            <span className="aud-counter-box-lbl">Total gastado</span>
                                        </div>
                                        <div className="aud-counter-box">
                                            <span className="aud-counter-box-val">{chartData.porTipo.length}</span>
                                            <span className="aud-counter-box-lbl">Tipo de gasto</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 4. GASTO POR CIUDAD (FULL WIDTH) */}
                            <div className="aud-panel-card">
                                <div className="aud-panel-header">
                                    <div>
                                        <h2 className="aud-panel-title">📍 Gasto por ciudad</h2>
                                        <p className="aud-panel-sub">Top 8 ciudades</p>
                                    </div>
                                    <button className="aud-dots-btn">⋮</button>
                                </div>

                                <div className="aud-chart-container">
                                    <ResponsiveContainer width="100%" height={230}>
                                        <BarChart
                                            data={chartData.porCiudad}
                                            margin={{ top: 15, right: 20, left: 10, bottom: 25 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis
                                                dataKey="ciudad"
                                                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                                                axisLine={{ stroke: '#CBD5E1' }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: '#64748B' }}
                                                axisLine={{ stroke: '#CBD5E1' }}
                                                tickLine={false}
                                                tickFormatter={formatCOPCompact}
                                                width={65}
                                            />
                                            <Tooltip content={<TooltipCOP />} />
                                            <Bar
                                                dataKey="total"
                                                fill="#7C3AED"
                                                radius={[4, 4, 0, 0]}
                                                maxBarSize={480}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* 5. EVOLUCIÓN MENSUAL DEL GASTO (FULL WIDTH AREA CHART) */}
                            <div className="aud-panel-card">
                                <div className="aud-panel-header">
                                    <div>
                                        <h2 className="aud-panel-title">📈 Evolución mensual del gasto</h2>
                                        <p className="aud-panel-sub">Gasto total agrupado por mes</p>
                                    </div>
                                    <div className="aud-panel-controls">
                                        <select
                                            className="aud-mini-select"
                                            value={filtroPeriodoMeses}
                                            onChange={(e) => setFiltroPeriodoMeses(e.target.value)}
                                        >
                                            <option value="anio">Este año ▾</option>
                                            <option value="historico">Histórico ▾</option>
                                        </select>
                                        <button className="aud-dots-btn">⋮</button>
                                    </div>
                                </div>

                                <div className="aud-chart-container">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <AreaChart
                                            data={chartData.porMes}
                                            margin={{ top: 15, right: 20, left: 10, bottom: 15 }}
                                        >
                                            <defs>
                                                <linearGradient id="colorEvolucion" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis
                                                dataKey="mes"
                                                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                                                axisLine={{ stroke: '#CBD5E1' }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: '#64748B' }}
                                                axisLine={{ stroke: '#CBD5E1' }}
                                                tickLine={false}
                                                tickFormatter={formatCOPCompact}
                                                width={65}
                                            />
                                            <Tooltip content={<TooltipCOP />} />
                                            <Area
                                                type="monotone"
                                                dataKey="total"
                                                stroke="#10B981"
                                                strokeWidth={2.5}
                                                fillOpacity={1}
                                                fill="url(#colorEvolucion)"
                                                dot={{ r: 3.5, fill: '#10B981', strokeWidth: 1.5, stroke: '#FFFFFF' }}
                                                activeDot={{ r: 6, fill: '#059669', stroke: '#FFFFFF', strokeWidth: 2 }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── BOTÓN / BANNER ELEGANTE INFERIOR: ACTIVIDAD ADMINISTRATIVA ── */}
                    <section className="aud-activity-banner">
                        <div className="aud-activity-banner-left">
                            <div className="aud-activity-shield">
                                <span>🛡️</span>
                            </div>
                            <div className="aud-activity-text">
                                <h3 className="aud-activity-title">
                                    Registro de auditoría y trazabilidad de acciones del sistema
                                </h3>
                                <p className="aud-activity-sub">
                                    Consulta el historial de acciones realizadas por los administradores y usuarios.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="aud-activity-btn"
                            onClick={() => setModalActividadAbierto(true)}
                        >
                            <span className="aud-activity-btn-icon">🛡️</span>
                            <span>Actividad administrativa</span>
                            <span className="aud-activity-btn-chevron">›</span>
                        </button>
                    </section>
                </main>

                {/* ── FOOTER ── */}
                <footer className="gsb-page-footer">
                    <span>© 2026 GSB - Global Security Bank. Todos los derechos reservados.</span>
                </footer>
            </div>

            {/* ── MODAL ELEGANTE: ACTIVIDAD ADMINISTRATIVA / TRAZABILIDAD ── */}
            {modalActividadAbierto && (
                <div className="sa-modal-overlay" onClick={() => setModalActividadAbierto(false)}>
                    <div
                        className="sa-modal aud-activity-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sa-modal-header aud-activity-modal-header">
                            <div>
                                <h3 className="aud-activity-modal-title">🛡️ Registro de Actividad Administrativa</h3>
                                <span className="aud-activity-modal-sub">
                                    Historial y trazabilidad completa de acciones ejecutadas en el sistema
                                </span>
                            </div>
                            <button className="sa-modal-close" onClick={() => setModalActividadAbierto(false)}>✕</button>
                        </div>

                        <div className="admin-card-toolbar aud-modal-toolbar">
                            <div className="auditoria-filtros-wrap">
                                <select
                                    className="admin-select"
                                    value={accionFiltro}
                                    onChange={(e) => setAccionFiltro(e.target.value)}
                                >
                                    <option value="">Todas las acciones ▾</option>
                                    {Object.entries(LABEL_ACCION).map(([valor, label]) => (
                                        <option key={valor} value={valor}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <span className="admin-user-count">Mostrando: {logs.length} evento(s)</span>
                        </div>

                        {errorLogs && (
                            <div className="admin-error-banner">{errorLogs}</div>
                        )}

                        <div className="aud-activity-modal-body">
                            {loadingLogs ? (
                                <div className="admin-loading-state">
                                    <p>Cargando registros de actividad…</p>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="admin-loading-state">
                                    <p>No hay actividad registrada para el filtro seleccionado.</p>
                                </div>
                            ) : (
                                <div className="auditoria-timeline-wrap">
                                    <div className="auditoria-timeline">
                                        {logs.map((log) => (
                                            <div key={log.id} className="auditoria-item">
                                                <div className="auditoria-item-icono">
                                                    <span>{ICONO_ACCION[log.accion] || '📌'}</span>
                                                </div>
                                                <div className="auditoria-item-body">
                                                    <div className="auditoria-item-top">
                                                        <span className="auditoria-item-accion">
                                                            {LABEL_ACCION[log.accion] || log.accion}
                                                        </span>
                                                        <span className={`auditoria-item-resultado auditoria-item-resultado--${log.resultado}`}>
                                                            {log.resultado === 'exitoso' ? '✓ Exitoso' : '✕ Fallido'}
                                                        </span>
                                                        <span className="auditoria-item-fecha">
                                                            🕐 {formatFechaHora(log.created_at)}
                                                        </span>
                                                    </div>
                                                    <p className="auditoria-item-linea">
                                                        <strong>{log.actor_nombre}</strong>
                                                        <span className="auditoria-item-rol-badge">
                                                            {LABEL_ROL[log.actor_rol] || log.actor_rol}
                                                        </span>
                                                        {log.usuario_objetivo_nombre ? (
                                                            <>
                                                                {' realizó esta acción sobre '}
                                                                <strong>{log.usuario_objetivo_nombre}</strong>
                                                            </>
                                                        ) : (
                                                            <>{' realizó esta acción'}</>
                                                        )}
                                                    </p>
                                                    {log.detalle && (
                                                        <p className="auditoria-item-detalle">{log.detalle}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
