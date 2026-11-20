import React, { useState, useEffect, useRef, useCallback } from 'react';
import { obtenerCatalogo, obtenerTecnicos, registrarSalida } from '../../services/inventario';
import './ModalSalida.css';

/**
 * Modal de despacho (Salida).
 * Props:
 *   planillaId  – ID de la planilla
 *   onClose()
 *   onSuccess(resumen, mensaje)
 */
export default function ModalSalida({ planillaId, onClose, onSuccess }) {
  const today = new Date().toISOString().split('T')[0];

  // ── Encabezado despacho ───────────────────────────────────────────────────
  const [tecnico, setTecnico] = useState('');
  const [oficina, setOficina] = useState('');
  const [fechaDespacho, setFechaDespacho] = useState(today);
  const [observacion, setObservacion] = useState('UT-GBSCOM');
  const [numeroOrden, setNumeroOrden] = useState('');

  // ── Catálogo / técnicos ───────────────────────────────────────────────────
  const [catalogo, setCatalogo] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [cargando, setCargando] = useState(true);

  // ── Ítem actual ───────────────────────────────────────────────────────────
  const [tipoSerial, setTipoSerial] = useState('con_serial');
  const [serial, setSerial] = useState('');
  const [descripcionItem, setDescripcionItem] = useState('');
  const [cantidadItem, setCantidadItem] = useState(1);
  const [sugDesc, setSugDesc] = useState([]);
  const [showSugDesc, setShowSugDesc] = useState(false);

  // ── Lista de ítems ────────────────────────────────────────────────────────
  const [items, setItems] = useState([]);

  // ── Estado ────────────────────────────────────────────────────────────────
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  // Autocomplete técnico
  const [showSugTec, setShowSugTec] = useState(false);
  const sugTecFiltrados = tecnicos.filter((t) => t.toUpperCase().includes(tecnico.trim().toUpperCase())).slice(0, 6);

  const backdropRef = useRef(null);
  const serialRef = useRef(null);

  // Cerrar con Esc
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Cargar catálogo y técnicos
  useEffect(() => {
    setCargando(true);
    Promise.all([obtenerCatalogo(planillaId), obtenerTecnicos(planillaId)])
      .then(([cat, tec]) => { setCatalogo(cat); setTecnicos(tec); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [planillaId]);

  // Autocomplete descripción
  const filtrarDesc = (val) => {
    if (!val.trim()) { setSugDesc([]); return; }
    setSugDesc(catalogo.filter((c) => c.descripcion?.toUpperCase().includes(val.trim().toUpperCase()) && c.en_stock > 0).slice(0, 8));
  };

  const handleDescChange = (e) => {
    setDescripcionItem(e.target.value);
    filtrarDesc(e.target.value);
    setShowSugDesc(true);
  };

  // Agregar ítem
  const agregarItem = () => {
    setError('');
    if (tipoSerial === 'con_serial') {
      const s = serial.trim().toUpperCase();
      if (!s) { setError('Ingresa un serial.'); return; }
      if (items.some((it) => it.tipo_serial === 'con_serial' && it.serial === s)) {
        setError(`El serial ${s} ya está en la lista.`); return;
      }
      setItems((prev) => [...prev, { tipo_serial: 'con_serial', serial: s }]);
      setSerial('');
      serialRef.current?.focus();
    } else {
      const desc = descripcionItem.trim();
      const qty = parseInt(cantidadItem, 10);
      if (!desc) { setError('Selecciona una descripción.'); return; }
      if (!qty || qty < 1) { setError('La cantidad debe ser mayor a 0.'); return; }
      setItems((prev) => [...prev, { tipo_serial: 'sin_serial', descripcion: desc, cantidad: qty }]);
      setDescripcionItem('');
      setCantidadItem(1);
      setSugDesc([]);
    }
  };

  const eliminarItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const totalUnidades = items.reduce((sum, it) => sum + (it.tipo_serial === 'con_serial' ? 1 : it.cantidad), 0);

  const handleEnviar = async () => {
    setError('');
    if (!tecnico.trim()) { setError('El técnico es obligatorio.'); return; }
    if (!oficina.trim()) { setError('La oficina de destino es obligatoria.'); return; }
    if (items.length === 0) { setError('Agrega al menos un ítem.'); return; }
    setEnviando(true);
    try {
      const payload = {
        tecnico, oficina, fecha_despacho: fechaDespacho,
        observacion, numero_orden: numeroOrden || null,
        items,
      };
      const resp = await registrarSalida(planillaId, payload);
      onSuccess(resp.resumen, resp.mensaje);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Error al registrar la salida.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mod-salida-backdrop" ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}>
      <div className="mod-salida-card" role="dialog" aria-modal="true" aria-label="Registrar Salida">

        {/* Header */}
        <div className="mod-salida-header">
          <div className="mod-salida-header-icon">⬆</div>
          <div>
            <h2 className="mod-salida-titulo">Registrar Salida</h2>
            <p className="mod-salida-subtitulo">Despacho de equipos desde bodega</p>
          </div>
          <button className="mod-salida-close" onClick={onClose} title="Cerrar">✕</button>
        </div>

        {/* Encabezado del despacho */}
        <div className="mod-salida-section">
          <h3 className="mod-salida-section-title">Datos del despacho</h3>
          <div className="mod-salida-row3">
            {/* Técnico con autocomplete */}
            <div className="mod-salida-field mod-salida-autocomplete-wrap">
              <label>Técnico *</label>
              <input
                type="text"
                placeholder={cargando ? 'Cargando…' : 'Nombre del técnico'}
                value={tecnico}
                onChange={(e) => { setTecnico(e.target.value); setShowSugTec(true); }}
                onFocus={() => setShowSugTec(true)}
                onBlur={() => setTimeout(() => setShowSugTec(false), 150)}
                autoComplete="off"
              />
              {showSugTec && sugTecFiltrados.length > 0 && (
                <ul className="mod-salida-sugerencias">
                  {sugTecFiltrados.map((t) => (
                    <li key={t} onMouseDown={() => { setTecnico(t); setShowSugTec(false); }}>{t}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mod-salida-field">
              <label>Oficina destino *</label>
              <input type="text" placeholder="Oficina o municipio" value={oficina} onChange={(e) => setOficina(e.target.value)} />
            </div>

            <div className="mod-salida-field">
              <label>Fecha de despacho</label>
              <input type="date" value={fechaDespacho} onChange={(e) => setFechaDespacho(e.target.value)} />
            </div>

            <div className="mod-salida-field">
              <label>Observación</label>
              <input type="text" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>

            <div className="mod-salida-field">
              <label>N° Orden</label>
              <input type="text" placeholder="Opcional" value={numeroOrden} onChange={(e) => setNumeroOrden(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Agregar ítem */}
        <div className="mod-salida-section">
          <h3 className="mod-salida-section-title">Agregar equipos</h3>

          <div className="mod-salida-tipo-serial">
            <button type="button" className={`mod-tipo-btn ${tipoSerial === 'con_serial' ? 'mod-tipo-btn--active' : ''}`} onClick={() => setTipoSerial('con_serial')}>
              🔢 Por serial
            </button>
            <button type="button" className={`mod-tipo-btn ${tipoSerial === 'sin_serial' ? 'mod-tipo-btn--active' : ''}`} onClick={() => setTipoSerial('sin_serial')}>
              📦 Sin serial
            </button>
          </div>

          {tipoSerial === 'con_serial' ? (
            <div className="mod-salida-inline-add">
              <input
                ref={serialRef}
                type="text"
                className="mod-salida-serial-input"
                placeholder="Escanea o escribe el serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarItem(); } }}
                autoFocus
              />
              <button type="button" className="mod-salida-add-btn" onClick={agregarItem}>+ Agregar</button>
            </div>
          ) : (
            <div className="mod-salida-row3">
              <div className="mod-salida-field mod-salida-autocomplete-wrap" style={{ gridColumn: '1/3' }}>
                <label>Descripción *</label>
                <input
                  type="text"
                  placeholder="Busca por nombre del producto"
                  value={descripcionItem}
                  onChange={handleDescChange}
                  onFocus={() => setShowSugDesc(true)}
                  onBlur={() => setTimeout(() => setShowSugDesc(false), 150)}
                  autoComplete="off"
                />
                {showSugDesc && sugDesc.length > 0 && (
                  <ul className="mod-salida-sugerencias">
                    {sugDesc.map((s) => (
                      <li key={s.descripcion} onMouseDown={() => { setDescripcionItem(s.descripcion); setSugDesc([]); }}>
                        <span>{s.descripcion}</span>
                        <span className="sug-stock">{s.en_stock} en stock</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mod-salida-field">
                <label>Cantidad</label>
                <input type="number" min={1} value={cantidadItem} onChange={(e) => setCantidadItem(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="button" className="mod-salida-add-btn-full" onClick={agregarItem}>+ Agregar ítem</button>
              </div>
            </div>
          )}
        </div>

        {/* Lista de ítems */}
        {items.length > 0 && (
          <div className="mod-salida-section">
            <h3 className="mod-salida-section-title">Equipos a despachar ({totalUnidades} unidades)</h3>
            <ul className="mod-salida-items-list">
              {items.map((it, idx) => (
                <li key={idx} className="mod-salida-item">
                  <div className="mod-item-info">
                    {it.tipo_serial === 'con_serial'
                      ? <><span className="mod-item-serial">{it.serial}</span><span className="mod-item-badge">con serial</span></>
                      : <><span className="mod-item-desc">{it.descripcion}</span><span className="mod-item-badge mod-item-badge--qty">{it.cantidad} ud(s)</span></>
                    }
                  </div>
                  <button type="button" className="mod-item-del" onClick={() => eliminarItem(idx)}>✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Preview */}
        {preview && items.length > 0 && (
          <div className="mod-salida-preview">
            <strong>Vas a despachar {totalUnidades} unidad(es)</strong> a <em>{tecnico.trim().toUpperCase()}</em> / <em>{oficina.trim().toUpperCase()}</em>.
          </div>
        )}

        {error && <div className="mod-salida-error">{error}</div>}

        {/* Footer */}
        <div className="mod-salida-footer">
          <button type="button" className="mod-btn mod-btn--ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
          {!preview && items.length > 0 && (
            <button type="button" className="mod-btn mod-btn--outline-red" onClick={() => setPreview(true)}>
              Vista previa
            </button>
          )}
          <button type="button" className="mod-btn mod-btn--red" onClick={handleEnviar} disabled={enviando || items.length === 0}>
            {enviando ? 'Guardando…' : `⬆ Despachar ${totalUnidades > 0 ? totalUnidades + ' ud(s)' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

