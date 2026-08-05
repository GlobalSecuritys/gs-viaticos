import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
    LABEL_CARGO,
    contarViaticos,
    contarViaticosHoy,
    etiquetaDiasDesde,
    iniciales,
    obtenerActividadReciente,
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
        return usuarios.map((usuario) => {
            const viaticosUsuario = viaticos.filter(
                (viatico) => String(viatico.usuario_id) === String(usuario.id)
            );

            return {
                ...usuario,
                actividad: obtenerActividadReciente(viaticosUsuario),
                totalViaticos: contarViaticos(viaticosUsuario),
                hoyCount: contarViaticosHoy(viaticosUsuario),
            };
        });
    }, [usuarios, viaticos]);

    const textoBusqueda = busqueda.toLowerCase();

    const filtrados = empleados.filter((empleado) =>
        (empleado.nombre || '').toLowerCase().includes(textoBusqueda) ||
        (empleado.codigo_empleado || '').toLowerCase().includes(textoBusqueda) ||
        (empleado.correo || '').toLowerCase().includes(textoBusqueda)
    );

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button
                    className="admin-back-btn"
                    onClick={() => navigate('/admin')}
                >
                    ← Volver
                </button>

                <h1 className="admin-page-title">Personal</h1>

                <input
                    type="text"
                    placeholder="Buscar por nombre, código o correo..."
                    className="admin-search-input"
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                />

                {error && (
                    <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>
                        {error}
                    </p>
                )}

                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>
                        Cargando personal...
                    </p>
                ) : filtrados.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>
                        No se encontró personal.
                    </p>
                ) : (
                    <div className="personal-grid">
                        {filtrados.map((empleado) => (
                            <div
                                key={empleado.id}
                                className={`personal-card ${!empleado.activo
                                    ? 'personal-card--inactivo'
                                    : ''
                                    }`}
                            >
                                <div className="personal-card-avatar">
                                    {iniciales(empleado.nombre)}
                                </div>

                                <h3 className="personal-card-nombre">
                                    {empleado.nombre}
                                </h3>

                                <span className={`rol-badge rol-badge--${empleado.rol}`}>
                                    {LABEL_CARGO[empleado.rol] || empleado.rol}
                                </span>

                                {empleado.hoyCount > 0 ? (
                                    <p className="personal-card-actividad">
                                        Hoy registró {empleado.hoyCount} viático
                                        {empleado.hoyCount > 1 ? 's' : ''}
                                    </p>
                                ) : empleado.actividad ? (
                                    <p className="personal-card-actividad">
                                        {etiquetaDiasDesde(
                                            empleado.actividad.diasDesde
                                        )}
                                    </p>
                                ) : (
                                    <p className="personal-card-sin-asignacion">
                                        Sin viáticos registrados
                                    </p>
                                )}

                                <p className="personal-card-total">
                                    {empleado.totalViaticos} viático
                                    {empleado.totalViaticos !== 1 ? 's' : ''} registrados
                                </p>

                                <button
                                    className="personal-card-btn"
                                    onClick={() =>
                                        navigate(`/admin/personal/${empleado.id}`)
                                    }
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