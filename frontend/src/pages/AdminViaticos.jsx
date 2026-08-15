import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import ModalEvidencia from '../components/ModalEvidencia';
import './AdminDashboard.css';
import './AdminUsuarios.css';

export default function AdminViaticos() {
    const navigate = useNavigate();
    const [viaticos, setViaticos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [seleccionado, setSeleccionado] = useState(null);

    async function cargarViaticos() {
        try {
            const { data } = await api.get('/admin/viaticos');
            console.log(data);

            setViaticos(data);
        } catch {
            setError('No se pudieron cargar los viáticos.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarViaticos();
    }, []);

    const [mensajeFeedback, setMensajeFeedback] = useState('');

    async function aprobar(id, comentario) {
        setError('');
        setMensajeFeedback(`✅ Viático aprobado correctamente${comentario ? ` — Comentario enviado: "${comentario}"` : ''}`);
        setSeleccionado(null);
        cargarViaticos();
    }

    async function rechazar(id, comentario) {
        setError('');
        setMensajeFeedback(`❌ Viático rechazado correctamente${comentario ? ` — Motivo enviado: "${comentario}"` : ''}`);
        setSeleccionado(null);
        cargarViaticos();
    }

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                <h1 className="admin-page-title">Gestionar Viáticos</h1>

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

                {error && <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error}</p>}

                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando viáticos...</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Técnico</th>
                                <th>Origen</th>
                                <th>Cliente</th>
                                <th>Fecha</th>
                                <th>Evidencia</th>
                                <th>Estado</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {viaticos.map((v) => (
                                <tr key={v.id}>
                                    <td>{v.nombre}</td>
                                    <td>
                                        {v.asignacion_id ? (
                                            <span style={{ fontSize: '0.75rem', background: '#EFF6FF', color: '#1D4ED8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                                📍 Asignación #{v.asignacion_id}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 500 }}>
                                                📄 Independiente
                                            </span>
                                        )}
                                    </td>
                                    <td>{v.cliente}</td>
                                    <td>{v.fecha}</td>
                                    <td>
                                        {v.evidencias?.length > 0 ? `📎 ${v.evidencias.length}` : 'Sin fotos'}
                                    </td>
                                    <td>
                                        <span className={`rol-badge rol-badge--${v.estado === 'pendiente' ? 'tecnico' : v.estado === 'aprobado' ? 'admin' : 'tecnico'}`}>
                                            {v.estado.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="admin-mini-btn" onClick={() => setSeleccionado(v)}>
                                            Ver detalle
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {seleccionado && (
                <ModalEvidencia
                    viatico={seleccionado}
                    onClose={() => setSeleccionado(null)}
                    onAprobar={aprobar}
                    onRechazar={rechazar}
                    onPresupuestoActualizado={(v) => {
                        setViaticos((prev) => prev.map((x) => (x.id === v.id ? v : x)));
                        setSeleccionado(v);
                    }}
                />
            )}
        </div>
    );
}