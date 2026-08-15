import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { listarAuditoria } from '../services/auditoria';
import logoGSB from '../assets/logo-gsb.png';
import NotificationBell from '../components/NotificationBell';
import InstallPwaPrompt from '../components/InstallPwaPrompt';
import ModalEvidencia from '../components/ModalEvidencia';
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

function labelTipoId(tipo) {
    if (tipo === 'nit_proveedor') return { texto: 'NIT Proveedor', color: '#7C3AED', bg: '#EDE9FE' };
    if (tipo === 'nit_nuevo') return { texto: 'NIT Nuevo', color: '#B45309', bg: '#FEF3C7' };
    return { texto: 'Cédula', color: '#1D63C8', bg: '#EFF6FF' };
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [periodo, setPeriodo] = useState('mes');
    const [resumenAbierto, setResumenAbierto] = useState(true);
    const [ultimaAccion, setUltimaAccion] = useState(null);
    const [cargandoAccion, setCargandoAccion] = useState(true);

    // Modal de consolidado y evidencia
    const [registroConsolidado, setRegistroConsolidado] = useState(null);
    const [evidenciaPreview, setEvidenciaPreview] = useState(null);
    const [busquedaConsolidado, setBusquedaConsolidado] = useState('');
    const [filtroEstadoConsolidado, setFiltroEstadoConsolidado] = useState('todos');

    async function cargar() {
        try {
            const [resMe, resUsuarios, resViaticos] = await Promise.all([
                api.get('/auth/me').catch(() => null),
                api.get('/admin/usuarios'),
                api.get('/admin/viaticos'),
            ]);
            setPerfilData(resMe?.data ?? null);
            setUsuarios(resUsuarios.data);
            setViaticos(resViaticos.data);
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
    const nombreMostrado = perfil.nombre || perfil.correo || 'Administrador';

    const [mensajeFeedback, setMensajeFeedback] = useState('');

    return (
        <div className="admin-root">
            {/* ── HEADER ── */}
            <header className="admin-header">
                <div className="admin-header-brand">
                    <img src={logoGSB} alt="Global Security Bank" className="admin-logo-img" />
                    <div>
                        <span className="admin-brand-name">PANEL ADMINISTRATIVO</span>
                        <span className="admin-brand-sub">GS-Viáticos</span>
                    </div>
                </div>
                <div className="admin-header-right">
                    <button
                        className="btn-nav-asignaciones"
                        style={{ background: '#0284C7' }}
                        onClick={() => navigate('/admin/cuentas-cobro')}
                    >
                        💵 Cuentas de Cobro
                    </button>
                    <button
                        className="btn-nav-asignaciones"
                        onClick={() => navigate('/admin/asignaciones')}
                    >
                        Asignaciones
                    </button>
                    <InstallPwaPrompt />
                    <NotificationBell />
                    <div className="admin-user-pill">
                        <span className="admin-user-avatar">{user?.correo?.[0]?.toUpperCase()}</span>
                        <span className="admin-user-email">{user?.correo}</span>
                    </div>
                    <button
                        className="btn-logout"
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                    >
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <main className="admin-main dash-main">
                {mensajeFeedback && (
                    <div style={{
                        backgroundColor: '#F0FDF4',
                        border: '1.5px solid #86EFAC',
                        color: '#166534',
                        padding: '0.9rem 1.25rem',
                        borderRadius: '12px',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        marginBottom: '1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(22, 101, 52, 0.1)',
                    }}>
                        <span>{mensajeFeedback}</span>
                        <button
                            onClick={() => setMensajeFeedback('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', color: '#166534' }}
                        >
                            ×
                        </button>
                    </div>
                )}

                {error && <p className="dash-error">{error}</p>}

                {/* ── SECCIÓN SUPERIOR: Perfil + KPIs ── */}
                <h2 className="admin-section-title">Operación General</h2>

                <div className="dash-top-row">
                    {/* Tarjeta de Perfil */}
                    <div className="dash-profile-card">
                        <div className="dash-profile-top">
                            <div className="dash-profile-avatar-wrap">
                                <div className="dash-profile-avatar">
                                    {iniciales(nombreMostrado) || perfil.correo?.[0]?.toUpperCase() || 'A'}
                                </div>
                            </div>
                            <div className="dash-profile-info">
                                <h3 className="dash-profile-nombre">{nombreMostrado}</h3>
                                <div className="dash-profile-badges">
                                    <span className="dash-profile-badge dash-profile-badge--rol">
                                        {labelRol(perfil.rol || user?.rol)}
                                    </span>
                                    <span className={`dash-profile-badge ${perfil.activo ? 'dash-profile-badge--activo' : 'dash-profile-badge--inactivo'}`}>
                                        {perfil.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="dash-profile-meta">
                            <div className="dash-profile-meta-row">
                                <span className="dash-profile-meta-icon">✉</span>
                                <span className="dash-profile-meta-val">{perfil.correo}</span>
                            </div>
                            {perfil.codigo_empleado && (
                                <div className="dash-profile-meta-row">
                                    <span className="dash-profile-meta-icon">🪪</span>
                                    <span className="dash-profile-meta-val">{perfil.codigo_empleado}</span>
                                </div>
                            )}
                            {perfil.created_at && (
                                <div className="dash-profile-meta-row">
                                    <span className="dash-profile-meta-icon">📅</span>
                                    <span className="dash-profile-meta-val">
                                        <span className="dash-profile-meta-label">Miembro desde</span>{' '}
                                        {formatFechaLargaISO(perfil.created_at)}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="dash-profile-ultima-accion">
                            <span className="dash-profile-ultima-accion-titulo">Última acción registrada</span>
                            {cargandoAccion ? (
                                <span className="dash-profile-ultima-accion-val dash-profile-ultima-accion-val--muted">Cargando…</span>
                            ) : ultimaAccion ? (
                                <div className="dash-profile-ultima-accion-body">
                                    <span className="dash-profile-ultima-accion-nombre">
                                        {ultimaAccion.accion?.replace(/_/g, ' ')}
                                    </span>
                                    <span className="dash-profile-ultima-accion-fecha">
                                        {formatFechaHoraISO(ultimaAccion.created_at)}
                                    </span>
                                </div>
                            ) : (
                                <span className="dash-profile-ultima-accion-val dash-profile-ultima-accion-val--muted">Sin actividad registrada aún</span>
                            )}
                        </div>

                        <div className="dash-profile-actions">
                            <button
                                className="dash-tech-btn"
                                onClick={() => user?.id && navigate(`/admin/personal/${user.id}`)}
                            >
                                Ver mi perfil →
                            </button>
                            <button
                                className="dash-tech-btn"
                                onClick={() => navigate('/admin/usuarios')}
                            >
                                Gestionar usuarios →
                            </button>
                            <button
                                className="dash-tech-btn"
                                onClick={() => navigate('/admin/auditoria')}
                            >
                                Auditoría →
                            </button>
                        </div>
                    </div>

                    {/* KPIs apilados */}
                    {loading ? (
                        <p style={{ color: 'var(--color-text-muted)', alignSelf: 'center' }}>Cargando estadísticas...</p>
                    ) : (
                        <div className="dash-kpis-col">
                            <div
                                className="dash-kpi-card"
                                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                                onClick={() => setFiltroEstadoConsolidado('todos')}
                                title="Ver todos los viáticos"
                            >
                                <span className="dash-kpi-label">Total Gastado {filtroEstadoConsolidado === 'todos' ? '✓' : ''}</span>
                                <span className="dash-kpi-value dash-kpi-value--money">{formatCOP(stats.totalGastado)}</span>
                            </div>
                            <div
                                className="dash-kpi-card dash-kpi-card--pendiente"
                                style={{ cursor: 'pointer', outline: filtroEstadoConsolidado === 'pendiente' ? '2px solid var(--color-pendiente)' : 'none', transition: 'all 0.2s ease' }}
                                onClick={() => setFiltroEstadoConsolidado((prev) => prev === 'pendiente' ? 'todos' : 'pendiente')}
                                title="Filtrar viáticos pendientes"
                            >
                                <span className="dash-kpi-label">Pendientes {filtroEstadoConsolidado === 'pendiente' ? '✓' : ''}</span>
                                <span className="dash-kpi-value">{stats.pendientes}</span>
                            </div>
                            <div
                                className="dash-kpi-card dash-kpi-card--aprobado"
                                style={{ cursor: 'pointer', outline: filtroEstadoConsolidado === 'aprobado' ? '2px solid var(--color-aprobado)' : 'none', transition: 'all 0.2s ease' }}
                                onClick={() => setFiltroEstadoConsolidado((prev) => prev === 'aprobado' ? 'todos' : 'aprobado')}
                                title="Filtrar viáticos aprobados"
                            >
                                <span className="dash-kpi-label">Aprobados {filtroEstadoConsolidado === 'aprobado' ? '✓' : ''}</span>
                                <span className="dash-kpi-value">{stats.aprobados}</span>
                            </div>
                            <div
                                className="dash-kpi-card dash-kpi-card--rechazado"
                                style={{ cursor: 'pointer', outline: filtroEstadoConsolidado === 'rechazado' ? '2px solid var(--color-rechazado)' : 'none', transition: 'all 0.2s ease' }}
                                onClick={() => setFiltroEstadoConsolidado((prev) => prev === 'rechazado' ? 'todos' : 'rechazado')}
                                title="Filtrar viáticos rechazados"
                            >
                                <span className="dash-kpi-label">Rechazados {filtroEstadoConsolidado === 'rechazado' ? '✓' : ''}</span>
                                <span className="dash-kpi-value">{stats.rechazados}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── SECCIÓN CENTRAL: VISTA CONSOLIDADA DE VIÁTICOS (ADMIN) ── */}
                <div className="admin-card-container dash-consolidado-card" style={{ marginBottom: '2rem' }}>
                    <div className="admin-card-toolbar">
                        <div>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.2rem' }}>
                                Viáticos Registrados (Vista Consolidada)
                            </h2>
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                                Consulta y gestiona las solicitudes de viáticos enviadas por los técnicos
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                                value={filtroEstadoConsolidado}
                                onChange={(e) => setFiltroEstadoConsolidado(e.target.value)}
                                style={{
                                    padding: '0.45rem 0.8rem',
                                    borderRadius: '8px',
                                    border: '1.5px solid var(--color-border)',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    background: '#FFFFFF',
                                }}
                            >
                                <option value="todos">Todos los estados</option>
                                <option value="pendiente">Pendientes</option>
                                <option value="aprobado">Aprobados</option>
                                <option value="rechazado">Rechazados</option>
                            </select>
                            <div className="admin-search-wrap" style={{ maxWidth: '280px' }}>
                                <span className="admin-search-icon">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Buscar por técnico, ciudad..."
                                    className="admin-search-input"
                                    value={busquedaConsolidado}
                                    onChange={(e) => setBusquedaConsolidado(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Fecha registro</th>
                                    <th>Técnico</th>
                                    <th>Ciudad</th>
                                    <th>Ítems</th>
                                    <th>Total gastos</th>
                                    <th>Estado</th>
                                    <th style={{ textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {viaticosConsolidados.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                                            No hay registros de viáticos para mostrar.
                                        </td>
                                    </tr>
                                ) : (
                                    viaticosConsolidados.map((r) => {
                                        return (
                                            <tr key={r.key} className="sa-asig-row" onClick={() => setRegistroConsolidado(r)}>
                                                <td>{r.fecha}</td>
                                                <td>
                                                    <strong>{r.tecnico_nombre}</strong>
                                                </td>
                                                <td>{r.ciudad}</td>
                                                <td>
                                                    <span className="badge-tipo">{r.items.length} ítems</span>
                                                </td>
                                                <td>
                                                    <strong>{formatCOP(r.total)}</strong>
                                                </td>
                                                <td>
                                                    <span className={`estado-badge estado-badge--${r.estado === 'pendiente' ? 'inactivo' : r.estado}`}>
                                                        {r.estado === 'pendiente' ? 'En revisión' : r.estado.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        className="admin-mini-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRegistroConsolidado(r);
                                                        }}
                                                    >
                                                        👁️ Ver detalle
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── SECCIÓN INFERIOR: Técnicos + Resumen ── */}
                {!loading && (
                    <div className="dash-layout">
                        {/* Columna izquierda — Técnicos */}
                        <section className="dash-col-left">
                            <h2 className="admin-section-title">Técnicos</h2>
                            {tecnicos.length === 0 ? (
                                <p style={{ color: 'var(--color-text-muted)' }}>No hay personal adicional registrado.</p>
                            ) : (
                                <div className="dash-tech-grid">
                                    {tecnicos.map((t) => (
                                        <div
                                            key={t.id}
                                            className="dash-tech-card"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/admin/personal/${t.id}`)}
                                        >
                                            <div className="dash-tech-card-top">
                                                <div className="dash-tech-avatar">{iniciales(t.nombre)}</div>
                                                {(t.rol === 'admin' || t.rol === 'superadmin') && (
                                                    <span className="dash-badge-admin">Admin</span>
                                                )}
                                            </div>

                                            <h3 className="dash-tech-nombre">{t.nombre}</h3>
                                            <span className="dash-tech-codigo">
                                                {t.codigo_empleado ? `Cédula: ${t.codigo_empleado}` : 'Sin cédula asignada'}
                                            </span>

                                            <div className="dash-tech-metrics">
                                                <div className="dash-tech-metric">
                                                    <span className="dash-tech-metric-value">{t.cantidadViaticos}</span>
                                                    <span className="dash-tech-metric-label">
                                                        {t.cantidadViaticos === 1 ? 'viático registrado' : 'viáticos registrados'}
                                                    </span>
                                                </div>
                                                <div className="dash-tech-metric">
                                                    <span className="dash-tech-metric-value">{formatCOP(t.totalGastado)}</span>
                                                    <span className="dash-tech-metric-label">total gastado</span>
                                                </div>
                                            </div>

                                            <button
                                                className="dash-tech-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/admin/personal/${t.id}`);
                                                }}
                                            >
                                                Ver información →
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Columna derecha — Resumen de Gastos */}
                        <section className="dash-col-right">
                            <div className="dash-summary-panel">
                                <h2 className="dash-summary-title">Resumen de Gastos</h2>

                                <div className="dash-period-tabs">
                                    {FILTROS_PERIODO.map((f) => (
                                        <button
                                            key={f.id}
                                            className={`dash-period-btn ${periodo === f.id ? 'dash-period-btn--activo' : ''}`}
                                            onClick={() => setPeriodo(f.id)}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    className="dash-summary-toggle"
                                    onClick={() => setResumenAbierto((v) => !v)}
                                >
                                    <span>Total Gastado</span>
                                    <span className={`dash-summary-chevron ${resumenAbierto ? 'dash-summary-chevron--abierto' : ''}`}>▾</span>
                                </button>

                                {resumenAbierto && (
                                    <div className="dash-summary-body">
                                        {resumenPeriodo.filas.length === 0 ? (
                                            <p className="dash-summary-empty">Sin gastos en este periodo.</p>
                                        ) : (
                                            <>
                                                <div className="dash-summary-list">
                                                    {resumenPeriodo.filas.map((f, i) => (
                                                        <div className="dash-summary-row" key={i}>
                                                            <span className="dash-summary-row-nombre">{f.nombre}</span>
                                                            <span className="dash-summary-row-linea" />
                                                            <span className="dash-summary-row-valor">{formatCOP(f.total)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="dash-summary-total-row">
                                                    <span>Total</span>
                                                    <span>{formatCOP(resumenPeriodo.total)}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </main>

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
                                <h3 style={{ fontSize: '1.2rem' }}>Detalle del viático</h3>
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
                            <div>
                                <span className="detalle-label">Total gastos</span>
                                <span className="detalle-valor" style={{ color: 'var(--color-primary-blue)' }}>{formatCOP(registroConsolidado.total)}</span>
                            </div>
                        </div>

                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '1rem 0 0.5rem' }}>Gastos registrados</h4>
                        <div className="admin-table-wrap" style={{ border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Concepto</th>
                                        <th>Razón social / NIT</th>
                                        <th>Identificación</th>
                                        <th>Asignación</th>
                                        <th>Valor</th>
                                        <th>Soporte</th>
                                        <th style={{ textAlign: 'center' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registroConsolidado.items.map((item) => {
                                        const evidencia = item.evidencias?.[0];
                                        const tipoId = labelTipoId(item.tipo_identificacion);
                                        return (
                                            <tr key={item.id}>
                                                <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{item.tipo_gasto}</td>
                                                <td>{item.meta?.razon_social || item.cliente} {item.nit_identificacion && `(${item.nit_identificacion})`}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '0.2rem 0.6rem',
                                                        borderRadius: '999px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        background: tipoId.bg,
                                                        color: tipoId.color,
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {tipoId.texto}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '0.2rem 0.65rem',
                                                        borderRadius: '999px',
                                                        fontSize: '0.72rem',
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
        </div>
    );
}
