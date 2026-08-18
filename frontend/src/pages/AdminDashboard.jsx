import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { listarAuditoria } from '../services/auditoria';
import { listarAsignaciones } from '../services/asignaciones';
import { obtenerAsignacionActivaDeTecnico, LABEL_TIPO_ASIGNACION } from '../utils/asignaciones';
import logoGSB from '../assets/logo-gsb.png';
import NotificationBell from '../components/NotificationBell';
import InstallPwaPrompt from '../components/InstallPwaPrompt';
import ModalEvidencia from '../components/ModalEvidencia';
import ModalAsignacionesTecnico from '../components/ModalAsignacionesTecnico';
import ModalCuentasCobroTecnico from '../components/ModalCuentasCobroTecnico';
import ModalCrearUsuario from '../components/ModalCrearUsuario';
import './AdminDashboard.css';

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

function formatFechaLargaISO(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatFechaHoraISO(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-CO', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function labelRol(rol) {
    if (rol === 'superadmin') return 'Super Administrador';
    if (rol === 'admin') return 'Administrador';
    return 'Técnico';
}

function esHoy(fechaStr) {
    const hoy = new Date();
    const f = new Date(fechaStr + 'T00:00:00');
    return (
        f.getFullYear() === hoy.getFullYear() &&
        f.getMonth() === hoy.getMonth() &&
        f.getDate() === hoy.getDate()
    );
}

function esEstaSemana(fechaStr) {
    const hoy = new Date();
    const f = new Date(fechaStr + 'T00:00:00');
    const diaSemana = (hoy.getDay() + 6) % 7; // lunes = 0
    const inicioSemana = new Date(hoy);
    inicioSemana.setHours(0, 0, 0, 0);
    inicioSemana.setDate(hoy.getDate() - diaSemana);
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 7);
    return f >= inicioSemana && f < finSemana;
}

function esEsteMes(fechaStr) {
    const hoy = new Date();
    const f = new Date(fechaStr + 'T00:00:00');
    return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
}

const FILTROS_PERIODO = [
    { id: 'hoy', label: 'Hoy', fn: esHoy },
    { id: 'semana', label: 'Esta semana', fn: esEstaSemana },
    { id: 'mes', label: 'Este mes', fn: esEsteMes },
];

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [perfilData, setPerfilData] = useState(null);
    const [usuarios, setUsuarios] = useState([]);
    const [viaticos, setViaticos] = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [tecnicoParaAsignaciones, setTecnicoParaAsignaciones] = useState(null);
    const [tecnicoParaCuentasCobro, setTecnicoParaCuentasCobro] = useState(null);
    const [mostrarCrearUsuario, setMostrarCrearUsuario] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [periodo, setPeriodo] = useState('mes');
    const [ultimaAccion, setUltimaAccion] = useState(null);
    const [cargandoAccion, setCargandoAccion] = useState(true);
    const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
    const [sidebarAbierto, setSidebarAbierto] = useState(false);
    const [itemMenuActivo, setItemMenuActivo] = useState('inicio');

    // Modal de consolidado y evidencia
    const [registroConsolidado, setRegistroConsolidado] = useState(null);
    const [evidenciaPreview, setEvidenciaPreview] = useState(null);
    const [busquedaConsolidado, setBusquedaConsolidado] = useState('');
    const [filtroEstadoConsolidado, setFiltroEstadoConsolidado] = useState('todos');

    // Referencias para scroll suave desde el sidebar
    const seccionViaticosRef = useRef(null);
    const seccionTecnicosRef = useRef(null);

    async function cargar() {
        try {
            const [resMe, resUsuarios, resViaticos, resAsig] = await Promise.all([
                api.get('/auth/me').catch(() => null),
                api.get('/admin/usuarios'),
                api.get('/admin/viaticos'),
                listarAsignaciones().catch(() => ({ data: [] })),
            ]);
            setPerfilData(resMe?.data ?? null);
            setUsuarios(resUsuarios.data);
            setViaticos(resViaticos.data);
            setAsignaciones(resAsig.data || []);
        } catch {
            setError('No se pudieron cargar los datos del panel.');
        } finally {
            setLoading(false);
        }
    }

    async function cargarUltimaAccion(actorId) {
        setCargandoAccion(true);
        try {
            const { data } = await listarAuditoria({ actorId, limit: 1 });
            setUltimaAccion(data?.[0] ?? null);
        } catch {
            setUltimaAccion(null);
        } finally {
            setCargandoAccion(false);
        }
    }

    useEffect(() => {
        cargar();
    }, []);

    useEffect(() => {
        if (user?.id) cargarUltimaAccion(user.id);
    }, [user?.id]);

    const stats = useMemo(() => {
        const totalGastado = viaticos.reduce((acc, v) => acc + Number(v.valor), 0);
        return {
            totalGastado,
            pendientes: viaticos.filter((v) => v.estado === 'pendiente').length,
            aprobados: viaticos.filter((v) => v.estado === 'aprobado').length,
            rechazados: viaticos.filter((v) => v.estado === 'rechazado').length,
        };
    }, [viaticos]);

    const tecnicos = useMemo(() => {
        return usuarios
            .filter((u) => {
                const esUsuarioActual =
                    (user?.id && String(u.id) === String(user.id)) ||
                    (user?.correo && u.correo?.toLowerCase() === user.correo.toLowerCase());
                if (esUsuarioActual) return false;
                if (user?.rol === 'superadmin' && u.rol === 'superadmin') return false;
                return true;
            })
            .map((u) => {
                const viaticosUsuario = viaticos.filter((v) => v.usuario_id === u.id);
                const totalGastado = viaticosUsuario.reduce((acc, v) => acc + Number(v.valor), 0);
                return {
                    ...u,
                    cantidadViaticos: viaticosUsuario.length,
                    totalGastado,
                };
            });
    }, [usuarios, viaticos, user]);

    // Consolidado de registros por Técnico + Fecha
    const viaticosConsolidados = useMemo(() => {
        const grupos = new Map();
        viaticos.forEach((v) => {
            const key = `${v.usuario_id}_${v.fecha}`;
            const u = usuarios.find((usr) => usr.id === v.usuario_id);
            const actual = grupos.get(key) || {
                key,
                usuario_id: v.usuario_id,
                tecnico_nombre: v.nombre || u?.nombre || `Usuario #${v.usuario_id}`,
                fecha: v.fecha,
                ciudad: v.ciudad || 'N/A',
                items: [],
                total: 0,
                estado: v.estado,
            };

            let meta;
            try {
                meta = JSON.parse(v.descripcion);
            } catch {
                meta = { razon_social: v.cliente, nit: '—', origen: '—', destino: v.ciudad, tiene_soporte: Boolean(v.evidencias?.length) };
            }

            actual.items.push({
                ...v,
                meta,
                _asignacion_label: v.asignacion_id
                    ? (v.asignacion_resumen?.cliente || `Asig. #${v.asignacion_id}`)
                    : 'Independiente',
            });
            actual.total += Number(v.valor);

            if (v.estado === 'pendiente') actual.estado = 'pendiente';
            grupos.set(key, actual);
        });

        let list = [...grupos.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));

        if (filtroEstadoConsolidado !== 'todos') {
            list = list.filter((r) => r.estado === filtroEstadoConsolidado);
        }

        if (!busquedaConsolidado.trim()) return list;
        const query = busquedaConsolidado.toLowerCase();
        return list.filter((r) =>
            r.tecnico_nombre.toLowerCase().includes(query) ||
            r.ciudad.toLowerCase().includes(query) ||
            r.fecha.includes(query)
        );
    }, [viaticos, usuarios, busquedaConsolidado, filtroEstadoConsolidado]);

    const filtroActivo = FILTROS_PERIODO.find((f) => f.id === periodo) ?? FILTROS_PERIODO[2];

    const resumenPeriodo = useMemo(() => {
        const viaticosPeriodo = viaticos.filter((v) => filtroActivo.fn(v.fecha));
        const porUsuario = new Map();

        viaticosPeriodo.forEach((v) => {
            const actual = porUsuario.get(v.usuario_id) || {
                nombre: v.nombre || `Usuario #${v.usuario_id}`,
                total: 0,
            };
            actual.total += Number(v.valor);
            porUsuario.set(v.usuario_id, actual);
        });

        const filas = [...porUsuario.values()].sort((a, b) => b.total - a.total);
        const total = filas.reduce((acc, f) => acc + f.total, 0);
        return { filas, total };
    }, [viaticos, filtroActivo]);

    const perfil = perfilData ?? {
        nombre: user?.nombre ?? '',
        correo: user?.correo ?? '',
        rol: user?.rol ?? '',
        codigo_empleado: null,
        activo: true,
    };
    const nombreMostrado = perfil.nombre || perfil.correo || 'Admin GSB';

    const [mensajeFeedback, setMensajeFeedback] = useState('');

    const NAV_ITEMS = [
        { id: 'inicio', label: 'Inicio', icon: '🏠', action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
        { id: 'viaticos', label: 'Viáticos', icon: '💼', action: () => seccionViaticosRef.current?.scrollIntoView({ behavior: 'smooth' }) },
        { id: 'tecnicos', label: 'Técnicos', icon: '👥', action: () => seccionTecnicosRef.current?.scrollIntoView({ behavior: 'smooth' }) },
        { id: 'usuarios', label: 'Usuarios', icon: '👤', action: () => navigate(user?.rol === 'superadmin' ? '/admin/usuarios' : `/admin/personal/${user?.id}`) },
        { id: 'auditoria', label: 'Auditoría', icon: '📊', action: () => navigate('/admin/auditoria') },
        { id: 'configuracion', label: 'Configuración', icon: '⚙️', action: () => user?.id && navigate(`/admin/personal/${user.id}`) },
    ];

    return (
        <div className="gsb-app-layout">
            {/* ── SIDEBAR CORPORATIVO ── */}
            <aside className={`gsb-sidebar ${sidebarAbierto ? 'gsb-sidebar--open' : ''}`}>
                <div className="gsb-sidebar-header">
                    <div className="gsb-sidebar-logo-wrap">
                        <img src={logoGSB} alt="Global Security Bank" className="gsb-sidebar-logo" />
                    </div>
                    <span className="gsb-sidebar-brand-name">GS-VIÁTICOS</span>
                </div>

                <nav className="gsb-sidebar-nav">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            className={`gsb-nav-item ${itemMenuActivo === item.id ? 'gsb-nav-item--active' : ''}`}
                            onClick={() => {
                                setItemMenuActivo(item.id);
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

            {/* Backdrop para sidebar en móviles */}
            {sidebarAbierto && (
                <div className="gsb-sidebar-backdrop" onClick={() => setSidebarAbierto(false)} />
            )}

            {/* ── CONTENIDO PRINCIPAL ── */}
            <div className="gsb-main-wrapper">
                {/* ── TOPBAR / HEADER ── */}
                <header className="gsb-topbar">
                    <div className="gsb-topbar-left">
                        <button
                            className="gsb-menu-toggle"
                            onClick={() => setSidebarAbierto(!sidebarAbierto)}
                            aria-label="Abrir menú"
                        >
                            ☰
                        </button>
                        <div>
                            <h1 className="gsb-topbar-title">PANEL ADMINISTRATIVO</h1>
                            <span className="gsb-topbar-subtitle">GS-VIÁTICOS</span>
                        </div>
                    </div>

                    <div className="gsb-topbar-right">
                        <InstallPwaPrompt />
                        <NotificationBell />

                        <div className="gsb-user-menu-wrap">
                            <button
                                className="gsb-user-pill"
                                onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
                            >
                                <span className="gsb-user-avatar">
                                    {iniciales(nombreMostrado) || user?.correo?.[0]?.toUpperCase() || 'A'}
                                </span>
                                <div className="gsb-user-meta">
                                    <span className="gsb-user-email">
                                        {user?.correo || 'admin@gsbank.com'}
                                    </span>
                                    <span className="gsb-user-role">{labelRol(perfil.rol || user?.rol)}</span>
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
                                        onClick={() => user?.id && navigate(`/admin/personal/${user.id}`)}
                                    >
                                        👤 Ver mi perfil
                                    </button>
                                    {user?.rol === 'superadmin' && (
                                        <button
                                            className="gsb-dropdown-item"
                                            onClick={() => navigate('/admin/usuarios')}
                                        >
                                            👥 Gestión de usuarios
                                        </button>
                                    )}
                                    <button
                                        className="gsb-dropdown-item"
                                        onClick={() => navigate('/admin/auditoria')}
                                    >
                                        📊 Registro de auditoría
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

                <main className="gsb-content-body">
                    {mensajeFeedback && (
                        <div className="gsb-alert-banner gsb-alert-banner--success">
                            <span>{mensajeFeedback}</span>
                            <button onClick={() => setMensajeFeedback('')}>×</button>
                        </div>
                    )}

                    {error && <div className="gsb-alert-banner gsb-alert-banner--error">{error}</div>}

                    {/* ── FILA SUPERIOR: Perfil Admin + 4 KPIs ── */}
                    <section className="gsb-top-section">
                        {/* Tarjeta de Perfil Administrador (Navy Card) */}
                        <div className="gsb-profile-card">
                            <div className="gsb-profile-watermark">
                                <svg viewBox="0 0 100 100" fill="none">
                                    <path d="M50 10 L85 25 V50 C85 75 50 92 50 92 C50 92 15 75 15 50 V25 Z" stroke="rgba(255,255,255,0.04)" strokeWidth="4" fill="rgba(255,255,255,0.015)" />
                                </svg>
                            </div>

                            <div className="gsb-profile-header">
                                <div className="gsb-profile-avatar">
                                    {iniciales(nombreMostrado) || 'AG'}
                                </div>
                                <div className="gsb-profile-welcome">
                                    <span className="gsb-profile-welcome-sub">Bienvenido,</span>
                                    <h2 className="gsb-profile-name">
                                        {nombreMostrado}
                                    </h2>
                                    <div className="gsb-profile-badges">
                                        <span className="gsb-badge-gold">{labelRol(perfil.rol || user?.rol)}</span>
                                        <span className="gsb-badge-active">{perfil.activo ? 'ACTIVO' : 'INACTIVO'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="gsb-profile-meta-list">
                                <div className="gsb-profile-meta-item">
                                    <span className="gsb-meta-icon">✉</span>
                                    <span>{perfil.correo}</span>
                                </div>
                                <div className="gsb-profile-meta-item">
                                    <span className="gsb-meta-icon">🪪</span>
                                    <span>{perfil.codigo_empleado || '100001'}</span>
                                </div>
                                <div className="gsb-profile-meta-item">
                                    <span className="gsb-meta-icon">📅</span>
                                    <span>Miembro desde {formatFechaLargaISO(perfil.created_at || '2026-08-04')}</span>
                                </div>
                            </div>

                            <div className="gsb-profile-last-action">
                                <span className="gsb-last-action-label">Última acción registrada</span>
                                <div className="gsb-last-action-content">
                                    <strong className="gsb-last-action-name">
                                        {cargandoAccion ? 'Cargando...' : ultimaAccion ? ultimaAccion.accion?.replace(/_/g, ' ') : 'Crear Usuario'}
                                    </strong>
                                    <span className="gsb-last-action-date">
                                        {ultimaAccion ? formatFechaHoraISO(ultimaAccion.created_at) : '15 de ago de 2026, 01:19 p. m.'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 4 KPIs con Gráficas de Ondas Corporativas */}
                        <div className="gsb-kpis-grid">
                            {/* KPI 1: TOTAL GASTADO */}
                            <div
                                className={`gsb-kpi-card ${filtroEstadoConsolidado === 'todos' ? 'gsb-kpi-card--selected' : ''}`}
                                onClick={() => setFiltroEstadoConsolidado('todos')}
                            >
                                <div className="gsb-kpi-card-top">
                                    <div className="gsb-kpi-icon-wrap gsb-kpi-icon--blue">
                                        <span>💼</span>
                                    </div>
                                    <span className="gsb-kpi-arrow-indicator gsb-kpi-arrow--blue">↗</span>
                                </div>
                                <span className="gsb-kpi-label">TOTAL GASTADO</span>
                                <h3 className="gsb-kpi-value">{formatCOP(stats.totalGastado)}</h3>
                                <span className="gsb-kpi-sub">Este mes</span>

                                {/* Onda azul */}
                                <div className="gsb-kpi-wave-wrap">
                                    <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="gsb-kpi-wave">
                                        <defs>
                                            <linearGradient id="blueWave" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#1D63C8" stopOpacity="0.25" />
                                                <stop offset="100%" stopColor="#1D63C8" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M0 24 Q 30 5, 60 18 T 120 12 L 120 28 L 0 28 Z" fill="url(#blueWave)" />
                                        <path d="M0 24 Q 30 5, 60 18 T 120 12" fill="none" stroke="#1D63C8" strokeWidth="2.2" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>

                            {/* KPI 2: PENDIENTES */}
                            <div
                                className={`gsb-kpi-card ${filtroEstadoConsolidado === 'pendiente' ? 'gsb-kpi-card--selected' : ''}`}
                                onClick={() => setFiltroEstadoConsolidado((prev) => prev === 'pendiente' ? 'todos' : 'pendiente')}
                            >
                                <div className="gsb-kpi-card-top">
                                    <div className="gsb-kpi-icon-wrap gsb-kpi-icon--amber">
                                        <span>⏳</span>
                                    </div>
                                </div>
                                <span className="gsb-kpi-label">PENDIENTES</span>
                                <h3 className="gsb-kpi-value">{stats.pendientes}</h3>
                                <span className="gsb-kpi-sub">Por aprobar</span>

                                {/* Onda ámbar */}
                                <div className="gsb-kpi-wave-wrap">
                                    <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="gsb-kpi-wave">
                                        <defs>
                                            <linearGradient id="amberWave" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#D97706" stopOpacity="0.25" />
                                                <stop offset="100%" stopColor="#D97706" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M0 22 Q 35 25, 65 14 T 120 16 L 120 28 L 0 28 Z" fill="url(#amberWave)" />
                                        <path d="M0 22 Q 35 25, 65 14 T 120 16" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>

                            {/* KPI 3: APROBADOS */}
                            <div
                                className={`gsb-kpi-card ${filtroEstadoConsolidado === 'aprobado' ? 'gsb-kpi-card--selected' : ''}`}
                                onClick={() => setFiltroEstadoConsolidado((prev) => prev === 'aprobado' ? 'todos' : 'aprobado')}
                            >
                                <div className="gsb-kpi-card-top">
                                    <div className="gsb-kpi-icon-wrap gsb-kpi-icon--emerald">
                                        <span>✓</span>
                                    </div>
                                </div>
                                <span className="gsb-kpi-label">APROBADOS</span>
                                <h3 className="gsb-kpi-value">{stats.aprobados}</h3>
                                <span className="gsb-kpi-sub">Este mes</span>

                                {/* Onda verde */}
                                <div className="gsb-kpi-wave-wrap">
                                    <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="gsb-kpi-wave">
                                        <defs>
                                            <linearGradient id="emeraldWave" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                                                <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M0 26 Q 30 8, 60 22 T 120 10 L 120 28 L 0 28 Z" fill="url(#emeraldWave)" />
                                        <path d="M0 26 Q 30 8, 60 22 T 120 10" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>

                            {/* KPI 4: RECHAZADOS */}
                            <div
                                className={`gsb-kpi-card ${filtroEstadoConsolidado === 'rechazado' ? 'gsb-kpi-card--selected' : ''}`}
                                onClick={() => setFiltroEstadoConsolidado((prev) => prev === 'rechazado' ? 'todos' : 'rechazado')}
                            >
                                <div className="gsb-kpi-card-top">
                                    <div className="gsb-kpi-icon-wrap gsb-kpi-icon--crimson">
                                        <span>✕</span>
                                    </div>
                                </div>
                                <span className="gsb-kpi-label">RECHAZADOS</span>
                                <h3 className="gsb-kpi-value">{stats.rechazados}</h3>
                                <span className="gsb-kpi-sub">Este mes</span>

                                {/* Onda roja */}
                                <div className="gsb-kpi-wave-wrap">
                                    <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="gsb-kpi-wave">
                                        <defs>
                                            <linearGradient id="crimsonWave" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#DC2626" stopOpacity="0.25" />
                                                <stop offset="100%" stopColor="#DC2626" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M0 16 Q 40 26, 75 12 T 120 20 L 120 28 L 0 28 Z" fill="url(#crimsonWave)" />
                                        <path d="M0 16 Q 40 26, 75 12 T 120 20" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ── SECCIÓN CENTRAL: Viáticos Registrados (Vista Consolidada) ── */}
                    <section className="gsb-table-card" ref={seccionViaticosRef}>
                        <div className="gsb-table-card-header">
                            <div>
                                <h2 className="gsb-table-title">Viáticos Registrados (Vista Consolidada)</h2>
                                <p className="gsb-table-subtitle">
                                    Consulta y gestiona las solicitudes de viáticos enviadas por los técnicos
                                </p>
                            </div>

                            <div className="gsb-table-controls">
                                <select
                                    className="gsb-select"
                                    value={filtroEstadoConsolidado}
                                    onChange={(e) => setFiltroEstadoConsolidado(e.target.value)}
                                >
                                    <option value="todos">Todos los estados ▾</option>
                                    <option value="pendiente">Pendientes</option>
                                    <option value="aprobado">Aprobados</option>
                                    <option value="rechazado">Rechazados</option>
                                </select>

                                <div className="gsb-search-box">
                                    <span className="gsb-search-icon">🔍</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar por técnico, ciudad..."
                                        className="gsb-search-input"
                                        value={busquedaConsolidado}
                                        onChange={(e) => setBusquedaConsolidado(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="gsb-table-responsive">
                            <table className="gsb-corporate-table">
                                <thead>
                                    <tr>
                                        <th>FECHA REGISTRO</th>
                                        <th>TÉCNICO</th>
                                        <th>CIUDAD</th>
                                        <th>ÍTEMS</th>
                                        <th>TOTAL GASTOS</th>
                                        <th>ESTADO</th>
                                        <th style={{ textAlign: 'center' }}>ACCIONES</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viaticosConsolidados.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="gsb-table-empty">
                                                No hay registros de viáticos para mostrar con los filtros aplicados.
                                            </td>
                                        </tr>
                                    ) : (
                                        viaticosConsolidados.map((r) => (
                                            <tr key={r.key} className="gsb-table-row" onClick={() => setRegistroConsolidado(r)}>
                                                <td className="gsb-td-fecha">{r.fecha}</td>
                                                <td className="gsb-td-tecnico">
                                                    <strong>{r.tecnico_nombre}</strong>
                                                </td>
                                                <td className="gsb-td-ciudad">{r.ciudad}</td>
                                                <td>
                                                    <span className="gsb-pill-items">
                                                        {r.items.length === 1 ? '1 ítem' : `${r.items.length} ítems`}
                                                    </span>
                                                </td>
                                                <td className="gsb-td-total">
                                                    <strong>{formatCOP(r.total)}</strong>
                                                </td>
                                                <td>
                                                    <span className={`gsb-status-pill gsb-status-pill--${r.estado}`}>
                                                        {r.estado === 'aprobado' ? 'APROBADO' : r.estado === 'rechazado' ? 'RECHAZADO' : 'PENDIENTE'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div className="gsb-table-actions">
                                                        <button
                                                            type="button"
                                                            className="gsb-btn-detail"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRegistroConsolidado(r);
                                                            }}
                                                        >
                                                            👁️ Ver detalle
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="gsb-btn-dots"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRegistroConsolidado(r);
                                                            }}
                                                            title="Opciones"
                                                        >
                                                            ⋮
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer con paginación */}
                        <div className="gsb-table-footer">
                            <span className="gsb-table-counter">
                                Mostrando {viaticosConsolidados.length} {viaticosConsolidados.length === 1 ? 'registro' : 'registros'}
                            </span>
                            <div className="gsb-pagination">
                                <button className="gsb-page-btn" disabled>‹</button>
                                <button className="gsb-page-btn gsb-page-btn--active">1</button>
                                <button className="gsb-page-btn" disabled>›</button>
                            </div>
                        </div>
                    </section>

                    {/* ── FILA INFERIOR: Técnicos + Resumen de Gastos ── */}
                    <div className="gsb-bottom-grid">
                        {/* Columna izquierda: Técnicos (65%) */}
                        <section className="gsb-techs-section" ref={seccionTecnicosRef}>
                            <div className="gsb-section-header">
                                <h2 className="gsb-section-title">Técnicos</h2>
                                <p className="gsb-section-subtitle">Gestión y actividad de técnicos</p>
                            </div>

                            <div className="gsb-techs-grid">
                                {tecnicos.map((t) => {
                                    const asigActiva = obtenerAsignacionActivaDeTecnico(asignaciones, t.id);
                                    return (
                                        <div key={t.id} className="gsb-tech-card">
                                            <div className="gsb-tech-card-header">
                                                <div className="gsb-tech-avatar">
                                                    {iniciales(t.nombre) || 'T'}
                                                </div>
                                                <div className="gsb-tech-identity">
                                                    <h3 className="gsb-tech-name">{t.nombre}</h3>
                                                    <span className="gsb-tech-cedula">
                                                        Cédula: {t.codigo_empleado || 'Sin asignar'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Caja de Asignación Activa */}
                                            <div className="gsb-tech-asig-box">
                                                {asigActiva ? (
                                                    <>
                                                        <div className="gsb-tech-asig-header">
                                                            <span className="gsb-tech-asig-dot" />
                                                            <span className="gsb-tech-asig-type">
                                                                {LABEL_TIPO_ASIGNACION[asigActiva.tipo] || asigActiva.tipo?.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <strong className="gsb-tech-asig-client" title={asigActiva.cliente}>
                                                            {asigActiva.cliente}
                                                        </strong>
                                                        <span className="gsb-tech-asig-location">
                                                            📍 {asigActiva.empresa ? `${asigActiva.empresa} · ` : ''}{asigActiva.ciudad}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <div className="gsb-tech-asig-none">
                                                        <span>⚪ Sin asignación activa</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Métricas de Viáticos y Gasto */}
                                            <div className="gsb-tech-metrics-row">
                                                <div className="gsb-tech-metric">
                                                    <span className="gsb-tech-metric-val">{t.cantidadViaticos}</span>
                                                    <span className="gsb-tech-metric-lbl">VIÁTICOS</span>
                                                </div>
                                                <div className="gsb-tech-metric">
                                                    <span className="gsb-tech-metric-val">{formatCOP(t.totalGastado)}</span>
                                                    <span className="gsb-tech-metric-lbl">GASTADO</span>
                                                </div>
                                            </div>

                                            {/* Botones de Asignaciones y Cuenta de Cobro */}
                                            <div className="gsb-tech-action-row">
                                                <button
                                                    type="button"
                                                    className="gsb-tech-btn-asig"
                                                    onClick={() => setTecnicoParaAsignaciones(t)}
                                                    title={`Ver asignaciones de ${t.nombre}`}
                                                >
                                                    📋 Asignaciones
                                                </button>
                                                <button
                                                    type="button"
                                                    className="gsb-tech-btn-cc"
                                                    onClick={() => setTecnicoParaCuentasCobro(t)}
                                                    title={`Ver cuentas de cobro de ${t.nombre}`}
                                                >
                                                    💵 Cuenta de Cobro
                                                </button>
                                            </div>

                                            <button
                                                type="button"
                                                className="gsb-tech-btn-profile"
                                                onClick={() => navigate(`/admin/personal/${t.id}`)}
                                            >
                                                Ver información →
                                            </button>
                                        </div>
                                    );
                                })}

                                {/* Tarjeta Agregar Técnico */}
                                <div className="gsb-add-tech-card" onClick={() => setMostrarCrearUsuario(true)}>
                                    <div className="gsb-add-tech-icon-wrap">
                                        <svg viewBox="0 0 24 24" fill="none" className="gsb-add-tech-icon">
                                            <circle cx="10" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                                            <path d="M2 20C2 16 6 14 10 14C14 14 18 16 18 20" stroke="currentColor" strokeWidth="1.8" />
                                            <path d="M19 8V14M16 11H22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                    <span className="gsb-add-tech-title">Agregar Técnico</span>
                                    <button
                                        type="button"
                                        className="gsb-add-tech-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMostrarCrearUsuario(true);
                                        }}
                                    >
                                        Nuevo Técnico
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Columna derecha: Resumen de Gastos (35%) */}
                        <section className="gsb-summary-section">
                            <div className="gsb-summary-card">
                                <div className="gsb-summary-watermark">
                                    <svg viewBox="0 0 100 100" fill="none">
                                        <path d="M50 10 L85 25 V50 C85 75 50 92 50 92 C50 92 15 75 15 50 V25 Z" stroke="rgba(255,255,255,0.04)" strokeWidth="4" fill="rgba(255,255,255,0.015)" />
                                    </svg>
                                </div>

                                <div className="gsb-summary-header">
                                    <h2 className="gsb-summary-title">📈 Resumen de Gastos</h2>

                                    <div className="gsb-summary-tabs">
                                        {FILTROS_PERIODO.map((f) => (
                                            <button
                                                key={f.id}
                                                className={`gsb-summary-tab ${periodo === f.id ? 'gsb-summary-tab--active' : ''}`}
                                                onClick={() => setPeriodo(f.id)}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="gsb-summary-total-hero">
                                    <span className="gsb-summary-hero-lbl">Total Gastado</span>
                                    <h3 className="gsb-summary-hero-val">{formatCOP(resumenPeriodo.total)}</h3>
                                </div>

                                <div className="gsb-summary-list">
                                    {resumenPeriodo.filas.length === 0 ? (
                                        <p className="gsb-summary-empty">Sin gastos registrados en este periodo.</p>
                                    ) : (
                                        resumenPeriodo.filas.map((f, i) => (
                                            <div className="gsb-summary-row" key={i}>
                                                <span className="gsb-summary-tech-name">{f.nombre}</span>
                                                <span className="gsb-summary-tech-val">{formatCOP(f.total)}</span>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="gsb-summary-total-footer">
                                    <span>Total</span>
                                    <strong>{formatCOP(resumenPeriodo.total)}</strong>
                                </div>
                            </div>
                        </section>
                    </div>
                </main>

                {/* ── FOOTER CORPORATIVO ── */}
                <footer className="gsb-page-footer">
                    <span>© 2026 GSB - Global Security Bank. Todos los derechos reservados.</span>
                </footer>
            </div>

            {/* ── MODAL DETALLE CONSOLIDADO (ADMIN) ── */}
            {registroConsolidado && (
                <div className="sa-modal-overlay" onClick={() => setRegistroConsolidado(null)}>
                    <div
                        className="sa-modal"
                        style={{ maxWidth: '780px', width: '90%', maxHeight: '88vh', overflowY: 'auto', padding: '1.75rem', boxSizing: 'border-box' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sa-modal-header">
                            <div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Detalle del viático</h3>
                                <span className={`estado-badge estado-badge--${registroConsolidado.estado === 'pendiente' ? 'inactivo' : registroConsolidado.estado}`}>
                                    {registroConsolidado.estado === 'pendiente' ? 'EN REVISIÓN' : registroConsolidado.estado.toUpperCase()}
                                </span>
                            </div>
                            <button className="sa-modal-close" onClick={() => setRegistroConsolidado(null)}>✕</button>
                        </div>

                        <div className="detalle-asig-grid" style={{ marginBottom: '1.25rem' }}>
                            <div>
                                <span className="detalle-label">Técnico</span>
                                <span className="detalle-valor">{registroConsolidado.tecnico_nombre}</span>
                            </div>
                            <div>
                                <span className="detalle-label">Fecha del registro</span>
                                <span className="detalle-valor">{registroConsolidado.fecha}</span>
                            </div>
                            <div>
                                <span className="detalle-label">Ciudad</span>
                                <span className="detalle-valor">{registroConsolidado.ciudad}</span>
                            </div>
                            <div>
                                <span className="detalle-label">Ítems registrados</span>
                                <span className="detalle-valor">{registroConsolidado.items.length}</span>
                            </div>
                        </div>

                        {/* Listado de ítems dentro del consolidado */}
                        <div className="admin-table-wrap" style={{ marginTop: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                            <table className="admin-table" style={{ fontSize: '0.82rem' }}>
                                <thead>
                                    <tr>
                                        <th>Concepto</th>
                                        <th>Asignación / Origen</th>
                                        <th>Valor</th>
                                        <th>Soporte</th>
                                        <th style={{ textAlign: 'center' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registroConsolidado.items.map((item) => {
                                        const evidencia = item.evidencias?.[0];
                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <strong>{item.tipo_gasto?.toUpperCase()}</strong>
                                                    {item.ot && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>OT: {item.ot}</span>}
                                                </td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        background: item.asignacion_id ? '#EFF6FF' : '#F1F5F9',
                                                        color: item.asignacion_id ? '#1D63C8' : '#64748B',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {item._asignacion_label}
                                                    </span>
                                                </td>
                                                <td><strong>{formatCOP(item.valor)}</strong></td>
                                                <td>
                                                    {evidencia ? (
                                                        <img
                                                            src={evidencia.secure_url}
                                                            alt="Soporte"
                                                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--color-border)' }}
                                                            onClick={() => setEvidenciaPreview(item)}
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin soporte</span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {evidencia && (
                                                        <button className="admin-mini-btn" onClick={() => setEvidenciaPreview(item)}>
                                                            👁️ Ver soporte
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de previsualización de foto/evidencia */}
            {evidenciaPreview && (
                <ModalEvidencia
                    viatico={evidenciaPreview}
                    onClose={() => setEvidenciaPreview(null)}
                    onAprobar={(id, cText) => {
                        setEvidenciaPreview(null);
                        setMensajeFeedback(`✅ Viático aprobado correctamente${cText ? ` — Comentario: "${cText}"` : ''}`);
                        cargar();
                    }}
                    onRechazar={(id, cText) => {
                        setEvidenciaPreview(null);
                        setMensajeFeedback(`❌ Viático rechazado correctamente${cText ? ` — Motivo enviado: "${cText}"` : ''}`);
                        cargar();
                    }}
                    onPresupuestoActualizado={(v) => {
                        setViaticos((prev) => prev.map((x) => (x.id === v.id ? v : x)));
                        setEvidenciaPreview(v);
                    }}
                />
            )}

            {/* Modal de Asignaciones Individuales de Técnico */}
            {tecnicoParaAsignaciones && (
                <ModalAsignacionesTecnico
                    tecnico={tecnicoParaAsignaciones}
                    onClose={() => setTecnicoParaAsignaciones(null)}
                    onAsignacionActualizada={cargar}
                />
            )}

            {/* Modal de Cuentas de Cobro Individuales de Técnico */}
            {tecnicoParaCuentasCobro && (
                <ModalCuentasCobroTecnico
                    tecnico={tecnicoParaCuentasCobro}
                    onClose={() => setTecnicoParaCuentasCobro(null)}
                />
            )}

            {/* Modal Crear Usuario / Técnico */}
            {mostrarCrearUsuario && (
                <ModalCrearUsuario
                    onClose={() => setMostrarCrearUsuario(false)}
                    onCreado={(nuevo) => {
                        setMostrarCrearUsuario(false);
                        setMensajeFeedback(`✅ Usuario "${nuevo.nombre}" creado exitosamente.`);
                        cargar();
                    }}
                />
            )}
        </div>
    );
}
