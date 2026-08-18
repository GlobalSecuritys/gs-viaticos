import { useState, useMemo } from 'react';
import ModalSeleccionarCliente from './ModalSeleccionarCliente';
import './AsignacionForm.css';

const VACIO = {
    tecnico_id: '',
    tipo: '',
    cliente: '',
    empresa: '',
    ciudad: '',
    fecha_inicio: '',
    fecha_fin: '',
    monto_anticipo: '',
    observaciones: '',
};

const OPCIONES_TIPO_PRINCIPALES = [
    { id: 'mantenimiento', label: 'Mantenimiento' },
    { id: 'oficina', label: 'Oficina' },
    { id: 'oficina_general', label: 'Oficina General' },
    { id: 'preventivo_rtc', label: 'Preventivo RTC' },
    { id: 'rtc', label: 'RTC' },
];

export default function AsignacionForm({ tecnicos, inicial, onSubmit, onCancelar, enviando, tecnicoPreseleccionado = null }) {
    const [form, setForm] = useState(() => {
        if (inicial) {
            return {
                tecnico_id: String(inicial.tecnico_id ?? ''),
                tipo: inicial.tipo ?? '',
                cliente: inicial.cliente ?? '',
                empresa: inicial.empresa ?? '',
                ciudad: inicial.ciudad ?? '',
                fecha_inicio: inicial.fecha_inicio ?? '',
                fecha_fin: inicial.fecha_fin ?? '',
                monto_anticipo: inicial.monto_anticipo ?? '',
                observaciones: inicial.observaciones ?? '',
            };
        }
        return {
            ...VACIO,
            tecnico_id: tecnicoPreseleccionado ? String(tecnicoPreseleccionado) : '',
        };
    });

    const [subtipoOficina, setSubtipoOficina] = useState(() => {
        if (inicial?.tipo === 'oficina_preventivo') return 'preventivo';
        if (inicial?.tipo === 'oficina_correctivo' || inicial?.tipo === 'oficina') return 'correctivo';
        return 'correctivo';
    });

    const [error, setError] = useState('');
    const [modalClienteAbierto, setModalClienteAbierto] = useState(false);

    // Determinar qué opción principal está seleccionada
    const tipoPrincipalSeleccionado = useMemo(() => {
        if (form.tipo === 'oficina' || form.tipo === 'oficina_correctivo' || form.tipo === 'oficina_preventivo') {
            return 'oficina';
        }
        return form.tipo;
    }, [form.tipo]);

    function actualizar(campo, valor) {
        setForm((f) => ({ ...f, [campo]: valor }));
    }

    function handleCambioTipoPrincipal(nuevoTipo) {
        if (nuevoTipo === 'oficina') {
            actualizar('tipo', subtipoOficina === 'preventivo' ? 'oficina_preventivo' : 'oficina_correctivo');
        } else {
            actualizar('tipo', nuevoTipo);
        }
    }

    function handleCambioSubtipoOficina(nuevoSubtipo) {
        setSubtipoOficina(nuevoSubtipo);
        actualizar('tipo', nuevoSubtipo === 'preventivo' ? 'oficina_preventivo' : 'oficina_correctivo');
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!form.tecnico_id || !form.tipo || !form.cliente || !form.ciudad || !form.fecha_inicio || !form.fecha_fin) {
            setError('Completa técnico, tipo, proyecto, ciudad y las dos fechas.');
            return;
        }
        if (form.fecha_fin < form.fecha_inicio) {
            setError('La fecha final no puede ser anterior a la fecha de inicio.');
            return;
        }
        setError('');
        onSubmit({
            ...form,
            tecnico_id: Number(form.tecnico_id),
            monto_anticipo: Number(form.monto_anticipo || 0),
        });
    }

    return (
        <form className="asig-form" onSubmit={handleSubmit}>
            {error && <p className="asig-form-error">{error}</p>}

            <div className="asig-form-grid">
                <label>
                    Técnico
                    <select
                        value={form.tecnico_id}
                        onChange={(e) => actualizar('tecnico_id', e.target.value)}
                        disabled={Boolean(tecnicoPreseleccionado && !inicial)}
                    >
                        <option value="">Selecciona un técnico...</option>
                        {tecnicos.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.nombre}{t.codigo_empleado ? ` (${t.codigo_empleado})` : ''}
                            </option>
                        ))}
                    </select>
                </label>

                <div>
                    <label>
                        Tipo de asignación
                        <select
                            value={tipoPrincipalSeleccionado}
                            onChange={(e) => handleCambioTipoPrincipal(e.target.value)}
                        >
                            <option value="">Selecciona...</option>
                            {OPCIONES_TIPO_PRINCIPALES.map((opt) => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                        </select>
                    </label>

                    {tipoPrincipalSeleccionado === 'oficina' && (
                        <div style={{
                            marginTop: '0.6rem',
                            padding: '0.65rem 0.85rem',
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.35rem',
                        }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                                Modalidad de Oficina:
                            </span>
                            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', margin: 0, fontSize: '0.84rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="subtipo_oficina"
                                        value="correctivo"
                                        checked={subtipoOficina === 'correctivo' || form.tipo === 'oficina_correctivo' || form.tipo === 'oficina'}
                                        onChange={() => handleCambioSubtipoOficina('correctivo')}
                                    />
                                    Correctivo
                                </label>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', margin: 0, fontSize: '0.84rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="subtipo_oficina"
                                        value="preventivo"
                                        checked={subtipoOficina === 'preventivo' || form.tipo === 'oficina_preventivo'}
                                        onChange={() => handleCambioSubtipoOficina('preventivo')}
                                    />
                                    Preventivo
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <label>
                    Proyecto
                    <div
                        className="asig-cliente-input-btn"
                        onClick={() => setModalClienteAbierto(true)}
                        tabIndex={0}
                        role="button"
                    >
                        <span className={form.cliente ? 'asig-cliente-val' : 'asig-cliente-ph'}>
                            {form.cliente || 'Selecciona un proyecto oficial...'}
                        </span>
                        <span className="asig-cliente-icon">🔍</span>
                    </div>
                </label>

                <label>
                    Oficina
                    <input
                        type="text"
                        value={form.empresa}
                        onChange={(e) => actualizar('empresa', e.target.value)}
                        placeholder="Ej. Sede Norte, Sucursal Centro (Opcional)"
                    />
                </label>

                <label>
                    Ciudad
                    <input
                        type="text"
                        value={form.ciudad}
                        onChange={(e) => actualizar('ciudad', e.target.value)}
                    />
                </label>

                <label>
                    Fecha inicio
                    <input
                        type="date"
                        value={form.fecha_inicio}
                        onChange={(e) => actualizar('fecha_inicio', e.target.value)}
                    />
                </label>

                <label>
                    Fecha final
                    <input
                        type="date"
                        value={form.fecha_fin}
                        onChange={(e) => actualizar('fecha_fin', e.target.value)}
                    />
                </label>

                <label>
                    Monto de anticipo entregado (COP)
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.monto_anticipo}
                        onChange={(e) => actualizar('monto_anticipo', e.target.value)}
                        placeholder="$0"
                    />
                </label>
            </div>

            <label className="asig-form-observaciones">
                Observaciones
                <textarea
                    rows={3}
                    value={form.observaciones}
                    onChange={(e) => actualizar('observaciones', e.target.value)}
                    placeholder="Opcional"
                />
            </label>

            <div className="asig-form-acciones">
                <button type="button" className="admin-back-btn" onClick={onCancelar}>Cancelar</button>
                <button type="submit" className="personal-card-btn" disabled={enviando}>
                    {enviando ? 'Guardando...' : inicial ? 'Guardar cambios' : 'Crear asignación'}
                </button>
            </div>

            {modalClienteAbierto && (
                <ModalSeleccionarCliente
                    clienteSeleccionado={form.cliente}
                    onSeleccionar={(c) => actualizar('cliente', c)}
                    onClose={() => setModalClienteAbierto(false)}
                />
            )}
        </form>
    );
}
