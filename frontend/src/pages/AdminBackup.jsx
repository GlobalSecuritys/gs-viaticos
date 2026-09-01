import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import logoGSB from '../assets/logo-gsb.png';
import './AdminBackup.css';

/* ================================================================
   CONFIGURACIÓN DE COLUMNAS DEL CSV Y ALIAS
   ================================================================ */
const COLUMNAS = {
  url: 'url_cloudinary',
  oficina: 'oficina',
  tecnico: 'tecnico',
  fecha: 'fecha',
  concepto: 'concepto'
};

const ALIAS = {
  url: [
    'url_cloudinary', 'url_foto', 'urlfoto', 'cloudinary_url', 'url_imagen',
    'url_comprobante', 'comprobante', 'imagen', 'foto', 'url', 'soporte', 'evidencia'
  ],
  oficina: ['oficina', 'sucursal', 'plaza', 'agencia', 'region', 'zona', 'sede', 'ciudad'],
  tecnico: ['tecnico', 'empleado', 'colaborador', 'nombre_tecnico', 'tecnico_nombre', 'responsable', 'nombre', 'usuario'],
  fecha: ['fecha', 'fecha_gasto', 'fecha_comprobante', 'dia', 'date', 'created_at'],
  concepto: ['concepto', 'tipo_gasto', 'tipo', 'categoria', 'gasto', 'detalle', 'descripcion']
};

/* ---------------- Utilidades ---------------- */
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

function slug(s, fallback = 'desconocido') {
  const t = String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t || fallback;
}

function extDe(url) {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (m) return '.' + m[1].toLowerCase();
  } catch (e) {
    /* URL no parseable */
  }
  return '.jpg';
}

function nombreFoto(f) {
  return `${slug(f.tecnico, 'tecnico')}_${slug(f.fecha, 'sin-fecha')}_${slug(f.oficina, 'oficina')}`;
}

function parseFechaTS(str) {
  const s = String(str ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    const t = Date.parse(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    if (!Number.isNaN(t)) return t;
  }
  const directo = Date.parse(s);
  if (!Number.isNaN(directo)) return directo;
  return null;
}

async function fetchBlob(url) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.blob();
}

function detectarColumnas(headers) {
  const disp = [...new Set(headers.filter(Boolean).map((h) => String(h).trim()))];
  const mapa = {};
  const libres = () => disp.filter((h) => !Object.values(mapa).includes(h));

  // 1) Coincidencia exacta
  for (const campo of Object.keys(COLUMNAS)) {
    mapa[campo] = libres().find((h) => norm(h) === norm(COLUMNAS[campo])) || null;
  }
  // 2) Coincidencia de alias
  for (const campo of Object.keys(COLUMNAS)) {
    if (mapa[campo]) continue;
    mapa[campo] = libres().find((h) => ALIAS[campo].includes(norm(h))) || null;
  }
  // 3) Contención parcial
  for (const campo of Object.keys(COLUMNAS)) {
    if (mapa[campo]) continue;
    mapa[campo] = libres().find((h) => ALIAS[campo].some((a) => norm(h).includes(a))) || null;
  }
  return mapa;
}

export default function AdminBackup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [mapaColumnas, setMapaColumnas] = useState(null);
  const [omitidasCount, setOmitidasCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadingDb, setLoadingDb] = useState(false);

  // Estados de descarga
  const [descargandoTodo, setDescargandoTodo] = useState(false);
  const [progresoTexto, setProgresoTexto] = useState('');
  const [descargandoOficina, setDescargandoOficina] = useState(null);
  const [descargandoFotoId, setDescargandoFotoId] = useState(null);

  // Oficinas colapsadas (Map o Set)
  const [oficinasAbiertas, setOficinasAbiertas] = useState({});

  // Lightbox
  const [lightboxFoto, setLightboxFoto] = useState(null);

  // Toast
  const [toast, setToast] = useState({ show: false, msg: '', tipo: 'ok' });
  const toastTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = (msg, tipo = 'ok') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ show: true, msg, tipo });
    toastTimeoutRef.current = setTimeout(() => {
      setToast({ show: false, msg: '', tipo: 'ok' });
    }, 4500);
  };

  // Procesar filas (desde CSV o desde API)
  const procesarFilas = (filas) => {
    if (!filas || !filas.length) {
      setErrorMsg('El conjunto de datos está vacío.');
      return;
    }
    const headers = Object.keys(filas[0]);
    const mapa = detectarColumnas(headers);

    if (!mapa.url || !mapa.oficina) {
      setErrorMsg(
        `No se encontró la columna de URL de comprobante y/o de oficina. Encabezados detectados: ${headers.join(', ') || 'ninguno'}`
      );
      return;
    }

    const itemsValidos = [];
    let omitidas = 0;

    filas.forEach((row, idx) => {
      const url = String(row[mapa.url] ?? '').trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        omitidas++;
        return;
      }
      const oficinaRaw = String(row[mapa.oficina] ?? '').trim() || 'Sin oficina';
      const tecnicoRaw = String(row[mapa.tecnico] ?? '').trim() || 'Técnico sin nombre';

      itemsValidos.push({
        _id: idx + 1,
        url,
        oficina: oficinaRaw,
        oficinaKey: norm(oficinaRaw) || 'sin-oficina',
        tecnico: tecnicoRaw,
        tecnicoKey: norm(tecnicoRaw) || 'sin-tecnico',
        fecha: String(row[mapa.fecha] ?? '').trim(),
        concepto: String(row[mapa.concepto] ?? '').trim(),
        _ext: extDe(url)
      });
    });

    if (!itemsValidos.length) {
      setErrorMsg('Se leyeron los datos pero ninguna fila tiene una URL de imagen válida.');
      return;
    }

    setData(itemsValidos);
    setMapaColumnas(mapa);
    setOmitidasCount(omitidas);
    setErrorMsg('');

    // Abrir la primera oficina por defecto
    const primeraOficina = norm(itemsValidos[0].oficina);
    setOficinasAbiertas({ [primeraOficina]: true });
  };

  // Carga de archivo CSV
  const handleFile = (file) => {
    if (!file) return;
    setErrorMsg('');
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setErrorMsg('El archivo seleccionado no parece ser un archivo CSV (.csv).');
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => String(h).trim(),
      complete: (res) => procesarFilas(res.data),
      error: (err) => setErrorMsg('Error al parsear el CSV: ' + err.message)
    });
  };

  // Cargar directamente los viáticos activos desde la base de datos del backend
  const cargarDirectoDeBd = async () => {
    setLoadingDb(true);
    setErrorMsg('');
    try {
      const res = await api.get('/viaticos');
      const viaticosDb = res.data || [];
      if (!viaticosDb.length) {
        showToast('No se encontraron viáticos en la base de datos.', 'warn');
        setLoadingDb(false);
        return;
      }

      // Mapear el formato de la BD a filas
      const filasBd = viaticosDb.map((v) => ({
        url_cloudinary: v.foto_url || v.url_foto || v.url_cloudinary || '',
        oficina: v.asignacion?.nombre_asignacion || v.oficina || v.destino || 'Sede Principal',
        tecnico: v.usuario?.nombre || v.nombre || `Técnico #${v.usuario_id || ''}`,
        fecha: v.fecha_gasto || v.fecha || (v.created_at ? v.created_at.slice(0, 10) : ''),
        concepto: v.concepto || v.tipo || 'Viático'
      }));

      procesarFilas(filasBd);
      showToast(`Se cargaron ${filasBd.length} registros directamente de la base de datos.`, 'ok');
    } catch (err) {
      setErrorMsg(
        'No se pudieron consultar los viáticos de la base de datos: ' +
          (err.response?.data?.detail || err.message)
      );
    } finally {
      setLoadingDb(false);
    }
  };

  // Agrupamiento estructurado por Oficina -> Técnico -> Fotos
  const oficinasAgrupadas = useMemo(() => {
    if (!data.length) return [];

    const porOficina = new Map();

    data.forEach((f) => {
      if (!porOficina.has(f.oficinaKey)) {
        porOficina.set(f.oficinaKey, {
          key: f.oficinaKey,
          label: f.oficina,
          tecnicos: new Map()
        });
      }
      const ofEntry = porOficina.get(f.oficinaKey);

      if (!ofEntry.tecnicos.has(f.tecnicoKey)) {
        ofEntry.tecnicos.set(f.tecnicoKey, {
          key: f.tecnicoKey,
          label: f.tecnico,
          fotos: []
        });
      }
      ofEntry.tecnicos.get(f.tecnicoKey).fotos.push(f);
    });

    // Ordenar cronológicamente dentro de cada técnico
    for (const ofEntry of porOficina.values()) {
      for (const tecEntry of ofEntry.tecnicos.values()) {
        tecEntry.fotos.sort((a, b) => {
          const ta = parseFechaTS(a.fecha);
          const tb = parseFechaTS(b.fecha);
          if (ta === null && tb === null) return 0;
          if (ta === null) return 1;
          if (tb === null) return -1;
          return ta - tb;
        });
      }
    }

    const lista = [...porOficina.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return lista.map((of) => ({
      ...of,
      totalFotos: [...of.tecnicos.values()].reduce((acc, t) => acc + t.fotos.length, 0),
      tecnicosList: [...of.tecnicos.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
    }));
  }, [data]);

  // Descarga masiva ZIP
  const generarZip = async (fotos, nombreZip, setProgreso) => {
    if (!fotos.length) return;
    try {
      setProgreso(`Descargando 0/${fotos.length}…`);
      const resultados = new Array(fotos.length);
      const fallos = [];
      let idx = 0;
      let hechas = 0;

      async function worker() {
        while (idx < fotos.length) {
          const i = idx++;
          try {
            resultados[i] = { blob: await fetchBlob(fotos[i].url) };
          } catch (e) {
            resultados[i] = null;
            fallos.push(fotos[i]);
          }
          hechas++;
          setProgreso(`Descargando ${hechas}/${fotos.length}…`);
        }
      }

      await Promise.all(Array.from({ length: Math.min(5, fotos.length) }, worker));

      setProgreso('Comprimiendo…');
      const zip = new JSZip();
      const usados = new Set();

      resultados.forEach((r, i) => {
        if (!r) return;
        const base = nombreFoto(fotos[i]);
        let n = base;
        let k = 2;
        while (usados.has(n + fotos[i]._ext)) n = `${base}_${k++}`;
        usados.add(n + fotos[i]._ext);
        zip.file(n + fotos[i]._ext, r.blob);
      });

      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (meta) => setProgreso(`Comprimiendo ${Math.round(meta.percent)}%…`)
      );

      saveAs(blob, nombreZip);

      showToast(
        fallos.length
          ? `ZIP generado con ${usados.size} fotos. (${fallos.length} no pudieron descargarse por bloqueo externo).`
          : `ZIP generado con éxito: ${usados.size} fotos incluidas.`,
        fallos.length ? 'warn' : 'ok'
      );
    } catch (e) {
      showToast('Error generando el ZIP: ' + e.message, 'err');
    }
  };

  const handleDescargarTodo = async () => {
    setDescargandoTodo(true);
    await generarZip(data, 'viaticos_todas_las_oficinas.zip', setProgresoTexto);
    setDescargandoTodo(false);
    setProgresoTexto('');
  };

  const handleDescargarOficina = async (ofData) => {
    const ofFotos = [];
    ofData.tecnicosList.forEach((t) => ofFotos.push(...t.fotos));
    setDescargandoOficina(ofData.key);
    await generarZip(ofFotos, `viaticos_${slug(ofData.label)}.zip`, (txt) => setProgresoTexto(txt));
    setDescargandoOficina(null);
    setProgresoTexto('');
  };

  const handleDescargarUna = async (foto) => {
    setDescargandoFotoId(foto._id);
    try {
      const blob = await fetchBlob(foto.url);
      saveAs(blob, `${nombreFoto(foto)}${foto._ext}`);
    } catch (e) {
      window.open(foto.url, '_blank', 'noopener,noreferrer');
      showToast('Abierta en nueva pestaña para descarga manual.', 'warn');
    } finally {
      setDescargandoFotoId(null);
    }
  };

  const toggleOficina = (key) => {
    setOficinasAbiertas((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="bkp-root">
      {/* ── BARRA SUPERIOR CORPORATIVA ── */}
      <header className="bkp-topbar">
        <div className="bkp-brand-wrap">
          <div className="bkp-logo-badge">
            <img src={logoGSB} alt="GSB Logo" className="bkp-logo-img" />
          </div>
          <div className="bkp-brand">
            <h1>
              Global Security <span>Bank</span>
            </h1>
            <p>Módulo de Backup y Respaldo de Comprobantes · Administración</p>
          </div>
        </div>

        <div className="bkp-topbar-actions">
          <button
            type="button"
            className="bkp-btn-nav"
            onClick={() => navigate('/seleccion-modulo')}
            title="Volver a la selección de módulos"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Módulos
          </button>
          <button
            type="button"
            className="bkp-btn-nav"
            onClick={() => navigate('/admin')}
            title="Ir al Panel de Viáticos"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            Panel Viáticos
          </button>
        </div>
      </header>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <main className="bkp-main">
        {/* Banner de Seguridad Administrativa */}
        <div className="bkp-admin-pill">
          <span className="bkp-badge-icon">🔒</span>
          <span>ÁREA EXCLUSIVA DE ADMINISTRACIÓN — ACCESO RESTRINGIDO</span>
        </div>

        {/* Zona de Selección / Carga de Datos */}
        {!data.length && (
          <section className="bkp-card bkp-upload-card">
            <div className="bkp-upload-options">
              <button
                type="button"
                className="bkp-btn-primary bkp-btn-lg"
                onClick={cargarDirectoDeBd}
                disabled={loadingDb}
              >
                {loadingDb ? (
                  <>
                    <span className="bkp-spinner"></span> Sincronizando con Base de Datos…
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                    </svg>
                    Cargar comprobantes activos del Sistema
                  </>
                )}
              </button>

              <div className="bkp-divider-or">
                <span>o carga un archivo CSV de respaldo</span>
              </div>
            </div>

            <div
              className={`bkp-dropzone ${isDragOver ? 'bkp-dropzone--dragover' : ''}`}
              tabIndex={0}
              role="button"
              aria-label="Subir archivo CSV"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFile(e.dataTransfer.files[0]);
                }
              }}
            >
              <div className="bkp-dz-icon">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="bkp-dz-title">Arrastra tu archivo CSV aquí</p>
              <p className="bkp-dz-sub">o haz clic para examinar tu equipo (Exportado desde Neon / Postgres)</p>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />
            </div>

            {errorMsg && (
              <div className="bkp-error-box" role="alert">
                <span>⚠️</span> {errorMsg}
              </div>
            )}

            <p className="bkp-hint">
              Columnas detectadas automáticamente: <code>url_cloudinary</code> · <code>oficina</code> · <code>tecnico</code> · <code>fecha</code> · <code>concepto</code>.
            </p>
          </section>
        )}

        {/* Resultados estructurados */}
        {data.length > 0 && (
          <section className="bkp-results-section">
            {/* Panel de Resumen y Acciones */}
            <div className="bkp-card bkp-summary-card">
              <div className="bkp-stats-row">
                <div className="bkp-stat">
                  <strong>{oficinasAgrupadas.length}</strong>
                  <span>Oficinas</span>
                </div>
                <div className="bkp-stat">
                  <strong>{data.length}</strong>
                  <span>Comprobantes</span>
                </div>
                {omitidasCount > 0 && (
                  <div className="bkp-stat bkp-stat--warn">
                    <strong>{omitidasCount}</strong>
                    <span>Sin imagen</span>
                  </div>
                )}
              </div>

              <div className="bkp-summary-actions">
                <button
                  type="button"
                  className="bkp-btn-outline bkp-btn-sm"
                  onClick={() => {
                    setData([]);
                    setMapaColumnas(null);
                    setErrorMsg('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Cambiar origen de datos
                </button>

                <button
                  type="button"
                  className="bkp-btn-primary"
                  onClick={handleDescargarTodo}
                  disabled={descargandoTodo}
                >
                  {descargandoTodo ? (
                    <>
                      <span className="bkp-spinner"></span>
                      <span>{progresoTexto || 'Generando ZIP…'}</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Descargar todo (.zip)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {mapaColumnas && (
              <p className="bkp-col-info">
                Mapeo activo → Foto: <code>{mapaColumnas.url}</code> · Oficina: <code>{mapaColumnas.oficina}</code> · Técnico: <code>{mapaColumnas.tecnico || '—'}</code> · Fecha: <code>{mapaColumnas.fecha || '—'}</code>
              </p>
            )}

            {/* Listado de Oficinas */}
            <div className="bkp-offices-list">
              {oficinasAgrupadas.map((ofData) => {
                const isOpen = !!oficinasAbiertas[ofData.key];
                const isDownloadingThis = descargandoOficina === ofData.key;

                return (
                  <section
                    key={ofData.key}
                    className={`bkp-card bkp-office-card ${isOpen ? 'bkp-office--open' : 'bkp-office--closed'}`}
                  >
                    <div className="bkp-office-head" onClick={() => toggleOficina(ofData.key)}>
                      <div className="bkp-office-title-wrap">
                        <svg
                          className={`bkp-chev ${isOpen ? 'bkp-chev--down' : ''}`}
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <h2 title={ofData.label}>{ofData.label}</h2>
                        <span className="bkp-chip">
                          {ofData.totalFotos} {ofData.totalFotos === 1 ? 'foto' : 'fotos'}
                        </span>
                      </div>

                      <div className="bkp-office-head-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="bkp-btn-outline bkp-btn-sm"
                          disabled={isDownloadingThis}
                          onClick={() => handleDescargarOficina(ofData)}
                        >
                          {isDownloadingThis ? (
                            <>
                              <span className="bkp-spinner"></span>
                              <span>{progresoTexto || 'Procesando…'}</span>
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              <span>ZIP de oficina ({ofData.totalFotos})</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="bkp-office-body">
                        {ofData.tecnicosList.map((tec) => (
                          <div key={tec.key} className="bkp-tech-block">
                            <div className="bkp-tech-head">
                              <span className="bkp-tech-name">{tec.label}</span>
                              <span className="bkp-chip bkp-chip-sm">
                                {tec.fotos.length} {tec.fotos.length === 1 ? 'foto' : 'fotos'}
                              </span>
                            </div>

                            <div className="bkp-grid">
                              {tec.fotos.map((f, i) => {
                                const caption = [f.fecha, f.concepto].filter(Boolean).join(' · ');
                                const isDownloadingSingle = descargandoFotoId === f._id;

                                return (
                                  <figure key={f._id} className="bkp-photo-card">
                                    <div
                                      className="bkp-photo-wrap"
                                      onClick={() => setLightboxFoto(f)}
                                      title="Haz clic para ampliar comprobante"
                                    >
                                      <img
                                        src={f.url}
                                        alt={`Comprobante ${i + 1} de ${tec.label}`}
                                        loading="lazy"
                                        onError={(e) => {
                                          e.currentTarget.closest('.bkp-photo-card')?.classList.add('broken');
                                        }}
                                      />
                                    </div>
                                    <figcaption>
                                      <span className="bkp-p-tecnico">{tec.label}</span>
                                      {caption && <span className="bkp-p-meta">{caption}</span>}
                                    </figcaption>
                                    <button
                                      type="button"
                                      className="bkp-dl-one"
                                      title="Descargar esta foto"
                                      aria-label="Descargar esta foto"
                                      disabled={isDownloadingSingle}
                                      onClick={() => handleDescargarUna(f)}
                                    >
                                      {isDownloadingSingle ? (
                                        <span className="bkp-spinner"></span>
                                      ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                          <polyline points="7 10 12 15 17 10" />
                                          <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                      )}
                                    </button>
                                  </figure>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* ── LIGHTBOX POPUP ── */}
      {lightboxFoto && (
        <div className="bkp-lightbox" onClick={() => setLightboxFoto(null)}>
          <button
            type="button"
            className="bkp-lb-close"
            onClick={() => setLightboxFoto(null)}
            aria-label="Cerrar vista previa"
          >
            &times;
          </button>
          <figure className="bkp-lb-figure" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxFoto.url} alt="Comprobante ampliado" />
            <figcaption className="bkp-lb-caption">
              {[lightboxFoto.tecnico, lightboxFoto.fecha, lightboxFoto.concepto, lightboxFoto.oficina]
                .filter(Boolean)
                .join('   ·   ')}
            </figcaption>
          </figure>
        </div>
      )}

      {/* ── TOAST NOTIFICACIÓN ── */}
      {toast.show && (
        <div className={`bkp-toast bkp-toast--${toast.tipo}`} role="status">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
