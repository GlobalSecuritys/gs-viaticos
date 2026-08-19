import { useState } from 'react';
import ModalSeleccionarCliente from './ModalSeleccionarCliente';
import { formatMiles, limpiarNumero } from '../utils/personal';
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

const OPCIONES_TIPO = [
    { id: 'mantenimiento', label: 'Mantenimiento' },
    { id: 'correctivo', label: 'Correctivo' },
    { id: 'preventivo', label: 'Preventivo' },
    { id: 'preventivo_rtc', label: 'Preventivo RTC' },
    { id: 'rtc', label: 'RTC' },
    { id: 'oficina', label: 'Oficina' },
];

export default function AsignacionForm({ tecnicos, inicial, onSubmit, onCancelar, enviando, tecnicoPreseleccionado = null }) {
    const [form, setForm] = useState(() => {
        if (inicial) {
            let tipoInicial = inicial.tipo ?? '';
            if (tipoInicial === 'oficina_correctivo') tipoInicial = 'correctivo';
            if (tipoInicial === 'oficina_preventivo') tipoInicial = 'preventivo';

            return {
                tecnico_id: String(inicial.tecnico_id ?? ''),
                tipo: tipoInicial,
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

    const [error, setError] = useState('');
    const [modalClienteAbierto, setModalClienteAbierto] = useState(false);

    function actualizar(campo, valor) {
        setForm((f) => ({ ...f, [campo]: valor }));
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

                <label>
                    Tipo de asignación
                    <select
                        value={form.tipo}
                        onChange={(e) => actualizar('tipo', e.target.value)}
                    >
                        <option value="">Selecciona...</option>
                        {OPCIONES_TIPO.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                    </select>
                </label>

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
                        type="text"
                        inputMode="numeric"
                        value={formatMiles(form.monto_anticipo)}
                        onChange={(e) => actualizar('monto_anticipo', limpiarNumero(e.target.value))}
                        placeholder="$ 0"
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
