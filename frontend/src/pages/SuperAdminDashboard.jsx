import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import logoGSB from '../assets/logo-gsb.png';
import NotificationBell from '../components/NotificationBell';
import { listarAsignaciones } from '../services/asignaciones';
import {
    TIPOS_ASIGNACION,
    LABEL_TIPO_ASIGNACION,
    ESTADOS_ASIGNACION,
    LABEL_ESTADO_ASIGNACION,
    filtrarAsignaciones,
} from '../utils/asignaciones';
import './SuperAdminDashboard.css';

function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value);
}

function formatFecha(iso) {
    if (!iso) return 'No registrada';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const NAV_ITEMS = [
    { id: 'inicio',         label: 'Inicio',        icon: '⊞', path: '/superadmin' },
    { id: 'viaticos',       label: 'Viáticos',       icon: '📋', path: '/admin/viaticos' },
    { id: 'asignaciones',   label: 'Asignaciones',   icon: '📁', path: '/admin/asignaciones' },
    { id: 'usuarios',       label: 'Usuarios',       icon: '👥', path: '/admin/usuarios' },
    { id: 'evidencias',     label: 'Evidencias',     icon: '📎', path: null },
    { id: 'notificaciones', label: 'Notificaciones', icon: '🔔', path: null },
    { id: 'auditoria',      label: 'Auditoría',      icon: 'ℹ', path: '/admin/auditoria' },
];

export default function SuperAdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [perfilData, setPerfilData] = useState(null);
    const [viaticos, setViaticos]     = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [loadingAsig, setLoadingAsig] = useState(true);
    const [error, setError]           = useState('');
    const [activeNav, setActiveNav]   = useState('inicio');

    // Asignaciones filters
    const [busqueda, setBusqueda]     = useState('');
    const [tipoFiltro, setTipoFiltro] = useState('');
    const [estadoFiltro, setEstadoFiltro] = useState('');

    // Modal estado de edición de perfil
    const [mostrarCambioPass, setMostrarCambioPass] = useState(false);
    const [passActual, setPassActual]   = useState('');
    const [passNuevo, setPassNuevo]     = useState('');
    const [passError, setPassError]     = useState('');
    const [passSaving, setPassSaving]   = useState(false);
    const [passOk, setPassOk]           = useState(false);

    useEffect(() => {
        async function cargar() {
            try {
                const [resMe, resViaticos, resAsig, resUsuarios] = await Promise.all([
                    api.get('/auth/me').catch(() => null),
                    api.get('/admin/viaticos'),
                    listarAsignaciones(),
                    api.get('/admin/usuarios'),
                ]);
                setPerfilData(resMe?.data ?? null);
                setViaticos(resViaticos.data);

                const usuariosPorId = new Map(resUsuarios.data.map((u) => [String(u.id), u]));
                setAsignaciones(
                    resAsig.data.map((a) => ({
                        ...a,
                        tecnico_nombre: usuariosPorId.get(String(a.tecnico_id))?.nombre,
                    }))
                );
            } catch {
                setError('No se pudieron cargar algunos datos del panel.');
            } finally {
                setLoading(false);
                setLoadingAsig(false);
            }
        }
        cargar();
    }, []);

    const kpis = useMemo(() => {
        const totalGastado = viaticos.reduce((acc, v) => acc + Number(v.valor), 0);
        return {
            totalGastado,
            pendientes: viaticos.filter((v) => v.estado === 'pendiente').length,
            aprobados:  viaticos.filter((v) => v.estado === 'aprobado').length,
            rechazados: viaticos.filter((v) => v.estado === 'rechazado').length,
        };
    }, [viaticos]);

    const asigFiltradas = useMemo(
        () => filtrarAsignaciones(asignaciones, { busqueda, tipo: tipoFiltro, estado: estadoFiltro }),
        [asignaciones, busqueda, tipoFiltro, estadoFiltro]
    );

    async function handleCambiarPassword(e) {
        e.preventDefault();
        setPassError('');
        if (!passNuevo || passNuevo.length < 6) {
            setPassError('La contraseña nueva debe tener al menos 6 caracteres.');
            return;
        }
        setPassSaving(true);
        try {
            await api.put('/auth/cambiar-password', {
                password_actual: passActual,
                password_nuevo: passNuevo,
            });
            setPassOk(true);
            setPassActual('');
            setPassNuevo('');
            setTimeout(() => {
                setMostrarCambioPass(false);
                setPassOk(false);
            }, 2000);
        } catch (err) {
            setPassError(err.response?.data?.detail || 'No se pudo cambiar la contraseña.');
        } finally {
            setPassSaving(false);
        }
    }

    // Información del perfil: primero intenta /auth/me, si no está disponible usa JWT
    const perfil = perfilData ?? {
        nombre: user?.nombre ?? 'Super Administrador',
        correo: user?.correo ?? '',
        codigo_empleado: 'EMP-0001',
        rol: 'superadmin',
        activo: true,
        fecha_registro: null,
    };

    return (
        <div className="sa-root">
            {/* ── SIDEBAR ── */}
            <aside className="sa-sidebar">
                <div className="sa-sidebar-brand">
                    <img src={logoGSB} alt="GSB" className="sa-sidebar-logo" />
                    <div>
                        <span className="sa-sidebar-title">GS-VIÁTICOS</span>
                        <span className="sa-sidebar-subtitle">GLOBAL SECURITY BANK S.A.S</span>
                    </div>
                </div>

                <nav className="sa-nav">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            className={`sa-nav-item ${activeNav === item.id ? 'sa-nav-item--active' : ''}`}
                            onClick={() => {
                                setActiveNav(item.id);
                                if (item.path) navigate(item.path);
                            }}
                        >
                            <span className="sa-nav-icon">{item.icon}</span>
                            <span className="sa-nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="sa-sidebar-footer">
                    <div className="sa-sidebar-footer-brand">GLOBAL SECURITY BANK S.A.S</div>
                    <div className="sa-sidebar-footer-nit">NIT: 830.057.616-3</div>
                </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <div className="sa-content">
                {/* Top Bar */}
                <header className="sa-topbar">
                    <button className="sa-topbar-menu" aria-label="Menu">☰</button>
                    <div className="sa-topbar-right">
                        <NotificationBell />
                        <div className="sa-topbar-user">
                            <div className="sa-topbar-avatar">
                                {(perfil.nombre || perfil.correo || 'S')[0].toUpperCase()}
                            </div>
                            <div className="sa-topbar-userinfo">
                                <span className="sa-topbar-username">{perfil.nombre || 'Super Administrador'}</span>
                                <span className="sa-topbar-useremail">{perfil.correo}</span>
                            </div>
                            <button
                                className="sa-topbar-logout"
                                onClick={() => { logout(); navigate('/login'); }}
                                title="Cerrar sesión"
                            >
                                ⏻
                            </button>
                        </div>
                    </div>
                </header>

                {/* Page Title */}
                <div className="sa-page-header">
                    <h1 className="sa-page-title">Inicio</h1>
                    <p className="sa-page-sub">Panel de control administrativo</p>
                </div>

                {error && <div className="sa-error">{error}</div>}

                {/* ── MAIN GRID: Perfil | KPIs ── */}
                <div className="sa-main-grid">
                    {/* Tarjeta de Perfil */}
                    <div className="sa-profile-card">
                        <div className="sa-profile-avatar-wrap">
                            <div className="sa-profile-avatar">
                                {(perfil.nombre || 'S')[0].toUpperCase()}
                            </div>
                            <span className="sa-profile-status-dot" title="Activo" />
                        </div>

                        <div className="sa-profile-info">
                            <h2 className="sa-profile-name">{perfil.nombre || 'Super Administrador'}</h2>
                            <div className="sa-profile-badges">
                                <span className="sa-badge sa-badge--role">SUPERADMIN</span>
                                <span className={`sa-badge ${perfil.activo ? 'sa-badge--active' : 'sa-badge--inactive'}`}>
                                    {perfil.activo ? 'Activo' : 'Inactivo'}
                                </span>
                            </div>

                            <div className="sa-profile-meta">
                                <div className="sa-profile-meta-item">
                                    <span className="sa-profile-meta-icon">✉</span>
                                    <span>{perfil.correo}</span>
                                </div>
                                <div className="sa-profile-meta-item">
                                    <span className="sa-profile-meta-icon">🪪</span>
                                    <span>{perfil.codigo_empleado || 'EMP-0001'}</span>
                                </div>
                                <div className="sa-profile-meta-item">
                                    <span className="sa-profile-meta-icon">📅</span>
                                    <span>Fecha de registro: {formatFecha(perfil.fecha_registro ?? perfil.created_at)}</span>
                                </div>
                            </div>
                        </div>

                        <hr className="sa-profile-divider" />

                        <div className="sa-profile-detail-grid">
                            <div className="sa-profile-detail-section">
                                <p className="sa-detail-section-title">Información del usuario</p>
                                <div className="sa-detail-row">
                                    <div>
                                        <span className="sa-detail-label">Nombre completo</span>
                                        <span className="sa-detail-value">{perfil.nombre || 'Super Administrador'}</span>
                                    </div>
                                    <div>
                                        <span className="sa-detail-label">Rol</span>
                                        <span className="sa-detail-value">Super Administrador</span>
                                    </div>
                                </div>
                                <div className="sa-detail-row">
                                    <div>
                                        <span className="sa-detail-label">Código de empleado</span>
                                        <span className="sa-detail-value">{perfil.codigo_empleado || 'EMP-0001'}</span>
                                    </div>
                                    <div>
                                        <span className="sa-detail-label">Estado</span>
                                        <span className={`sa-badge ${perfil.activo ? 'sa-badge--active' : 'sa-badge--inactive'}`} style={{ fontSize: '0.75rem' }}>
                                            {perfil.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="sa-profile-detail-section">
                                <p className="sa-detail-section-title">Contacto</p>
                                <div className="sa-detail-row">
                                    <div>
                                        <span className="sa-detail-label">Correo electrónico</span>
                                        <span className="sa-detail-value">{perfil.correo}</span>
                                    </div>
                                    <div>
                                        <span className="sa-detail-label">Teléfono</span>
                                        <span className="sa-detail-value">{perfil.telefono || 'No registrado'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="sa-profile-actions">
                            <button
                                className="sa-btn sa-btn--outline"
                                onClick={() => navigate(`/admin/personal/${user?.id}`)}
                            >
                                ✏ Editar información
                            </button>
                            <button
                                className="sa-btn sa-btn--primary"
                                onClick={() => setMostrarCambioPass(true)}
                            >
                                🔑 Cambiar contraseña
                            </button>
                        </div>
                    </div>

                    {/* KPIs columna derecha */}
                    <div className="sa-kpis-col">
                        <div className="sa-kpi-card sa-kpi--blue">
                            <div className="sa-kpi-icon-wrap sa-kpi-icon--blue">$</div>
                            <div className="sa-kpi-body">
                                <span className="sa-kpi-label">Total gastado</span>
                                <span className="sa-kpi-value">{loading ? '—' : formatCOP(kpis.totalGastado)}</span>
                                <span className="sa-kpi-period">Este mes</span>
                            </div>
                            <div className="sa-kpi-sparkline sa-kpi-sparkline--blue">
                                <svg viewBox="0 0 60 30" preserveAspectRatio="none">
                                    <polyline points="0,25 15,18 30,22 45,10 60,15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        </div>

                        <div className="sa-kpi-card sa-kpi--orange">
                            <div className="sa-kpi-icon-wrap sa-kpi-icon--orange">⏳</div>
                            <div className="sa-kpi-body">
                                <span className="sa-kpi-label">Pendientes</span>
                                <span className="sa-kpi-value">{loading ? '—' : kpis.pendientes}</span>
                                <span className="sa-kpi-period">Este mes</span>
                            </div>
                            <div className="sa-kpi-sparkline sa-kpi-sparkline--orange">
                                <svg viewBox="0 0 60 30" preserveAspectRatio="none">
                                    <polyline points="0,20 15,25 30,15 45,20 60,10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        </div>

                        <div className="sa-kpi-card sa-kpi--green">
                            <div className="sa-kpi-icon-wrap sa-kpi-icon--green">✓</div>
                            <div className="sa-kpi-body">
                                <span className="sa-kpi-label">Aprobados</span>
                                <span className="sa-kpi-value">{loading ? '—' : kpis.aprobados}</span>
                                <span className="sa-kpi-period">Este mes</span>
                            </div>
                            <div className="sa-kpi-sparkline sa-kpi-sparkline--green">
                                <svg viewBox="0 0 60 30" preserveAspectRatio="none">
                                    <polyline points="0,28 15,20 30,22 45,12 60,8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        </div>

                        <div className="sa-kpi-card sa-kpi--red">
                            <div className="sa-kpi-icon-wrap sa-kpi-icon--red">✕</div>
                            <div className="sa-kpi-body">
                                <span className="sa-kpi-label">Rechazados</span>
                                <span className="sa-kpi-value">{loading ? '—' : kpis.rechazados}</span>
                                <span className="sa-kpi-period">Este mes</span>
                            </div>
                            <div className="sa-kpi-sparkline sa-kpi-sparkline--red">
                                <svg viewBox="0 0 60 30" preserveAspectRatio="none">
                                    <polyline points="0,10 15,18 30,12 45,22 60,20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── ASIGNACIONES ── */}
                <div className="sa-asig-card">
                    <div className="sa-asig-header">
                        <h2 className="sa-asig-title">Asignaciones</h2>
                        <button
                            className="sa-btn sa-btn--primary sa-btn--sm"
                            onClick={() => navigate('/admin/asignaciones/nueva')}
                        >
                            + Nueva asignación
                        </button>
                    </div>

                    <div className="sa-asig-filtros">
                        <div className="sa-asig-search-wrap">
                            <span className="sa-asig-search-icon">🔍</span>
                            <input
                                type="text"
                                className="sa-asig-search"
                                placeholder="Buscar por técnico, cliente o empresa"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                            />
                        </div>
                        <select
                            className="sa-asig-select"
                            value={estadoFiltro}
                            onChange={(e) => setEstadoFiltro(e.target.value)}
                        >
                            <option value="">Todos los estados</option>
                            {ESTADOS_ASIGNACION.map((e) => (
                                <option key={e} value={e}>{LABEL_ESTADO_ASIGNACION[e]}</option>
                            ))}
                        </select>
                        <select
                            className="sa-asig-select"
                            value={tipoFiltro}
                            onChange={(e) => setTipoFiltro(e.target.value)}
                        >
                            <option value="">Todos los tipos</option>
                            {TIPOS_ASIGNACION.map((t) => (
                                <option key={t} value={t}>{LABEL_TIPO_ASIGNACION[t]}</option>
                            ))}
                        </select>
                    </div>

                    <div className="sa-asig-body">
                        {loadingAsig ? (
                            <div className="sa-asig-empty">
                                <span className="sa-asig-empty-icon">⏳</span>
                                <p>Cargando asignaciones...</p>
                            </div>
                        ) : asigFiltradas.length === 0 ? (
                            <div className="sa-asig-empty">
                                <span className="sa-asig-empty-icon">📁</span>
                                <p className="sa-asig-empty-title">No se encontraron asignaciones</p>
                                <p className="sa-asig-empty-sub">
                                    {asignaciones.length === 0
                                        ? 'Crea la primera asignación usando el botón superior.'
                                        : 'No hay asignaciones que coincidan con los filtros seleccionados.'}
                                </p>
                            </div>
                        ) : (
                            <div className="sa-asig-table-wrap">
                                <table className="sa-asig-table">
                                    <thead>
                                        <tr>
                                            <th>Técnico</th>
                                            <th>Cliente / Empresa</th>
                                            <th>Tipo</th>
                                            <th>Estado</th>
                                            <th>Fecha inicio</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {asigFiltradas.map((a) => (
                                            <tr key={a.id} className="sa-asig-row" onClick={() => navigate(`/admin/asignaciones/${a.id}`)}>
                                                <td>{a.tecnico_nombre ?? `#${a.tecnico_id}`}</td>
                                                <td>
                                                    <span className="sa-asig-cliente">{a.cliente}</span>
                                                    {a.empresa && <span className="sa-asig-empresa">{a.empresa}</span>}
                                                </td>
                                                <td><span className="sa-asig-tipo-badge">{LABEL_TIPO_ASIGNACION[a.tipo] ?? a.tipo}</span></td>
                                                <td>
                                                    <span className={`sa-estado-badge sa-estado--${a.estado}`}>
                                                        {LABEL_ESTADO_ASIGNACION[a.estado] ?? a.estado}
                                                    </span>
                                                </td>
                                                <td>{a.fecha_inicio ? formatFecha(a.fecha_inicio) : '—'}</td>
                                                <td><span className="sa-asig-arrow">→</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <footer className="sa-footer">
                    © 2025 Global Security Bank S.A.S · Todos los derechos reservados
                </footer>
            </div>

            {/* ── MODAL CAMBIAR CONTRASEÑA ── */}
            {mostrarCambioPass && (
                <div className="sa-modal-overlay" onClick={() => setMostrarCambioPass(false)}>
                    <div className="sa-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="sa-modal-header">
                            <h3>Cambiar contraseña</h3>
                            <button className="sa-modal-close" onClick={() => setMostrarCambioPass(false)}>✕</button>
                        </div>
                        {passOk ? (
                            <div className="sa-modal-success">✓ Contraseña actualizada correctamente.</div>
                        ) : (
                            <form onSubmit={handleCambiarPassword} className="sa-modal-form">
                                <label>
                                    Contraseña actual
                                    <input
                                        type="password"
                                        value={passActual}
                                        onChange={(e) => setPassActual(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                    />
                                </label>
                                <label>
                                    Nueva contraseña
                                    <input
                                        type="password"
                                        value={passNuevo}
                                        onChange={(e) => setPassNuevo(e.target.value)}
                                        required
                                        autoComplete="new-password"
                                    />
                                </label>
                                {passError && <p className="sa-modal-error">{passError}</p>}
                                <div className="sa-modal-actions">
                                    <button type="button" className="sa-btn sa-btn--outline" onClick={() => setMostrarCambioPass(false)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="sa-btn sa-btn--primary" disabled={passSaving}>
                                        {passSaving ? 'Guardando...' : 'Guardar'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
