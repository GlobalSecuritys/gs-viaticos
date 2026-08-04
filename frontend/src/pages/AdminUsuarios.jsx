import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './AdminDashboard.css';
import './AdminUsuarios.css';

export default function AdminUsuarios() {
    const navigate = useNavigate();
    const [usuarios, setUsuarios] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function cargarUsuarios() {
        try {
            const { data } = await api.get('/admin/usuarios');
            setUsuarios(data);
        } catch (err) {
            setError('No se pudieron cargar los usuarios');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarUsuarios();
    }, []);

    async function cambiarRol(id, rolActual) {
        const nuevoRol = rolActual === 'admin' ? 'tecnico' : 'admin';
        try {
            await api.put(`/admin/usuarios/${id}/rol`, { rol: nuevoRol });
            await cargarUsuarios();
        } catch (err) {
            setError('No se pudo cambiar el rol');
        }
    }

    const filtrados = usuarios.filter((u) =>
        u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        u.codigo_empleado?.toLowerCase().includes(busqueda.toLowerCase()) ||
        u.correo.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                <h1 className="admin-page-title">Usuarios</h1>

                <input
                    type="text"
                    placeholder="Buscar por nombre, código o correo..."
                    className="admin-search-input"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />

                {error && <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error}</p>}
                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando usuarios...</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nombre</th>
                                <th>Correo</th>
                                <th>Rol</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map((u) => (
                                <tr key={u.id}>
                                    <td>{u.codigo_empleado || '—'}</td>                                    <td>{u.nombre}</td>
                                    <td>{u.correo}</td>
                                    <td>
                                        <span className={`rol-badge rol-badge--${u.rol}`}>{u.rol.toUpperCase()}</span>
                                    </td>
                                    <td>
                                        <button className="admin-mini-btn" onClick={() => cambiarRol(u.id, u.rol)}>
                                            Cambiar a {u.rol === 'admin' ? 'Técnico' : 'Admin'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}