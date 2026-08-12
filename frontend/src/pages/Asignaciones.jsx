import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { listarAsignaciones } from '../services/asignaciones';
import { TIPOS_ASIGNACION, LABEL_TIPO_ASIGNACION, ESTADOS_ASIGNACION, LABEL_ESTADO_ASIGNACION, filtrarAsignaciones } from '../utils/asignaciones';
import { formatCOP } from '../utils/personal';
import AsignacionCard from '../components/AsignacionCard';
import './Asignaciones.css';

export default function Asignaciones() {
    const navigate = useNavigate();

    const [asignaciones, setAsignaciones] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [tipo, setTipo] = useState('');
    const [estado, setEstado] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function cargar() {
            try {
                const [resAsignaciones, resUsuarios] = await Promise.all([
                    listarAsignaciones(),
                    api.get('/admin/usuarios'),
                ]);
                const usuariosPorId = new Map(resUsuarios.data.map((u) => [String(u.id), u]));
                setAsignaciones(
                    resAsignaciones.data.map((a) => ({
                        ...a,
                        tecnico_nombre: usuariosPorId.get(String(a.tecnico_id))?.nombre || a.tecnico_nombre,
                    }))
                );
            } catch {
                setError('No se pudieron cargar las asignaciones.');
            } finally {
                setLoading(false);
            }
        }
        cargar();
    }, []);

    const filtradas = useMemo(
        () => filtrarAsignaciones(asignaciones, { busqueda, tipo, estado }),
        [asignaciones, busqueda, tipo, estado]
    );

    // Métricas del resumen ejecutivo
    const metricas = useMemo(() => {
        const total = asignaciones.length;
        const enCurso = asignaciones.filter((a) => a.estado === 'en_curso').length;
        const pendientes = asignaciones.filter((a) => a.estado === 'pendiente').length;
        const finalizadas = asignaciones.filter((a) => a.estado === 'finalizada').length;
        
        const totalAnticipos = asignaciones.reduce((acc, a) => acc + Number(a.monto_anticipo || 0), 0);
        const totalGastado = asignaciones.reduce((acc, a) => acc + Number(a.total_gastado || 0), 0);
        const totalSaldo = asignaciones.reduce((acc, a) => acc + Number(a.saldo_restante || 0), 0);

        return {
            total,
            enCurso,
            pendientes,
            finalizadas,
            totalAnticipos,
            totalGastado,
            totalSaldo,
        };
    }, [asignaciones]);

    return (
        <div className="admin-root">
            <div className="admin-container">
                {/* Header */}
                <div className="admin-page-header">
                    <div>
                        <button className="admin-back-btn" onClick={() => navigate('/admin')}>
                            ← Volver al Panel
                        </button>
                    </div>
                    <div className="asig-title-row">
                        <div>
                            <h1 className="admin-page-title">Gestión de Asignaciones</h1>
                            <p className="admin-page-sub">
                                Misiones operativas, anticipos a técnicos y control de legalización
                            </p>
                        </div>
                        <button className="asig-btn-nueva" onClick={() => navigate('/admin/asignaciones/nueva')}>
                            ✨ + Nueva Asignación
                        </button>
                    </div>
                </div>

                {/* Executive Summary Metric Cards */}
                {!loading && (
                    <div className="asig-stats-grid">
                        <div className="asig-stat-card">
                            <span className="asig-stat-icon">📋</span>
                            <div className="asig-stat-info">
                                <span className="asig-stat-label">Total Misiones</span>
                                <span className="asig-stat-val">{metricas.total}</span>
                            </div>
                        </div>
                        <div className="asig-stat-card">
                            <span className="asig-stat-icon">⚡</span>
                            <div className="asig-stat-info">
                                <span className="asig-stat-label">En Curso</span>
                                <span className="asig-stat-val text-success">{metricas.enCurso}</span>
                            </div>
                        </div>
                        <div className="asig-stat-card">
                            <span className="asig-stat-icon">⏳</span>
                            <div className="asig-stat-info">
                                <span className="asig-stat-label">Pendientes</span>
                                <span className="asig-stat-val text-warning">{metricas.pendientes}</span>
                            </div>
                        </div>
                        <div className="asig-stat-card">
                            <span className="asig-stat-icon">💰</span>
                            <div className="asig-stat-info">
                                <span className="asig-stat-label">Anticipos Entregados</span>
                                <span className="asig-stat-val">{formatCOP(metricas.totalAnticipos)}</span>
                            </div>
                        </div>
                        <div className="asig-stat-card">
                            <span className="asig-stat-icon">📊</span>
                            <div className="asig-stat-info">
                                <span className="asig-stat-label">Total Ejecutado / Gastado</span>
                                <span className="asig-stat-val text-blue">{formatCOP(metricas.totalGastado)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Filtros */}
                <div className="asig-filtros-card">
                    <div className="asig-filtros">
                        <div className="admin-search-wrap">
                            <span className="admin-search-icon">🔍</span>
                            <input
                                type="text"
                                placeholder="Buscar por técnico, cliente, proyecto o ciudad..."
                                className="admin-search-input"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                            />
                        </div>
                        <select className="admin-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                            <option value="">Todos los tipos</option>
                            {TIPOS_ASIGNACION.map((t) => (
                                <option key={t} value={t}>{LABEL_TIPO_ASIGNACION[t]}</option>
                            ))}
                        </select>
                        <select className="admin-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
                            <option value="">Todos los estados</option>
                            {ESTADOS_ASIGNACION.map((e) => (
                                <option key={e} value={e}>{LABEL_ESTADO_ASIGNACION[e]}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && <div className="admin-error-banner">{error}</div>}

                {!loading && !error && (
                    <div className="asig-counter-row">
                        <p className="asig-contador">
                            Mostrando <strong>{filtradas.length}</strong> de <strong>{asignaciones.length}</strong> asignaciones
                        </p>
                        {(busqueda || tipo || estado) && (
                            <button
                                className="asig-clear-filters"
                                onClick={() => { setBusqueda(''); setTipo(''); setEstado(''); }}
                            >
                                🧹 Limpiar filtros
                            </button>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="admin-loading-state">
                        <p>Cargando asignaciones...</p>
                    </div>
                ) : filtradas.length === 0 ? (
                    <div className="asig-empty-box">
                        <span className="asig-empty-icon">📂</span>
                        <h3>No se encontraron asignaciones</h3>
                        <p>Intenta ajustar los filtros de búsqueda o registra una nueva asignaciones para el equipo técnico.</p>
                    </div>
                ) : (
                    <div className="asig-grid">
                        {filtradas.map((a) => (
                            <AsignacionCard
                                key={a.id}
                                asignacion={a}
                                onClick={() => navigate(`/admin/asignaciones/${a.id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
