import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { crearAsignacion } from '../services/asignaciones';
import AsignacionForm from '../components/AsignacionForm';
import './NuevaAsignacion.css';

export default function NuevaAsignacion() {
    const navigate = useNavigate();

    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        async function cargar() {
            try {
                const { data } = await api.get('/admin/usuarios');
                setUsuarios(data);
            } catch {
                setError('No se pudo cargar la lista de técnicos.');
            } finally {
                setLoading(false);
            }
        }
        cargar();
    }, []);

    const tecnicos = useMemo(() => usuarios.filter((u) => u.rol === 'tecnico' && u.activo), [usuarios]);

    async function handleSubmit(payload) {
        setEnviando(true);
        setError('');
        try {
            await crearAsignacion(payload);
            navigate('/admin/asignaciones');
        } catch (err) {
            // Mostrar el error real del backend cuando está disponible
            const detail = err?.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else if (Array.isArray(detail)) {
                // Errores de validación Pydantic (422)
                const msgs = detail.map((d) => d.msg || JSON.stringify(d)).join(' · ');
                setError(msgs);
            } else {
                setError('No se pudo crear la asignación. Verifica los datos e intenta de nuevo.');
            }
            setEnviando(false);
        }
    }

    return (
        <div className="nueva-asig-root">
            <div className="nueva-asig-container">
                {/* Header */}
                <div className="nueva-asig-header">
                    <button className="nueva-asig-back" onClick={() => navigate('/admin/asignaciones')}>
                        ← Volver a Asignaciones
                    </button>
                    <div className="nueva-asig-title-wrap">
                        <div className="nueva-asig-icon">📋</div>
                        <div>
                            <h1 className="nueva-asig-title">Nueva Asignación</h1>
                            <p className="nueva-asig-sub">Completa la información de la misión o servicio de campo</p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="nueva-asig-error">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {loading ? (
                    <div className="nueva-asig-loading">
                        <div className="nueva-asig-spinner" />
                        <p>Cargando técnicos disponibles...</p>
                    </div>
                ) : tecnicos.length === 0 ? (
                    <div className="nueva-asig-empty">
                        <span className="nueva-asig-empty-icon">👤</span>
                        <p>No hay técnicos activos disponibles para asignar.</p>
                        <p className="nueva-asig-empty-sub">Primero activa al menos un técnico en Gestión de Usuarios.</p>
                    </div>
                ) : (
                    <AsignacionForm
                        tecnicos={tecnicos}
                        onSubmit={handleSubmit}
                        onCancelar={() => navigate('/admin/asignaciones')}
                        enviando={enviando}
                    />
                )}
            </div>
        </div>
    );
}
