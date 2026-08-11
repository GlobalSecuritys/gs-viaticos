import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { subirEvidencias } from '../services/api';
import { obtenerMisAsignacionesActivas } from '../services/asignaciones';
import TecnicoLayout from '../components/TecnicoLayout';
import { useAuth } from '../context/AuthContext';
import { formatFechaLarga, formatCOP } from '../utils/personal';
import './NuevoViatico.css';

const CONCEPTOS = [
    { value: 'alimentacion', label: 'Alimentación' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'hotel', label: 'Hospedaje / Hotel' },
    { value: 'peajes', label: 'Peajes' },
    { value: 'parqueadero', label: 'Parqueadero' },
    { value: 'otros', label: 'Otros' },
];

function hoyISO() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
}

const CONTEXTO_KEY = 'gs_fecha_anterior_viatico';

function getItemInicial(id) {
    return {
        id,
        nit: '',
        razon_social: '',
        concepto: 'alimentacion',
        lugar: '',
        origen: '',
        destino: '',
        tiene_soporte: 'si',
        valor: '',
        archivo: null,
        previewUrl: null,
    };
}

export default function NuevoViatico() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();

    const asignacionIdParam = searchParams.get('asignacion_id');
    const [asignacionDetalle, setAsignacionDetalle] = useState(null);

    useEffect(() => {
        if (asignacionIdParam) {
            obtenerMisAsignacionesActivas()
                .then((res) => {
                    const found = (res.data || []).find(
                        (a) => String(a.id) === String(asignacionIdParam)
                    );
                    if (found) setAsignacionDetalle(found);
                })
                .catch(() => {});
        }
    }, [asignacionIdParam]);

    // 1. Contexto de fecha
    const fechaGuardada = localStorage.getItem(CONTEXTO_KEY) || hoyISO();
    const [opcionFecha, setOpcionFecha] = useState('hoy'); // 'hoy' | 'anterior'
    const [fechaSeleccionada, setFechaSeleccionada] = useState(
        opcionFecha === 'hoy' ? hoyISO() : fechaGuardada
    );

    function handleCambiarOpcionFecha(opcion) {
        setOpcionFecha(opcion);
        if (opcion === 'hoy') {
            setFechaSeleccionada(hoyISO());
        } else {
            setFechaSeleccionada(fechaGuardada);
        }
    }

    // 2. Lista dinámica de ítems/gastos
    const [gastos, setGastos] = useState([getItemInicial(1)]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [exitoMsg, setExitoMsg] = useState('');

    function handleAddGasto() {
        setGastos((prev) => [...prev, getItemInicial(Date.now())]);
    }

    function handleRemoveGasto(id) {
        if (gastos.length <= 1) return;
        setGastos((prev) => prev.filter((g) => g.id !== id));
    }

    function handleGastoChange(id, field, value) {
        setGastos((prev) =>
            prev.map((g) => (g.id === id ? { ...g, [field]: value } : g))
        );
    }

    function handleFileChange(id, e) {
        const file = e.target.files?.[0];
        if (!file) return;

        const previewUrl = URL.createObjectURL(file);
        setGastos((prev) =>
            prev.map((g) =>
                g.id === id ? { ...g, archivo: file, previewUrl } : g
            )
        );
    }

    function handleRemoveFile(id) {
        setGastos((prev) =>
            prev.map((g) =>
                g.id === id ? { ...g, archivo: null, previewUrl: null } : g
            )
        );
    }

    // Resumen de cálculos
    const totalGastosCount = gastos.length;
    const totalValor = gastos.reduce(
        (acc, g) => acc + (parseFloat(g.valor) || 0),
        0
    );
    const conSoporteCount = gastos.filter(
        (g) => g.tiene_soporte === 'si'
    ).length;
    const sinSoporteCount = gastos.filter(
        (g) => g.tiene_soporte === 'no'
    ).length;

    const anticipoAsig = asignacionDetalle
        ? Number(asignacionDetalle.monto_anticipo || 0)
        : 0;
    const gastadoPrevio = asignacionDetalle
        ? Number(asignacionDetalle.total_gastado || 0)
        : 0;
    const saldoGSB = Math.max(0, anticipoAsig - (gastadoPrevio + totalValor));

    // 3. Envío masivo de ítems
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setExitoMsg('');

        // Validaciones básicas
        for (let i = 0; i < gastos.length; i++) {
            const g = gastos[i];
            const val = parseFloat(g.valor);
            if (isNaN(val) || val <= 0) {
                setError(
                    `El Gasto #${i + 1} (${g.concepto}) debe tener un valor mayor a 0.`
                );
                return;
            }
        }

        setLoading(true);
        try {
            // Guardar fecha seleccionada como la fecha anterior para registros consecutivos
            localStorage.setItem(CONTEXTO_KEY, fechaSeleccionada);

            // Crear cada viático/ítem en el backend
            for (let i = 0; i < gastos.length; i++) {
                const g = gastos[i];
                const val = parseFloat(g.valor);

                const descripcionEstructurada = JSON.stringify({
                    nit: g.nit || '—',
                    razon_social: g.razon_social || (asignacionDetalle ? asignacionDetalle.cliente : '—'),
                    lugar: g.lugar || (asignacionDetalle ? asignacionDetalle.ciudad : '—'),
                    origen: g.origen || '—',
                    destino: g.destino || (asignacionDetalle ? asignacionDetalle.ciudad : '—'),
                    tiene_soporte: g.tiene_soporte === 'si',
                    asignacion_id: asignacionIdParam ? Number(asignacionIdParam) : null,
                });

                const payload = {
                    fecha: fechaSeleccionada,
                    cliente: g.razon_social || (asignacionDetalle ? asignacionDetalle.cliente : (g.nit || 'Gasto Operativo')),
                    ciudad: g.destino || g.lugar || (asignacionDetalle ? asignacionDetalle.ciudad : 'N/A'),
                    ot: asignacionIdParam ? `ASIG-#${asignacionIdParam}` : (g.origen ? `${g.origen} -> ${g.destino}` : 'OT-CAMPO'),
                    tipo_gasto: g.concepto,
                    valor: val,
                    descripcion: descripcionEstructurada,
                    asignacion_id: asignacionIdParam ? Number(asignacionIdParam) : null,
                };

                // 1. Crear el registro del viático
                const { data: viaticoCreado } = await api.post(
                    '/viaticos',
                    payload
                );

                // 2. Si adjuntó foto/soporte, subir la evidencia asociada a este ítem
                if (g.archivo && g.tiene_soporte === 'si') {
                    try {
                        await subirEvidencias(viaticoCreado.id, [g.archivo]);
                    } catch {
                        console.warn(
                            `No se pudo subir la foto del gasto #${i + 1}`
                        );
                    }
                }
            }

            setExitoMsg(
                '¡Se registraron correctamente todos los gastos!'
            );
            setTimeout(() => {
                navigate('/mis-viaticos');
            }, 1200);
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(
                Array.isArray(detail)
                    ? detail.map((d) => d.msg).join(' · ')
                    : detail || 'Error al guardar los gastos.'
            );
        } finally {
            setLoading(false);
        }
    }

    const cedulaUsuario = user?.codigo_empleado || '1.234.567.890';

    return (
        <TecnicoLayout>
            <div className="nv-root">
                {/* Banner de vinculación si viene de una asignación */}
                {asignacionIdParam && (
                    <div className="nv-asig-badge-banner" style={{ background: '#EFF6FF', border: '1px solid #93C5FD', padding: '0.85rem 1.25rem', borderRadius: '10px', marginBottom: '1.25rem', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                        <span>📍</span>
                        <div>
                            <strong>Vinculado a Asignación #{asignacionIdParam}</strong>
                            {asignacionDetalle && (
                                <span> — Cliente: <strong>{asignacionDetalle.cliente}</strong> ({asignacionDetalle.ciudad})</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="nv-header-card">
                    <div>
                        <h1 className="nv-title">1. Registrar viático</h1>
                        <p className="nv-sub">
                            {asignacionIdParam
                                ? `Registra los viáticos directamente asociados a la Asignación #${asignacionIdParam}`
                                : 'Registra tus viáticos e ítems de gasto de forma independiente'}
                        </p>
                    </div>
                    <span className="nv-status-tag">✓ Borrador listo</span>
                </div>

                {error && <div className="admin-error-banner">{error}</div>}
                {exitoMsg && <div className="nv-success-banner">{exitoMsg}</div>}

                <div className="nv-layout-grid">
                    {/* Columna principal: Fecha + Lista de Gastos */}
                    <div className="nv-main-col">
                        {/* ── 1. FECHA DEL GASTO ── */}
                        <div className="nv-card">
                            <h3 className="nv-card-title">1. Fecha del gasto</h3>
                            <p className="nv-card-sub">
                                Selecciona la fecha que aplicarás para todos los gastos.
                            </p>

                            <div className="nv-fecha-options">
                                <label
                                    className={`nv-fecha-radio ${opcionFecha === 'hoy' ? 'nv-fecha-radio--selected' : ''}`}
                                    onClick={() => handleCambiarOpcionFecha('hoy')}
                                >
                                    <input
                                        type="radio"
                                        name="opcionFecha"
                                        checked={opcionFecha === 'hoy'}
                                        onChange={() => { }}
                                    />
                                    <div>
                                        <strong>Usar fecha de hoy</strong>
                                        <span className="nv-fecha-date">{formatFechaLarga(hoyISO())}</span>
                                    </div>
                                </label>

                                <label
                                    className={`nv-fecha-radio ${opcionFecha === 'anterior' ? 'nv-fecha-radio--selected' : ''}`}
                                    onClick={() => handleCambiarOpcionFecha('anterior')}
                                >
                                    <input
                                        type="radio"
                                        name="opcionFecha"
                                        checked={opcionFecha === 'anterior'}
                                        onChange={() => { }}
                                    />
                                    <div style={{ width: '100%' }}>
                                        <strong>Mantener fecha anterior</strong>
                                        {opcionFecha === 'anterior' ? (
                                            <div className="nv-fecha-picker-wrap" onClick={(e) => e.stopPropagation()}>
                                                <span className="nv-fecha-picker-label">📅 Seleccionar fecha:</span>
                                                <input
                                                    type="date"
                                                    className="nv-fecha-picker-input"
                                                    value={fechaSeleccionada}
                                                    onChange={(e) => {
                                                        setFechaSeleccionada(e.target.value);
                                                        localStorage.setItem(CONTEXTO_KEY, e.target.value);
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <span className="nv-fecha-date">
                                                Última usada: {formatFechaLarga(fechaGuardada)}
                                            </span>
                                        )}
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* ── 2. GASTOS DEL VIAJE (ÍTEMS) ── */}
                        <div className="nv-card">
                            <div className="nv-card-header">
                                <div>
                                    <h3 className="nv-card-title">2. Gastos del viaje</h3>
                                    <p className="nv-card-sub">
                                        Agrega todos los gastos que realizaste. Puedes añadir tantos como necesites.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <div className="nv-gastos-list">
                                    {gastos.map((gasto, index) => (
                                        <div key={gasto.id} className="nv-gasto-item-card">
                                            <div className="nv-gasto-item-top">
                                                <span className="nv-gasto-item-number">
                                                    Gasto {index + 1}
                                                </span>
                                                {gastos.length > 1 && (
                                                    <button
                                                        type="button"
                                                        className="nv-gasto-delete-btn"
                                                        title="Eliminar gasto"
                                                        onClick={() => handleRemoveGasto(gasto.id)}
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </div>

                                            <div className="nv-gasto-fields-grid">
                                                {/* NIT con opción [✓ Usar mi CC] */}
                                                <div className="nv-field-group">
                                                    <div className="nv-label-row">
                                                        <label>NIT</label>
                                                        <button
                                                            type="button"
                                                            className="nv-use-cc-btn"
                                                            onClick={() => handleGastoChange(gasto.id, 'nit', cedulaUsuario)}
                                                            title="Usar mi cédula / código de empleado"
                                                        >
                                                            ✓ Usar mi CC
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="900.123.456-7"
                                                        value={gasto.nit}
                                                        onChange={(e) =>
                                                            handleGastoChange(gasto.id, 'nit', e.target.value)
                                                        }
                                                    />
                                                </div>

                                                {/* Razón social */}
                                                <div className="nv-field-group">
                                                    <label>Razón social</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Ej: Hotel Campestre S.A.S"
                                                        value={gasto.razon_social}
                                                        onChange={(e) =>
                                                            handleGastoChange(gasto.id, 'razon_social', e.target.value)
                                                        }
                                                    />
                                                </div>

                                                {/* Concepto */}
                                                <div className="nv-field-group">
                                                    <label>Concepto</label>
                                                    <select
                                                        value={gasto.concepto}
                                                        onChange={(e) =>
                                                            handleGastoChange(gasto.id, 'concepto', e.target.value)
                                                        }
                                                    >
                                                        {CONCEPTOS.map((c) => (
                                                            <option key={c.value} value={c.value}>
                                                                {c.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Oficina / lugar */}
                                                <div className="nv-field-group">
                                                    <label>Oficina / lugar donde realizó</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Ej: Matansa"
                                                        value={gasto.lugar}
                                                        onChange={(e) =>
                                                            handleGastoChange(gasto.id, 'lugar', e.target.value)
                                                        }
                                                    />
                                                </div>

                                                {/* Origen */}
                                                <div className="nv-field-group">
                                                    <div className="nv-label-row">
                                                        <label>Origen</label>
                                                        <label className="nv-na-checkbox-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={gasto.origen === 'N/A'}
                                                                onChange={(e) =>
                                                                    handleGastoChange(
                                                                        gasto.id,
                                                                        'origen',
                                                                        e.target.checked ? 'N/A' : ''
                                                                    )
                                                                }
                                                            />
                                                            <span>N/A</span>
                                                        </label>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Ej: Bogotá D.C."
                                                        value={gasto.origen}
                                                        disabled={gasto.origen === 'N/A'}
                                                        onChange={(e) =>
                                                            handleGastoChange(gasto.id, 'origen', e.target.value)
                                                        }
                                                    />
                                                </div>

                                                {/* Destino */}
                                                <div className="nv-field-group">
                                                    <div className="nv-label-row">
                                                        <label>Destino</label>
                                                        <label className="nv-na-checkbox-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={gasto.destino === 'N/A'}
                                                                onChange={(e) =>
                                                                    handleGastoChange(
                                                                        gasto.id,
                                                                        'destino',
                                                                        e.target.checked ? 'N/A' : ''
                                                                    )
                                                                }
                                                            />
                                                            <span>N/A</span>
                                                        </label>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Ej: Matansa"
                                                        value={gasto.destino}
                                                        disabled={gasto.destino === 'N/A'}
                                                        onChange={(e) =>
                                                            handleGastoChange(gasto.id, 'destino', e.target.value)
                                                        }
                                                    />
                                                </div>

                                                {/* ¿Tiene soporte? */}
                                                <div className="nv-field-group">
                                                    <label>¿Tiene soporte?</label>
                                                    <div className="nv-soporte-toggle-group">
                                                        <button
                                                            type="button"
                                                            className={`nv-toggle-btn ${gasto.tiene_soporte === 'si' ? 'nv-toggle-btn--active' : ''}`}
                                                            onClick={() => handleGastoChange(gasto.id, 'tiene_soporte', 'si')}
                                                        >
                                                            Sí
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`nv-toggle-btn ${gasto.tiene_soporte === 'no' ? 'nv-toggle-btn--active' : ''}`}
                                                            onClick={() => handleGastoChange(gasto.id, 'tiene_soporte', 'no')}
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Valor del gasto */}
                                                <div className="nv-field-group">
                                                    <label>Valor del gasto (COP) *</label>
                                                    <input
                                                        type="number"
                                                        placeholder="$0"
                                                        value={gasto.valor}
                                                        onChange={(e) =>
                                                            handleGastoChange(gasto.id, 'valor', e.target.value)
                                                        }
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            {/* Soporte (opcional) dentro de CADA ítem */}
                                            {gasto.tiene_soporte === 'si' && (
                                                <div className="nv-gasto-soporte-box">
                                                    <span className="nv-soporte-label">Soporte (opcional)</span>
                                                    {gasto.previewUrl ? (
                                                        <div className="nv-soporte-preview-wrap">
                                                            <img
                                                                src={gasto.previewUrl}
                                                                alt="Vista previa del soporte"
                                                                className="nv-soporte-thumb"
                                                            />
                                                            <div className="nv-soporte-preview-actions">
                                                                <label className="nv-foto-btn">
                                                                    📷 Cambiar foto
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        onChange={(e) => handleFileChange(gasto.id, e)}
                                                                        hidden
                                                                    />
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    className="nv-foto-remove-btn"
                                                                    onClick={() => handleRemoveFile(gasto.id)}
                                                                >
                                                                    Quitar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <label className="nv-foto-btn nv-foto-btn--empty">
                                                            📷 Adjuntar foto
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                onChange={(e) => handleFileChange(gasto.id, e)}
                                                                hidden
                                                            />
                                                        </label>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    className="nv-add-btn"
                                    onClick={handleAddGasto}
                                >
                                    + Agregar otro gasto
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* ── SIDEBAR SUMMARY CARD ── */}
                    <div className="nv-summary-col">
                        <div className="nv-card nv-summary-card">
                            <h3 className="nv-summary-title">Resumen del registro</h3>

                            <div className="nv-summary-rows">
                                <div className="nv-summary-row">
                                    <span>Total de gastos</span>
                                    <strong>{totalGastosCount}</strong>
                                </div>
                                <div className="nv-summary-row nv-summary-row--highlight">
                                    <span>Valor total</span>
                                    <strong>${totalValor.toLocaleString('es-CO')}</strong>
                                </div>
                                <div className="nv-summary-row">
                                    <span>Con soporte</span>
                                    <strong style={{ color: 'var(--color-aprobado)' }}>
                                        {conSoporteCount}
                                    </strong>
                                </div>
                                <div className="nv-summary-row">
                                    <span>Sin soporte</span>
                                    <strong style={{ color: 'var(--color-pendiente)' }}>
                                        {sinSoporteCount}
                                    </strong>
                                </div>

                                {asignacionDetalle ? (
                                    <>
                                        <hr className="nv-summary-divider" />
                                        <div className="nv-summary-row">
                                            <span>Anticipo asignación</span>
                                            <strong>{formatCOP(anticipoAsig)}</strong>
                                        </div>
                                        <div className="nv-summary-row nv-summary-row--saldo">
                                            <span>Saldo restante asignación</span>
                                            <strong>{formatCOP(saldoGSB)}</strong>
                                        </div>
                                    </>
                                ) : (
                                    <div className="nv-summary-row" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#64748B' }}>
                                        <span>Origen:</span>
                                        <strong>Viático Independiente</strong>
                                    </div>
                                )}
                            </div>

                            <div className="nv-consejo-box">
                                <span className="nv-consejo-icon">💡</span>
                                <div>
                                    <strong>Consejo</strong>
                                    <p>
                                        Puedes adjuntar fotos por cada gasto. La evidencia es opcional.
                                    </p>
                                </div>
                            </div>

                            <div className="nv-verificaciones-box">
                                <span className="nv-verif-title">Antes de enviar, verifica:</span>
                                <ul>
                                    <li>✓ Todos los gastos registrados</li>
                                    <li>✓ Valores correctos</li>
                                    <li>✓ Soportes (opcional)</li>
                                </ul>
                            </div>

                            <button
                                type="button"
                                className="nv-submit-btn"
                                onClick={handleSubmit}
                                disabled={loading}
                            >
                                {loading ? 'Enviando viáticos...' : '🚀 Revisar y enviar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </TecnicoLayout>
    );
}
