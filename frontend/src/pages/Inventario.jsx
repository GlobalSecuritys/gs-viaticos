import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { esAdministradorSeccion, tieneAccesoSeccion } from '../utils/permisos';
import { formatApiError } from '../utils/formatError';
import { listarProcesosCalidad } from '../services/calidadProcesos';
import {
  obtenerDatosExcel,
  buscarEnExcel,
  guardarSalidaRegistro,
} from '../services/inventario';
import './Inventario.css';

export default function Inventario() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEditar = user?.rol === 'superadmin' || esAdministradorSeccion(user, 'IN');
  const puedeVer = puedeEditar || tieneAccesoSeccion(user, 'IN');

  const [rutaFichaIN, setRutaFichaIN] = useState('/calidad-de-procesos');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // ── Vista activa: 'excel' | 'buscar' | 'salida' ───────────────────────────
  const [vistaActiva, setVistaActiva] = useState('excel');
  const [panelFiltroAbierto, setPanelFiltroAbierto] = useState(false);

  // ── Datos Excel ───────────────────────────────────────────────────────────
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [excelData, setExcelData] = useState({
    existe: false,
    archivo: 'inventario_general.xlsx',
    hojas: [],
    hoja_activa: null,
    columnas: [],
    total_filas: 0,
    filas: [],
  });
  const [hojaSeleccionada, setHojaSeleccionada] = useState('');

  // Filtros dinámicos sobre la tabla del Excel
  const [filtroTextoGlobal, setFiltroTextoGlobal] = useState('');
  const [filtrosColumnas, setFiltrosColumnas] = useState({});

  // ── Formulario 1: Buscar equipo ──────────────────────────────────────────
  const [formBuscar, setFormBuscar] = useState({
    serial: '',
    oficina: '',
    tecnico: '',
    fecha: '',
  });
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

  // ── Cargar ficha SGC para botón Volver ─────────────────────────────────────
  useEffect(() => {
    listarProcesosCalidad()
      .then((procesos) => {
        const proceso = procesos.find((p) => p.codigo === 'IN');
        if (proceso) setRutaFichaIN('/calidad-de-procesos/proceso/' + proceso.id);
      })
      .catch(() => {});
  }, []);

  // ── Cargar datos del Excel ────────────────────────────────────────────────
  const cargarExcel = useCallback(async (hoja = '') => {
    setCargandoExcel(true);
    setError('');
    try {
      const data = await obtenerDatosExcel({ hoja, limit: 1500 });
      setExcelData(data);
      if (data.hoja_activa) {
        setHojaSeleccionada(data.hoja_activa);
      }
    } catch (err) {
      setError(formatApiError(err, 'No se pudo leer el archivo Excel en el servidor.'));
    } finally {
      setCargandoExcel(false);
    }
  }, []);

  useEffect(() => {
    if (puedeVer) {
      cargarExcel();
    }
  }, [puedeVer, cargarExcel]);

  const cambiarHoja = (nombreHoja) => {
    setHojaSeleccionada(nombreHoja);
    setFiltroTextoGlobal('');
    setFiltrosColumnas({});
    cargarExcel(nombreHoja);
  };

  // ── Filas filtradas de la tabla Excel según panel de filtros ──────────────
  const filasFiltradas = useMemo(() => {
    if (!excelData.filas) return [];
    return excelData.filas.filter((fila) => {
      // Filtro global
      if (filtroTextoGlobal.trim()) {
        const q = filtroTextoGlobal.toLowerCase();
        const coincideGlobal = Object.values(fila).some((val) =>
          String(val || '').toLowerCase().includes(q)
        );
        if (!coincideGlobal) return false;
      }
      // Filtros por columna
      for (const [col, valFiltro] of Object.entries(filtrosColumnas)) {
        if (!valFiltro || !valFiltro.trim()) continue;
        const qCol = valFiltro.toLowerCase();
        const valCelda = String(fila[col] || '').toLowerCase();
        if (!valCelda.includes(qCol)) return false;
      }
      return true;
    });
  }, [excelData.filas, filtroTextoGlobal, filtrosColumnas]);

  // ── Manejo de Búsqueda de Equipo ──────────────────────────────────────────
  const handleBuscar = async (e) => {
    if (e) e.preventDefault();
    setAvisoBusqueda('');
    setError('');

    const tieneAlMenosUno =
      formBuscar.serial.trim() ||
      formBuscar.oficina.trim() ||
      formBuscar.tecnico.trim() ||
      formBuscar.fecha.trim();

    if (!tieneAlMenosUno) {
      setAvisoBusqueda('Por favor diligencia al menos un campo para realizar la búsqueda (Serial, Oficina, Técnico o Fecha).');
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

  // ── Manejo de Guardar y Generar Orden (Salida) ────────────────────────────
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

      setMensajeExitoSalida(
        '✓ Registro de salida guardado correctamente. La generación del documento de orden se habilitará próximamente.'
      );
      setFormSalida({
        orden: '',
        oficina_instalada: '',
        fecha: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      setError(formatApiError(err, 'No se pudo guardar el registro de salida.'));
    } finally {
      setGuardandoSalida(false);
    }
  };

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

  return (
    <div className="sgc-inv-panel">
      {/* ── Encabezado principal ── */}
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
            Proceso Inventario (IN) · Visualización y gestión en tiempo real desde archivo maestro
          </p>
        </div>
      </header>

      {/* ── Avisos globales ── */}
      {feedback && <div className="sgc-inv-alerta sgc-inv-alerta--ok">{feedback}</div>}
      {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

      {/* ── BARRA DE HERRAMIENTAS PRINCIPAL: EXCEL, FILTRO, BUSCAR/SALIDA ── */}
      <section className="sgc-inv-toolbar-container">
        <div className="sgc-inv-toolbar-left">
          {/* Botón 1: Excel */}
          <button
            type="button"
            className={`sgc-inv-btn-accion ${vistaActiva === 'excel' ? 'sgc-inv-btn-accion--activo' : ''}`}
            onClick={() => setVistaActiva('excel')}
            title="Visualizar el contenido del archivo Excel maestro"
          >
            <span className="sgc-inv-btn-icon">📊</span>
            <span>Excel</span>
          </button>

          {/* Botón 2: Filtro */}
          <button
            type="button"
            className={`sgc-inv-btn-accion ${panelFiltroAbierto ? 'sgc-inv-btn-accion--filtro-activo' : ''}`}
            onClick={() => {
              setVistaActiva('excel');
              setPanelFiltroAbierto((prev) => !prev);
            }}
            title="Abrir u ocultar panel de filtros sobre la tabla del Excel"
          >
            <span className="sgc-inv-btn-icon">🔍</span>
            <span>Filtro {Object.values(filtrosColumnas).filter(Boolean).length > 0 || filtroTextoGlobal ? '(Activo)' : ''}</span>
          </button>

          {/* Botón 3: Buscar equipo / Salida */}
          <button
            type="button"
            className={`sgc-inv-btn-accion ${vistaActiva === 'buscar' || vistaActiva === 'salida' ? 'sgc-inv-btn-accion--activo' : ''}`}
            onClick={() => setVistaActiva('buscar')}
            title="Abrir formulario de búsqueda de equipo y gestión de salida"
          >
            <span className="sgc-inv-btn-icon">🔎</span>
            <span>Buscar equipo / Salida</span>
          </button>
        </div>

        {/* Info archivo cargado */}
        <div className="sgc-inv-toolbar-right">
          <span className="sgc-inv-badge-archivo">
            📁 {excelData.archivo || 'inventario_general.xlsx'}
          </span>
          {excelData.existe && (
            <span className="sgc-inv-badge-filas">
              {excelData.total_filas} registros
            </span>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          VISTA 1: EXCEL (TABLA, HOJAS Y PANEL DE FILTROS)
         ══════════════════════════════════════════════════════════════════════ */}
      {vistaActiva === 'excel' && (
        <section className="sgc-inv-seccion-excel">
          {/* Selector de Hojas si existen */}
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

          {/* Panel de Filtros retráctil */}
          {panelFiltroAbierto && (
            <div className="sgc-inv-panel-filtros animate-slide-down">
              <div className="sgc-inv-filtros-head">
                <h3 className="sgc-inv-filtros-titulo">Filtros sobre Hoja: {hojaSeleccionada}</h3>
                {(filtroTextoGlobal || Object.values(filtrosColumnas).some(Boolean)) && (
                  <button
                    type="button"
                    className="sgc-inv-btn-limpiar"
                    onClick={() => {
                      setFiltroTextoGlobal('');
                      setFiltrosColumnas({});
                    }}
                  >
                    ✕ Limpiar filtros
                  </button>
                )}
              </div>

              {/* Búsqueda rápida general */}
              <div className="sgc-inv-filtro-global-box">
                <input
                  type="text"
                  placeholder="Buscar texto en cualquier columna de esta hoja..."
                  value={filtroTextoGlobal}
                  onChange={(e) => setFiltroTextoGlobal(e.target.value)}
                  className="sgc-inv-input sgc-inv-input--global"
                />
              </div>

              {/* Filtros específicos por columna real */}
              <div className="sgc-inv-filtros-grid">
                {excelData.columnas.slice(0, 8).map((col) => (
                  <div key={col} className="sgc-inv-filtro-col-item">
                    <label className="sgc-inv-filtro-col-label">{col}</label>
                    <input
                      type="text"
                      placeholder={`Filtrar por ${col}...`}
                      value={filtrosColumnas[col] || ''}
                      onChange={(e) =>
                        setFiltrosColumnas((prev) => ({
                          ...prev,
                          [col]: e.target.value,
                        }))
                      }
                      className="sgc-inv-input sgc-inv-input--sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contenido de la Tabla */}
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
                No se encontró <code>backend/data/inventario/inventario_general.xlsx</code>.
                Coloca el archivo Excel en la carpeta del servidor para visualizarlo aquí.
              </p>
              <button
                type="button"
                className="sgc-inv-btn sgc-inv-btn--primary"
                onClick={() => cargarExcel()}
              >
                Reintentar lectura
              </button>
            </div>
          ) : (
            <div className="sgc-inv-tabla-card">
              <div className="sgc-inv-tabla-meta">
                <span>
                  Mostrando <strong>{filasFiltradas.length}</strong> de{' '}
                  <strong>{excelData.total_filas}</strong> registros en{' '}
                  <strong>{hojaSeleccionada}</strong>
                </span>
                <button
                  type="button"
                  className="sgc-inv-btn-recargar"
                  onClick={() => cargarExcel(hojaSeleccionada)}
                  title="Recargar archivo si fue actualizado en disco"
                >
                  ↻ Refrescar datos
                </button>
              </div>

              <div className="sgc-inv-table-wrapper">
                <table className="sgc-inv-table">
                  <thead>
                    <tr>
                      <th className="sgc-inv-th-num">#</th>
                      {excelData.columnas.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={excelData.columnas.length + 1} className="sgc-inv-td-vacio">
                          No hay registros que coincidan con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filasFiltradas.map((fila, idx) => (
                        <tr key={idx} className="sgc-inv-tr">
                          <td className="sgc-inv-td-num">{idx + 1}</td>
                          {excelData.columnas.map((col) => (
                            <td key={col} className="sgc-inv-td">
                              {fila[col] !== undefined && fila[col] !== null ? String(fila[col]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
      {/* ══════════════════════════════════════════════════════════════════════
          VISTA 2: BUSCAR EQUIPO / SALIDA (Paso 2 y Paso 3)
         ══════════════════════════════════════════════════════════════════════ */}
      {(vistaActiva === 'buscar' || vistaActiva === 'salida') && (
        <section className="sgc-inv-seccion-gestion animate-fade-in">
          <div className="sgc-inv-tabs-sub">
            <button
              type="button"
              className={`sgc-inv-tab-sub ${vistaActiva === 'buscar' ? 'sgc-inv-tab-sub--activo' : ''}`}
              onClick={() => setVistaActiva('buscar')}
            >
              1. Buscar equipo
            </button>
            <button
              type="button"
              className={`sgc-inv-tab-sub ${vistaActiva === 'salida' ? 'sgc-inv-tab-sub--activo' : ''}`}
              onClick={() => setVistaActiva('salida')}
            >
              2. Registro de Salida
            </button>
          </div>

          {/* ── Sub-formulario 1: Buscar equipo ── */}
          {vistaActiva === 'buscar' && (
            <div className="sgc-inv-form-card">
              <div className="sgc-inv-form-header">
                <h3>Búsqueda de Equipo en Inventario</h3>
                <p>
                  Completa cualquiera de los campos siguientes para filtrar en el archivo Excel.
                  Ninguno es obligatorio, pero debes ingresar al menos uno para iniciar la búsqueda.
                </p>
              </div>

              {avisoBusqueda && (
                <div className="sgc-inv-alerta sgc-inv-alerta--aviso">
                  ⚠️ {avisoBusqueda}
                </div>
              )}

              <form onSubmit={handleBuscar} className="sgc-inv-form-grid">
                <div className="sgc-inv-form-group">
                  <label htmlFor="b-serial">Serial / Código:</label>
                  <input
                    id="b-serial"
                    type="text"
                    placeholder="Ej. SN-89218 o número de serie..."
                    value={formBuscar.serial}
                    onChange={(e) => setFormBuscar({ ...formBuscar, serial: e.target.value })}
                    className="sgc-inv-input"
                  />
                </div>

                <div className="sgc-inv-form-group">
                  <label htmlFor="b-oficina">Oficina / Sede / Destino:</label>
                  <input
                    id="b-oficina"
                    type="text"
                    placeholder="Ej. Oficina Principal, Cali, etc..."
                    value={formBuscar.oficina}
                    onChange={(e) => setFormBuscar({ ...formBuscar, oficina: e.target.value })}
                    className="sgc-inv-input"
                  />
                </div>

                <div className="sgc-inv-form-group">
                  <label htmlFor="b-tecnico">Técnico / Responsable:</label>
                  <input
                    id="b-tecnico"
                    type="text"
                    placeholder="Ej. Juan Pérez..."
                    value={formBuscar.tecnico}
                    onChange={(e) => setFormBuscar({ ...formBuscar, tecnico: e.target.value })}
                    className="sgc-inv-input"
                  />
                </div>

                <div className="sgc-inv-form-group">
                  <label htmlFor="b-fecha">Fecha:</label>
                  <input
                    id="b-fecha"
                    type="text"
                    placeholder="Ej. 2026-03-15 o año/mes..."
                    value={formBuscar.fecha}
                    onChange={(e) => setFormBuscar({ ...formBuscar, fecha: e.target.value })}
                    className="sgc-inv-input"
                  />
                </div>

                {/* Botones de acción del formulario */}
                <div className="sgc-inv-form-actions-full">
                  <button
                    type="submit"
                    disabled={buscando}
                    className="sgc-inv-btn sgc-inv-btn--primary"
                  >
                    {buscando ? 'Buscando...' : '🔍 Buscar'}
                  </button>

                  <button
                    type="button"
                    className="sgc-inv-btn sgc-inv-btn--salida"
                    onClick={() => setVistaActiva('salida')}
                  >
                    ➜ Salida
                  </button>

                  {(formBuscar.serial || formBuscar.oficina || formBuscar.tecnico || formBuscar.fecha) && (
                    <button
                      type="button"
                      className="sgc-inv-btn sgc-inv-btn--ghost"
                      onClick={() => {
                        setFormBuscar({ serial: '', oficina: '', tecnico: '', fecha: '' });
                        setResultadosBusqueda([]);
                        setBusquedaEjecutada(false);
                        setAvisoBusqueda('');
                      }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </form>

              {/* Resultados de la búsqueda */}
              {busquedaEjecutada && (
                <div className="sgc-inv-resultados-box">
                  <div className="sgc-inv-resultados-header">
                    <h4>Resultados encontrados ({resultadosBusqueda.length})</h4>
                    <span className="sgc-inv-nota-clic">Haz clic en un registro para transferirlo a Salida</span>
                  </div>

                  {resultadosBusqueda.length === 0 ? (
                    <p className="sgc-inv-vacio-msg">
                      No se encontraron registros con los criterios diligenciados en la hoja actual ({hojaSeleccionada}).
                    </p>
                  ) : (
                    <div className="sgc-inv-table-wrapper sgc-inv-table-wrapper--sm">
                      <table className="sgc-inv-table">
                        <thead>
                          <tr>
                            <th>Acción</th>
                            {excelData.columnas.slice(0, 6).map((col) => (
                              <th key={col}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {resultadosBusqueda.map((fila, idx) => (
                            <tr key={idx} className="sgc-inv-tr sgc-inv-tr--clickable" onClick={() => irASalidaDesdeFila(fila)}>
                              <td>
                                <button
                                  type="button"
                                  className="sgc-inv-btn-usar-salida"
                                  title="Llevar a formulario de salida"
                                >
                                  Usar en Salida →
                                </button>
                              </td>
                              {excelData.columnas.slice(0, 6).map((col) => (
                                <td key={col}>{fila[col] || '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Sub-formulario 2: Salida (Paso 3) ── */}
          {vistaActiva === 'salida' && (
            <div className="sgc-inv-form-card animate-fade-in">
              <div className="sgc-inv-form-header">
                <h3>Formulario de Salida</h3>
                <p>
                  Registra la salida del equipo indicando el número de orden, la oficina donde se instala y la fecha.
                </p>
              </div>

              {/* Resumen de datos capturados previamente en búsqueda */}
              <div className="sgc-inv-resumen-busqueda-previa">
                <span className="sgc-inv-subtitulo-previa">Datos del equipo capturados:</span>
                <div className="sgc-inv-chips-previa">
                  <div className="sgc-inv-chip">
                    <strong>Serial:</strong> {formBuscar.serial || '—'}
                  </div>
                  <div className="sgc-inv-chip">
                    <strong>Oficina origen:</strong> {formBuscar.oficina || '—'}
                  </div>
                  <div className="sgc-inv-chip">
                    <strong>Técnico:</strong> {formBuscar.tecnico || '—'}
                  </div>
                  <div className="sgc-inv-chip">
                    <strong>Fecha ref:</strong> {formBuscar.fecha || '—'}
                  </div>
                </div>
                <button
                  type="button"
                  className="sgc-inv-btn-modificar-busqueda"
                  onClick={() => setVistaActiva('buscar')}
                >
                  ✎ Modificar datos del equipo
                </button>
              </div>

              {mensajeExitoSalida && (
                <div className="sgc-inv-alerta sgc-inv-alerta--ok">
                  {mensajeExitoSalida}
                </div>
              )}

              <form onSubmit={handleGuardarSalida} className="sgc-inv-form-grid">
                <div className="sgc-inv-form-group">
                  <label htmlFor="s-orden">Orden / N° Orden de Trabajo:</label>
                  <input
                    id="s-orden"
                    type="text"
                    required
                    placeholder="Ej. OT-10492 o número de orden..."
                    value={formSalida.orden}
                    onChange={(e) => setFormSalida({ ...formSalida, orden: e.target.value })}
                    className="sgc-inv-input"
                  />
                </div>

                <div className="sgc-inv-form-group">
                  <label htmlFor="s-oficina-inst">Oficina Instalada / Destino Final:</label>
                  <input
                    id="s-oficina-inst"
                    type="text"
                    required
                    placeholder="Ej. Sucursal Centro..."
                    value={formSalida.oficina_instalada}
                    onChange={(e) => setFormSalida({ ...formSalida, oficina_instalada: e.target.value })}
                    className="sgc-inv-input"
                  />
                </div>

                <div className="sgc-inv-form-group">
                  <label htmlFor="s-fecha">Fecha de Salida / Instalación:</label>
                  <input
                    id="s-fecha"
                    type="date"
                    required
                    value={formSalida.fecha}
                    onChange={(e) => setFormSalida({ ...formSalida, fecha: e.target.value })}
                    className="sgc-inv-input"
                  />
                </div>

                {/* Botón Guardar y generar orden */}
                <div className="sgc-inv-form-actions-full">
                  <button
                    type="submit"
                    disabled={guardandoSalida}
                    className="sgc-inv-btn sgc-inv-btn--gold"
                  >
                    {guardandoSalida ? 'Guardando salida...' : '💾 Guardar y generar orden'}
                  </button>

                  <button
                    type="button"
                    className="sgc-inv-btn sgc-inv-btn--ghost"
                    onClick={() => setVistaActiva('buscar')}
                  >
                    ← Regresar a búsqueda
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}