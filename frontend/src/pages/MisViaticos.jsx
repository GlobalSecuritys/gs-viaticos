import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { obtenerMisAsignacionesActivas } from '../services/asignaciones';
import TecnicoLayout from '../components/TecnicoLayout';
import ModalSeleccionarTipoViatico from '../components/ModalSeleccionarTipoViatico';
import { LABEL_TIPO_GASTO, formatCOP, formatFechaLarga, formatMiles, limpiarNumero } from '../utils/personal';
import { LABEL_TIPO_ASIGNACION } from '../utils/asignaciones';
import './Forms.css';
import './MisViaticos.css';

const LABEL_ESTADO = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

const ICONO_GASTO = {
  alimentacion: '🍽',
  transporte: '🚗',
  hotel: '🏨',
  peajes: '🛣',
  parqueadero: '🅿',
  materiales: '📦',
  otros: '📎',
};

const CONCEPTOS = [
  { id: 'alimentacion', label: 'Alimentación' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'peajes', label: 'Peajes' },
  { id: 'parqueadero', label: 'Parqueadero' },
  { id: 'materiales', label: 'Materiales' },
];

export default function MisViaticos() {
  const navigate = useNavigate();
  const [viaticos, setViaticos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mostrarModalTipoViatico, setMostrarModalTipoViatico] = useState(false);
  const [colapsadas, setColapsadas] = useState({});

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

  const [viaticoEliminando, setViaticoEliminando] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  useEffect(() => {
    let activo = true;
    Promise.all([
      api.get('/viaticos').catch(() => ({ data: [] })),
      obtenerMisAsignacionesActivas().catch(() => ({ data: [] })),
    ])
      .then(([resViaticos, resAsig]) => {
        if (activo) {
          setViaticos(resViaticos.data || []);
          setAsignaciones(resAsig.data || []);
        }
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar tus viáticos.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => { activo = false; };
  }, []);

  const asignacionesMap = useMemo(() => {
    const map = new Map();
    asignaciones.forEach((a) => map.set(a.id, a));
    return map;
  }, [asignaciones]);

  const { grupos, independientes } = useMemo(() => {
    const porAsignacion = {};
    const libres = [];
    viaticos.forEach((v) => {
      if (v.asignacion_id) {
        if (!porAsignacion[v.asignacion_id]) {
          const asig = asignacionesMap.get(v.asignacion_id);
          const resumen = v.asignacion_resumen || (asig ? {
            id: asig.id,
            cliente: asig.cliente,
            empresa: asig.empresa,
            tipo: asig.tipo,
            ciudad: asig.ciudad,
            monto_anticipo: asig.monto_anticipo,
            total_gastado: asig.total_gastado,
            saldo_restante: asig.saldo_restante,
          } : null);

          porAsignacion[v.asignacion_id] = {
            asignacion_id: v.asignacion_id,
            resumen,
            asigObj: asig || null,
            viaticos: [],
          };
        }
        porAsignacion[v.asignacion_id].viaticos.push(v);
      } else {
        libres.push(v);
      }
    });
    const gruposOrdenados = Object.values(porAsignacion).sort(
      (a, b) => b.viaticos.length - a.viaticos.length
    );
    return { grupos: gruposOrdenados, independientes: libres };
  }, [viaticos, asignacionesMap]);

  function toggleColapsada(key) {
    setColapsadas((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function esDescripcionEstructurada(str) {
    if (!str || typeof str !== 'string') return false;
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null;
    } catch { return false; }
  }

  function abrirEditar(v) {
    setViaticoEditando(v);
    setErrorEdit('');
    setMostrarFechaEdit(false);
    setEditForm({
      cliente: v.cliente || '',
      ciudad: v.ciudad || '',
      ot: v.ot || '',
      tipo_gasto: v.tipo_gasto || 'alimentacion',
      valor: v.valor || '',
      descripcion: esDescripcionEstructurada(v.descripcion) ? '' : (v.descripcion || ''),
      fecha: v.fecha || '',
    });
  }

  function abrirEliminar(v) {
    setViaticoEliminando(v);
    setErrorEliminar('');
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    setGuardandoEdit(true);
    setErrorEdit('');
    try {
      const payload = {
        cliente: editForm.cliente,
        ciudad: editForm.ciudad,
        ot: editForm.ot,
        tipo_gasto: editForm.tipo_gasto,
        valor: parseFloat(editForm.valor),
        descripcion: editForm.descripcion || null,
      };
      if (mostrarFechaEdit && editForm.fecha) payload.fecha = editForm.fecha;
      const { data } = await api.put(`/viaticos/${viaticoEditando.id}`, payload);
      setViaticos((prev) => prev.map((item) => item.id === viaticoEditando.id ? { ...item, ...data } : item));
      setViaticoEditando(null);
    } catch (err) {
      setErrorEdit(err.response?.data?.detail || 'No se pudo guardar el viatico.');
    } finally {
      setGuardandoEdit(false);
    }
  }

  async function handleConfirmarEliminar() {
    setEliminando(true);
    try {
      await api.delete(`/viaticos/${viaticoEliminando.id}`);
      setViaticos((prev) => prev.filter((item) => item.id !== viaticoEliminando.id));
      setViaticoEliminando(null);
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || 'No se pudo eliminar el viatico.');
    } finally {
      setEliminando(false);
    }
  }

  function FilaViatico({ v }) {
    return (
      <div className="mv-viatico-item">
        <div className="mv-vi-izq">
          <span className="mv-vi-icono">{ICONO_GASTO[v.tipo_gasto] || '📎'}</span>
          <div className="mv-vi-info">
            <span className="mv-vi-tipo">{LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}</span>
            <span className="mv-vi-fecha">{formatFechaLarga(v.fecha)}</span>
            {v.ciudad && <span className="mv-vi-ciudad">📍 {v.ciudad}</span>}
            {v.evidencias?.length > 0 ? (
              <span className="mv-vi-ev">📎 {v.evidencias.length} foto{v.evidencias.length > 1 ? 's' : ''}</span>
            ) : (
              <span className="mv-vi-ev mv-vi-ev--vacio">Sin evidencia</span>
            )}
          </div>
        </div>
        <div className="mv-vi-der">
          <span className="mv-vi-valor">{formatCOP(v.valor)}</span>
          <span className={`mv-vi-estado mv-vi-estado--${v.estado}`}>
            {LABEL_ESTADO[v.estado] || v.estado}
          </span>
          {v.comentario_admin && (
            <span className="mv-vi-comentario" title={v.comentario_admin}>
              💬 {v.comentario_admin}
            </span>
          )}
          {v.estado === 'pendiente' && (
            <div className="mv-vi-acciones">
              <button type="button" className="mv-btn-accion mv-btn-accion--edit" onClick={() => abrirEditar(v)}>
                ✏ Editar
              </button>
              <button type="button" className="mv-btn-accion mv-btn-accion--del" onClick={() => abrirEliminar(v)}>
                🗑 Borrar
              </button>
            </div>
          )}
          {v.estado === 'rechazado' && (
            <div className="mv-vi-acciones">
              <button type="button" className="mv-btn-accion mv-btn-accion--reenviar" onClick={() => abrirEditar(v)}>
                🔄 Corregir y reenviar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function PaletaAsignacion({ grupo }) {
    const { asignacion_id, resumen, asigObj, viaticos: items } = grupo;
    const isColapsada = !!colapsadas[asignacion_id];
    const totalGrupo = items.reduce((acc, v) => acc + parseFloat(v.valor || 0), 0);
    const pendientes = items.filter((v) => v.estado === 'pendiente').length;
    const aprobados = items.filter((v) => v.estado === 'aprobado').length;
    const rechazados = items.filter((v) => v.estado === 'rechazado').length;

    const primerViatico = items[0] || {};
    const nombreCliente = resumen?.cliente || asigObj?.cliente || primerViatico.cliente || `Asignación #${asignacion_id}`;
    const nombreOficina = resumen?.empresa || asigObj?.empresa || '';
    const nombreLugar = resumen?.ciudad || asigObj?.ciudad || primerViatico.ciudad || '';
    const tipoAsig = resumen?.tipo || asigObj?.tipo || '';

    // Formato: asignacion / oficina / lugar
    const partesTitulo = [nombreCliente, nombreOficina, nombreLugar].filter(Boolean);
    const tituloPaleta = partesTitulo.length > 0 ? partesTitulo.join(' / ') : `Asignación #${asignacion_id}`;

    const anticipoAsig = resumen?.monto_anticipo || asigObj?.monto_anticipo || 0;
    const gastadoAsig = resumen?.total_gastado || asigObj?.total_gastado || totalGrupo;
    const saldoAsig = resumen?.saldo_restante !== undefined ? resumen.saldo_restante : (asigObj?.saldo_restante !== undefined ? asigObj.saldo_restante : Math.max(0, anticipoAsig - gastadoAsig));
    const saldoFavorTecnico = Number(gastadoAsig) > Number(anticipoAsig) ? Number(gastadoAsig) - Number(anticipoAsig) : 0;

    return (
      <div className="mv-paleta">
        <button
          type="button"
          className="mv-paleta-header"
          onClick={() => toggleColapsada(asignacion_id)}
          aria-expanded={!isColapsada}
        >
          <div className="mv-paleta-header-izq">
            <span className="mv-paleta-icono">📋</span>
            <div className="mv-paleta-titulo">
              <span className="mv-paleta-cliente">{tituloPaleta}</span>
              {tipoAsig && (
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569', background: '#F1F5F9', padding: '0.12rem 0.45rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  {LABEL_TIPO_ASIGNACION[tipoAsig] || tipoAsig}
                </span>
              )}
            </div>
          </div>
          <div className="mv-paleta-header-der">
            <div className="mv-paleta-badges">
              {pendientes > 0 && <span className="mv-paleta-badge mv-paleta-badge--pendiente">{pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>}
              {aprobados > 0 && <span className="mv-paleta-badge mv-paleta-badge--aprobado">{aprobados} aprobado{aprobados > 1 ? 's' : ''}</span>}
              {rechazados > 0 && <span className="mv-paleta-badge mv-paleta-badge--rechazado">{rechazados} rechazado{rechazados > 1 ? 's' : ''}</span>}
              <span className="mv-paleta-badge mv-paleta-badge--total">{formatCOP(totalGrupo)}</span>
            </div>
            <span className="mv-paleta-toggle">{isColapsada ? '▼' : '▲'}</span>
          </div>
        </button>

        {!isColapsada && (
          <div className="mv-paleta-body">
            <div className="mv-paleta-resumen">
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Anticipo</span>
                <span className="mv-pr-val">{formatCOP(anticipoAsig)}</span>
              </div>
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Gastado</span>
                <span className="mv-pr-val mv-pr-val--gastado">{formatCOP(gastadoAsig)}</span>
              </div>
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Saldo</span>
                <span className={`mv-pr-val ${parseFloat(saldoAsig) < 0 ? 'mv-pr-val--negativo' : 'mv-pr-val--saldo'}`}>
                  {formatCOP(saldoAsig)}
                </span>
              </div>
              {saldoFavorTecnico > 0 && (
                <div className="mv-paleta-resumen-item mv-paleta-resumen-item--favor-tecnico" style={{ background: '#FEF2F2', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                  <span className="mv-pr-label" style={{ color: '#991B1B', fontWeight: 700 }}>Saldo a favor técnico</span>
                  <span className="mv-pr-val" style={{ color: '#DC2626', fontWeight: 800 }}>{formatCOP(saldoFavorTecnico)}</span>
                </div>
              )}
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Items</span>
                <span className="mv-pr-val">{items.length}</span>
              </div>
            </div>
            <div className="mv-paleta-viaticos">
              {items.map((v) => <FilaViatico key={v.id} v={v} />)}
            </div>
            <div className="mv-paleta-footer">
              <button
                type="button"
                className="mv-paleta-btn-agregar"
                onClick={() => navigate(`/nuevo-viatico?asignacion_id=${asignacion_id}`)}
              >
                + Agregar gasto a esta asignacion
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <TecnicoLayout>
      <div className="mv-root" style={{ padding: '2rem 1.5rem', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <header className="form-header">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>← Volver</button>
          <div className="form-header-title">
            <h1>Mis Viaticos</h1>
            <p>Historial y estado de tus viaticos registrados</p>
          </div>
          <button className="btn-nuevo" onClick={() => setMostrarModalTipoViatico(true)}>
            + Nuevo Viatico
          </button>
        </header>

        <div className="mv-body">
          {error && <div className="form-error" role="alert"><span>⚠</span> {error}</div>}

          {loading ? (
            <div className="mv-loading"><div className="mv-spinner" /><span>Cargando tus viaticos…</span></div>
          ) : viaticos.length === 0 ? (
            <div className="mv-empty">
              <span className="mv-empty-icon">📋</span>
              <p>Todavia no has registrado ningun viatico.</p>
              <button className="btn-primary" onClick={() => setMostrarModalTipoViatico(true)}>Registrar el primero</button>
            </div>
          ) : (
            <div className="mv-grupos-wrap">
              {grupos.length > 0 && (
                <section className="mv-section">
                  <div className="mv-section-header">
                    <h2 className="mv-section-title"><span>📍</span> Por Asignacion</h2>
                    <span className="mv-section-count">{grupos.length} asignacion{grupos.length > 1 ? 'es' : ''}</span>
                  </div>
                  <div className="mv-paletas-lista">
                    {grupos.map((g) => <PaletaAsignacion key={g.asignacion_id} grupo={g} />)}
                  </div>
                </section>
              )}

              {independientes.length > 0 && (
                <section className="mv-section">
                  <div className="mv-section-header">
                    <h2 className="mv-section-title"><span>📄</span> Viaticos Independientes</h2>
                    <span className="mv-section-count">{independientes.length} registro{independientes.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="mv-paleta mv-paleta--independiente">
                    <div className="mv-paleta-viaticos">
                      {independientes.map((v) => <FilaViatico key={v.id} v={v} />)}
                    </div>
                    <div className="mv-paleta-footer">
                      <button type="button" className="mv-paleta-btn-agregar" onClick={() => navigate('/nuevo-viatico')}>
                        + Agregar viatico independiente
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {viaticoEditando && (
          <div className="mv-modal-overlay">
            <div className="mv-modal">
              <div className="mv-modal-header">
                <div>
                  <h2>Editar Viatico #{viaticoEditando.id}</h2>
                  {viaticoEditando.estado === 'rechazado' && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#D97706', fontWeight: 600 }}>
                      ⚠ Este viático fue rechazado. Al guardar se reenviará al administrador para revisión.
                    </p>
                  )}
                </div>
                <button type="button" className="mv-modal-close" onClick={() => setViaticoEditando(null)}>✕</button>
              </div>
              {errorEdit && <div className="form-error" style={{ margin: '1rem 1.25rem 0' }}><span>⚠</span> {errorEdit}</div>}
              <form onSubmit={handleGuardarEdicion} className="mv-modal-body">
                <div className="mv-form-grid">
                  <div className="mv-form-field">
                    <label>Cliente</label>
                    <input type="text" required value={editForm.cliente} onChange={(e) => setEditForm({ ...editForm, cliente: e.target.value })} />
                  </div>
                  <div className="mv-form-field">
                    <label>Ciudad / Ubicacion</label>
                    <input type="text" required value={editForm.ciudad} onChange={(e) => setEditForm({ ...editForm, ciudad: e.target.value })} />
                  </div>
                  <div className="mv-form-field">
                    <label>Tipo de Gasto</label>
                    <select value={editForm.tipo_gasto} onChange={(e) => setEditForm({ ...editForm, tipo_gasto: e.target.value })}>
                      {editForm.tipo_gasto === 'otros' && <option value="otros">Otros (Histórico)</option>}
                      {CONCEPTOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="mv-form-field">
                    <label>Valor (COP)</label>
                    <input type="text" inputMode="numeric" required placeholder="$ 0" value={formatMiles(editForm.valor)} onChange={(e) => setEditForm({ ...editForm, valor: limpiarNumero(e.target.value) })} />
                  </div>
                </div>
                <div className="mv-form-field" style={{ marginTop: '0.85rem' }}>
                  <label>Descripcion / Observacion (opcional)</label>
                  <textarea rows={2} value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} />
                </div>
                <div className="mv-fecha-colapsable">
                  <button type="button" className="mv-btn-colapsable" onClick={() => setMostrarFechaEdit((v) => !v)}>
                    <span>Editar fecha (opcional)</span>
                    <span>{mostrarFechaEdit ? '▴' : '▾'}</span>
                  </button>
                  {mostrarFechaEdit && (
                    <div className="mv-fecha-input-wrap">
                      <label>Nueva fecha</label>
                      <input type="date" value={editForm.fecha} onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value })} />
                    </div>
                  )}
                </div>
                <div className="mv-modal-footer">
                  <button type="button" className="btn-back" onClick={() => setViaticoEditando(null)} disabled={guardandoEdit}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={guardandoEdit}>
                    {guardandoEdit
                      ? 'Guardando…'
                      : viaticoEditando?.estado === 'rechazado'
                        ? '🔄 Corregir y Reenviar'
                        : 'Guardar Cambios'
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {viaticoEliminando && (
          <div className="mv-modal-overlay">
            <div className="mv-modal mv-modal--small">
              <div className="mv-modal-header">
                <h2>Eliminar Viatico #{viaticoEliminando.id}</h2>
                <button type="button" className="mv-modal-close" onClick={() => setViaticoEliminando(null)}>✕</button>
              </div>
              {errorEliminar && <div className="form-error" style={{ margin: '1rem 1.25rem 0' }}><span>⚠</span> {errorEliminar}</div>}
              <div className="mv-modal-body">
                <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--color-text)' }}>
                  Estas seguro de que deseas eliminar el viatico de <strong>{viaticoEliminando.cliente}</strong> por <strong>{formatCOP(viaticoEliminando.valor)}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                  Esta accion no se puede deshacer y notificara al administrador.
                </p>
              </div>
              <div className="mv-modal-footer">
                <button type="button" className="btn-back" onClick={() => setViaticoEliminando(null)} disabled={eliminando}>Cancelar</button>
                <button type="button" className="btn-primary" style={{ backgroundColor: '#DC2626' }} onClick={handleConfirmarEliminar} disabled={eliminando}>
                  {eliminando ? 'Eliminando…' : 'Si, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {mostrarModalTipoViatico && (
          <ModalSeleccionarTipoViatico onClose={() => setMostrarModalTipoViatico(false)} />
        )}
      </div>
    </TecnicoLayout>
  );
}
