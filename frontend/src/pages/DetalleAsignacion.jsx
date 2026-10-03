import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { obtenerAsignacion, actualizarAsignacion, finalizarAsignacion, borrarAsignacionConFlujo, toggleGraciaAsignacion } from '../services/asignaciones';
import { irAtras } from '../utils/navigation';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION } from '../utils/asignaciones';
import { formatFechaLarga, formatFechaCorta, formatCOP } from '../utils/personal';
import { parseDescripcion } from '../utils/descripcion';
import AsignacionForm from '../components/AsignacionForm';
import ModalEvidencia from '../components/ModalEvidencia';
import ModalCuentaCobro from '../components/ModalCuentaCobro';
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
    const [mostrarModalCc, setMostrarModalCc] = useState(false);

    const [editando, setEditando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function cargar() {
        try {
            const [resAsignacion, resUsuarios, resViaticos] = await Promise.all([
                obtenerAsignacion(id),
                api.get('/admin/usuarios').catch(() => ({ data: [] })),
                // Filtramos en el backend para evitar traer los ~300 viáticos completos.
                // El endpoint acepta ?asignacion_id=N y devuelve solo los de esta asignación.
                api.get(`/admin/viaticos?asignacion_id=${id}`).catch(() => ({ data: [] })),
            ]);

            setAsignacion(resAsignacion.data);

            if (resUsuarios.data?.length) {
                setTecnicos(resUsuarios.data.filter((u) => u.rol === 'tecnico' && u.activo));
                setTecnico(resUsuarios.data.find((u) => String(u.id) === String(resAsignacion.data.tecnico_id)));
            }

            // El backend ya filtra por asignacion_id y por el campo ot legacy ("ASIG-#N"),
            // por lo que no es necesario filtrar en cliente.
            setViaticosVinculados(resViaticos.data || []);
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
        setError('');
        const res = await borrarAsignacionConFlujo(asignacion || id);
        if (res.cancelado) return;
        if (!res.ok) {
            setError(res.mensaje);
            return;
        }
        navigate('/admin/asignaciones');
    }

    const [cambiandoGracia, setCambiandoGracia] = useState(false);

    async function handleToggleGracia() {
        const nuevoEstado = !asignacion?.gracia_activada;
        const confirmMsg = nuevoEstado
            ? '¿Deseas activar el período de gracia de 24 horas para esta asignación? El técnico dispondrá de 24h tras el cierre para subir o ajustar viáticos.'
            : '¿Deseas desactivar el período de gracia? Al cerrarse, el técnico quedará bloqueado inmediatamente.';
        if (!window.confirm(confirmMsg)) return;

        setCambiandoGracia(true);
        setError('');
        try {
            const res = await toggleGraciaAsignacion(asignacion.id, nuevoEstado);
            setAsignacion(res.data);
        } catch {
            setError('No se pudo actualizar el período de gracia de la asignación.');
        } finally {
            setCambiandoGracia(false);
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
                    <button className="admin-back-btn" onClick={() => irAtras(navigate, '/admin/asignaciones')}>← Volver a Asignaciones</button>
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
                        <button className="admin-back-btn" onClick={() => irAtras(navigate, '/admin/asignaciones')}>← Volver a Asignaciones</button>
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
                                    <span className="detalle-label">Proyecto</span>
                                    <span className="detalle-valor">{asignacion.cliente}</span>
                                </div>
                                <div className="detalle-field">
                                    <span className="detalle-label">Oficina</span>
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
                                <div className="detalle-field">
                                    <span className="detalle-label">Cuenta de Cobro</span>
                                    {asignacion.cuenta_cobro?.secure_url ? (
                                        <button
                                            type="button"
                                            onClick={() => setMostrarModalCc(true)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                color: '#0284C7',
                                                background: '#EFF6FF',
                                                border: '1px solid #BAE6FD',
                                                borderRadius: '6px',
                                                padding: '0.3rem 0.75rem',
                                                fontWeight: 700,
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                width: 'fit-content',
                                            }}
                                        >
                                            📄 Ver Cuenta de Cobro Formal
                                        </button>
                                    ) : (
                                        <span className="detalle-valor" style={{ color: '#94A3B8' }}>No adjuntada</span>
                                    )}
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
                                    {Number(asignacion.total_gastado || 0) > Number(asignacion.monto_anticipo || 0) && (
                                        <div style={{ background: '#FEF2F2', padding: '0.4rem 0.65rem', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                                            <span style={{ fontSize: '0.78rem', color: '#991B1B', display: 'block', fontWeight: 700 }}>🚨 Saldo a favor técnico</span>
                                            <strong style={{ fontSize: '1.1rem', color: '#DC2626', fontWeight: 800 }}>
                                                {formatCOP(Number(asignacion.total_gastado || 0) - Number(asignacion.monto_anticipo || 0))}
                                            </strong>
                                        </div>
                                    )}
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
                                        🗑️ Borrar
                                    </button>
                                )}
                            </div>

                            {/* Control Admin: Período de Gracia de 24 Horas */}
                            {esAdmin && (
                                <div style={{
                                    marginTop: '1.5rem',
                                    padding: '1.1rem 1.25rem',
                                    background: asignacion.gracia_activada ? '#FEF3C7' : '#F8FAFC',
                                    border: `1.5px solid ${asignacion.gracia_activada ? '#F59E0B' : '#E2E8F0'}`,
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    flexWrap: 'wrap',
                                    boxShadow: asignacion.gracia_activada ? '0 2px 8px rgba(245, 158, 11, 0.1)' : 'none',
                                }}>
                                    <div style={{ flex: 1, minWidth: '240px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                            <span style={{ fontSize: '1.25rem' }}>⏱️</span>
                                            <strong style={{ fontSize: '0.95rem', color: asignacion.gracia_activada ? '#92400E' : '#1E293B' }}>
                                                Período de Gracia de 24 Horas
                                            </strong>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                padding: '0.15rem 0.5rem',
                                                borderRadius: '999px',
                                                background: asignacion.gracia_activada ? '#D97706' : '#E2E8F0',
                                                color: asignacion.gracia_activada ? '#FFFFFF' : '#64748B',
                                            }}>
                                                {asignacion.gracia_activada ? 'ACTIVO' : 'DESACTIVADO'}
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: asignacion.gracia_activada ? '#78350F' : '#64748B', lineHeight: 1.4 }}>
                                            {asignacion.gracia_activada
                                                ? 'Gracia concedida por el administrador: el técnico puede subir o ajustar viáticos durante 24 horas después del cierre.'
                                                : 'Desactivado por defecto. Al cerrarse la asignación, el técnico queda bloqueado inmediatamente el mismo día a las 11:59 PM.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        style={{
                                            padding: '0.5rem 1rem',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            background: asignacion.gracia_activada ? '#DC2626' : '#2563EB',
                                            color: '#FFFFFF',
                                            border: 'none',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        }}
                                        onClick={handleToggleGracia}
                                        disabled={cambiandoGracia}
                                    >
                                        {cambiandoGracia
                                            ? 'Guardando...'
                                            : asignacion.gracia_activada
                                                ? '🔒 Desactivar Gracia'
                                                : '⏱️ Activar Gracia (24h)'}
                                    </button>
                                </div>
                            )}
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

            {/* Modal de Cuenta de Cobro Formal */}
            {mostrarModalCc && asignacion && (
                <ModalCuentaCobro
                    archivoUrl={asignacion.cuenta_cobro?.secure_url}
                    cuenta={{
                        consecutivo: `ASIG-${asignacion.id}`,
                        fecha: asignacion.fecha_inicio,
                        ciudad: asignacion.ciudad,
                        titular_nombre: asignacion.tecnico_nombre || `Técnico #${asignacion.tecnico_id}`,
                        identificacion: asignacion.tecnico_cedula || '—',
                        concepto_servicio: `Servicio de viáticos y ejecución técnica en ${asignacion.ciudad} - ${asignacion.cliente} (${asignacion.tipo})`,
                        total: asignacion.total_gastado || asignacion.monto_anticipo || 0,
                        items: [
                            {
                                oficina: asignacion.ciudad || 'SEDE',
                                fecha_inicio: asignacion.fecha_inicio,
                                fecha_fin: asignacion.fecha_fin,
                                num_tecnicos: 1,
                                valor_diario: asignacion.total_gastado || asignacion.monto_anticipo || 0,
                                valor_total: asignacion.total_gastado || asignacion.monto_anticipo || 0,
                            }
                        ]
                    }}
                    onClose={() => setMostrarModalCc(false)}
                />
            )}
        </div>
    );
}
