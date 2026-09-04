import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listarProcesosCalidad } from '../services/calidadProcesos';
import './MapaProcesosSGC.css';

/**
 * MapaProcesosSGC
 *
 * Componente principal interactivo del Mapa de Procesos SGC (Dirección / Misionales / Apoyo)
 * con integración directa de los módulos operativos en:
 * - Operaciones (OP) → Viáticos & Operaciones
 * - Administrativo (AD) → Backup & Evidencias
 * - SG-SST (SS) → Talento Humano
 */
export default function MapaProcesosSGC({ mostrarEncabezadoCategoria = true }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [procesos, setProcesos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockAlert, setLockAlert] = useState(null);

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

  // Mapeo específico de subprocesos misionales
  const comercial = procesosMisionales.find((p) => p.codigo === 'CO') || procesosMisionales[0];
  const compras = procesosMisionales.find((p) => p.codigo === 'CI') || procesosMisionales[1];
  const operaciones = procesosMisionales.find((p) => p.codigo === 'OP') || procesosMisionales[2];

  // Mapeo de procesos de apoyo
  const ambiental = procesosApoyo.find((p) => p.codigo === 'SA' || p.codigo === 'GA') || procesosApoyo[0];
  const administrativo = procesosApoyo.find((p) => p.codigo === 'AD') || procesosApoyo[1];
  const sgsst = procesosApoyo.find((p) => p.codigo === 'SS') || procesosApoyo[2];

  /**
   * Renderiza una tarjeta estándar SGC (Gerencia, Mejora Continua, Comercial, Compras, Ambiental)
   */
  const renderCardEstandar = (proc, iconSvg, colorTheme = 'gold') => {
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
            <span className="sgc-link-detalle">👤 Ver detalle</span>
            {proc.total_documentos > 0 && (
              <span className="sgc-doc-badge">📄 {proc.total_documentos} doc</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleAccesoDenegado = (nombreModulo, razon) => {
    setLockAlert({
      modulo: nombreModulo,
      razon: razon || 'Tu cuenta no tiene permisos suficientes para acceder a este módulo operativo.',
    });
  };

  /**
   * Renderiza una tarjeta de nodo integrado operacional:
   * - Operaciones (OP)
   * - Administrativo (AD)
   * - SG-SST (SS)
   */
  const renderCardOperativa = ({
    proc,
    iconSvg,
    colorTheme,
    badgeText,
    primaryRoute,
    primaryButtonText,
    chips,
    isLocked = false,
    lockReason = '',
  }) => {
    if (!proc) return null;
    const responsiblesText =
      proc.responsables && proc.responsables.length > 0
        ? proc.responsables.map((r) => r.usuario?.nombre || 'Usuario').join(', ')
        : 'Equipo Operativo';

    return (
      <div
        key={proc.id}
        className={`sgc-proc-card sgc-proc-card--${colorTheme} sgc-proc-card--operativo ${isLocked ? 'sgc-proc-card--locked' : ''}`}
        onClick={() => {
          if (isLocked) {
            handleAccesoDenegado(proc.nombre, lockReason);
          } else {
            navigate(primaryRoute);
          }
        }}
        title={isLocked ? `🔒 Acceso restringido: No tienes permisos para ingresar a ${proc.nombre}` : `Ingresar al módulo operativo de ${proc.nombre}`}
      >
        <div className="sgc-proc-top-row">
          <div className="sgc-proc-icon-box">
            {isLocked ? (
              <span className="sgc-lock-icon" aria-hidden="true">🔒</span>
            ) : (
              iconSvg
            )}
          </div>
          <div className="sgc-proc-info">
            <div className="sgc-proc-header">
              <h4 className="sgc-proc-title">
                {proc.nombre.toUpperCase()} <span className="sgc-proc-code">({proc.codigo})</span>
              </h4>
              {isLocked ? (
                <span className="sgc-operativo-badge sgc-operativo-badge--locked">
                  🔒 SIN ACCESO
                </span>
              ) : (
                <span className="sgc-operativo-badge">{badgeText}</span>
              )}
            </div>
            <p className="sgc-proc-responsable">
              <span className="sgc-resp-label">Responsable:</span>{' '}
              <span className="sgc-resp-name">{responsiblesText}</span>
            </p>
          </div>
        </div>

        {/* Chips de subsecciones / accesos directos */}
        <div className="sgc-operativo-chips">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={`sgc-operativo-chip ${isLocked ? 'sgc-operativo-chip--locked' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isLocked) {
                  handleAccesoDenegado(proc.nombre, lockReason);
                } else {
                  navigate(chip.path);
                }
              }}
              title={isLocked ? `🔒 Acceso bloqueado a ${chip.label}` : `Acceso directo a ${chip.label}`}
            >
              <span className="sgc-chip-icon">{isLocked ? '🔒' : chip.icon}</span>
              <span className="sgc-chip-label">{chip.label}</span>
            </button>
          ))}
        </div>

        {/* Acciones del nodo: botón principal hacia el módulo y enlace secundario al SGC */}
        <div className="sgc-operativo-actions">
          <button
            type="button"
            className={`sgc-btn-primary-operativo ${isLocked ? 'sgc-btn-primary-operativo--locked' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isLocked) {
                handleAccesoDenegado(proc.nombre, lockReason);
              } else {
                navigate(primaryRoute);
              }
            }}
          >
            {isLocked ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Acceso Restringido</span>
              </>
            ) : (
              <>
                <span>{primaryButtonText}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          <button
            type="button"
            className="sgc-link-sgc-doc"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/calidad-de-procesos/proceso/${proc.id}`);
            }}
            title="Ver documentación y manuales SGC de este proceso"
          >
            📄 SGC ({proc.total_documentos || 0} doc)
          </button>
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
                  {procesosDireccion.map((p, idx) =>
                    renderCardEstandar(
                      p,
                      idx === 0 ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      ),
                      'gold'
                    )
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
                      renderCardEstandar(
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
                      renderCardEstandar(
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

                  {/* Subcolumna derecha: Operaciones (OP) INTEGRADO CON VIÁTICOS */}
                  <div className="sgc-mis-subcol-right">
                    {operaciones &&
                      renderCardOperativa({
                        proc: operaciones,
                        iconSvg: (
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        ),
                        colorTheme: 'blue',
                        badgeText: 'OPERATIVO',
                        primaryRoute: '/admin',
                        primaryButtonText: 'Ingresar a Viáticos & Operaciones',
                        isLocked: !((user?.rol === 'admin' || user?.rol === 'superadmin') && user?.acceso_viaticos !== false),
                        lockReason: 'Tu cuenta no tiene habilitado el acceso a Viáticos & Operaciones. Por favor solicita al Administrador Master (admin@gsbank.com) que active tus permisos.',
                        chips: [
                          { label: 'Liquidaciones', icon: '📋', path: '/admin' },
                          { label: 'Gastos & Facturas', icon: '💳', path: '/admin' },
                          { label: 'Técnicos & OT', icon: '👷', path: '/admin' },
                          { label: 'Cuentas de Cobro', icon: '💵', path: '/admin/cuentas-cobro' },
                          { label: 'Reportes Excel', icon: '📊', path: '/admin' },
                        ],
                      })}
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
                    renderCardEstandar(
                      ambiental,
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                      </svg>,
                      'green'
                    )}

                  {/* 2. Administrativo (AD) INTEGRADO CON BACKUP & EVIDENCIAS */}
                  {administrativo &&
                    renderCardOperativa({
                      proc: administrativo,
                      iconSvg: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      ),
                      colorTheme: 'green',
                      badgeText: 'BACKUP',
                      primaryRoute: '/admin/backup',
                      primaryButtonText: 'Ingresar a Backup & Evidencias',
                      isLocked: !(user?.rol === 'admin' || user?.rol === 'superadmin'),
                      lockReason: 'El módulo de Backup & Evidencias requiere privilegios de Administrador o Superadministrador.',
                      chips: [
                        { label: 'Visor Comprobantes', icon: '🖼️', path: '/admin/backup' },
                        { label: 'Por Oficinas', icon: '🏢', path: '/admin/backup' },
                        { label: 'Descargas ZIP', icon: '📦', path: '/admin/backup' },
                      ],
                    })}

                  {/* 3. SG-SST (SS) INTEGRADO CON TALENTO HUMANO */}
                  {sgsst &&
                    renderCardOperativa({
                      proc: sgsst,
                      iconSvg: (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          <polyline points="9 12 11 14 15 10" />
                        </svg>
                      ),
                      colorTheme: 'green',
                      badgeText: 'TALENTO HUMANO',
                      primaryRoute: '/talento-humano',
                      primaryButtonText: 'Ingresar a Talento Humano',
                      isLocked: !(user?.rol === 'admin' || user?.rol === 'superadmin'),
                      lockReason: 'El módulo de Talento Humano requiere privilegios de Administrador o Superadministrador.',
                      chips: [
                        { label: 'Directorio Personal', icon: '👤', path: '/talento-humano' },
                        { label: 'Contratos & Docs', icon: '📄', path: '/talento-humano' },
                        { label: 'Dotación & EPP', icon: '🦺', path: '/talento-humano' },
                        { label: 'Solicitudes', icon: '📝', path: '/talento-humano' },
                      ],
                    })}
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

      {/* ── MODAL / DIÁLOGO DE ACCESO RESTRINGIDO (CANDADO) ── */}
      {lockAlert && (
        <div className="sgc-lock-backdrop" onClick={() => setLockAlert(null)}>
          <div className="sgc-lock-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <div className="sgc-lock-dialog-icon">🔒</div>
            <div className="sgc-lock-dialog-content">
              <h3 className="sgc-lock-dialog-title">Acceso Restringido</h3>
              <div className="sgc-lock-dialog-module">{lockAlert.modulo}</div>
              <p className="sgc-lock-dialog-text">{lockAlert.razon}</p>
              <div className="sgc-lock-dialog-tip">
                <span>💡</span>
                <span>Puedes consultar libremente los manuales, fichas y documentación SGC de este proceso haciendo clic en el botón <strong>"📄 SGC doc"</strong>.</span>
              </div>
            </div>
            <div className="sgc-lock-dialog-actions">
              <button
                type="button"
                className="sgc-lock-dialog-btn"
                onClick={() => setLockAlert(null)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
