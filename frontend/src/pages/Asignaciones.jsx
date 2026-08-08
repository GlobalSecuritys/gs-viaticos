import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { listarAsignaciones } from '../services/asignaciones';
import { TIPOS_ASIGNACION, LABEL_TIPO_ASIGNACION, ESTADOS_ASIGNACION, LABEL_ESTADO_ASIGNACION, filtrarAsignaciones } from '../utils/asignaciones';
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
                // Enriquecemos con el nombre del técnico para búsqueda/lectura rápida
                // sin depender de que el backend lo incluya ya resuelto.
                const usuariosPorId = new Map(resUsuarios.data.map((u) => [String(u.id), u]));
                setAsignaciones(
                    resAsignaciones.data.map((a) => ({
                        ...a,
                        tecnico_nombre: usuariosPorId.get(String(a.tecnico_id))?.nombre,
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

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>

                <div className="asig-header">
                    <h1 className="admin-page-title">Asignaciones</h1>
                    <button className="personal-card-btn asig-btn-nueva" onClick={() => navigate('/admin/asignaciones/nueva')}>
                        + Nueva asignación
                    </button>
                </div>

                <div className="asig-filtros">
                    <input
                        type="text"
                        placeholder="Buscar por técnico, cliente, empresa o ciudad..."
                        className="admin-search-input"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                    <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                        <option value="">Todos los tipos</option>
                        {TIPOS_ASIGNACION.map((t) => (
                            <option key={t} value={t}>{LABEL_TIPO_ASIGNACION[t]}</option>
                        ))}
                    </select>
                    <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                        <option value="">Todos los estados</option>
                        {ESTADOS_ASIGNACION.map((e) => (
                            <option key={e} value={e}>{LABEL_ESTADO_ASIGNACION[e]}</option>
                        ))}
                    </select>
                </div>

                {error && <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error}</p>}

                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando asignaciones...</p>
                ) : filtradas.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>No se encontraron asignaciones.</p>
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
