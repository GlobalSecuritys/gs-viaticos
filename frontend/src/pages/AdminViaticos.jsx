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

    async function aprobar(id) {
        try {
            await api.put(`/admin/viaticos/${id}/aprobar`);
            setSeleccionado(null);
            cargarViaticos();
        } catch {
            setError('No se pudo aprobar el viático.');
        }
    }

    async function rechazar(id) {
        try {
            await api.put(`/admin/viaticos/${id}/rechazar`);
            setSeleccionado(null);
            cargarViaticos();
        } catch {
            setError('No se pudo rechazar el viático.');
        }
    }

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                <h1 className="admin-page-title">Gestionar Viáticos</h1>

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