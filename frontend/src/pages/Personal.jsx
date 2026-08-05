import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { listarAsignaciones } from '../services/asignaciones';
import {
    LABEL_CARGO,
    formatFechaCorta,
    iniciales,
} from '../utils/personal';
import { LABEL_TIPO_ASIGNACION, obtenerAsignacionActivaDeTecnico } from '../utils/asignaciones';
import './Personal.css';

export default function Personal() {
    const navigate = useNavigate();

    const [usuarios, setUsuarios] = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function cargar() {
            try {
                const { data } = await api.get('/admin/usuarios');
                setUsuarios(data);
            } catch {
                setError('No se pudo cargar el personal.');
            } finally {
                setLoading(false);
            }

            // Las asignaciones se cargan aparte y de forma tolerante: mientras el
            // backend de Fase 2 no exista todavía, la tarjeta simplemente mostrará
            // "Sin asignación activa" en vez de romper la carga de Personal.
            try {
                const resAsignaciones = await listarAsignaciones();
                setAsignaciones(resAsignaciones.data);
            } catch {
                setAsignaciones([]);
            }
        }
        cargar();
    }, []);

    const empleados = useMemo(() => {
        return usuarios.map((u) => {
            const asignacionActiva = obtenerAsignacionActivaDeTecnico(asignaciones, u.id);
            return { ...u, asignacionActiva };
        });
    }, [usuarios, asignaciones]);

    const filtrados = empleados.filter((e) =>
        e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.codigo_empleado?.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.correo.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin')}>
                    ← Volver
                </button>

                <h1 className="admin-page-title">Personal</h1>

                <input
                    type="text"
                    placeholder="Buscar por nombre, código o correo..."
                    className="admin-search-input"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />

                {error && <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error}</p>}

                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando personal...</p>
                ) : filtrados.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>No se encontró personal.</p>
                ) : (
                    <div className="personal-grid">
                        {filtrados.map((e) => (
                            <div key={e.id} className={`personal-card ${!e.activo ? 'personal-card--inactivo' : ''}`}>
                                <div className="personal-card-avatar">{iniciales(e.nombre)}</div>

                                <h3 className="personal-card-nombre">{e.nombre}</h3>

                                <span className={`rol-badge rol-badge--${e.rol}`}>
                                    {LABEL_CARGO[e.rol] || e.rol}
                                </span>

                                {e.asignacionActiva ? (
                                    <>
                                        <p className="personal-card-asignacion">
                                            {LABEL_TIPO_ASIGNACION[e.asignacionActiva.tipo] || e.asignacionActiva.tipo} - {e.asignacionActiva.ciudad}
                                        </p>
                                        <p className="personal-card-fechas">
                                            {formatFechaCorta(e.asignacionActiva.fecha_inicio)} → {formatFechaCorta(e.asignacionActiva.fecha_fin)}
                                        </p>
                                    </>
                                ) : (
                                    <p className="personal-card-sin-asignacion">Sin asignación activa</p>
                                )}

                                <button
                                    className="personal-card-btn"
                                    onClick={() => navigate(`/admin/personal/${e.id}`)}
                                >
                                    Ver información
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
