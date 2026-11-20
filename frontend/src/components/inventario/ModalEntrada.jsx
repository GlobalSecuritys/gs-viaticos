import React, { useState, useEffect, useRef, useCallback } from 'react';
import { obtenerCatalogo, registrarEntrada } from '../../services/inventario';
import './ModalEntrada.css';

/**
 * Modal de ingreso a bodega (Entrada).
 * Props:
 *   planillaId  – ID de la planilla
 *   onClose()   – cierra el modal sin hacer nada
 *   onSuccess(resumen, mensaje) – éxito: pasa el resumen actualizado
 */
export default function ModalEntrada({ planillaId, onClose, onSuccess }) {
  const today = new Date().toISOString().split('T')[0];

  // ── Datos del encabezado ──────────────────────────────────────────────────
  const [fecha, setFecha] = useState(today);
  const [numeroOrden, setNumeroOrden] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');

  // ── Ítem actual ───────────────────────────────────────────────────────────
  const [catalogo, setCatalogo] = useState([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [descripcion, setDescripcion] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [tipoSerial, setTipoSerial] = useState('sin_serial');
  const [serialesTexto, setSerialesTexto] = useState('');
  const [idEquiposTexto, setIdEquiposTexto] = useState('');
  const [cantidad, setCantidad] = useState(1);

  // ── Lista de ítems a enviar ───────────────────────────────────────────────
  const [items, setItems] = useState([]);

  // ── Estado envío ──────────────────────────────────────────────────────────
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  const descRef = useRef(null);
  const backdropRef = useRef(null);

  // Cerrar con Esc
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Cargar catálogo
  useEffect(() => {
    setCargandoCatalogo(true);
    obtenerCatalogo(planillaId)
      .then(setCatalogo)
      .catch(() => setCatalogo([]))
      .finally(() => setCargandoCatalogo(false));
  }, [planillaId]);

  // Autocompletar
  const filtrarSugerencias = useCallback((val) => {
    if (!val.trim()) { setSugerencias([]); return; }
    const q = val.trim().toUpperCase();
    setSugerencias(catalogo.filter((c) => c.descripcion?.toUpperCase().includes(q)).slice(0, 8));
  }, [catalogo]);

  const handleDescChange = (e) => {
    const val = e.target.value;
    setDescripcion(val);
    filtrarSugerencias(val);
    setMostrarSugerencias(true);

    // Sugerir tipo serial según catálogo
    const match = catalogo.find((c) => c.descripcion?.toUpperCase() === val.trim().toUpperCase());
    if (match) setTipoSerial(match.tipo_sugerido || 'sin_serial');
  };

  const seleccionarSugerencia = (item) => {
    setDescripcion(item.descripcion);
    setTipoSerial(item.tipo_sugerido || 'sin_serial');
    setMostrarSugerencias(false);
  };

  // Agregar ítem a la lista
  const agregarItem = () => {
    setError('');
    const desc = descripcion.trim();
    if (!desc) { setError('La descripción es obligatoria.'); return; }

    if (tipoSerial === 'con_serial') {
      const seriales = serialesTexto.split('\n').map((s) => s.trim()).filter(Boolean);
      if (seriales.length === 0) { setError('Ingresa al menos un serial.'); return; }
      const dups = seriales.filter((s, i) => seriales.indexOf(s) !== i);
      if (dups.length > 0) { setError(`Seriales repetidos: ${dups.join(', ')}`); return; }
      const idEquipos = idEquiposTexto.split('\n').map((s) => s.trim());
      setItems((prev) => [...prev, { descripcion: desc, tipo_serial: 'con_serial', seriales, id_equipos: idEquipos }]);
    } else {
      const qty = parseInt(cantidad, 10);
      if (!qty || qty < 1) { setError('La cantidad debe ser mayor a 0.'); return; }
      setItems((prev) => [...prev, { descripcion: desc, tipo_serial: 'sin_serial', cantidad: qty }]);
    }

    // Reset campos ítem
    setDescripcion('');
    setSerialesTexto('');
    setIdEquiposTexto('');
    setCantidad(1);
    setTipoSerial('sin_serial');
    setSugerencias([]);
    descRef.current?.focus();
  };

  const eliminarItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const totalUnidades = items.reduce((sum, it) => {
    if (it.tipo_serial === 'con_serial') return sum + (it.seriales?.length || 0);
    return sum + (it.cantidad || 0);
  }, 0);

  const handleEnviar = async () => {
    if (items.length === 0) { setError('Agrega al menos un ítem.'); return; }
    setEnviando(true);
    setError('');
    try {
      const payload = { fecha, numero_orden: numeroOrden || null, codigo_barras: codigoBarras || null, items };
      const resp = await registrarEntrada(planillaId, payload);
      onSuccess(resp.resumen, resp.mensaje);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Error al registrar la entrada.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mod-entrada-backdrop" ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}>
      <div className="mod-entrada-card" role="dialog" aria-modal="true" aria-label="Registrar Entrada">
        {/* ── Header ── */}
        <div className="mod-entrada-header">
          <div className="mod-entrada-header-icon">⬇</div>
          <div>
            <h2 className="mod-entrada-titulo">Registrar Entrada</h2>
            <p className="mod-entrada-subtitulo">Ingreso de equipos a bodega</p>
          </div>
          <button className="mod-entrada-close" onClick={onClose} title="Cerrar">✕</button>
        </div>

        {/* ── Encabezado ── */}
        <div className="mod-entrada-section">
          <h3 className="mod-entrada-section-title">Datos del ingreso</h3>
          <div className="mod-entrada-row3">
            <div className="mod-entrada-field">
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="mod-entrada-field">
              <label>N° Orden / Factura</label>
              <input type="text" placeholder="Ej: OC-2026-001" value={numeroOrden} onChange={(e) => setNumeroOrden(e.target.value)} />
            </div>
            <div className="mod-entrada-field">
              <label>Código de barras</label>
              <input type="text" placeholder="Opcional" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Agregar ítem ── */}
        <div className="mod-entrada-section">
          <h3 className="mod-entrada-section-title">Agregar ítem</h3>

          {/* Descripción con autocomplete */}
          <div className="mod-entrada-field mod-entrada-field--full mod-entrada-autocomplete-wrap">
            <label>Descripción *</label>
            <input
              ref={descRef}
              type="text"
              placeholder={cargandoCatalogo ? 'Cargando catálogo…' : 'Busca o escribe un producto'}
              value={descripcion}
              onChange={handleDescChange}
              onFocus={() => setMostrarSugerencias(true)}
              onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
              autoComplete="off"
            />
            {mostrarSugerencias && sugerencias.length > 0 && (
              <ul className="mod-entrada-sugerencias">
                {sugerencias.map((s) => (
                  <li key={s.descripcion} onMouseDown={() => seleccionarSugerencia(s)}>
                    <span className="sug-desc">{s.descripcion}</span>
                    <span className="sug-stock">{s.en_stock} en stock</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tipo serial */}
          <div className="mod-entrada-tipo-serial">
            <button type="button" className={`mod-tipo-btn ${tipoSerial === 'sin_serial' ? 'mod-tipo-btn--active' : ''}`} onClick={() => setTipoSerial('sin_serial')}>
              📦 Sin serial
            </button>
            <button type="button" className={`mod-tipo-btn ${tipoSerial === 'con_serial' ? 'mod-tipo-btn--active' : ''}`} onClick={() => setTipoSerial('con_serial')}>
              🔢 Con serial
            </button>
          </div>

          {tipoSerial === 'sin_serial' ? (
            <div className="mod-entrada-field">
              <label>Cantidad</label>
              <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ width: 100 }} />
            </div>
          ) : (
            <div className="mod-entrada-row2">
              <div className="mod-entrada-field">
                <label>Seriales (uno por línea) *</label>
                <textarea rows={4} placeholder="ABC-001&#10;ABC-002&#10;ABC-003" value={serialesTexto} onChange={(e) => setSerialesTexto(e.target.value)} />
                <span className="mod-entrada-hint">{serialesTexto.split('\n').filter((s) => s.trim()).length} serial(es)</span>
              </div>
              <div className="mod-entrada-field">
                <label>ID Equipo (uno por línea, opcional)</label>
                <textarea rows={4} placeholder="EQ-001&#10;EQ-002&#10;EQ-003" value={idEquiposTexto} onChange={(e) => setIdEquiposTexto(e.target.value)} />
              </div>
            </div>
          )}

          <button type="button" className="mod-entrada-add-btn" onClick={agregarItem}>
            + Agregar ítem a la lista
          </button>
        </div>

        {/* ── Lista de ítems ── */}
        {items.length > 0 && (
          <div className="mod-entrada-section">
            <h3 className="mod-entrada-section-title">Ítems a ingresar ({totalUnidades} unidades)</h3>
            <ul className="mod-entrada-items-list">
              {items.map((it, idx) => (
                <li key={idx} className="mod-entrada-item">
                  <div className="mod-item-info">
                    <span className="mod-item-desc">{it.descripcion}</span>
                    <span className="mod-item-badge">
                      {it.tipo_serial === 'con_serial' ? `${it.seriales.length} serial(es)` : `${it.cantidad} ud(s)`}
                    </span>
                  </div>
                  <button type="button" className="mod-item-del" onClick={() => eliminarItem(idx)} title="Quitar ítem">✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Preview resumen ── */}
        {preview && items.length > 0 && (
          <div className="mod-entrada-preview">
            <strong>Vas a ingresar {totalUnidades} unidades</strong> en {items.length} ítem(s) a la planilla.
            {numeroOrden && <span> · Orden: <em>{numeroOrden}</em></span>}
          </div>
        )}

        {/* ── Error ── */}
        {error && <div className="mod-entrada-error">{error}</div>}

        {/* ── Footer ── */}
        <div className="mod-entrada-footer">
          <button type="button" className="mod-btn mod-btn--ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
          {!preview && items.length > 0 && (
            <button type="button" className="mod-btn mod-btn--outline" onClick={() => setPreview(true)}>
              Vista previa
            </button>
          )}
          <button type="button" className="mod-btn mod-btn--green" onClick={handleEnviar} disabled={enviando || items.length === 0}>
            {enviando ? 'Guardando…' : `⬇ Ingresar ${totalUnidades > 0 ? totalUnidades + ' ud(s)' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

