import { useState } from 'react';
import api from '../services/api';
import './ModalEvidencia.css';
import './ModalCrearUsuario.css';

import { formatApiError } from '../utils/formatError';

export default function ModalCrearUsuario({ onClose, onCreado }) {
    const [nombre, setNombre] = useState('');
    const [correo, setCorreo] = useState('');
    const [codigoEmpleado, setCodigoEmpleado] = useState('');
    const [password, setPassword] = useState('');
    const [rol, setRol] = useState('tecnico');
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setGuardando(true);
        try {
            const { data } = await api.post('/admin/usuarios', {
                nombre,
                correo,
                codigo_empleado: codigoEmpleado,
                password,
                rol,
            });
            onCreado(data);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo crear el usuario.'));
        } finally {
            setGuardando(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-crear-usuario" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose}>×</button>

                <h2 className="mcu-titulo">Crear usuario</h2>
                <p className="mcu-subtitulo">Solo puede crear técnicos o administradores.</p>

                <form onSubmit={handleSubmit} className="mcu-form">
                    <label className="mcu-campo">
                        Nombre completo
                        <input
                            type="text"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            required
                        />
                    </label>

                    <label className="mcu-campo">
                        Correo
                        <input
                            type="email"
                            value={correo}
                            onChange={(e) => setCorreo(e.target.value)}
                            required
                        />
                    </label>

                    <label className="mcu-campo">
                        Cédula
                        <input
                            type="text"
                            value={codigoEmpleado}
                            onChange={(e) => setCodigoEmpleado(e.target.value)}
                            placeholder="Solo números, 6-15 dígitos"
                            required
                        />
                    </label>

                    <label className="mcu-campo">
                        Contraseña temporal
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </label>

                    <label className="mcu-campo">
                        Rol
                        <select value={rol} onChange={(e) => setRol(e.target.value)}>
                            <option value="tecnico">Técnico</option>
                            <option value="admin">Admin</option>
                        </select>
                    </label>

                    {error && <p className="mcu-error">{error}</p>}

                    <button type="submit" className="mcu-btn-crear" disabled={guardando}>
                        {guardando ? 'Creando...' : 'Crear usuario'}
                    </button>
                </form>
            </div>
        </div>
    );
}
