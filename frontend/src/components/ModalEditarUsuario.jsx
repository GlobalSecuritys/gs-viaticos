import { useState } from 'react';
import api from '../services/api';
import './ModalEvidencia.css';
import './ModalCrearUsuario.css';

export default function ModalEditarUsuario({ usuario, onClose, onGuardado }) {
    const [nombre, setNombre] = useState(usuario.nombre);
    const [correo, setCorreo] = useState(usuario.correo);
    const [codigoEmpleado, setCodigoEmpleado] = useState(usuario.codigo_empleado || '');
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setGuardando(true);
        try {
            const { data } = await api.put(`/admin/usuarios/${usuario.id}`, {
                nombre,
                correo,
                codigo_empleado: codigoEmpleado || null,
            });
            onGuardado(data);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo guardar los cambios.');
        } finally {
            setGuardando(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-crear-usuario" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose}>×</button>

                <h2 className="mcu-titulo">Editar información</h2>
                <p className="mcu-subtitulo">Nombre, correo y código de empleado.</p>

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
                        Código de empleado
                        <input
                            type="text"
                            value={codigoEmpleado}
                            onChange={(e) => setCodigoEmpleado(e.target.value)}
                            placeholder="Solo números, 6-15 dígitos"
                        />
                    </label>

                    {error && <p className="mcu-error">{error}</p>}

                    <button type="submit" className="mcu-btn-crear" disabled={guardando}>
                        {guardando ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </form>
            </div>
        </div>
    );
}
