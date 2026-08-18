import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import TecnicoLayout from '../components/TecnicoLayout';
import { LABEL_TIPO_GASTO, formatCOP, formatFechaLarga } from '../utils/personal';
import './Forms.css';
import './MisViaticos.css';

const LABEL_ESTADO = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

const CONCEPTOS = [
  { id: 'alimentacion', label: 'Alimentación' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'peajes', label: 'Peajes' },
  { id: 'parqueadero', label: 'Parqueadero' },
  { id: 'otros', label: 'Otros' },
];

export default function MisViaticos() {
  const navigate = useNavigate();
  const [viaticos, setViaticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Estados para Modal de Edición
  const [viaticoEditando, setViaticoEditando] = useState(null);
  const [editForm, setEditForm] = useState({
    cliente: '',
    ciudad: '',
    ot: '',
    tipo_gasto: 'alimentacion',
    valor: '',
    descripcion: '',
    fecha: '',
  });
  const [mostrarFechaEdit, setMostrarFechaEdit] = useState(false);
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [errorEdit, setErrorEdit] = useState('');

  // Estados para Modal de Eliminación
  const [viaticoEliminando, setViaticoEliminando] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  useEffect(() => {
    let activo = true;
    api
      .get('/viaticos')
      .then(({ data }) => {
        if (activo) setViaticos(data || []);
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar tus viáticos.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  function esDescripcionEstructurada(str) {
    if (!str || typeof str !== 'string') return false;
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }

  function abrirEditar(v) {
    setViaticoEditando(v);
    setEditForm({
      cliente: v.cliente || '',
      ciudad: v.ciudad || '',
      tipo_gasto: v.tipo_gasto || 'alimentacion',
      valor: v.valor || '',
      descripcion: esDescripcionEstructurada(v.descripcion) ? '' : (v.descripcion || ''),
      fecha: v.fecha ? v.fecha.slice(0, 10) : '',
    });
    setMostrarFechaEdit(false);
    setErrorEdit('');
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!viaticoEditando) return;

    setGuardandoEdit(true);
    setErrorEdit('');

    try {
      const payload = {
        cliente: editForm.cliente,
        ciudad: editForm.ciudad,
        ot: viaticoEditando.ot,
        tipo_gasto: editForm.tipo_gasto,
        valor: Number(editForm.valor),
        descripcion: editForm.descripcion || null,
      };

      if (mostrarFechaEdit && editForm.fecha) {
        payload.fecha = editForm.fecha;
      }

      const { data: viaticoActualizado } = await api.put(`/viaticos/${viaticoEditando.id}`, payload);

      setViaticos((prev) =>
        prev.map((item) => (item.id === viaticoActualizado.id ? viaticoActualizado : item))
      );
      setViaticoEditando(null);
    } catch (err) {
      setErrorEdit(err.response?.data?.detail || 'No se pudo editar el viático.');
    } finally {
      setGuardandoEdit(false);
    }
  }

  function abrirEliminar(v) {
    setViaticoEliminando(v);
    setErrorEliminar('');
  }

  async function handleConfirmarEliminar() {
    if (!viaticoEliminando) return;

    setEliminando(true);
    setErrorEliminar('');

    try {
      await api.delete(`/viaticos/${viaticoEliminando.id}`);
      setViaticos((prev) => prev.filter((item) => item.id !== viaticoEliminando.id));
      setViaticoEliminando(null);
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || 'No se pudo eliminar el viático.');
    } finally {
      setEliminando(false);
    }
  }

  return (
    <TecnicoLayout>
      <div className="mv-root" style={{ padding: '2rem 1.5rem', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <header className="form-header">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Volver
          </button>
          <div className="form-header-title">
            <h1>Mis Viáticos</h1>
            <p>Historial y estado de tus viáticos registrados</p>
          </div>
          <button className="btn-nuevo" onClick={() => navigate('/nuevo-viatico')}>
            + Nuevo Viático
          </button>
        </header>

        <div className="mv-body">
          {error && (
            <div className="form-error" role="alert">
              <span>⚠</span> {error}
            </div>
          )}

          {loading ? (
            <div className="mv-loading">
              <div className="mv-spinner" />
              <span>Cargando tus viáticos…</span>
            </div>
          ) : viaticos.length === 0 ? (
            <div className="mv-empty">
              <span className="mv-empty-icon">📋</span>
              <p>Todavía no has registrado ningún viático.</p>
              <button className="btn-primary" onClick={() => navigate('/nuevo-viatico')}>
                Registrar el primero
              </button>
            </div>
          ) : (
            <div className="mv-table-wrap">
              <table className="mv-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Ciudad</th>
                    <th>Tipo</th>
                    <th className="text-right">Valor</th>
                    <th className="text-center">Evidencia</th>
                    <th>Estado</th>
                    <th className="text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {viaticos.map((v) => (
                    <tr key={v.id}>
                      <td className="td-date">{formatFechaLarga(v.fecha)}</td>
                      <td className="td-main">
                        <div>{v.cliente}</div>
                        {v.asignacion_id ? (
                          <span style={{ fontSize: '0.73rem', color: '#1D4ED8', background: '#EFF6FF', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }} title={`ID interno: #${v.asignacion_id}`}>
                            📍 {v.cliente || `Asig. #${v.asignacion_id}`}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.73rem', color: '#64748B', background: '#F1F5F9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                            📄 Independiente {v.monto_presupuesto ? `(${formatCOP(v.monto_presupuesto)})` : '(Habilitación manual por admin)'}
                          </span>
                        )}
                      </td>
                      <td>{v.ciudad}</td>
                      <td>
                        <span className="badge-tipo">
                          {LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}
                        </span>
                      </td>
                      <td className="td-valor text-right">{formatCOP(v.valor)}</td>
                      <td className="text-center">
                        {v.evidencias?.length > 0 ? (
                          <span className="badge-evidencia">📎 {v.evidencias.length}</span>
                        ) : (
                          <span className="badge-evidencia badge-evidencia--vacio">Sin fotos</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge-estado badge-estado--${v.estado}`}>
                          {LABEL_ESTADO[v.estado] || v.estado}
                        </span>
                        {v.comentario_admin && (
                          <div style={{ fontSize: '0.75rem', color: '#B45309', marginTop: '0.35rem', background: '#FFFBEB', padding: '0.25rem 0.4rem', borderRadius: '4px', border: '1px solid #FDE68A', maxWidth: '200px', wordBreak: 'break-word' }} title={v.comentario_admin}>
                            💬 {v.comentario_admin}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        {v.estado === 'pendiente' ? (
                          <div className="mv-acciones-btns">
                            <button
                              type="button"
                              className="mv-btn-accion mv-btn-accion--edit"
                              onClick={() => abrirEditar(v)}
                              title="Editar viático"
                            >
                              ✏ Editar
                            </button>
                            <button
                              type="button"
                              className="mv-btn-accion mv-btn-accion--del"
                              onClick={() => abrirEliminar(v)}
                              title="Eliminar viático"
                            >
                              🗑 Borrar
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL DE EDICIÓN */}
        {viaticoEditando && (
          <div className="mv-modal-overlay">
            <div className="mv-modal">
              <div className="mv-modal-header">
                <h2>Editar Viático #{viaticoEditando.id}</h2>
                <button
                  type="button"
                  className="mv-modal-close"
                  onClick={() => setViaticoEditando(null)}
                >
                  ✕
                </button>
              </div>

              {errorEdit && (
                <div className="form-error" style={{ margin: '1rem 1.25rem 0' }}>
                  <span>⚠</span> {errorEdit}
                </div>
              )}

              <form onSubmit={handleGuardarEdicion} className="mv-modal-body">
                <div className="mv-form-grid">
                  <div className="mv-form-field">
                    <label>Cliente</label>
                    <input
                      type="text"
                      required
                      value={editForm.cliente}
                      onChange={(e) => setEditForm({ ...editForm, cliente: e.target.value })}
                    />
                  </div>

                  <div className="mv-form-field">
                    <label>Ciudad / Ubicación</label>
                    <input
                      type="text"
                      required
                      value={editForm.ciudad}
                      onChange={(e) => setEditForm({ ...editForm, ciudad: e.target.value })}
                    />
                  </div>

                  <div className="mv-form-field">
                    <label>Tipo de Gasto</label>
                    <select
                      value={editForm.tipo_gasto}
                      onChange={(e) => setEditForm({ ...editForm, tipo_gasto: e.target.value })}
                    >
                      {CONCEPTOS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mv-form-field">
                    <label>Valor (COP)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editForm.valor}
                      onChange={(e) => setEditForm({ ...editForm, valor: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mv-form-field" style={{ marginTop: '0.85rem' }}>
                  <label>Descripción / Observación (opcional)</label>
                  <textarea
                    rows={2}
                    value={editForm.descripcion}
                    onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
                  />
                </div>

                {/* Sección colapsable para editar fecha */}
                <div className="mv-fecha-colapsable">
                  <button
                    type="button"
                    className="mv-btn-colapsable"
                    onClick={() => setMostrarFechaEdit((v) => !v)}
                  >
                    <span>Editar fecha (opcional)</span>
                    <span>{mostrarFechaEdit ? '▴' : '▾'}</span>
                  </button>

                  {mostrarFechaEdit && (
                    <div className="mv-fecha-input-wrap">
                      <label>Nueva fecha</label>
                      <input
                        type="date"
                        value={editForm.fecha}
                        onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                <div className="mv-modal-footer">
                  <button
                    type="button"
                    className="btn-back"
                    onClick={() => setViaticoEditando(null)}
                    disabled={guardandoEdit}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" disabled={guardandoEdit}>
                    {guardandoEdit ? 'Guardando…' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
        {viaticoEliminando && (
          <div className="mv-modal-overlay">
            <div className="mv-modal mv-modal--small">
              <div className="mv-modal-header">
                <h2>Eliminar Viático #{viaticoEliminando.id}</h2>
                <button
                  type="button"
                  className="mv-modal-close"
                  onClick={() => setViaticoEliminando(null)}
                >
                  ✕
                </button>
              </div>

              {errorEliminar && (
                <div className="form-error" style={{ margin: '1rem 1.25rem 0' }}>
                  <span>⚠</span> {errorEliminar}
                </div>
              )}

              <div className="mv-modal-body">
                <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--color-text)' }}>
                  ¿Estás seguro de que deseas eliminar el viático de{' '}
                  <strong>{viaticoEliminando.cliente}</strong> por{' '}
                  <strong>{formatCOP(viaticoEliminando.valor)}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                  Esta acción no se puede deshacer y notificará al administrador.
                </p>
              </div>

              <div className="mv-modal-footer">
                <button
                  type="button"
                  className="btn-back"
                  onClick={() => setViaticoEliminando(null)}
                  disabled={eliminando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ backgroundColor: '#DC2626' }}
                  onClick={handleConfirmarEliminar}
                  disabled={eliminando}
                >
                  {eliminando ? 'Eliminando…' : 'Sí, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TecnicoLayout>
  );
}
