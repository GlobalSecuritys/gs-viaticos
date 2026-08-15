import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import ModalCuentaCobro from '../components/ModalCuentaCobro';
import './AdminDashboard.css';
import './CuentaCobro.css';

function formatCOP(val) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(Number(val) || 0);
}

export default function AdminCuentasCobro() {
    const navigate = useNavigate();
    const [cuentas, setCuentas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);

    async function cargarCuentas() {
        try {
            setLoading(true);
            const { data } = await api.get('/cuentas-cobro');
            setCuentas(data || []);
        } catch {
            setError('No se pudieron cargar las cuentas de cobro emitidas.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarCuentas();
    }, []);

    const cuentasFiltradas = useMemo(() => {
        return cuentas.filter((c) => {
            if (filtroEstado !== 'todos' && (c.estado || 'pendiente') !== filtroEstado) {
                return false;
            }
            if (!busqueda.trim()) return true;
            const query = busqueda.toLowerCase();
            const titular = (c.titular_nombre || '').toLowerCase();
            const cedula = (c.titular_cedula || '').toLowerCase();
            const concepto = (c.concepto_servicio || '').toLowerCase();
            const consecutivo = String(c.consecutivo || c.id).toLowerCase();
            const ciudad = (c.ciudad || '').toLowerCase();
            return (
                titular.includes(query) ||
                cedula.includes(query) ||
                concepto.includes(query) ||
                consecutivo.includes(query) ||
                ciudad.includes(query)
            );
        });
    }, [cuentas, busqueda, filtroEstado]);

    const totalGeneral = useMemo(() => {
        return cuentasFiltradas.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
    }, [cuentasFiltradas]);

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin')}>
                    ← Volver al Panel
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <h1 className="admin-page-title" style={{ margin: 0 }}>💵 Gestión de Cuentas de Cobro</h1>
                        <p style={{ margin: '0.3rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
                            Consulta, revisa e imprime las cuentas de cobro generadas por los técnicos con el formato oficial.
                        </p>
                    </div>

                    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '0.6rem 1.2rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400E' }}>Total Cuentas Filtradas:</span>
                        <strong style={{ fontSize: '1.1rem', color: '#B45309' }}>{formatCOP(totalGeneral)}</strong>
                    </div>
                </div>

                {error && <p className="dash-error">{error}</p>}

                {/* Tarjeta de Filtros y Búsqueda */}
                <div className="admin-card-container" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div className="admin-search-wrap" style={{ maxWidth: '380px', width: '100%' }}>
                            <span className="admin-search-icon">🔍</span>
                            <input
                                type="text"
                                placeholder="Buscar por técnico, cédula, concepto..."
                                className="admin-search-input"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Estado:</span>
                            <select
                                value={filtroEstado}
                                onChange={(e) => setFiltroEstado(e.target.value)}
                                style={{
                                    padding: '0.45rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1.5px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                }}
                            >
                                <option value="todos">Todos los estados</option>
                                <option value="pendiente">Pendientes</option>
                                <option value="aprobado">Aprobadas</option>
                                <option value="pagado">Pagadas</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Tabla de Cuentas de Cobro */}
                <div className="admin-card-container">
                    {loading ? (
                        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando cuentas de cobro...</p>
                    ) : cuentasFiltradas.length === 0 ? (
                        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No se encontraron cuentas de cobro con los filtros seleccionados.</p>
                    ) : (
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Consecutivo</th>
                                        <th>Fecha</th>
                                        <th>Técnico / Titular</th>
                                        <th>Cédula</th>
                                        <th>Concepto del Servicio</th>
                                        <th>Banco / Cuenta</th>
                                        <th>Valor Total</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'center' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cuentasFiltradas.map((c) => (
                                        <tr key={c.id}>
                                            <td>
                                                <span style={{ fontWeight: 700, color: '#0F172A' }}>
                                                    No. {c.consecutivo || `${c.fecha?.split('-')?.[0] || '2026'}-${c.id}`}
                                                </span>
                                            </td>
                                            <td>{c.fecha}</td>
                                            <td><strong>{c.titular_nombre || `Usuario #${c.usuario_id}`}</strong></td>
                                            <td>{c.titular_cedula || c.identificacion || '—'}</td>
                                            <td style={{ maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {c.concepto_servicio}
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                    {c.banco} ({c.tipo_cuenta})<br />
                                                    <strong>N° {c.numero_cuenta}</strong>
                                                </span>
                                            </td>
                                            <td>
                                                <strong style={{ color: 'var(--color-primary-blue)' }}>
                                                    {formatCOP(c.total)}
                                                </strong>
                                            </td>
                                            <td>
                                                <span className={`estado-badge estado-badge--${c.estado === 'aprobado' ? 'activo' : 'inactivo'}`}>
                                                    {(c.estado || 'PENDIENTE').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    className="admin-mini-btn"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                                    onClick={() => setCuentaSeleccionada(c)}
                                                >
                                                    👁️ Ver Formato Oficial
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal con Formato Idéntico al del Técnico */}
            {cuentaSeleccionada && (
                <ModalCuentaCobro
                    cuenta={cuentaSeleccionada}
                    onClose={() => setCuentaSeleccionada(null)}
                />
            )}
        </div>
    );
}
