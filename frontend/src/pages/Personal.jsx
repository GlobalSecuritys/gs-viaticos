import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
    LABEL_CARGO,
    formatFechaCorta,
    iniciales,
    obtenerAsignacionActual,
} from '../utils/personal';
import './Personal.css';

export default function Personal() {
    const navigate = useNavigate();

    const [usuarios, setUsuarios] = useState([]);
    const [viaticos, setViaticos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
                setError('No se pudo cargar el personal.');
            } finally {
                setLoading(false);
            }
        }
        cargar();
    }, []);

    const empleados = useMemo(() => {
        return usuarios.map((u) => {
            const viaticosUsuario = viaticos.filter((v) => v.usuario_id === u.id);
            const asignacion = obtenerAsignacionActual(viaticosUsuario);
            return { ...u, asignacion };
        });
    }, [usuarios, viaticos]);

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

                                {e.asignacion ? (
                                    <>
                                        <p className="personal-card-asignacion">
                                            {e.asignacion.ot} - {e.asignacion.ciudad}
                                        </p>
                                        <p className="personal-card-fechas">
                                            {formatFechaCorta(e.asignacion.inicio)} → {formatFechaCorta(e.asignacion.final)}
                                        </p>
                                    </>
                                ) : (
                                    <p className="personal-card-sin-asignacion">Sin viáticos registrados</p>
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
