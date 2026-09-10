import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { listarAuditoria } from '../services/auditoria';
import { LABEL_TIPO_ASIGNACION } from '../utils/asignaciones';
import logoGSB from '../assets/logo-gsb.png';
import NotificationBell from '../components/NotificationBell';
import InstallPwaPrompt from '../components/InstallPwaPrompt';
import ModalAsignacionesTecnico from '../components/ModalAsignacionesTecnico';
import ModalCuentasCobroTecnico from '../components/ModalCuentasCobroTecnico';
import ModalCrearUsuario from '../components/ModalCrearUsuario';
import { obtenerNombreUsuario } from '../utils/personal';
import { esLectorSeccion } from '../utils/permisos';
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
    if (rol === 'superadmin' || rol === 'admin') return 'Administrador';
    return 'Técnico';
}

// Los rangos de cada periodo los calcula el backend (GET /admin/viaticos-resumen),
// que es la fuente única del total gastado del panel.
const FILTROS_PERIODO = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'semana', label: 'Esta semana' },
    { id: 'mes', label: 'Este mes' },
    { id: 'historico', label: 'Histórico' },
];

const RESUMEN_VACIO = { total: 0, total_historico: 0, filas: [] };

// Mínimo de caracteres para disparar la búsqueda de técnicos en el servidor.
const MIN_CHARS_BUSQUEDA = 2;
const DEBOUNCE_BUSQUEDA_MS = 350;

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const esLector = esLectorSeccion(user, 'OP');

    const [perfilData, setPerfilData] = useState(null);
    // Resumen de gastos: único cálculo de "total gastado" de la pantalla.
    const [resumen, setResumen] = useState(RESUMEN_VACIO);
    const [cargandoResumen, setCargandoResumen] = useState(true);
    // Técnicos: NO se cargan al abrir el panel, solo al buscar o al expandir.
    const [tecnicos, setTecnicos] = useState([]);
    const [cargandoTecnicos, setCargandoTecnicos] = useState(false);
    const [tecnicoParaAsignaciones, setTecnicoParaAsignaciones] = useState(null);
    const [tecnicoParaCuentasCobro, setTecnicoParaCuentasCobro] = useState(null);
    const [mostrarCrearUsuario, setMostrarCrearUsuario] = useState(false);
    const [error, setError] = useState('');
    const [periodo, setPeriodo] = useState('mes');
    const [ultimaAccion, setUltimaAccion] = useState(null);
    const [cargandoAccion, setCargandoAccion] = useState(true);
    const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
    const [sidebarAbierto, setSidebarAbierto] = useState(false);
    const [itemMenuActivo, setItemMenuActivo] = useState('inicio');

    const [busquedaTecnico, setBusquedaTecnico] = useState('');
    // "Expandir todos" es ahora una acción manual: trae el listado completo
    // desde el servidor y expande las tarjetas. Por defecto está apagado.
    const [expandirTodosTecnicos, setExpandirTodosTecnicos] = useState(false);
    const [tecnicosExpandidos, setTecnicosExpandidos] = useState({});

    const toggleExpandirTodos = () => {
        setExpandirTodosTecnicos((prev) => !prev);
        setTecnicosExpandidos({});
    };

    const toggleTecnicoExpandido = (tecnicoId) => {
        setTecnicosExpandidos((prev) => {
            const estadoActual = prev[tecnicoId] !== undefined ? prev[tecnicoId] : expandirTodosTecnicos;
            return { ...prev, [tecnicoId]: !estadoActual };
        });
    };

    // filtroAsigTecnicos: Map de tecnico.id -> asignacion_id seleccionada ('global' | string)
    const [filtroAsigTecnicos, setFiltroAsigTecnicos] = useState({});

    // Referencias para scroll suave desde el sidebar
    const seccionTecnicosRef = useRef(null);

    const cargarPerfil = useCallback(async () => {
        try {
            const resMe = await api.get('/auth/me');
            setPerfilData(resMe?.data ?? null);
        } catch {
            setPerfilData(null);
        }
    }, []);

    // Única consulta de totales del panel. El backend agrega en SQL y devuelve
    // tanto el total del periodo como el histórico, así que no hay dos cálculos
    // distintos de "total gastado" en la pantalla.
    const cargarResumen = useCallback(async (periodoId) => {
        setCargandoResumen(true);
        try {
            const { data } = await api.get('/admin/viaticos-resumen', {
                params: { periodo: periodoId },
            });
            setResumen(data ?? RESUMEN_VACIO);
        } catch {
            setResumen(RESUMEN_VACIO);
            setError('No se pudo cargar el resumen de gastos.');
        } finally {
            setCargandoResumen(false);
        }
    }, []);

    // Búsqueda de técnicos filtrada EN EL SERVIDOR (no se traen todos para
    // filtrarlos aquí). Solo se llama al buscar o al expandir el listado.
    const cargarTecnicos = useCallback(async ({ q = '', todos = false } = {}) => {
        setCargandoTecnicos(true);
        try {
            const { data } = await api.get('/admin/tecnicos', {
                params: todos ? { limit: 200 } : { q, limit: 60 },
            });
            setTecnicos(data ?? []);
        } catch {
            setTecnicos([]);
            setError('No se pudo cargar el listado de técnicos.');
        } finally {
            setCargandoTecnicos(false);
        }
    }, []);

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
        cargarPerfil();
    }, [cargarPerfil]);

    useEffect(() => {
        cargarResumen(periodo);
    }, [periodo, cargarResumen]);

    useEffect(() => {
        if (user?.id) cargarUltimaAccion(user.id);
    }, [user?.id]);

    const busquedaActiva = busquedaTecnico.trim().length >= MIN_CHARS_BUSQUEDA;
    const listadoVisible = expandirTodosTecnicos || busquedaActiva;

    // Debounce: una sola consulta por pausa de escritura, no una por tecla.
    useEffect(() => {
        if (!listadoVisible) {
            setTecnicos([]);
            return undefined;
        }
        const q = busquedaTecnico.trim();
        const temporizador = setTimeout(() => {
            cargarTecnicos({ q, todos: expandirTodosTecnicos && !q });
        }, DEBOUNCE_BUSQUEDA_MS);
        return () => clearTimeout(temporizador);
    }, [listadoVisible, busquedaTecnico, expandirTodosTecnicos, cargarTecnicos]);

    // Refresco tras crear usuario / actualizar asignaciones.
    const recargarPanel = useCallback(() => {
        cargarPerfil();
        cargarResumen(periodo);
        if (listadoVisible) {
            cargarTecnicos({
                q: busquedaTecnico.trim(),
                todos: expandirTodosTecnicos && !busquedaTecnico.trim(),
            });
        }
    }, [cargarPerfil, cargarResumen, cargarTecnicos, periodo, listadoVisible, busquedaTecnico, expandirTodosTecnicos]);

    const perfil = perfilData ?? {
        nombre: user?.nombre ?? '',
        correo: user?.correo ?? '',
        rol: user?.rol ?? '',
        codigo_empleado: null,
        activo: true,
    };
    const nombreMostrado = obtenerNombreUsuario(perfil.nombre ? perfil : user, 'Admin GSB');

    const [mensajeFeedback, setMensajeFeedback] = useState('');

    const NAV_ITEMS = [
        { id: 'inicio', label: 'Resumen & Liquidaciones', icon: '🏠', action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
        { id: 'gastos', label: 'Gastos & Comprobantes', icon: '💳', action: () => {
            const el = document.querySelector('.gsb-filter-strip') || document.querySelector('.gsb-table-card');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        } },
        { id: 'tecnicos', label: 'Asignaciones & Técnicos', icon: '👷', action: () => seccionTecnicosRef.current?.scrollIntoView({ behavior: 'smooth' }) },
        { id: 'cuentas-cobro', label: 'Cuentas de Cobro', icon: '💵', action: () => navigate('/admin/cuentas-cobro') },
        { id: 'reportes', label: 'Reportes & Exportación', icon: '📊', action: () => setMostrarModalExportar(true) },
    ];

    return (
        <div className="gsb-app-layout">
            {/* ── SIDEBAR CORPORATIVO (MÓDULO VIÁTICOS) ── */}
            <aside className={`gsb-sidebar ${sidebarAbierto ? 'gsb-sidebar--open' : ''}`}>
                <div className="gsb-sidebar-header" onClick={() => navigate('/seleccion-modulo')} style={{ cursor: 'pointer' }} title="Regresar al Hub de Módulos">
                    <div className="gsb-sidebar-logo-wrap">
                        <img src={logoGSB} alt="Global Security Bank" className="gsb-sidebar-logo" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="gsb-sidebar-brand-name">GS-VIÁTICOS</span>
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>‹ Hub de Módulos</span>
                    </div>
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
                                    {(user?.rol === 'superadmin' || user?.rol === 'admin') && (
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

                    {esLector && (
                        <div className="gsb-alert-banner" style={{ background: '#EFF6FF', borderLeft: '4px solid #3B82F6', color: '#1E3A8A', padding: '0.85rem 1.25rem', marginBottom: '1.25rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 500 }}>
                            <span style={{ fontSize: '1.25rem' }}>👁️</span>
                            <div>
                                <strong>Modo Lector de Sección (Operaciones)</strong>: Acceso de visualización general. No puedes subir soportes, aprobar/rechazar gastos ni abrir modales de gestión técnica.
                            </div>
                        </div>
                    )}

                    {/* ── FILA SUPERIOR: Perfil Admin ── */}
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

                    </section>

                    {/* ── FILA INFERIOR: Técnicos + Resumen de Gastos ── */}
                    <div className="gsb-bottom-grid">
                        {/* Columna izquierda: Técnicos (65%) */}
                        <section className="gsb-techs-section" ref={seccionTecnicosRef}>
                            <div className="gsb-section-header gsb-techs-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <h2 className="gsb-section-title">Técnicos</h2>
                                        <p className="gsb-section-subtitle">
                                            {listadoVisible
                                                ? `Gestión y actividad de técnicos (${tecnicos.length})`
                                                : 'Busca un técnico o expande el listado completo'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="gsb-techs-toggle-all-btn"
                                        onClick={toggleExpandirTodos}
                                        title={expandirTodosTecnicos ? 'Colapsar todas las tarjetas' : 'Expandir todas las tarjetas'}
                                    >
                                        <span className={`gsb-techs-toggle-chevron ${expandirTodosTecnicos ? 'gsb-techs-toggle-chevron--open' : ''}`}>
                                            ▼
                                        </span>
                                        <span className="gsb-techs-toggle-lbl">
                                            {expandirTodosTecnicos ? 'Colapsar todos' : 'Expandir todos'}
                                        </span>
                                    </button>
                                </div>

                                <div className="gsb-search-box gsb-techs-search">
                                    <span className="gsb-search-icon">🔍</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar técnico..."
                                        className="gsb-search-input"
                                        value={busquedaTecnico}
                                        onChange={(e) => setBusquedaTecnico(e.target.value)}
                                    />
                                    {busquedaTecnico && (
                                        <button
                                            type="button"
                                            className="gsb-search-clear-btn"
                                            onClick={() => setBusquedaTecnico('')}
                                            title="Limpiar búsqueda"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* El listado arranca oculto: no se renderiza ni se consulta
                                hasta que el admin busca o pulsa "Expandir todos". */}
                            {!listadoVisible && (
                                <div className="gsb-techs-placeholder">
                                    <span className="gsb-techs-placeholder-icon">🔍</span>
                                    <p className="gsb-techs-placeholder-txt">
                                        Escribe al menos {MIN_CHARS_BUSQUEDA} caracteres para buscar un técnico
                                        por nombre, cédula o correo, o pulsa <strong>Expandir todos</strong> para
                                        cargar el listado completo.
                                    </p>
                                </div>
                            )}

                            {listadoVisible && cargandoTecnicos && (
                                <div className="gsb-techs-placeholder">
                                    <p className="gsb-techs-placeholder-txt">Cargando técnicos…</p>
                                </div>
                            )}

                            {listadoVisible && !cargandoTecnicos && tecnicos.length === 0 && (
                                <div className="gsb-techs-placeholder">
                                    <p className="gsb-techs-placeholder-txt">
                                        Ningún técnico coincide con la búsqueda.
                                    </p>
                                </div>
                            )}

                            <div className="gsb-techs-grid">
                                {(listadoVisible && !cargandoTecnicos ? tecnicos : []).map((t) => {
                                    const asigActiva = t.asignacion_activa;
                                    const estaExpandido = tecnicosExpandidos[t.id] !== undefined ? tecnicosExpandidos[t.id] : expandirTodosTecnicos;

                                    return (
                                        <div key={t.id} className={`gsb-tech-card ${!estaExpandido ? 'gsb-tech-card--collapsed' : ''}`}>
                                            <div
                                                className="gsb-tech-card-header"
                                                onClick={() => toggleTecnicoExpandido(t.id)}
                                                style={{ cursor: 'pointer' }}
                                                title={estaExpandido ? 'Clic para colapsar' : 'Clic para expandir'}
                                            >
                                                <div className="gsb-tech-avatar">
                                                    {iniciales(t.nombre) || 'T'}
                                                </div>
                                                <div className="gsb-tech-identity" style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                                                        <h3 className="gsb-tech-name">{t.nombre}</h3>
                                                        <span
                                                            className={`gsb-tech-status-badge ${t.activo !== false ? 'gsb-tech-status-badge--active' : 'gsb-tech-status-badge--inactive'}`}
                                                            title={t.activo !== false ? 'Técnico Activo' : 'Técnico Inactivo'}
                                                        >
                                                            {t.activo !== false ? 'ACTIVO' : 'INACTIVO'}
                                                        </span>
                                                    </div>
                                                    <span className="gsb-tech-cedula">
                                                        Cédula: {t.codigo_empleado || 'Sin asignar'}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`gsb-tech-card-toggle-btn ${estaExpandido ? 'gsb-tech-card-toggle-btn--open' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTecnicoExpandido(t.id);
                                                    }}
                                                    title={estaExpandido ? 'Colapsar tarjeta' : 'Expandir tarjeta'}
                                                >
                                                    ▼
                                                </button>
                                            </div>

                                            {/* ── Vista Compacta / Colapsada (Esencial) ── */}
                                            {!estaExpandido ? (
                                                <div className="gsb-tech-compact-body" onClick={() => toggleTecnicoExpandido(t.id)} style={{ cursor: 'pointer' }}>
                                                    <div className="gsb-tech-compact-asig-row">
                                                        {asigActiva ? (
                                                            <span className="gsb-tech-mini-asig" title={`${asigActiva.cliente} - ${asigActiva.ciudad}`}>
                                                                <span className="gsb-tech-asig-dot" />
                                                                <strong className="gsb-tech-mini-cliente">{asigActiva.cliente}</strong>
                                                                <span className="gsb-tech-mini-ciudad">· {asigActiva.ciudad}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="gsb-tech-mini-asig gsb-tech-mini-asig--vacio">
                                                                ⚪ Sin asignación activa
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="gsb-tech-compact-footer">
                                                        <span className="gsb-tech-compact-viaticos-chip">
                                                            🧾 {t.cantidad_viaticos || 0} viát. · {formatCOP(t.total_gastado || 0)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="gsb-tech-mini-btn-ver"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/admin/personal/${t.id}`);
                                                            }}
                                                            title={`Ver perfil de ${t.nombre}`}
                                                        >
                                                            Ver perfil →
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ── Vista Expandida (Detalle Completo) ── */
                                                <>
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

                                                    {/* ── Widget de Saldo por Asignación ── */}
                                                    {(() => {
                                                        const asigTec = (t.asignaciones || []).filter(
                                                            a => Number(a.monto_anticipo || 0) > 0 || Number(a.total_gastado || 0) > 0
                                                        );
                                                        const filtroKey = filtroAsigTecnicos[t.id] || 'global';
                                                        const setFiltro = (val) => setFiltroAsigTecnicos(prev => ({ ...prev, [t.id]: val }));

                                                        const globalAnticipo = asigTec.reduce((s, a) => s + Number(a.monto_anticipo || 0), 0);
                                                        const globalGastado  = asigTec.reduce((s, a) => s + Number(a.total_gastado  || 0), 0);

                                                        let viewAnticipo, viewGastado;
                                                        if (filtroKey === 'global' || asigTec.length === 0) {
                                                            viewAnticipo = globalAnticipo;
                                                            viewGastado  = globalGastado;
                                                        } else {
                                                            const sel = asigTec.find(a => String(a.id) === filtroKey);
                                                            viewAnticipo = Number(sel?.monto_anticipo || 0);
                                                            viewGastado  = Number(sel?.total_gastado  || 0);
                                                        }
                                                        const viewSaldo = viewAnticipo - viewGastado;
                                                        const esFavorTec = viewGastado > viewAnticipo;

                                                        return (
                                                            <div className="gsb-tech-balance-widget">
                                                                <div className="gsb-tech-bw-header">
                                                                    <span className="gsb-tech-bw-icon">💲</span>
                                                                    <select
                                                                        className="gsb-tech-asig-filter"
                                                                        value={filtroKey}
                                                                        onChange={e => setFiltro(e.target.value)}
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        <option value="global">🌐 Balance Global ({asigTec.length} asig.)</option>
                                                                        {asigTec.map(a => (
                                                                            <option key={a.id} value={String(a.id)}>
                                                                                📋 {a.cliente || `#${a.id}`}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div className="gsb-tech-bw-row">
                                                                    <span className="gsb-tech-bw-lbl">Anticipo</span>
                                                                    <span className="gsb-tech-bw-val">{formatCOP(viewAnticipo)}</span>
                                                                </div>
                                                                <div className="gsb-tech-bw-row">
                                                                    <span className="gsb-tech-bw-lbl">Gastado</span>
                                                                    <span className="gsb-tech-bw-val" style={{ color: '#0284C7' }}>{formatCOP(viewGastado)}</span>
                                                                </div>
                                                                <div className={`gsb-tech-bw-row gsb-tech-bw-saldo ${esFavorTec ? 'gsb-tech-bw-saldo--warn' : 'gsb-tech-bw-saldo--ok'}`}>
                                                                    <span className="gsb-tech-bw-lbl">
                                                                        {esFavorTec ? '🚨 Favor Técnico' : '✅ Saldo Empresa'}
                                                                    </span>
                                                                    <strong className="gsb-tech-bw-val">{formatCOP(Math.abs(viewSaldo))}</strong>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Métricas de Viáticos y Gasto */}
                                                    <div className="gsb-tech-metrics-row">
                                                        <div className="gsb-tech-metric">
                                                            <span className="gsb-tech-metric-val">{t.cantidad_viaticos}</span>
                                                            <span className="gsb-tech-metric-lbl">VIÁTICOS</span>
                                                        </div>
                                                        <div className="gsb-tech-metric">
                                                            <span className="gsb-tech-metric-val">{formatCOP(t.total_gastado)}</span>
                                                            <span className="gsb-tech-metric-lbl">GASTADO</span>
                                                        </div>
                                                    </div>

                                                    {/* Botones de Asignaciones y Cuenta de Cobro */}
                                                    {!esLector && (
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
                                                    )}

                                                    <button
                                                        type="button"
                                                        className="gsb-tech-btn-profile"
                                                        onClick={() => navigate(`/admin/personal/${t.id}`)}
                                                    >
                                                        Ver información →
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Tarjeta Agregar Técnico */}
                                {!esLector && (
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
                                )}
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
                                    <h3 className="gsb-summary-hero-val">
                                        {cargandoResumen ? '…' : formatCOP(Number(resumen.total || 0))}
                                    </h3>
                                    {periodo !== 'historico' && (
                                        <span className="gsb-summary-hero-hist">
                                            Histórico: {formatCOP(Number(resumen.total_historico || 0))}
                                        </span>
                                    )}
                                </div>

                                <div className="gsb-summary-list">
                                    {cargandoResumen ? (
                                        <p className="gsb-summary-empty">Calculando…</p>
                                    ) : (resumen.filas || []).length === 0 ? (
                                        <p className="gsb-summary-empty">Sin gastos registrados en este periodo.</p>
                                    ) : (
                                        resumen.filas.map((f) => (
                                            <div className="gsb-summary-row" key={f.usuario_id}>
                                                <span className="gsb-summary-tech-name">{f.nombre}</span>
                                                <span className="gsb-summary-tech-val">{formatCOP(Number(f.total || 0))}</span>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="gsb-summary-total-footer">
                                    <span>Total</span>
                                    <strong>{cargandoResumen ? '…' : formatCOP(Number(resumen.total || 0))}</strong>
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

            {/* Modal de Asignaciones Individuales de Técnico */}
            {tecnicoParaAsignaciones && (
                <ModalAsignacionesTecnico
                    tecnico={tecnicoParaAsignaciones}
                    onClose={() => setTecnicoParaAsignaciones(null)}
                    onAsignacionActualizada={recargarPanel}
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
                        recargarPanel();
                    }}
                />
            )}
        </div>
    );
}
