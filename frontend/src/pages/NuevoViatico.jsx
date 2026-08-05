import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { subirEvidencias } from '../services/api';
import SelectorEvidencias from '../components/SelectorEvidencias';
import './Forms.css';

const TIPOS_GASTO = [
  { value: 'alimentacion', label: 'Alimentación' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'hotel', label: 'Hotel / Hospedaje' },
  { value: 'peajes', label: 'Peajes' },
  { value: 'parqueadero', label: 'Parqueadero' },
  { value: 'otros', label: 'Otros' },
];

const INITIAL_STATE = {
  fecha: '',
  cliente: '',
  ciudad: '',
  ot: '',
  tipo_gasto: '',
  valor: '',
  descripcion: '',
};

export default function NuevoViatico() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_STATE);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [archivos, setArchivos] = useState([]);
  const [errorEvidencias, setErrorEvidencias] = useState('');
  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const valor = parseFloat(form.valor);
    if (isNaN(valor) || valor <= 0) {
      setError('El valor debe ser un número mayor a 0.');
      return;
    }

    if (archivos.length === 0) {
      setError('Debes adjuntar al menos 1 fotografía como evidencia.');
      return;
    }

    setLoading(true);
    try {
      const { data: viaticoCreado } = await api.post('/viaticos', {
        ...form,
        valor,
      });

      try {
        await subirEvidencias(viaticoCreado.id, archivos);
      } catch (errEvidencias) {
        setError(
          'El viático se guardó, pero hubo un problema subiendo las fotografías. ' +
          'Puedes intentar agregarlas más tarde desde el detalle del viático.'
        );
        setLoading(false);
        return;
      }

      navigate('/mis-viaticos');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d) => d.msg).join(' · '));
      } else {
        setError(detail || 'Error al registrar el viático. Intente nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="form-root">
      <header className="form-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Volver
        </button>
        <div className="form-header-title">
          <h1>Nuevo Viático</h1>
          <p>Complete todos los campos para registrar el gasto</p>
        </div>
      </header>

      <div className="form-body">
        <form onSubmit={handleSubmit} className="viatico-form">
          {error && (
            <div className="form-error" role="alert">
              <span>⚠</span> {error}
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="fecha">Fecha</label>
              <input
                id="fecha"
                name="fecha"
                type="date"
                value={form.fecha}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="tipo_gasto">Tipo de Gasto</label>
              <select
                id="tipo_gasto"
                name="tipo_gasto"
                value={form.tipo_gasto}
                onChange={handleChange}
                required
              >
                <option value="" disabled>Seleccionar tipo…</option>
                {TIPOS_GASTO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="cliente">Cliente</label>
              <input
                id="cliente"
                name="cliente"
                type="text"
                value={form.cliente}
                onChange={handleChange}
                placeholder="Ej. Banco de Bogotá"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="ot">Orden de Trabajo (OT)</label>
              <input
                id="ot"
                name="ot"
                type="text"
                value={form.ot}
                onChange={handleChange}
                placeholder="Ej. OT-2026-001"
                required
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="ciudad">Ciudad</label>
              <input
                id="ciudad"
                name="ciudad"
                type="text"
                value={form.ciudad}
                onChange={handleChange}
                placeholder="Ej. Bogotá"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="valor">Valor (COP)</label>
              <input
                id="valor"
                name="valor"
                type="number"
                min="0.01"
                step="0.01"
                value={form.valor}
                onChange={handleChange}
                placeholder="Ej. 85000"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="descripcion">Descripción <span className="label-opt">(opcional)</span></label>
            <textarea
              id="descripcion"
              name="descripcion"
              value={form.descripcion}
              onChange={handleChange}
              rows={3}
              placeholder="Detalle adicional del gasto…"
            />
          </div>

          <SelectorEvidencias
            archivos={archivos}
            setArchivos={setArchivos}
            error={errorEvidencias}
            setError={setErrorEvidencias}
          />

          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar Viático'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
