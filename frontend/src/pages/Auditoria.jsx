import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listarAuditoria } from '../services/auditoria';
import api from '../services/api';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';
import '../pages/AdminDashboard.css';
import '../pages/AdminUsuarios.css';
import './Auditoria.css';

/* ─────────────────────────── constants ─────────────────────────── */

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
    otros: 'Otros',
};

const LABEL_ESTADO = {
    aprobado: 'Aprobado',
    pendiente: 'Pendiente',
    rechazado: 'Rechazado',
};

// paleta corporativa coherente con el resto del panel
const COLORES_ESTADO = {
    aprobado: '#059669',
    pendiente: '#D97706',
    rechazado: '#DC2626',
};

const COLORES_TIPO = [
    '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6B7280',
];

const COLORES_BARRA = '#3B82F6';

/* ─────────────────────────── helpers ─────────────────────────── */

function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value);
}

function formatFechaHora(iso) {
    const d = new Date(iso);
    return d.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/* Tooltip personalizado COP */
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

/* ─────────────────────────── computeChartData ─────────────────────────── */

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
                ? u.nombre_completo || u.correo
                : `Usuario #${uid}`;
        }
    }
    const porTecnico = Object.entries(gastoTecnico)
        .map(([uid, total]) => ({ nombre: nombreTecnico[uid], total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    // 2. Distribución por estado (conteo de viáticos)
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

    // 5. Evolución mensual
    const gastoMes = {};
    for (const v of viaticos) {
        if (!v.fecha) continue;
        const [year, month] = v.fecha.split('-');
        const key = `${year}-${month}`;
        gastoMes[key] = (gastoMes[key] || 0) + Number(v.valor || 0);
    }
    const porMes = Object.entries(gastoMes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, total]) => {
            const [year, month] = mes.split('-');
            const d = new Date(Number(year), Number(month) - 1);
            const label = d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
            return { mes: label, total };
        });

    return { porTecnico, porEstado, porTipo, porCiudad, porMes };
}

/* ─────────────────────────── component ─────────────────────────── */

export default function Auditoria() {
    const navigate = useNavigate();
    const { user } = useAuth();

    // timeline state
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [accionFiltro, setAccionFiltro] = useState('');

    // analytics state
    const [viaticos, setViaticos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [loadingAnalytics, setLoadingAnalytics] = useState(true);

    /* fetch timeline */
    async function cargar() {
        setLoading(true);
        setError('');
        try {
            const { data } = await listarAuditoria({
                accion: accionFiltro || undefined,
                limit: 100,
            });
            setLogs(data);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo cargar la actividad administrativa.');
        } finally {
            setLoading(false);
        }
    }

    /* fetch analytics data */
    async function cargarAnalytics() {
        setLoadingAnalytics(true);
        try {
            const [resV, resU] = await Promise.all([
                api.get('/admin/viaticos'),
                api.get('/admin/usuarios'),
            ]);
            setViaticos(resV.data);
            setUsuarios(resU.data);
        } catch {
            // silently fail — charts will show empty state
        } finally {
            setLoadingAnalytics(false);
        }
    }

    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accionFiltro]);

    useEffect(() => {
        cargarAnalytics();
    }, []);

    const chartData = useMemo(
        () => computeChartData(viaticos, usuarios),
        [viaticos, usuarios]
    );

    if (user && user.rol !== 'superadmin') {
        return <Navigate to="/admin" replace />;
    }

    const hayDatos = viaticos.length > 0;

    return (
        <div className="admin-root">
            <div className="admin-container">
                <div className="admin-page-header">
                    <div>
                        <button className="admin-back-btn" onClick={() => navigate('/admin')}>
                            ← Volver
                        </button>
                    </div>
                    <h1 className="admin-page-title">📊 Panel analítico</h1>
                    <p className="admin-page-sub">Análisis de viáticos, técnicos y actividad administrativa</p>
                </div>

                {/* ─── SECCIÓN ANALÍTICA ─── */}
                <section className="aud-analytics-section">
                    <div className="aud-analytics-header">
                        <h2 className="aud-analytics-title">Análisis de viáticos por técnico</h2>
                        <span className="aud-analytics-sub">
                            {hayDatos
                                ? `${viaticos.length} viáticos · ${usuarios.length} usuarios`
                                : 'Sin datos'}
                        </span>
                    </div>

                    {loadingAnalytics ? (
                        <div className="aud-analytics-loading">Cargando análisis…</div>
                    ) : !hayDatos ? (
                        <div className="aud-analytics-empty">
                            No hay viáticos registrados todavía para generar estadísticas.
                        </div>
                    ) : (
                        <div className="aud-charts-grid">

                            {/* 1. Gasto por técnico */}
                            <div className="aud-chart-card aud-chart-card--wide">
                                <p className="aud-chart-title">💰 Gasto total por técnico</p>
                                <p className="aud-chart-sub">Top 10 · de mayor a menor</p>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart
                                        data={chartData.porTecnico}
                                        margin={{ top: 8, right: 16, left: 0, bottom: 60 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis
                                            dataKey="nombre"
                                            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                            angle={-35}
                                            textAnchor="end"
                                            interval={0}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                            tickFormatter={(v) =>
                                                new Intl.NumberFormat('es-CO', {
                                                    notation: 'compact',
                                                    currency: 'COP',
                                                    style: 'currency',
                                                    minimumFractionDigits: 0,
                                                }).format(v)
                                            }
                                            width={80}
                                        />
                                        <Tooltip content={<TooltipCOP />} />
                                        <Bar dataKey="total" fill={COLORES_BARRA} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 2. Distribución por estado */}
                            <div className="aud-chart-card">
                                <p className="aud-chart-title">📋 Viáticos por estado</p>
                                <p className="aud-chart-sub">Distribución del total</p>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={chartData.porEstado}
                                            cx="50%"
                                            cy="45%"
                                            outerRadius={75}
                                            dataKey="value"
                                            label={({ name, percent }) =>
                                                `${name} ${(percent * 100).toFixed(0)}%`
                                            }
                                            labelLine={false}
                                        >
                                            {chartData.porEstado.map((entry) => (
                                                <Cell
                                                    key={entry.estado}
                                                    fill={COLORES_ESTADO[entry.estado] || '#94A3B8'}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value) => [`${value} viáticos`, 'Cantidad']}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 3. Gasto por tipo_gasto */}
                            <div className="aud-chart-card">
                                <p className="aud-chart-title">🗂️ Gasto por tipo</p>
                                <p className="aud-chart-sub">Distribución del monto total</p>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={chartData.porTipo}
                                            cx="50%"
                                            cy="45%"
                                            outerRadius={75}
                                            dataKey="value"
                                            label={({ name, percent }) =>
                                                `${name} ${(percent * 100).toFixed(0)}%`
                                            }
                                            labelLine={false}
                                        >
                                            {chartData.porTipo.map((entry, i) => (
                                                <Cell
                                                    key={entry.name}
                                                    fill={COLORES_TIPO[i % COLORES_TIPO.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<TooltipPie />} />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 4. Gasto por ciudad */}
                            <div className="aud-chart-card aud-chart-card--wide">
                                <p className="aud-chart-title">🏙️ Gasto por ciudad</p>
                                <p className="aud-chart-sub">Top 8 ciudades</p>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart
                                        data={chartData.porCiudad}
                                        margin={{ top: 8, right: 16, left: 0, bottom: 50 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis
                                            dataKey="ciudad"
                                            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                            angle={-30}
                                            textAnchor="end"
                                            interval={0}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                            tickFormatter={(v) =>
                                                new Intl.NumberFormat('es-CO', {
                                                    notation: 'compact',
                                                    currency: 'COP',
                                                    style: 'currency',
                                                    minimumFractionDigits: 0,
                                                }).format(v)
                                            }
                                            width={80}
                                        />
                                        <Tooltip content={<TooltipCOP />} />
                                        <Bar dataKey="total" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 5. Evolución mensual */}
                            <div className="aud-chart-card aud-chart-card--full">
                                <p className="aud-chart-title">📈 Evolución mensual del gasto</p>
                                <p className="aud-chart-sub">Gasto total agrupado por mes</p>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart
                                        data={chartData.porMes}
                                        margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis
                                            dataKey="mes"
                                            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                            tickFormatter={(v) =>
                                                new Intl.NumberFormat('es-CO', {
                                                    notation: 'compact',
                                                    currency: 'COP',
                                                    style: 'currency',
                                                    minimumFractionDigits: 0,
                                                }).format(v)
                                            }
                                            width={80}
                                        />
                                        <Tooltip content={<TooltipCOP />} />
                                        <Bar dataKey="total" fill="#10B981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                        </div>
                    )}
                </section>

                {/* ─── TIMELINE ACTIVIDAD ADMINISTRATIVA ─── */}
                <div className="admin-card-container auditoria-container-card">
                    <div className="aud-timeline-section-header">
                        <h2 className="aud-analytics-title">🗒️ Actividad administrativa</h2>
                        <p className="admin-page-sub" style={{ margin: 0 }}>
                            Registro de auditoría y trazabilidad de acciones del sistema
                        </p>
                    </div>

                    <div className="admin-card-toolbar">
                        <div className="auditoria-filtros-wrap">
                            <select
                                className="admin-select"
                                value={accionFiltro}
                                onChange={(e) => setAccionFiltro(e.target.value)}
                            >
                                <option value="">Todas las acciones</option>
                                {Object.entries(LABEL_ACCION).map(([valor, label]) => (
                                    <option key={valor} value={valor}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <span className="admin-user-count">Mostrando: {logs.length} evento(s)</span>
                    </div>

                    {error && (
                        <div className="admin-error-banner">{error}</div>
                    )}

                    {loading ? (
                        <div className="admin-loading-state">
                            <p>Cargando registros de actividad…</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="admin-loading-state">
                            <p>No hay actividad registrada todavía.</p>
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
    );
}
