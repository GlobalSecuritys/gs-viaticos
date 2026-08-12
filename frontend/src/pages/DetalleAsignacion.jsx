import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { obtenerAsignacion, actualizarAsignacion, finalizarAsignacion, eliminarAsignacion } from '../services/asignaciones';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION } from '../utils/asignaciones';
import { formatFechaLarga, formatFechaCorta, formatCOP } from '../utils/personal';
import { parseDescripcion } from '../utils/descripcion';
import AsignacionForm from '../components/AsignacionForm';
import ModalEvidencia from '../components/ModalEvidencia';
import './DetalleAsignacion.css';

export default function DetalleAsignacion() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [asignacion, setAsignacion] = useState(null);
    const [tecnico, setTecnico] = useState(null);
    const [tecnicos, setTecnicos] = useState([]);
    const [viaticosVinculados, setViaticosVinculados] = useState([]);
    const [evidenciaPreview, setEvidenciaPreview] = useState(null);

    const [editando, setEditando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function cargar() {
        try {
            const [resAsignacion, resUsuarios, resViaticos] = await Promise.all([
                obtenerAsignacion(id),
                api.get('/admin/usuarios').catch(() => ({ data: [] })),
                api.get('/admin/viaticos').catch(() => ({ data: [] })),
            ]);

            setAsignacion(resAsignacion.data);

            if (resUsuarios.data?.length) {
                setTecnicos(resUsuarios.data.filter((u) => u.rol === 'tecnico' && u.activo));
                setTecnico(resUsuarios.data.find((u) => String(u.id) === String(resAsignacion.data.tecnico_id)));
            }

            // Filtrar viáticos asociados a esta asignación
            if (resViaticos.data?.length) {
                const asigIdNum = Number(id);
                const vinculados = resViaticos.data.filter((v) => {
                    if (v.asignacion_id === asigIdNum) return true;
                    if (v.ot === `ASIG-#${asigIdNum}`) return true;
                    try {
                        const parsed = JSON.parse(v.descripcion);
                        if (Number(parsed?.asignacion_id) === asigIdNum) return true;
                    } catch {
                        // no-op
                    }
                    return false;
                });
                setViaticosVinculados(vinculados);
            }
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
                <div className="admin-container">
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando asignación...</p>
                </div>
            </div>
        );
    }

    if (error && !asignacion) {
        return (
            <div className="admin-root">
                <div className="admin-container">
                    <button className="admin-back-btn" onClick={() => navigate('/admin/asignaciones')}>← Volver a Asignaciones</button>
                    <div className="admin-error-banner">{error}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-root">
            <div className="admin-container">
                <div className="admin-page-header">
                    <div>
                        <button className="admin-back-btn" onClick={() => navigate('/admin/asignaciones')}>← Volver a Asignaciones</button>
                    </div>
                </div>

                {error && <div className="admin-error-banner">{error}</div>}

                <div className="admin-card-container detalle-asig-card">
                    {editando ? (
                        <div style={{ padding: '1.5rem' }}>
                            <h1 className="admin-page-title" style={{ marginBottom: '1.5rem' }}>Editar asignación</h1>
                            <AsignacionForm
                                tecnicos={tecnicosParaForm}
                                inicial={asignacion}
                                onSubmit={handleGuardar}
                                onCancelar={() => setEditando(false)}
                                enviando={enviando}
                            />
                        </div>
                    ) : (
                        <div style={{ padding: '1.75rem' }}>
                            <div className="detalle-asig-header">
                                <div>
                                    <span className="detalle-asig-tipo">{LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}</span>
                                    <h1 className="admin-page-title" style={{ margin: '0.25rem 0 0' }}>
                                        {tecnico?.nombre || `Técnico #${asignacion.tecnico_id}`}
                                    </h1>
                                </div>
                                <span className={`estado-badge estado-badge--${asignacion.estado === 'en_curso' ? 'activo' : asignacion.estado}`}>
                                    {LABEL_ESTADO_ASIGNACION[asignacion.estado] || asignacion.estado}
                                </span>
                            </div>

                            <div className="detalle-asig-grid">
                                <div className="detalle-field">
                                    <span className="detalle-label">Cliente</span>
                                    <span className="detalle-valor">{asignacion.cliente}</span>
                                </div>
                                <div className="detalle-field">
                                    <span className="detalle-label">Proyecto</span>
                                    <span className="detalle-valor">{asignacion.empresa || '—'}</span>
                                </div>
                                <div className="detalle-field">
                                    <span className="detalle-label">Ciudad</span>
                                    <span className="detalle-valor">{asignacion.ciudad}</span>
                                </div>
                                <div className="detalle-field">
                                    <span className="detalle-label">Fecha inicio</span>
                                    <span className="detalle-valor">{formatFechaLarga(asignacion.fecha_inicio)}</span>
                                </div>
                                <div className="detalle-field">
                                    <span className="detalle-label">Fecha final</span>
                                    <span className="detalle-valor">{formatFechaLarga(asignacion.fecha_fin)}</span>
                                </div>
                                <div className="detalle-field">
                                    <span className="detalle-label">Creado por</span>
                                    <span className="detalle-valor">{asignacion.creado_por_nombre || asignacion.creado_por || '—'}</span>
                                </div>
                            </div>

                            {/* Resumen Financiero Claro */}
                            <div className="detalle-fin-card" style={{ marginTop: '1.5rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1.25rem' }}>
                                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    💰 Resumen Financiero y Legalización
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                                    <div>
                                        <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'block' }}>Anticipo entregado</span>
                                        <strong style={{ fontSize: '1.1rem', color: '#1E293B' }}>{formatCOP(Number(asignacion.monto_anticipo || 0))}</strong>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'block' }}>Total gastado</span>
                                        <strong style={{ fontSize: '1.1rem', color: '#0284C7' }}>{formatCOP(Number(asignacion.total_gastado || 0))}</strong>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'block' }}>Saldo restante GSB</span>
                                        <strong style={{ fontSize: '1.1rem', color: '#16A34A' }}>{formatCOP(Number(asignacion.saldo_restante || 0))}</strong>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'block' }}>Ítems registrados</span>
                                        <strong style={{ fontSize: '1.1rem', color: '#475569' }}>{viaticosVinculados.length || asignacion.cantidad_viaticos || 0}</strong>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'block' }}>Estado Legalización</span>
                                        <span style={{
                                            display: 'inline-block',
                                            marginTop: '0.2rem',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '6px',
                                            background: asignacion.estado_legalizacion === 'excedido' ? '#FEE2E2' : asignacion.estado_legalizacion === 'legalizado' ? '#DCFCE7' : '#F1F5F9',
                                            color: asignacion.estado_legalizacion === 'excedido' ? '#991B1B' : asignacion.estado_legalizacion === 'legalizado' ? '#166534' : '#334155'
                                        }}>
                                            {{
                                                sin_gastos: 'Sin gastos',
                                                en_curso: 'En proceso',
                                                legalizado: 'Legalizado',
                                                excedido: 'Excedido'
                                            }[asignacion.estado_legalizacion] || asignacion.estado_legalizacion || 'Sin gastos'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Ítems / Viáticos Vinculados */}
                            <div className="detalle-viaticos-section" style={{ marginTop: '1.75rem' }}>
                                <h3 style={{ fontSize: '1.05rem', color: '#0F172A', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    📋 Viáticos y Evidencias Asociadas a esta Misión ({viaticosVinculados.length})
                                </h3>

                                {viaticosVinculados.length === 0 ? (
                                    <div style={{ padding: '1.5rem', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', textAlign: 'center', color: '#64748B', fontSize: '0.9rem' }}>
                                        El técnico aún no ha registrado ítems de viáticos vinculados a esta asignación.
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                            <thead>
                                                <tr style={{ background: '#F1F5F9', textAlign: 'left', color: '#475569' }}>
                                                    <th style={{ padding: '0.65rem 0.85rem' }}>Fecha</th>
                                                    <th style={{ padding: '0.65rem 0.85rem' }}>Tipo</th>
                                                    <th style={{ padding: '0.65rem 0.85rem' }}>Detalles / Proveedor</th>
                                                    <th style={{ padding: '0.65rem 0.85rem' }}>Valor</th>
                                                    <th style={{ padding: '0.65rem 0.85rem' }}>Estado</th>
                                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {viaticosVinculados.map((v) => {
                                                    const descInfo = parseDescripcion(v.descripcion);
                                                    return (
                                                        <tr key={v.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                            <td style={{ padding: '0.65rem 0.85rem' }}>{formatFechaCorta(v.fecha)}</td>
                                                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: '#1E40AF' }}>{v.tipo_gasto}</td>
                                                            <td style={{ padding: '0.65rem 0.85rem', color: '#334155' }}>
                                                                {descInfo.razonSocial ? <strong>{descInfo.razonSocial}</strong> : null}
                                                                {descInfo.nit ? <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>NIT: {descInfo.nit}</span> : null}
                                                                {descInfo.lugar ? <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Lugar: {descInfo.lugar}</span> : null}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: '#0F172A' }}>{formatCOP(v.valor)}</td>
                                                            <td style={{ padding: '0.65rem 0.85rem' }}>
                                                                <span className={`estado-badge estado-badge--${v.estado}`}>
                                                                    {v.estado}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                                                                <button
                                                                    className="admin-back-btn"
                                                                    style={{ margin: 0, padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                                    onClick={() => setEvidenciaPreview(v)}
                                                                >
                                                                    🔍 Ver Detalle
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {asignacion.observaciones && (
                                <div className="detalle-obs-wrap" style={{ marginTop: '1.5rem' }}>
                                    <span className="detalle-label">Observaciones</span>
                                    <p className="detalle-obs-text">{asignacion.observaciones}</p>
                                </div>
                            )}

                            <div className="detalle-asig-acciones">
                                {esAdmin && (
                                    <button className="admin-back-btn" style={{ marginBottom: 0 }} onClick={() => setEditando(true)} disabled={enviando}>
                                        ✏️ Editar / Reasignar
                                    </button>
                                )}
                                {puedeFinalizar && (
                                    <button className="asig-btn-nueva" onClick={handleFinalizar} disabled={enviando}>
                                        ✅ Finalizar asignación
                                    </button>
                                )}
                                {puedeEliminar && (
                                    <button className="detalle-asig-btn-eliminar" onClick={handleEliminar} disabled={enviando}>
                                        🗑️ Eliminar
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de evidencia / viático */}
            {evidenciaPreview && (
                <ModalEvidencia
                    viatico={evidenciaPreview}
                    onClose={() => setEvidenciaPreview(null)}
                    onPresupuestoActualizado={(vActualizado) => {
                        setViaticosVinculados((prev) => prev.map((x) => (x.id === vActualizado.id ? vActualizado : x)));
                        setEvidenciaPreview(vActualizado);
                    }}
                />
            )}
        </div>
    );
}
