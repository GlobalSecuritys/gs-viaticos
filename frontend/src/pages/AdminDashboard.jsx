import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import logoGSB from '../assets/logo-gsb.png';
import NotificationBell from '../components/NotificationBell';
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

    const [usuarios, setUsuarios] = useState([]);
    const [viaticos, setViaticos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [periodo, setPeriodo] = useState('mes');
    const [resumenAbierto, setResumenAbierto] = useState(true);

    useEffect(() => {
        async function cargar() {
            try {
                const [resUsuarios, resViaticos] = await Promise.all([
                    api.get('/admin/usuarios'),
                    api.get('/admin/viaticos'),
                ]);
                setUsuarios(resUsuarios.data);
                setViaticos(resViaticos.data);
            } catch {
                setError('No se pudieron cargar los datos del panel.');
            } finally {
                setLoading(false);
            }
        }
        cargar();
    }, []);

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
        return usuarios.map((u) => {
            const viaticosUsuario = viaticos.filter((v) => v.usuario_id === u.id);
            const totalGastado = viaticosUsuario.reduce((acc, v) => acc + Number(v.valor), 0);
            return {
                ...u,
                cantidadViaticos: viaticosUsuario.length,
                totalGastado,
            };
        });
    }, [usuarios, viaticos]);

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

    return (
        <div className="admin-root">
            <header className="admin-header">
                <div className="admin-header-brand">
                    <img src={logoGSB} alt="Global Security Bank" className="admin-logo-img" />
                    <div>
                        <span className="admin-brand-name">PANEL ADMINISTRATIVO</span>
                        <span className="admin-brand-sub">GS-Viáticos</span>
                    </div>
                </div>
                <div className="admin-header-right">
                    <NotificationBell />
                    <div className="admin-user-pill">
                        <span className="admin-user-avatar">{user?.correo?.[0]?.toUpperCase()}</span>
                        <span className="admin-user-email">{user?.correo}</span>
                    </div>
                    <button
                        className="btn-logout"
                        onClick={() => {
                            logout();
                            navigate("/login");
                        }}
                    >Cerrar sesión</button>
                </div>
            </header>

            <main className="admin-main dash-main">
                <div className="admin-welcome">
                    <h1>Bienvenido, Administrador</h1>
                    <p>{user?.nombre || user?.correo}</p>
                </div>

                {error && <p className="dash-error">{error}</p>}

                <h2 className="admin-section-title">Operación General</h2>
                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando estadísticas...</p>
                ) : (
                    <div className="admin-stats-grid">
                        <div className="admin-stat-card">
                            <span className="stat-label">Total Gastado</span>
                            <span className="stat-value dash-stat-value--money">{formatCOP(stats.totalGastado)}</span>
                        </div>
                        <div className="admin-stat-card admin-stat-card--pendiente">
                            <span className="stat-label">Pendientes</span>
                            <span className="stat-value">{stats.pendientes}</span>
                        </div>
                        <div className="admin-stat-card admin-stat-card--aprobado">
                            <span className="stat-label">Aprobados</span>
                            <span className="stat-value">{stats.aprobados}</span>
                        </div>
                        <div className="admin-stat-card admin-stat-card--rechazado">
                            <span className="stat-label">Rechazados</span>
                            <span className="stat-value">{stats.rechazados}</span>
                        </div>
                    </div>
                )}

                {!loading && (
                    <div className="dash-layout">
                        {/* Columna izquierda — Técnicos */}
                        <section className="dash-col-left">
                            <h2 className="admin-section-title">Técnicos</h2>
                            {tecnicos.length === 0 ? (
                                <p style={{ color: 'var(--color-text-muted)' }}>No hay personal registrado.</p>
                            ) : (
                                <div className="dash-tech-grid">
                                    {tecnicos.map((t) => (
                                        <div key={t.id} className="dash-tech-card">
                                            <div className="dash-tech-card-top">
                                                <div className="dash-tech-avatar">{iniciales(t.nombre)}</div>
                                                {(t.rol === 'admin' || t.rol === 'superadmin') && (
                                                    <span className="dash-badge-admin">Admin</span>
                                                )}
                                            </div>

                                            <h3 className="dash-tech-nombre">{t.nombre}</h3>
                                            <span className="dash-tech-codigo">
                                                {t.codigo_empleado ? `Código: ${t.codigo_empleado}` : 'Sin código asignado'}
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
                                                onClick={() => navigate(`/admin/personal/${t.id}`)}
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
        </div>
    );
}
