import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './AdminDashboard.css';
import './AdminUsuarios.css';

const LABEL_TIPO = {
    alimentacion: 'Alimentación',
    transporte: 'Transporte',
    hotel: 'Hotel',
    peajes: 'Peajes',
    parqueadero: 'Parqueadero',
    otros: 'Otros',
};

function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value);
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

export default function AdminViaticos() {
    const navigate = useNavigate();
    const [viaticos, setViaticos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [procesando, setProcesando] = useState(null);

    async function cargarViaticos() {
        try {
            const { data } = await api.get('/admin/viaticos');
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

    async function actualizarEstado(id, accion) {
        setProcesando(id);
        try {
            const { data: actualizado } = await api.put(`/admin/viaticos/${id}/${accion}`);
            setViaticos((prev) =>
                prev.map((v) => (v.id === id ? { ...v, estado: actualizado.estado } : v))
            );
        } catch {
            setError(`No se pudo ${accion === 'aprobar' ? 'aprobar' : 'rechazar'} el viático.`);
        } finally {
            setProcesando(null);
        }
    }

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                <h1 className="admin-page-title">Gestión de Viáticos</h1>

                {loading && <p>Cargando…</p>}
                {error && <p className="form-error">{error}</p>}

                {!loading && !error && (
                    <div className="mv-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Nombre</th>
                                    <th>Correo</th>
                                    <th>Cliente</th>
                                    <th>Ciudad</th>
                                    <th>OT</th>
                                    <th>Tipo de Gasto</th>
                                    <th className="text-right">Valor</th>
                                    <th className="text-center">Estado</th>
                                    <th>Fecha</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {viaticos.map((v) => (
                                    <tr key={v.id}>
                                        <td>{v.codigo_empleado || '—'}</td>
                                        <td>{v.nombre}</td>
                                        <td>{v.correo}</td>
                                        <td>{v.cliente}</td>
                                        <td>{v.ciudad}</td>
                                        <td>{v.ot}</td>
                                        <td>{LABEL_TIPO[v.tipo_gasto] || v.tipo_gasto}</td>
                                        <td className="text-right">{formatCOP(v.valor)}</td>
                                        <td className="text-center">
                                            <span className={`rol-badge rol-badge--${v.estado}`}>{v.estado}</span>
                                        </td>
                                        <td>{formatDate(v.fecha)}</td>
                                        <td>
                                            {v.estado === 'pendiente' && (
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button
                                                        className="admin-mini-btn"
                                                        disabled={procesando === v.id}
                                                        onClick={() => actualizarEstado(v.id, 'aprobar')}
                                                    >
                                                        {procesando === v.id ? '…' : 'Aprobar'}
                                                    </button>
                                                    <button
                                                        className="admin-mini-btn"
                                                        disabled={procesando === v.id}
                                                        onClick={() => actualizarEstado(v.id, 'rechazar')}
                                                    >
                                                        {procesando === v.id ? '…' : 'Rechazar'}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}