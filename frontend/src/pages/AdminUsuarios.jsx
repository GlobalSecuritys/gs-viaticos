import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './AdminDashboard.css';
import './AdminUsuarios.css';

import { formatApiError } from '../utils/formatError';

export default function AdminUsuarios() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [usuarios, setUsuarios] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function cargarUsuarios() {
        try {
            const { data } = await api.get('/admin/usuarios');
            setUsuarios(data);
        } catch {
            setError('No se pudieron cargar los usuarios');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarUsuarios();
    }, []);

    async function cambiarRol(id, nuevoRol) {
        try {
            await api.put(`/admin/usuarios/${id}/rol`, {
                rol: nuevoRol,
            });

            cargarUsuarios();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cambiar el rol'));
        }
    }

    async function cambiarEstado(id, nuevoActivo) {
        try {
            await api.put(`/admin/usuarios/${id}/estado`, {
                activo: nuevoActivo,
            });

            cargarUsuarios();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cambiar el estado'));
        }
    }

    const filtrados = usuarios.filter((u) =>
        u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        u.codigo_empleado?.toLowerCase().includes(busqueda.toLowerCase()) ||
        u.correo.toLowerCase().includes(busqueda.toLowerCase())
    );

    if (user && user.rol !== 'superadmin') {
        return <Navigate to="/admin" replace />;
    }

    return (
        <div className="admin-root">
            <div className="admin-container">

                <div className="admin-page-header">
                    <div>
                        <button
                            className="admin-back-btn"
                            onClick={() => navigate('/admin')}
                        >
                            ← Volver
                        </button>
                    </div>
                    <h1 className="admin-page-title">
                        Administración de Usuarios
                    </h1>
                    <p className="admin-page-sub">
                        Gestión centralizada de cuentas, roles y estados del personal GSB
                    </p>
                </div>

                <div className="admin-card-container">
                    <div className="admin-card-toolbar">
                        <div className="admin-search-wrap">
                            <span className="admin-search-icon">🔍</span>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, cédula o correo..."
                                className="admin-search-input"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                            />
                        </div>
                        <span className="admin-user-count">
                            Total: {filtrados.length} usuario(s)
                        </span>
                    </div>

                    {error && (
                        <div className="admin-error-banner">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="admin-loading-state">
                            <p>Cargando lista de usuarios...</p>
                        </div>
                    ) : (
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Cédula</th>
                                        <th>Nombre</th>
                                        <th>Correo</th>
                                        <th>Rol</th>
                                        <th>Cambiar rol</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filtrados.map((u) => (
                                        <tr key={u.id}>
                                            <td>{u.codigo_empleado || '—'}</td>

                                            <td>
                                                <strong style={{ color: 'var(--color-text)' }}>{u.nombre}</strong>
                                            </td>

                                            <td>{u.correo}</td>

                                            <td>
                                                <span
                                                    className={`rol-badge ${u.rol === 'superadmin'
                                                        ? 'rol-badge--superadmin'
                                                        : `rol-badge--${u.rol}`
                                                        }`}
                                                >
                                                    {u.rol.toUpperCase()}
                                                </span>
                                            </td>

                                            <td>
                                                {u.rol === 'superadmin' ? (
                                                    <select
                                                        className="admin-select"
                                                        value="superadmin"
                                                        disabled
                                                    >
                                                        <option value="superadmin">
                                                            SuperAdmin
                                                        </option>
                                                    </select>
                                                ) : (
                                                    <select
                                                        className="admin-select"
                                                        value={u.rol}
                                                        onChange={(e) =>
                                                            cambiarRol(
                                                                u.id,
                                                                e.target.value
                                                            )
                                                        }
                                                    >
                                                        <option value="tecnico">
                                                            Técnico
                                                        </option>

                                                        <option value="admin">
                                                            Admin
                                                        </option>

                                                        {user?.rol === 'superadmin' && (
                                                            <option value="superadmin">
                                                                SuperAdmin
                                                            </option>
                                                        )}
                                                    </select>
                                                )}
                                            </td>

                                            <td>
                                                {user && user.id === u.id ? (
                                                    <span
                                                        className={`estado-badge estado-badge--${u.activo ? 'activo' : 'inactivo'}`}
                                                        title="No puedes activar o desactivar tu propia cuenta"
                                                    >
                                                        {u.activo ? 'ACTIVO' : 'INACTIVO'}
                                                    </span>
                                                ) : (
                                                    <button
                                                        className="admin-estado-btn"
                                                        onClick={() => cambiarEstado(u.id, !u.activo)}
                                                    >
                                                        {u.activo ? '🚫 Desactivar' : '✅ Activar'}
                                                    </button>
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
        </div>
    );
}