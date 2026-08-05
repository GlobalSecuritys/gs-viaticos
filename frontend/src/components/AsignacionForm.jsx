import { useState } from 'react';
import { TIPOS_ASIGNACION, LABEL_TIPO_ASIGNACION } from '../utils/asignaciones';
import './AsignacionForm.css';

const VACIO = {
    tecnico_id: '',
    tipo: '',
    cliente: '',
    empresa: '',
    ciudad: '',
    fecha_inicio: '',
    fecha_fin: '',
    observaciones: '',
};

// tecnicos: [{id, nombre, codigo_empleado}] — ya filtrados por rol 'tecnico'.
// inicial: asignación existente cuando el form se usa en modo edición.
// puedeReasignar: si el usuario actual puede cambiar el técnico (SuperAdmin/Admin sí).
export default function AsignacionForm({ tecnicos, inicial, onSubmit, onCancelar, enviando }) {
    const [form, setForm] = useState(() =>
        inicial
            ? {
                tecnico_id: String(inicial.tecnico_id ?? ''),
                tipo: inicial.tipo ?? '',
                cliente: inicial.cliente ?? '',
                empresa: inicial.empresa ?? '',
                ciudad: inicial.ciudad ?? '',
                fecha_inicio: inicial.fecha_inicio ?? '',
                fecha_fin: inicial.fecha_fin ?? '',
                observaciones: inicial.observaciones ?? '',
            }
            : VACIO
    );
    const [error, setError] = useState('');

    function actualizar(campo, valor) {
        setForm((f) => ({ ...f, [campo]: valor }));
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!form.tecnico_id || !form.tipo || !form.cliente || !form.ciudad || !form.fecha_inicio || !form.fecha_fin) {
            setError('Completa técnico, tipo, cliente, ciudad y las dos fechas.');
            return;
        }
        if (form.fecha_fin < form.fecha_inicio) {
            setError('La fecha final no puede ser anterior a la fecha de inicio.');
            return;
        }
        setError('');
        onSubmit({ ...form, tecnico_id: Number(form.tecnico_id) });
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
                    <select value={form.tipo} onChange={(e) => actualizar('tipo', e.target.value)}>
                        <option value="">Selecciona...</option>
                        {TIPOS_ASIGNACION.map((t) => (
                            <option key={t} value={t}>{LABEL_TIPO_ASIGNACION[t]}</option>
                        ))}
                    </select>
                </label>

                <label>
                    Cliente
                    <input
                        type="text"
                        value={form.cliente}
                        onChange={(e) => actualizar('cliente', e.target.value)}
                        placeholder="Ej: Banco Santander"
                    />
                </label>

                <label>
                    Empresa
                    <input
                        type="text"
                        value={form.empresa}
                        onChange={(e) => actualizar('empresa', e.target.value)}
                        placeholder="Opcional"
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
        </form>
    );
}
