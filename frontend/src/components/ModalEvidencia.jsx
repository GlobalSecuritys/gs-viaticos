import { useState } from 'react';
import { parseDescripcion } from '../utils/descripcion';
import { formatMiles, limpiarNumero } from '../utils/personal';
import api from '../services/api';
import ModalCuentaCobro from './ModalCuentaCobro';
import './ModalEvidencia.css';

const LABEL_TIPO = {
    alimentacion: 'Alimentación',
    transporte: 'Transporte',
    hotel: 'Hospedaje / Hotel',
    peajes: 'Peajes',
    parqueadero: 'Parqueadero',
    otros: 'Otros',
};

function formatCOP(value) {
    const num = Number(value || 0);
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(num);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

export default function ModalEvidencia({ viatico: viaticoInicial, onClose, onAprobar, onRechazar, onPresupuestoActualizado }) {
    const [viatico, setViatico] = useState(viaticoInicial);
    const [indiceActivo, setIndiceActivo] = useState(0);
    const [editandoPresupuesto, setEditandoPresupuesto] = useState(false);
    const [presupuestoInput, setPresupuestoInput] = useState(viatico?.monto_presupuesto ? String(viatico.monto_presupuesto) : '');
    const [guardandoPresupuesto, setGuardandoPresupuesto] = useState(false);
    const [errorPresupuesto, setErrorPresupuesto] = useState('');

    const [modoAccion, setModoAccion] = useState(null); // 'aprobar' | 'rechazar' | null
    const [comentarioInput, setComentarioInput] = useState('');
    const [procesandoAccion, setProcesandoAccion] = useState(false);
    const [errorAccion, setErrorAccion] = useState('');
    const [mostrarModalCc, setMostrarModalCc] = useState(false);

    async function handleConfirmarAccion(e) {
        e.preventDefault();
        setProcesandoAccion(true);
        setErrorAccion('');
        const cText = comentarioInput.trim();
        try {
            if (modoAccion === 'aprobar') {
                await api.put(`/admin/viaticos/${viatico.id}/aprobar`, {
                    comentario_admin: cText || null,
                });
                if (onAprobar) onAprobar(viatico.id, cText);
                onClose();
            } else if (modoAccion === 'rechazar') {
                await api.put(`/admin/viaticos/${viatico.id}/rechazar`, {
                    comentario_admin: cText || null,
                });
                if (onRechazar) onRechazar(viatico.id, cText);
                onClose();
            }
        } catch {
            setErrorAccion('Error al procesar la solicitud.');
            setProcesandoAccion(false);
        }
    }

    const evidencias = viatico.evidencias || [];
    const tieneEvidencias = evidencias.length > 0;

    const parsed = parseDescripcion(viatico.descripcion);

    const asigId = viatico.asignacion_id || parsed?.asignacion_id;
    const esAsignacion = Boolean(asigId);

    // Cálculos para viático independiente
    const presVal = Number(viatico.monto_presupuesto || 0);
    const viaticoVal = Number(viatico.valor || 0);
    const sobranteIndep = presVal - viaticoVal;

    async function handleGuardarPresupuesto(e) {
        e.preventDefault();
        const num = parseFloat(presupuestoInput);
        if (isNaN(num) || num <= 0) {
            setErrorPresupuesto('Ingresa un monto de presupuesto válido mayor a 0.');
            return;
        }

        setGuardandoPresupuesto(true);
        setErrorPresupuesto('');
        try {
            const { data } = await api.put(`/admin/viaticos/${viatico.id}/presupuesto`, {
                monto_presupuesto: num,
            });
            setViatico(data);
            setEditandoPresupuesto(false);
            if (onPresupuestoActualizado) onPresupuestoActualizado(data);
        } catch {
            setErrorPresupuesto('No se pudo guardar el presupuesto.');
        } finally {
            setGuardandoPresupuesto(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-evidencia" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose}>×</button>

                <div className="modal-imagen-lado">
                    {tieneEvidencias ? (
                        <>
                            <img
                                src={evidencias[indiceActivo]?.secure_url}
                                alt={`Evidencia ${indiceActivo + 1}`}
                                className="modal-imagen-principal"
                            />
                            {evidencias.length > 1 && (
                                <div className="modal-thumbs-strip">
                                    {evidencias.map((ev, i) => (
                                        <img
                                            key={ev.id}
                                            src={ev.secure_url}
                                            alt={`Miniatura ${i + 1}`}
                                            className={`modal-thumb ${i === indiceActivo ? 'modal-thumb--activa' : ''}`}
                                            onClick={() => setIndiceActivo(i)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="modal-sin-evidencia">
                            <span>📷</span>
                            <p>Este viático no tiene fotografías adjuntas</p>
                        </div>
                    )}
                </div>

                <div className="modal-info-lado">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={`badge-estado badge-estado--${viatico.estado}`}>
                            {viatico.estado.charAt(0).toUpperCase() + viatico.estado.slice(1)}
                        </span>
                        {esAsignacion ? (
                        <span style={{ fontSize: '0.78rem', background: '#EFF6FF', color: '#1D4ED8', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }} title={`ID interno: #${asigId}`}>
                                📍 {viatico.asignacion_resumen?.cliente || viatico.cliente || `Asig. #${asigId}`}
                            </span>
                        ) : (
                            <span style={{ fontSize: '0.78rem', background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 500 }}>
                                📄 Viático Independiente
                            </span>
                        )}
                    </div>

                    <h2 className="modal-info-titulo">{parsed?.razon_social || viatico.cliente}</h2>
                    <p className="modal-info-ot">OT / Referencia: {viatico.ot}</p>

                    {/* Información básica diligenciada por el técnico */}
                    <div className="modal-info-grid">
                        <div>
                            <span className="modal-info-label">Técnico</span>
                            <span className="modal-info-valor">{viatico.nombre || '—'}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Correo</span>
                            <span className="modal-info-valor">{viatico.correo || '—'}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Cédula</span>
                            <span className="modal-info-valor">{viatico.codigo_empleado || '—'}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Fecha</span>
                            <span className="modal-info-valor">{formatDate(viatico.fecha)}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Ciudad / Lugar</span>
                            <span className="modal-info-valor">{parsed?.lugar || viatico.ciudad}</span>
                        </div>
                        <div>
                            <span className="modal-info-label">Tipo de gasto</span>
                            <span className="modal-info-valor">{LABEL_TIPO[viatico.tipo_gasto] || viatico.tipo_gasto}</span>
                        </div>
                    </div>

                    {/* Datos estructurados si la descripción proviene del formulario */}
                    {parsed ? (
                        <div className="modal-structured-data" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.85rem', borderRadius: '8px', margin: '1rem 0' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748B', fontWeight: 700, letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
                                📑 Detalles del Comprobante / Gasto
                            </span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.83rem' }}>
                                <div>
                                    <strong style={{ color: '#475569' }}>NIT:</strong> {parsed.nit || '—'}
                                </div>
                                <div>
                                    <strong style={{ color: '#475569' }}>Razón Social:</strong> {parsed.razon_social || '—'}
                                </div>
                                <div>
                                    <strong style={{ color: '#475569' }}>Lugar realización:</strong>{' '}
                                    <span style={{ fontWeight: 600, color: '#1D63C8' }}>{parsed.lugar || '—'}</span>
                                </div>
                                <div>
                                    <strong style={{ color: '#475569' }}>Origen:</strong> {parsed.origen || '—'}
                                </div>
                                <div>
                                    <strong style={{ color: '#475569' }}>Destino:</strong> {parsed.destino || '—'}
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <strong style={{ color: '#475569' }}>¿Tiene soporte?:</strong> {parsed.tiene_soporte ? 'Sí (Fotografía adjunta)' : 'No'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        viatico.descripcion && (
                            <div className="modal-descripcion">
                                <span className="modal-info-label">Descripción</span>
                                <p>{viatico.descripcion}</p>
                            </div>
                        )
                    )}

                    {/* ── SECCIÓN DE PRESUPUESTO Y VALORES FINANCIEROS ── */}
                    {esAsignacion ? (
                        <div className="modal-fin-box" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '0.85rem', margin: '0.85rem 0' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF', display: 'block', marginBottom: '0.5rem' }}>
                                📊 Control Financiero — {viatico.asignacion_resumen?.cliente || viatico.cliente || `Asig. #${asigId}`}
                            </span>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.82rem', textAlign: 'center' }}>
                                <div>
                                    <span style={{ color: '#475569', display: 'block', fontSize: '0.75rem' }}>Presupuesto Aprobado</span>
                                    <strong style={{ color: '#1E293B', fontSize: '0.95rem' }}>
                                        {formatCOP(viatico.asignacion_resumen?.monto_anticipo || 0)}
                                    </strong>
                                </div>
                                <div>
                                    <span style={{ color: '#475569', display: 'block', fontSize: '0.75rem' }}>Total Consumido</span>
                                    <strong style={{ color: '#0284C7', fontSize: '0.95rem' }}>
                                        {formatCOP(viatico.asignacion_resumen?.total_gastado || 0)}
                                    </strong>
                                </div>
                                <div>
                                    <span style={{ color: '#475569', display: 'block', fontSize: '0.75rem' }}>Saldo Restante</span>
                                    <strong style={{ color: '#16A34A', fontSize: '0.95rem' }}>
                                        {formatCOP(viatico.asignacion_resumen?.saldo_restante || 0)}
                                    </strong>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="modal-fin-box" style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '0.85rem', margin: '0.85rem 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                                    💼 Control de Viático Independiente
                                </span>
                                {!editandoPresupuesto && (
                                    <button
                                        type="button"
                                        style={{ background: 'none', border: 'none', color: '#0284C7', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                        onClick={() => setEditandoPresupuesto(true)}
                                    >
                                        ✏️ Definir presupuesto
                                    </button>
                                )}
                            </div>

                            {editandoPresupuesto ? (
                                <form onSubmit={handleGuardarPresupuesto} style={{ marginTop: '0.5rem' }}>
                                    {errorPresupuesto && <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '0 0 0.3rem 0' }}>{errorPresupuesto}</p>}
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="Ej: 200.000"
                                            value={formatMiles(presupuestoInput)}
                                            onChange={(e) => setPresupuestoInput(limpiarNumero(e.target.value))}
                                            style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.85rem' }}
                                            autoFocus
                                        />
                                        <button
                                            type="submit"
                                            disabled={guardandoPresupuesto}
                                            style={{ background: '#0284C7', color: '#FFF', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                                        >
                                            {guardandoPresupuesto ? '...' : 'Guardar'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditandoPresupuesto(false)}
                                            style={{ background: '#E2E8F0', color: '#334155', border: 'none', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.82rem', textAlign: 'center' }}>
                                    <div>
                                        <span style={{ color: '#475569', display: 'block', fontSize: '0.75rem' }}>Presupuesto Aprobado</span>
                                        <strong style={{ color: viatico.monto_presupuesto ? '#1E293B' : '#94A3B8', fontSize: '0.95rem' }}>
                                            {viatico.monto_presupuesto ? formatCOP(presVal) : 'Sin definir'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span style={{ color: '#475569', display: 'block', fontSize: '0.75rem' }}>Valor Viático</span>
                                        <strong style={{ color: '#0284C7', fontSize: '0.95rem' }}>
                                            {formatCOP(viaticoVal)}
                                        </strong>
                                    </div>
                                    <div>
                                        <span style={{ color: '#475569', display: 'block', fontSize: '0.75rem' }}>Sobrante</span>
                                        <strong style={{ color: viatico.monto_presupuesto ? (sobranteIndep >= 0 ? '#16A34A' : '#DC2626') : '#94A3B8', fontSize: '0.95rem' }}>
                                            {viatico.monto_presupuesto ? formatCOP(sobranteIndep) : '—'}
                                        </strong>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {viatico.comentario_admin && (
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '0.85rem', margin: '0.85rem 0' }}>
                            <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#B45309', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                                💬 Comentario del Administrador
                            </span>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#78350F', whiteSpace: 'pre-wrap' }}>
                                {viatico.comentario_admin}
                            </p>
                        </div>
                    )}

                    {/* ── CUENTA DE COBRO ADJUNTA ── */}
                    {viatico.cuenta_cobro && (
                        <div style={{
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            borderRadius: '10px',
                            padding: '0.85rem',
                            margin: '0.85rem 0',
                        }}>
                            <span style={{
                                fontSize: '0.78rem',
                                textTransform: 'uppercase',
                                color: '#166534',
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                display: 'block',
                                marginBottom: '0.6rem',
                            }}>
                                📄 Cuenta de Cobro Adjunta
                            </span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', fontSize: '0.82rem', color: '#1E293B' }}>
                                <div>
                                    <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>Consecutivo</span>
                                    <strong>{viatico.cuenta_cobro.consecutivo}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>Estado</span>
                                    <strong style={{ color: viatico.cuenta_cobro.estado === 'aprobada' ? '#16A34A' : viatico.cuenta_cobro.estado === 'rechazada' ? '#DC2626' : '#B45309' }}>
                                        {viatico.cuenta_cobro.estado.charAt(0).toUpperCase() + viatico.cuenta_cobro.estado.slice(1)}
                                    </strong>
                                </div>
                                <div>
                                    <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>Banco</span>
                                    <strong>{viatico.cuenta_cobro.banco}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>Tipo de cuenta</span>
                                    <strong>{viatico.cuenta_cobro.tipo_cuenta}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>No. cuenta</span>
                                    <strong>{viatico.cuenta_cobro.numero_cuenta}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>Titular</span>
                                    <strong>{viatico.cuenta_cobro.titular_nombre}</strong>
                                </div>
                                {viatico.cuenta_cobro.titular_celular && (
                                    <div>
                                        <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>Celular</span>
                                        <strong>{viatico.cuenta_cobro.titular_celular}</strong>
                                    </div>
                                )}
                                <div style={{ gridColumn: 'span 2' }}>
                                    <span style={{ color: '#475569', fontSize: '0.75rem', display: 'block' }}>Concepto</span>
                                    <strong>{viatico.cuenta_cobro.concepto_servicio}</strong>
                                </div>
                            </div>
                            <div style={{ marginTop: '0.65rem', paddingTop: '0.55rem', borderTop: '1px dashed #86EFAC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: '#15803D', display: 'block' }}>Valor total</span>
                                    <strong style={{ fontSize: '0.98rem', color: '#166534' }}>{formatCOP(viatico.cuenta_cobro.total)}</strong>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setMostrarModalCc(true)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        background: '#166534',
                                        color: '#FFFFFF',
                                        fontWeight: 700,
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                                    }}
                                >
                                    📄 Ver documento
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="modal-info-valor-grande" style={{ marginTop: '0.5rem' }}>
                        <span className="modal-info-label">Valor total del viático</span>
                        <span className="modal-valor-monto">{formatCOP(viatico.valor)}</span>
                    </div>

                    {modoAccion ? (
                        <form onSubmit={handleConfirmarAccion} style={{ background: modoAccion === 'rechazar' ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${modoAccion === 'rechazar' ? '#FCA5A5' : '#86EFAC'}`, borderRadius: '10px', padding: '1rem', marginTop: '1rem' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: modoAccion === 'rechazar' ? '#991B1B' : '#166534' }}>
                                {modoAccion === 'rechazar' ? '❌ Confirmar Rechazo' : '✅ Confirmar Aprobación'}
                            </h4>
                            {errorAccion && <p style={{ color: '#DC2626', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{errorAccion}</p>}
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: '0.35rem', fontWeight: 600 }}>
                                {modoAccion === 'rechazar' ? 'Comentario / Motivo del rechazo:' : 'Comentario del administrador (opcional):'}
                            </label>
                            <textarea
                                rows={2}
                                value={comentarioInput}
                                onChange={(e) => setComentarioInput(e.target.value)}
                                placeholder={modoAccion === 'rechazar' ? 'Ej: El comprobante no coincide con la fecha u OT...' : 'Ej: Aprobado conforme a la solicitud...'}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem', marginBottom: '0.75rem', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => { setModoAccion(null); setComentarioInput(''); }}
                                    style={{ background: '#E2E8F0', color: '#334155', border: 'none', padding: '0.45rem 0.85rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                                    disabled={procesandoAccion}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    style={{ background: modoAccion === 'rechazar' ? '#DC2626' : '#16A34A', color: '#FFF', border: 'none', padding: '0.45rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}
                                    disabled={procesandoAccion}
                                >
                                    {procesandoAccion ? 'Procesando...' : (modoAccion === 'rechazar' ? 'Confirmar Rechazo' : 'Confirmar Aprobación')}
                                </button>
                            </div>
                        </form>
                    ) : (
                        viatico.estado === 'pendiente' && onAprobar && onRechazar && (
                            <div className="modal-acciones" style={{ marginTop: '1rem' }}>
                                <button
                                    type="button"
                                    className="btn-rechazar"
                                    onClick={() => setModoAccion('rechazar')}
                                >
                                    Rechazar
                                </button>
                                <button
                                    type="button"
                                    className="btn-aprobar"
                                    onClick={() => setModoAccion('aprobar')}
                                >
                                    Aprobar
                                </button>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Modal de documento formal de Cuenta de Cobro */}
            {mostrarModalCc && viatico.cuenta_cobro && (
                <ModalCuentaCobro
                    cuenta={{
                        ...viatico.cuenta_cobro,
                        identificacion: viatico.cuenta_cobro.identificacion || viatico.codigo_empleado,
                        titular_cedula: viatico.cuenta_cobro.titular_cedula || viatico.codigo_empleado,
                        items: viatico.cuenta_cobro.items || [
                            {
                                oficina: viatico.ciudad || 'SEDE',
                                fecha_inicio: viatico.fecha,
                                fecha_fin: viatico.fecha,
                                num_tecnicos: 1,
                                valor_diario: viatico.cuenta_cobro.total,
                                valor_total: viatico.cuenta_cobro.total,
                            }
                        ]
                    }}
                    onClose={() => setMostrarModalCc(false)}
                />
            )}
        </div>
    );
}