import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarProcesosCalidad } from '../services/calidadProcesos';
import './MapaProcesosSGC.css';

/**
 * MapaProcesosSGC
 *
 * Mapa de Procesos del Sistema de Gestión de Calidad (SGC).
 * Presenta las 8 cajas de proceso estándar y homogéneas:
 * - Dirección: Gerencia (GR), Mejora Continua (MC)
 * - Misionales: Comercial (CO), Compras e Inventario (CI), Operaciones (OP)
 * - Apoyo: Ambiental (SA), Administrativo (AD), SG-SST (SS)
 *
 * Cada caja contiene exclusivamente:
 * 1. Ícono del proceso
 * 2. Nombre del proceso y código
 * 3. Responsable: [Nombre o "Sin asignar"]
 * 4. Enlace "Ver detalle" que conduce a la ficha del proceso
 */
export default function MapaProcesosSGC({ mostrarEncabezadoCategoria = true }) {
  const navigate = useNavigate();
  const [procesos, setProcesos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        setLoading(true);
        const data = await listarProcesosCalidad();
        if (activo) {
          setProcesos(data || []);
        }
      } catch (err) {
        if (activo) {
          setError('No se pudo cargar el mapa de procesos. Intente de nuevo.');
        }
      } finally {
        if (activo) setLoading(false);
      }
    }
    cargar();
    return () => {
      activo = false;
    };
  }, []);

  // Agrupar por categoría
  const procesosDireccion = useMemo(
    () => procesos.filter((p) => p.categoria.toLowerCase() === 'direccion'),
    [procesos]
  );
  const procesosMisionales = useMemo(
    () => procesos.filter((p) => p.categoria.toLowerCase() === 'misional'),
    [procesos]
  );
  const procesosApoyo = useMemo(
    () => procesos.filter((p) => p.categoria.toLowerCase() === 'apoyo'),
    [procesos]
  );

  // Mapeo específico de subprocesos de dirección
  const gerencia =
    procesosDireccion.find((p) => p.codigo === 'GR' || p.codigo === 'GE') || procesosDireccion[0];
  const mejoraContinua =
    procesosDireccion.find((p) => p.codigo === 'MC') || procesosDireccion[1];

  // Mapeo específico de subprocesos misionales
  const comercial =
    procesosMisionales.find((p) => p.codigo === 'CO') || procesosMisionales[0];
  const compras =
    procesosMisionales.find((p) => p.codigo === 'CI') || procesosMisionales[1];
  const operaciones =
    procesosMisionales.find((p) => p.codigo === 'OP') || procesosMisionales[2];

  // Mapeo de procesos de apoyo
  const ambiental =
    procesosApoyo.find((p) => p.codigo === 'SA' || p.codigo === 'GA') || procesosApoyo[0];
  const administrativo =
    procesosApoyo.find((p) => p.codigo === 'AD') || procesosApoyo[1];
  const sgsst =
    procesosApoyo.find((p) => p.codigo === 'SS') || procesosApoyo[2];

  /**
   * Renderiza una caja limpia, uniforme y estandarizada del Mapa de Procesos SGC
   */
  const renderCard = (proc, iconSvg, colorTheme = 'gold') => {
    if (!proc) return null;
    const responsiblesText =
      proc.responsables && proc.responsables.length > 0
        ? proc.responsables.map((r) => r.usuario?.nombre || 'Usuario').join(', ')
        : 'Sin asignar';

    return (
      <div
        key={proc.id}
        className={`sgc-proc-card sgc-proc-card--${colorTheme}`}
        onClick={() => navigate(`/calidad-de-procesos/proceso/${proc.id}`)}
        title={`Ver detalle del proceso ${proc.nombre} (${proc.codigo})`}
      >
        <div className="sgc-proc-icon-box">{iconSvg}</div>
        <div className="sgc-proc-info">
          <div className="sgc-proc-header">
            <h4 className="sgc-proc-title">
              {proc.nombre.toUpperCase()} <span className="sgc-proc-code">({proc.codigo})</span>
            </h4>
          </div>
          <p className="sgc-proc-responsable">
            <span className="sgc-resp-label">Responsable:</span>{' '}
            <span className="sgc-resp-name">{responsiblesText}</span>
          </p>
          <div className="sgc-proc-footer">
            <span className="sgc-link-detalle">👤 Ver detalle →</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="sgc-map-wrapper">
      {error && <div className="sgc-alert-error">{error}</div>}

      {loading ? (
        <div className="sgc-loading-state">
          <div className="sgc-spinner"></div>
          <p>Cargando Mapa de Procesos SGC…</p>
        </div>
      ) : (
        <div className="sgc-map-container">
          {/* ── LEYENDA / CONVENCIONES ── */}
          <div className="sgc-convenciones-card">
            <h5 className="sgc-convenciones-title">Convenciones</h5>
            <div className="sgc-convencion-item">
              <span className="sgc-dot sgc-dot--dir"></span>
              <span>Dirección</span>
            </div>
            <div className="sgc-convencion-item">
              <span className="sgc-dot sgc-dot--mis"></span>
              <span>Misionales</span>
            </div>
            <div className="sgc-convencion-item">
              <span className="sgc-dot sgc-dot--apo"></span>
              <span>Apoyo</span>
            </div>
            <div className="sgc-convencion-item">
              <span className="sgc-dot sgc-dot--usr"></span>
              <span>Usuarios / SGC</span>
            </div>
          </div>

          {/* ── ESTRUCTURA EN 3 COLUMNAS: ENTRADA / MAPA / SALIDA ── */}
          <div className="sgc-map-layout">
            {/* Columna Izquierda: Clientes (Necesidades) */}
            <div className="sgc-side-col sgc-side-col--left">
              <div className="sgc-side-pill">
                <div className="sgc-side-icon">👥</div>
                <div className="sgc-side-text">
                  <strong>CLIENTES Y PARTES INTERESADAS</strong>
                  <span>NECESIDADES Y REQUISITOS</span>
                </div>
              </div>
              <div className="sgc-side-arrow-right">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 5l7 7-7 7v-4H3v-6h11V5z" />
                </svg>
              </div>
            </div>

            {/* Columna Central: Los 3 bloques SGC */}
            <div className="sgc-center-blocks">
              {/* 1. PROCESOS DE DIRECCIÓN */}
              <section className="sgc-section-block sgc-section-block--direccion">
                <div
                  className="sgc-block-header sgc-block-header--direccion"
                  onClick={() => navigate('/calidad-de-procesos/categoria/direccion')}
                  title="Ver listado de Procesos de Dirección"
                >
                  <h3>PROCESOS DE DIRECCIÓN</h3>
                  {mostrarEncabezadoCategoria && <span className="sgc-header-hint">Ver categoría →</span>}
                </div>
                <div className="sgc-cards-row sgc-cards-row--direccion">
                  {gerencia &&
                    renderCard(
                      gerencia,
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>,
                      'gold'
                    )}
                  {mejoraContinua &&
                    renderCard(
                      mejoraContinua,
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>,
                      'gold'
                    )}
                </div>
              </section>

              {/* Conector Vertical Dirección <-> Misionales */}
              <div className="sgc-v-connector">
                <svg width="28" height="34" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l-5 5h3v10H7l5 5 5-5h-3V7h3l-5-5z" />
                </svg>
              </div>

              {/* 2. PROCESOS MISIONALES */}
              <section className="sgc-section-block sgc-section-block--misional">
                <div
                  className="sgc-block-header sgc-block-header--misional"
                  onClick={() => navigate('/calidad-de-procesos/categoria/misional')}
                  title="Ver listado de Procesos Misionales"
                >
                  <h3>PROCESOS MISIONALES</h3>
                  {mostrarEncabezadoCategoria && <span className="sgc-header-hint">Ver categoría →</span>}
                </div>

                <div className="sgc-misionales-grid">
                  {/* Subcolumna izquierda: Comercial & Compras */}
                  <div className="sgc-mis-subcol-left">
                    {comercial &&
                      renderCard(
                        comercial,
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>,
                        'blue'
                      )}

                    {/* Flecha bidireccional entre Comercial y Compras */}
                    <div className="sgc-v-mini-connector">
                      <svg width="22" height="26" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l-4 4h2.5v12H8l4 4 4-4h-2.5V6H16l-4-4z" />
                      </svg>
                    </div>

                    {compras &&
                      renderCard(
                        compras,
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="9" cy="21" r="1" />
                          <circle cx="20" cy="21" r="1" />
                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>,
                        'blue'
                      )}
                  </div>

                  {/* Conector horizontal entre subcolumnas */}
                  <div className="sgc-h-mini-connector">
                    <svg width="34" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2 12l5-5v3h10V7l5 5-5 5v-3H7v3l-5-5z" />
                    </svg>
                  </div>

                  {/* Subcolumna derecha: Operaciones (OP) */}
                  <div className="sgc-mis-subcol-right">
                    {operaciones &&
                      renderCard(
                        operaciones,
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>,
                        'blue'
                      )}
                  </div>
                </div>
              </section>

              {/* Conector Vertical Misionales <-> Apoyo */}
              <div className="sgc-v-connector">
                <svg width="28" height="34" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l-5 5h3v10H7l5 5 5-5h-3V7h3l-5-5z" />
                </svg>
              </div>

              {/* 3. PROCESOS DE APOYO */}
              <section className="sgc-section-block sgc-section-block--apoyo">
                <div
                  className="sgc-block-header sgc-block-header--apoyo"
                  onClick={() => navigate('/calidad-de-procesos/categoria/apoyo')}
                  title="Ver listado de Procesos de Apoyo"
                >
                  <h3>PROCESOS DE APOYO</h3>
                  {mostrarEncabezadoCategoria && <span className="sgc-header-hint">Ver categoría →</span>}
                </div>
                <div className="sgc-cards-row sgc-cards-row--apoyo">
                  {/* 1. Ambiental (SA / GA) */}
                  {ambiental &&
                    renderCard(
                      ambiental,
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                      </svg>,
                      'green'
                    )}

                  {/* 2. Administrativo (AD) */}
                  {administrativo &&
                    renderCard(
                      administrativo,
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>,
                      'green'
                    )}

                  {/* 3. SG-SST (SS) */}
                  {sgsst &&
                    renderCard(
                      sgsst,
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>,
                      'green'
                    )}
                </div>
              </section>
            </div>

            {/* Columna Derecha: Clientes (Satisfacción) */}
            <div className="sgc-side-col sgc-side-col--right">
              <div className="sgc-side-arrow-left">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 5l7 7-7 7v-4H3v-6h11V5z" />
                </svg>
              </div>
              <div className="sgc-side-pill">
                <div className="sgc-side-icon">👍</div>
                <div className="sgc-side-text">
                  <strong>CLIENTES Y PARTES INTERESADAS</strong>
                  <span>SATISFACCIÓN</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
