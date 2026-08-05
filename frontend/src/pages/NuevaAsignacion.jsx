import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { crearAsignacion } from '../services/asignaciones';
import AsignacionForm from '../components/AsignacionForm';

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
        } catch {
            setError('No se pudo crear la asignación. Verifica los datos e intenta de nuevo.');
            setEnviando(false);
        }
    }

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin/asignaciones')}>← Volver a Asignaciones</button>

                <h1 className="admin-page-title">Nueva asignación</h1>

                {error && <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error}</p>}

                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando técnicos...</p>
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
