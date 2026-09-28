import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { esAdministradorSeccion, tieneAccesoSeccion } from '../utils/permisos';
import { formatApiError } from '../utils/formatError';
import { listarProcesosCalidad } from '../services/calidadProcesos';
import {
  listarPlanillas,
  obtenerDatosExcel,
  buscarEnExcel,
  guardarSalidaRegistro,
} from '../services/inventario';
import './Inventario.css';

// ── Metadatos visuales por planilla (orden fijo 1-5) ─────────────────────────
const PLANILLA_META = {
  1: { emoji: '🔴', color: 'planilla-red',   etiqueta: 'RTC'          },
  2: { emoji: '🔵', color: 'planilla-blue',  etiqueta: 'RTC'          },
  3: { emoji: '🟢', color: 'planilla-green', etiqueta: 'Mantenimiento' },
  4: { emoji: '🟡', color: 'planilla-gold',  etiqueta: 'Zeus'         },
  5: { emoji: '🏛️', color: 'planilla-navy',  etiqueta: 'General'      },
};

function getMeta(orden) {
  return PLANILLA_META[orden] || { emoji: '📋', color: 'planilla-default', etiqueta: '' };
}

export default function Inventario() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEditar = user?.rol === 'superadmin' || esAdministradorSeccion(user, 'IN');
  const puedeVer = puedeEditar || tieneAccesoSeccion(user, 'IN');

  const [rutaFichaIN, setRutaFichaIN] = useState('/calidad-de-procesos');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // ── Planillas (home) ──────────────────────────────────────────────────────
  const [planillas, setPlanillas] = useState([]);
  const [cargandoPlanillas, setCargandoPlanillas] = useState(false);
  const [planillaSeleccionada, setPlanillaSeleccionada] = useState(null); // null = home

  // ── Vista activa: 'excel' | 'buscar' | 'salida' (dentro de una planilla) ─
  const [vistaActiva, setVistaActiva] = useState('excel');
  const [panelFiltroAbierto, setPanelFiltroAbierto] = useState(false);

  // ── Datos Excel ───────────────────────────────────────────────────────────
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [excelData, setExcelData] = useState({
    existe: false,
    archivo: '',
    hojas: [],
    hoja_activa: null,
    columnas: [],
    total_filas: 0,
    filas: [],
    mensaje: null,
  });
  const [hojaSeleccionada, setHojaSeleccionada] = useState('');

  // Filtros dinámicos
  const [filtroTextoGlobal, setFiltroTextoGlobal] = useState('');
  const [filtrosColumnas, setFiltrosColumnas] = useState({});

  // ── Formulario 1: Buscar equipo ───────────────────────────────────────────
  const [formBuscar, setFormBuscar] = useState({ serial: '', oficina: '', tecnico: '', fecha: '' });
  const [busquedaEjecutada, setBusquedaEjecutada] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [avisoBusqueda, setAvisoBusqueda] = useState('');

  // ── Formulario 2: Salida ──────────────────────────────────────────────────
  const [formSalida, setFormSalida] = useState({
    orden: '',
    oficina_instalada: '',
    fecha: new Date().toISOString().split('T')[0],
  });
  const [guardandoSalida, setGuardandoSalida] = useState(false);
  const [mensajeExitoSalida, setMensajeExitoSalida] = useState('');

  // ── Cargar ficha SGC para botón Volver ────────────────────────────────────
  useEffect(() => {
    listarProcesosCalidad()
      .then((procesos) => {
        const proceso = procesos.find((p) => p.codigo === 'IN');
        if (proceso) setRutaFichaIN('/calidad-de-procesos/proceso/' + proceso.id);
      })
      .catch(() => {});
  }, []);

  // ── Cargar planillas al montar ────────────────────────────────────────────
  const cargarPlanillas = useCallback(async () => {
    if (!puedeVer) return;
    setCargandoPlanillas(true);
    setError('');
    try {
      const data = await listarPlanillas();
      setPlanillas(data);
    } catch (err) {
      setError(formatApiError(err, 'No se pudieron cargar las planillas de inventario.'));
    } finally {
      setCargandoPlanillas(false);
    }
  }, [puedeVer]);

  useEffect(() => {
    cargarPlanillas();
  }, [cargarPlanillas]);

  // ── Cargar datos del Excel (dentro de una planilla) ───────────────────────
  const cargarExcel = useCallback(async (hoja = '', planilla = null) => {
    const pl = planilla || planillaSeleccionada;
    setCargandoExcel(true);
    setError('');
    try {
      const data = await obtenerDatosExcel({
        hoja,
        limit: 1500,
        planilla_id: pl?.id,
        planilla_nombre: pl?.nombre,
      });
      setExcelData(data);
      if (data.hoja_activa) setHojaSeleccionada(data.hoja_activa);
    } catch (err) {
      setError(formatApiError(err, 'No se pudo leer el archivo Excel en el servidor.'));
    } finally {
      setCargandoExcel(false);
    }
  }, [planillaSeleccionada]);

  const cambiarHoja = (nombreHoja) => {
    setHojaSeleccionada(nombreHoja);
    setFiltroTextoGlobal('');
    setFiltrosColumnas({});
    cargarExcel(nombreHoja, planillaSeleccionada);
  };

  // Filas filtradas
  const filasFiltradas = useMemo(() => {
    if (!excelData.filas) return [];
    return excelData.filas.filter((fila) => {
      if (filtroTextoGlobal.trim()) {
        const q = filtroTextoGlobal.toLowerCase();
        const coincide = Object.values(fila).some((val) =>
          String(val || '').toLowerCase().includes(q)
        );
        if (!coincide) return false;
      }
      for (const [col, valFiltro] of Object.entries(filtrosColumnas)) {
        if (!valFiltro || !valFiltro.trim()) continue;
        const valCelda = String(fila[col] || '').toLowerCase();
        if (!valCelda.includes(valFiltro.toLowerCase())) return false;
      }
      return true;
    });
  }, [excelData.filas, filtroTextoGlobal, filtrosColumnas]);

  // ── Abrir una planilla ────────────────────────────────────────────────────
  const abrirPlanilla = (planilla) => {
    setPlanillaSeleccionada(planilla);
    setVistaActiva('excel');
    setFiltroTextoGlobal('');
    setFiltrosColumnas({});
    setPanelFiltroAbierto(false);
    setHojaSeleccionada('');
    cargarExcel('', planilla);
  };

  const volverAlHome = () => {
    setPlanillaSeleccionada(null);
    setVistaActiva('excel');
    setError('');
    setFeedback('');
    cargarPlanillas(); // Refrescar conteos
  };

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  const handleBuscar = async (e) => {
    if (e) e.preventDefault();
    setAvisoBusqueda('');
    setError('');
    const tieneAlMenosUno =
      formBuscar.serial.trim() || formBuscar.oficina.trim() ||
      formBuscar.tecnico.trim() || formBuscar.fecha.trim();
    if (!tieneAlMenosUno) {
      setAvisoBusqueda('Por favor diligencia al menos un campo para realizar la búsqueda.');
      return;
    }
    setBuscando(true);
    setBusquedaEjecutada(true);
    try {
      const resp = await buscarEnExcel({
        hoja: hojaSeleccionada,
        serial: formBuscar.serial,
        oficina: formBuscar.oficina,
        tecnico: formBuscar.tecnico,
        fecha: formBuscar.fecha,
        planilla_id: planillaSeleccionada?.id,
        planilla_nombre: planillaSeleccionada?.nombre,
      });
      setResultadosBusqueda(resp.resultados || []);
    } catch (err) {
      setError(formatApiError(err, 'Error al buscar en el inventario.'));
    } finally {
      setBuscando(false);
    }
  };

  const irASalidaDesdeFila = (fila) => {
    setFormBuscar((prev) => ({
      ...prev,
      serial: fila['Serial'] || fila['SERIAL'] || fila['ID. EQUIPO'] || fila['Código'] || prev.serial,
      oficina: fila['Oficina'] || fila['OFICINA'] || fila['Destino'] || fila['Sede'] || prev.oficina,
      tecnico: fila['Técnico'] || fila['TECNICO'] || fila['Responsable'] || prev.tecnico,
      fecha: fila['Fecha'] || fila['FECHA'] || prev.fecha,
    }));
    setVistaActiva('salida');
  };

  // ── Guardar Salida ────────────────────────────────────────────────────────
  const handleGuardarSalida = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setMensajeExitoSalida('');
    setGuardandoSalida(true);
    try {
      await guardarSalidaRegistro({
        serial: formBuscar.serial || null,
        oficina: formBuscar.oficina || null,
        tecnico: formBuscar.tecnico || null,
        fecha_busqueda: formBuscar.fecha || null,
        orden: formSalida.orden || null,
        oficina_instalada: formSalida.oficina_instalada || null,
        fecha: formSalida.fecha || null,
      });
      setMensajeExitoSalida('✓ Registro de salida guardado correctamente.');
      setFormSalida({ orden: '', oficina_instalada: '', fecha: new Date().toISOString().split('T')[0] });
    } catch (err) {
      setError(formatApiError(err, 'No se pudo guardar el registro de salida.'));
    } finally {
      setGuardandoSalida(false);
    }
  };

  // ── Sin permisos ──────────────────────────────────────────────────────────
  if (!puedeVer) {
    return (
      <div className="sgc-inv-panel">
        <header className="sgc-inv-panel-header">
          <button type="button" className="sgc-inv-btn sgc-inv-btn--ghost" onClick={() => navigate(rutaFichaIN)}>
            ← Mapa SGC
          </button>
          <div>
            <h1 className="sgc-inv-title">Inventario</h1>
            <p className="sgc-inv-subtitle">Inventario (IN)</p>
          </div>
        </header>
        <p className="sgc-inv-vacio">
          No tienes permisos sobre el proceso Inventario (IN). Solicítalos al Administrador del Mapa de Procesos SGC.
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VISTA HOME: 5 TARJETAS DE PLANILLA
  // ═══════════════════════════════════════════════════════════════════════════
  if (!planillaSeleccionada) {
    return (
      <div className="sgc-inv-panel">
        {/* ── Encabezado ── */}
        <header className="sgc-inv-panel-header">
          <button
            type="button"
            className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
            onClick={() => navigate(rutaFichaIN)}
          >
            ← Mapa SGC
          </button>
          <div className="sgc-inv-header-text">
            <h1 className="sgc-inv-title">Inventario General</h1>
            <p className="sgc-inv-subtitle">
              Proceso Inventario (IN) · Selecciona una planilla para gestionar su stock
            </p>
          </div>
        </header>

        {/* ── Avisos globales ── */}
        {feedback && <div className="sgc-inv-alerta sgc-inv-alerta--ok">{feedback}</div>}
        {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

        {/* ── Grid de tarjetas ── */}
        {cargandoPlanillas ? (
          <div className="sgc-inv-cargando-box">
            <div className="sgc-inv-spinner" />
            <p>Cargando planillas de inventario...</p>
          </div>
        ) : planillas.length === 0 ? (
          <div className="sgc-inv-vacio-box">
            <span className="sgc-inv-vacio-icono">📋</span>
            <h3>No hay planillas configuradas</h3>
            <p>El servidor aún no ha sembrado las planillas. Reinicia el backend.</p>
            <button type="button" className="sgc-inv-btn sgc-inv-btn--primary" onClick={cargarPlanillas}>
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <div className="sgc-inv-planillas-grid">
              {planillas.map((planilla) => {
                const meta = getMeta(planilla.orden);
                return (
                  <button
                    key={planilla.id}
                    type="button"
                    className={`sgc-inv-planilla-card sgc-inv-planilla-card--${meta.color}`}
                    onClick={() => abrirPlanilla(planilla)}
                    aria-label={`Abrir planilla ${planilla.nombre}`}
                  >
                    <div className="sgc-inv-card-accent" />
                    <div className="sgc-inv-card-body">
                      <div className="sgc-inv-card-emoji">{meta.emoji}</div>
                      {meta.etiqueta && (
                        <span className="sgc-inv-card-etiqueta">{meta.etiqueta}</span>
                      )}
                      <h2 className="sgc-inv-card-nombre">{planilla.nombre}</h2>
                      {planilla.descripcion && (
                        <p className="sgc-inv-card-desc">{planilla.descripcion}</p>
                      )}
                      <div className="sgc-inv-card-stats">
                        <div className="sgc-inv-card-stat">
                          <span className="sgc-inv-card-stat-num">{planilla.total_items ?? 0}</span>
                          <span className="sgc-inv-card-stat-lbl">ítems</span>
                        </div>
                        <div className="sgc-inv-card-stat-sep" />
                        <div className="sgc-inv-card-stat">
                          <span className="sgc-inv-card-stat-num">{planilla.total_unidades ?? 0}</span>
                          <span className="sgc-inv-card-stat-lbl">unidades</span>
                        </div>
                      </div>
                      <div className="sgc-inv-card-cta">
                        Abrir planilla →
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fila de resumen total */}
            <div className="sgc-inv-home-totales">
              <span className="sgc-inv-home-total-item">
                <strong>{planillas.reduce((s, p) => s + (p.total_items ?? 0), 0)}</strong> ítems totales
              </span>
              <span className="sgc-inv-home-total-sep">·</span>
              <span className="sgc-inv-home-total-item">
                <strong>{planillas.reduce((s, p) => s + (p.total_unidades ?? 0), 0)}</strong> unidades en stock
              </span>
              <span className="sgc-inv-home-total-sep">·</span>
              <span className="sgc-inv-home-total-item">
                <strong>{planillas.length}</strong> planillas activas
              </span>
              <button
                type="button"
                className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm sgc-inv-home-refresh"
                onClick={cargarPlanillas}
                title="Actualizar conteos"
              >
                ↺ Actualizar
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VISTA DETALLE: DENTRO DE UNA PLANILLA (Excel / Búsqueda / Salida)
  // ═══════════════════════════════════════════════════════════════════════════
  const metaActiva = getMeta(planillaSeleccionada.orden);

  return (
    <div className="sgc-inv-panel">
      {/* ── Encabezado con breadcrumb ── */}
      <header className="sgc-inv-panel-header">
        <button
          type="button"
          className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
          onClick={volverAlHome}
        >
          ← Planillas
        </button>
        <div className="sgc-inv-header-text">
          <h1 className="sgc-inv-title">
            {metaActiva.emoji} {planillaSeleccionada.nombre}
          </h1>
          <p className="sgc-inv-subtitle">
            Inventario (IN) · {planillaSeleccionada.total_items ?? 0} ítems ·{' '}
            {planillaSeleccionada.total_unidades ?? 0} unidades en stock
          </p>
        </div>
      </header>

      {/* ── Avisos globales ── */}
      {feedback && <div className="sgc-inv-alerta sgc-inv-alerta--ok">{feedback}</div>}
      {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

      {/* ── BARRA DE HERRAMIENTAS ── */}
      <section className="sgc-inv-toolbar-container">
        <div className="sgc-inv-toolbar-left">
          <button
            type="button"
            className={`sgc-inv-btn-accion ${vistaActiva === 'excel' ? 'sgc-inv-btn-accion--activo' : ''}`}
            onClick={() => setVistaActiva('excel')}
            title="Visualizar el contenido del archivo Excel maestro"
          >
            <span className="sgc-inv-btn-icon">📊</span>
            <span>Excel</span>
          </button>

          <button
            type="button"
            className={`sgc-inv-btn-accion ${panelFiltroAbierto ? 'sgc-inv-btn-accion--filtro-activo' : ''}`}
            onClick={() => {
              setVistaActiva('excel');
              setPanelFiltroAbierto((prev) => !prev);
            }}
            title="Abrir u ocultar panel de filtros"
          >
            <span className="sgc-inv-btn-icon">🔍</span>
            <span>Filtro {Object.values(filtrosColumnas).filter(Boolean).length > 0 || filtroTextoGlobal ? '(Activo)' : ''}</span>
          </button>

          <button
            type="button"
            className={`sgc-inv-btn-accion ${vistaActiva === 'buscar' || vistaActiva === 'salida' ? 'sgc-inv-btn-accion--activo' : ''}`}
            onClick={() => setVistaActiva('buscar')}
            title="Buscar equipo y gestión de salida"
          >
            <span className="sgc-inv-btn-icon">🔎</span>
            <span>Buscar equipo / Salida</span>
          </button>
        </div>

        <div className="sgc-inv-toolbar-right">
          <span className="sgc-inv-badge-archivo" title={excelData.archivo || ''}>
            📁 {excelData.archivo || (planillaSeleccionada ? `${planillaSeleccionada.nombre}.xlsx` : 'inventario.xlsx')}
          </span>
          {excelData.existe && (
            <span className="sgc-inv-badge-filas">{excelData.total_filas} registros</span>
          )}
        </div>
      </section>

      {/* ── VISTA 1: EXCEL ── */}
      {vistaActiva === 'excel' && (
        <section className="sgc-inv-seccion-excel">
          {excelData.hojas && excelData.hojas.length > 0 && (
            <div className="sgc-inv-hojas-bar">
              <span className="sgc-inv-hojas-label">Hojas del Excel:</span>
              <div className="sgc-inv-hojas-pills">
                {excelData.hojas.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`sgc-inv-hoja-pill ${hojaSeleccionada === h ? 'sgc-inv-hoja-pill--activa' : ''}`}
                    onClick={() => cambiarHoja(h)}
                  >
                    📄 {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          {panelFiltroAbierto && (
            <div className="sgc-inv-panel-filtros animate-slide-down">
              <div className="sgc-inv-filtros-head">
                <h3 className="sgc-inv-filtros-titulo">Filtros sobre Hoja: {hojaSeleccionada}</h3>
                {(filtroTextoGlobal || Object.values(filtrosColumnas).some(Boolean)) && (
                  <button
                    type="button"
                    className="sgc-inv-btn-limpiar"
                    onClick={() => { setFiltroTextoGlobal(''); setFiltrosColumnas({}); }}
                  >
                    ✕ Limpiar filtros
                  </button>
                )}
              </div>
              <div className="sgc-inv-filtro-global-box">
                <input
                  type="text"
                  placeholder="Buscar texto en cualquier columna de esta hoja..."
                  value={filtroTextoGlobal}
                  onChange={(e) => setFiltroTextoGlobal(e.target.value)}
                  className="sgc-inv-input sgc-inv-input--global"
                />
              </div>
              <div className="sgc-inv-filtros-grid">
                {excelData.columnas.slice(0, 8).map((col) => (
                  <div key={col} className="sgc-inv-filtro-col-item">
                    <label className="sgc-inv-filtro-col-label">{col}</label>
                    <input
                      type="text"
                      placeholder={`Filtrar por ${col}...`}
                      value={filtrosColumnas[col] || ''}
                      onChange={(e) => setFiltrosColumnas((prev) => ({ ...prev, [col]: e.target.value }))}
                      className="sgc-inv-input sgc-inv-input--sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {cargandoExcel ? (
            <div className="sgc-inv-cargando-box">
              <div className="sgc-inv-spinner" />
              <p>Leyendo datos desde el servidor...</p>
            </div>
          ) : !excelData.existe ? (
            <div className="sgc-inv-vacio-box">
              <span className="sgc-inv-vacio-icono">📁</span>
              <h3>Archivo no disponible en servidor</h3>
              <p>
                {excelData.mensaje || (
                  <>
                    No se encontró el archivo Excel en <code>backend/data/migracion_inventario/</code>.
                    Coloca el archivo Excel en la carpeta del servidor para visualizarlo aquí.
                  </>
                )}
              </p>
              <button
                type="button"
                className="sgc-inv-btn sgc-inv-btn--primary"
                onClick={() => cargarExcel(hojaSeleccionada, planillaSeleccionada)}
              >
                Reintentar lectura
              </button>
            </div>
          ) : excelData.filas.length === 0 ? (
            <div className="sgc-inv-vacio-box">
              <span className="sgc-inv-vacio-icono">📋</span>
              <h3>Sin datos en esta hoja</h3>
              <p>La hoja <strong>{hojaSeleccionada}</strong> está vacía o no se encontraron filas.</p>
            </div>
          ) : (
            <>
              {(filtroTextoGlobal || Object.values(filtrosColumnas).some(Boolean)) && (
                <div className="sgc-inv-filtro-resumen">
                  Mostrando <strong>{filasFiltradas.length}</strong> de{' '}
                  <strong>{excelData.filas.length}</strong> registros
                  <button
                    type="button"
                    className="sgc-inv-btn-limpiar sgc-inv-btn-limpiar--inline"
                    onClick={() => { setFiltroTextoGlobal(''); setFiltrosColumnas({}); }}
                  >
                    ✕ Quitar filtros
                  </button>
                </div>
              )}
              <div className="sgc-inv-tabla-wrapper">
                <table className="sgc-inv-tabla">
                  <thead>
                    <tr>
                      {excelData.columnas.map((col) => (
                        <th key={col} className="sgc-inv-th">{col}</th>
                      ))}
                      {puedeEditar && <th className="sgc-inv-th sgc-inv-th--accion">Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.slice(0, 500).map((fila, idx) => (
                      <tr key={idx} className="sgc-inv-tr">
                        {excelData.columnas.map((col) => (
                          <td key={col} className="sgc-inv-td">{fila[col] ?? ''}</td>
                        ))}
                        {puedeEditar && (
                          <td className="sgc-inv-td sgc-inv-td--accion">
                            <button
                              type="button"
                              className="sgc-inv-btn-tabla-accion"
                              onClick={() => irASalidaDesdeFila(fila)}
                              title="Usar este equipo para registrar una salida"
                            >
                              📤 Salida
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filasFiltradas.length > 500 && (
                  <p className="sgc-inv-tabla-aviso">
                    Mostrando primeros 500 de {filasFiltradas.length} resultados filtrados.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── VISTA 2: BUSCAR ── */}
      {vistaActiva === 'buscar' && (
        <section className="sgc-inv-seccion-buscar">
          <h2 className="sgc-inv-seccion-titulo">🔎 Buscar Equipo</h2>
          <form className="sgc-inv-form-buscar" onSubmit={handleBuscar}>
            {avisoBusqueda && (
              <div className="sgc-inv-alerta sgc-inv-alerta--aviso">{avisoBusqueda}</div>
            )}
            <div className="sgc-inv-form-grid">
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Serial / ID Equipo</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  placeholder="Ej: SN-12345"
                  value={formBuscar.serial}
                  onChange={(e) => setFormBuscar((p) => ({ ...p, serial: e.target.value }))}
                />
              </div>
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Oficina / Sede</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  placeholder="Ej: Bogotá Norte"
                  value={formBuscar.oficina}
                  onChange={(e) => setFormBuscar((p) => ({ ...p, oficina: e.target.value }))}
                />
              </div>
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Técnico / Responsable</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  placeholder="Ej: Juan García"
                  value={formBuscar.tecnico}
                  onChange={(e) => setFormBuscar((p) => ({ ...p, tecnico: e.target.value }))}
                />
              </div>
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Fecha</label>
                <input
                  type="date"
                  className="sgc-inv-input"
                  value={formBuscar.fecha}
                  onChange={(e) => setFormBuscar((p) => ({ ...p, fecha: e.target.value }))}
                />
              </div>
            </div>
            <div className="sgc-inv-form-actions">
              <button type="submit" className="sgc-inv-btn sgc-inv-btn--primary" disabled={buscando}>
                {buscando ? 'Buscando...' : '🔍 Buscar'}
              </button>
              {busquedaEjecutada && puedeEditar && (
                <button
                  type="button"
                  className="sgc-inv-btn sgc-inv-btn--secondary"
                  onClick={() => setVistaActiva('salida')}
                >
                  📤 Ir a Salida
                </button>
              )}
            </div>
          </form>

          {busquedaEjecutada && !buscando && (
            <div className="sgc-inv-resultados-busqueda">
              {resultadosBusqueda.length === 0 ? (
                <div className="sgc-inv-vacio-box">
                  <span className="sgc-inv-vacio-icono">🔍</span>
                  <h3>Sin coincidencias</h3>
                  <p>No se encontraron equipos con esos criterios. Intenta con otros datos.</p>
                </div>
              ) : (
                <>
                  <div className="sgc-inv-resultado-header">
                    <strong>{resultadosBusqueda.length}</strong> equipo(s) encontrado(s)
                  </div>
                  <div className="sgc-inv-tabla-wrapper">
                    <table className="sgc-inv-tabla">
                      <thead>
                        <tr>
                          {Object.keys(resultadosBusqueda[0]).map((col) => (
                            <th key={col} className="sgc-inv-th">{col}</th>
                          ))}
                          {puedeEditar && <th className="sgc-inv-th sgc-inv-th--accion">Acción</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {resultadosBusqueda.map((fila, idx) => (
                          <tr key={idx} className="sgc-inv-tr">
                            {Object.values(fila).map((val, i) => (
                              <td key={i} className="sgc-inv-td">{val ?? ''}</td>
                            ))}
                            {puedeEditar && (
                              <td className="sgc-inv-td sgc-inv-td--accion">
                                <button
                                  type="button"
                                  className="sgc-inv-btn-tabla-accion"
                                  onClick={() => irASalidaDesdeFila(fila)}
                                >
                                  📤 Salida
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── VISTA 3: SALIDA (solo admin) ── */}
      {vistaActiva === 'salida' && puedeEditar && (
        <section className="sgc-inv-seccion-salida">
          <h2 className="sgc-inv-seccion-titulo">📤 Registrar Salida</h2>
          <form className="sgc-inv-form-salida" onSubmit={handleGuardarSalida}>
            {mensajeExitoSalida && (
              <div className="sgc-inv-alerta sgc-inv-alerta--ok">{mensajeExitoSalida}</div>
            )}
            <h3 className="sgc-inv-form-subtitle">Equipo identificado</h3>
            <div className="sgc-inv-form-grid">
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Serial / ID</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  value={formBuscar.serial}
                  onChange={(e) => setFormBuscar((p) => ({ ...p, serial: e.target.value }))}
                />
              </div>
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Oficina de origen</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  value={formBuscar.oficina}
                  onChange={(e) => setFormBuscar((p) => ({ ...p, oficina: e.target.value }))}
                />
              </div>
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Técnico</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  value={formBuscar.tecnico}
                  onChange={(e) => setFormBuscar((p) => ({ ...p, tecnico: e.target.value }))}
                />
              </div>
            </div>

            <h3 className="sgc-inv-form-subtitle">Detalles de la Salida</h3>
            <div className="sgc-inv-form-grid">
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">N° Orden de Trabajo</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  placeholder="Ej: OT-2026-0042"
                  value={formSalida.orden}
                  onChange={(e) => setFormSalida((p) => ({ ...p, orden: e.target.value }))}
                />
              </div>
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Oficina destino / Instalación</label>
                <input
                  type="text"
                  className="sgc-inv-input"
                  placeholder="Ej: Sucursal Centro"
                  value={formSalida.oficina_instalada}
                  onChange={(e) => setFormSalida((p) => ({ ...p, oficina_instalada: e.target.value }))}
                />
              </div>
              <div className="sgc-inv-form-group">
                <label className="sgc-inv-label">Fecha de salida</label>
                <input
                  type="date"
                  className="sgc-inv-input"
                  value={formSalida.fecha}
                  onChange={(e) => setFormSalida((p) => ({ ...p, fecha: e.target.value }))}
                />
              </div>
            </div>

            <div className="sgc-inv-form-actions">
              <button type="submit" className="sgc-inv-btn sgc-inv-btn--primary" disabled={guardandoSalida}>
                {guardandoSalida ? 'Guardando...' : '💾 Guardar Salida'}
              </button>
              <button
                type="button"
                className="sgc-inv-btn sgc-inv-btn--ghost"
                onClick={() => setVistaActiva('buscar')}
              >
                ← Volver a Búsqueda
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}