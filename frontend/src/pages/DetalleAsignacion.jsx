import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { obtenerAsignacion, actualizarAsignacion, finalizarAsignacion, eliminarAsignacion } from '../services/asignaciones';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION, CLASE_ESTADO_ASIGNACION } from '../utils/asignaciones';
import { formatFechaLarga } from '../utils/personal';
import AsignacionForm from '../components/AsignacionForm';
import './DetalleAsignacion.css';

// Nota de permisos (según el prompt de Fase 2):
//   SuperAdmin -> crear, editar, eliminar, reasignar, finalizar
//   Admin      -> crear, editar, reasignar, finalizar (NO eliminar históricas)
//   Técnico    -> solo visualizar (esta ruta ya está protegida por AdminRoute,
//                 así que un técnico no llega aquí; se deja el chequeo igual
//                 por si AdminRoute cambia en el futuro).
export default function DetalleAsignacion() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [asignacion, setAsignacion] = useState(null);
    const [tecnico, setTecnico] = useState(null);
    const [tecnicos, setTecnicos] = useState([]);
    const [editando, setEditando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function cargar() {
        try {
            const [resAsignacion, resUsuarios] = await Promise.all([
                obtenerAsignacion(id),
                api.get('/admin/usuarios'),
            ]);
            setAsignacion(resAsignacion.data);
            setTecnicos(resUsuarios.data.filter((u) => u.rol === 'tecnico' && u.activo));
            setTecnico(resUsuarios.data.find((u) => String(u.id) === String(resAsignacion.data.tecnico_id)));
        } catch {
            setError('No se pudo cargar la asignación.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const esSuperAdmin = user?.rol === 'superadmin';
    const esAdmin = user?.rol === 'admin' || esSuperAdmin;
    const puedeEliminar = esSuperAdmin || (user?.rol === 'admin' && asignacion?.estado === 'pendiente');
    const puedeFinalizar = esAdmin && asignacion && !['finalizada', 'cancelada'].includes(asignacion.estado);

    const tecnicosParaForm = useMemo(() => {
        if (!tecnico) return tecnicos;
        return tecnicos.some((t) => t.id === tecnico.id) ? tecnicos : [tecnico, ...tecnicos];
    }, [tecnicos, tecnico]);

    async function handleGuardar(payload) {
        setEnviando(true);
        setError('');
        try {
            await actualizarAsignacion(id, payload);
            setEditando(false);
            await cargar();
        } catch {
            setError('No se pudo guardar los cambios.');
        } finally {
            setEnviando(false);
        }
    }

    async function handleFinalizar() {
        setEnviando(true);
        setError('');
        try {
            await finalizarAsignacion(id);
            await cargar();
        } catch {
            setError('No se pudo finalizar la asignación.');
        } finally {
            setEnviando(false);
        }
    }

    async function handleEliminar() {
        if (!window.confirm('¿Eliminar esta asignación? Esta acción no se puede deshacer.')) return;
        setEnviando(true);
        setError('');
        try {
            await eliminarAsignacion(id);
            navigate('/admin/asignaciones');
        } catch {
            setError('No se pudo eliminar la asignación.');
            setEnviando(false);
        }
    }

    if (loading) {
        return (
            <div className="admin-root">
                <div className="admin-main">
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando asignación...</p>
                </div>
            </div>
        );
    }

    if (error && !asignacion) {
        return (
            <div className="admin-root">
                <div className="admin-main">
                    <button className="admin-back-btn" onClick={() => navigate('/admin/asignaciones')}>← Volver</button>
                    <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-root">
            <div className="admin-main">
                <button className="admin-back-btn" onClick={() => navigate('/admin/asignaciones')}>← Volver a Asignaciones</button>

                {error && <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error}</p>}

                {editando ? (
                    <>
                        <h1 className="admin-page-title">Editar asignación</h1>
                        <AsignacionForm
                            tecnicos={tecnicosParaForm}
                            inicial={asignacion}
                            onSubmit={handleGuardar}
                            onCancelar={() => setEditando(false)}
                            enviando={enviando}
                        />
                    </>
                ) : (
                    <>
                        <div className="detalle-asig-header">
                            <div>
                                <span className="detalle-asig-tipo">{LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}</span>
                                <h1 className="admin-page-title" style={{ margin: '0.2rem 0 0' }}>
                                    {tecnico?.nombre || `Técnico #${asignacion.tecnico_id}`}
                                </h1>
                            </div>
                            <span className={`estado-asignacion ${CLASE_ESTADO_ASIGNACION[asignacion.estado] || ''}`}>
                                {LABEL_ESTADO_ASIGNACION[asignacion.estado] || asignacion.estado}
                            </span>
                        </div>

                        <div className="perfil-info-grid">
                            <div>
                                <span className="modal-info-label">Cliente</span>
                                <span className="modal-info-valor">{asignacion.cliente}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Empresa</span>
                                <span className="modal-info-valor">{asignacion.empresa || '—'}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Ciudad</span>
                                <span className="modal-info-valor">{asignacion.ciudad}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Fecha inicio</span>
                                <span className="modal-info-valor">{formatFechaLarga(asignacion.fecha_inicio)}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Fecha final</span>
                                <span className="modal-info-valor">{formatFechaLarga(asignacion.fecha_fin)}</span>
                            </div>
                            <div>
                                <span className="modal-info-label">Creado por</span>
                                <span className="modal-info-valor">{asignacion.creado_por_nombre || asignacion.creado_por || '—'}</span>
                            </div>
                        </div>

                        {asignacion.observaciones && (
                            <div className="perfil-info-grid" style={{ gridTemplateColumns: '1fr' }}>
                                <div>
                                    <span className="modal-info-label">Observaciones</span>
                                    <span className="modal-info-valor">{asignacion.observaciones}</span>
                                </div>
                            </div>
                        )}

                        <div className="detalle-asig-acciones">
                            {esAdmin && (
                                <button className="admin-back-btn" onClick={() => setEditando(true)} disabled={enviando}>
                                    Editar / Reasignar
                                </button>
                            )}
                            {puedeFinalizar && (
                                <button className="personal-card-btn" style={{ width: 'auto' }} onClick={handleFinalizar} disabled={enviando}>
                                    Finalizar
                                </button>
                            )}
                            {puedeEliminar && (
                                <button className="detalle-asig-btn-eliminar" onClick={handleEliminar} disabled={enviando}>
                                    Eliminar
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
