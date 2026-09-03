import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerMisAsignacionesActivas } from '../services/asignaciones';
import { calcularEstadoGraciaAsignacion, LABEL_TIPO_ASIGNACION } from '../utils/asignaciones';
import './PanelAlertasCierre.css';

export default function PanelAlertasCierre() {
  const navigate = useNavigate();
  const [asignaciones, setAsignaciones] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());

  // Actualizar cada 30 segundos para refrescar contadores en vivo
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        const res = await obtenerMisAsignacionesActivas();
        if (activo) {
          setAsignaciones(res.data || []);
        }
      } catch {
        // En caso de error de red, mantener silencioso para no interrumpir el layout
      } finally {
        if (activo) setCargando(false);
      }
    }
    cargar();
    // Refrescar cada 2 minutos
    const interval = setInterval(cargar, 120000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, []);

  // Procesar asignaciones con su estado de gracia calculado
  const itemsProcesados = useMemo(() => {
    return asignaciones.map((a) => {
      const gracia = calcularEstadoGraciaAsignacion(a);
      return {
        asignacion: a,
        ...gracia,
      };
    }).sort((a, b) => {
      // Priorizar asignaciones en gracia o urgentes al tope
      if (a.enGracia && !b.enGracia) return -1;
      if (!a.enGracia && b.enGracia) return 1;
      return (a.horasRestantes || 9999) - (b.horasRestantes || 9999);
    });
  }, [asignaciones, nowTick]);

  // Contar cuántas asignaciones están en período de gracia o próximas a vencer (< 24h)
  const alertasUrgentes = itemsProcesados.filter(
    (i) => i.enGracia || i.nivelUrgencia === 'urgente' || i.nivelUrgencia === 'advertencia'
  );
  const conteoAlertas = alertasUrgentes.length;
  const tieneGraciaActiva = itemsProcesados.some((i) => i.enGracia);

  function formatearFechaHora(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    let horas = d.getHours();
    const minutos = String(d.getMinutes()).padStart(2, '0');
    const ampm = horas >= 12 ? 'PM' : 'AM';
    horas = horas % 12 || 12;
    return `${dia}/${mes}/${anio} a las ${horas}:${minutos} ${ampm}`;
  }

  return (
    <>
      {/* Botón pestaña lateral flotante en el costado derecho */}
      <button
        type="button"
        className={`pac-tab-btn ${conteoAlertas > 0 ? 'pac-tab-btn--alerta' : ''} ${tieneGraciaActiva ? 'pac-tab-btn--gracia' : ''}`}
        onClick={() => setAbierto((prev) => !prev)}
        title="Ver alertas de cierre de asignaciones"
        aria-label="Panel de alertas de cierre de asignaciones"
      >
        <span className="pac-tab-icon">⏰</span>
        <span className="pac-tab-label">Cierres</span>
        {conteoAlertas > 0 && (
          <span className="pac-tab-badge">{conteoAlertas}</span>
        )}
      </button>

      {/* Backdrop cuando el panel está abierto en móviles */}
      {abierto && (
        <div
          className="pac-backdrop"
          onClick={() => setAbierto(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel lateral desplegable en el costado */}
      <aside
        className={`pac-panel ${abierto ? 'pac-panel--abierto' : ''}`}
        aria-label="Alertas de cierre de asignaciones"
      >
        <div className="pac-header">
          <div className="pac-header-title-wrap">
            <span className="pac-header-icon">⏰</span>
            <div>
              <h2 className="pac-header-title">Cierre de Asignaciones</h2>
              <p className="pac-header-sub">
                Control de plazos y ventana de gracia (24h)
              </p>
            </div>
          </div>
          <button
            type="button"
            className="pac-close-btn"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar panel de alertas"
          >
            ✕
          </button>
        </div>

        <div className="pac-body">
          {cargando ? (
            <div className="pac-loading">
              <div className="pac-spinner" />
              <span>Verificando asignaciones...</span>
            </div>
          ) : itemsProcesados.length === 0 ? (
            <div className="pac-empty">
              <span className="pac-empty-icon">✅</span>
              <h4>Sin asignaciones activas</h4>
              <p>No tienes misiones con plazos pendientes en este momento.</p>
            </div>
          ) : (
            <div className="pac-list">
              {itemsProcesados.map(({ asignacion: a, puedeSubir, enGracia, tiempoRestanteStr, limiteDate, nivelUrgencia }) => {
                const tipoLabel = LABEL_TIPO_ASIGNACION[a.tipo] || a.tipo;
                const limiteFormateado = formatearFechaHora(limiteDate);

                return (
                  <div
                    key={a.id}
                    className={`pac-card pac-card--${nivelUrgencia}`}
                  >
                    {/* Header de la tarjeta */}
                    <div className="pac-card-header">
                      <span className="pac-card-tag">
                        {tipoLabel}
                      </span>
                      {enGracia ? (
                        <span className="pac-card-status pac-card-status--gracia">
                          ⏳ Gracia 24h Activa
                        </span>
                      ) : nivelUrgencia === 'urgente' || nivelUrgencia === 'advertencia' ? (
                        <span className="pac-card-status pac-card-status--urgente">
                          ⚠️ Cierra Pronto
                        </span>
                      ) : (
                        <span className="pac-card-status pac-card-status--normal">
                          🟢 En Curso
                        </span>
                      )}
                    </div>

                    {/* Cliente / OT */}
                    <div className="pac-card-main">
                      <strong className="pac-card-cliente">
                        {a.cliente}
                      </strong>
                      <span className="pac-card-lugar">
                        {[a.empresa, a.ciudad].filter(Boolean).join(' · ')}
                      </span>
                    </div>

                    {/* Alerta de tiempo */}
                    <div className={`pac-card-alerta pac-card-alerta--${nivelUrgencia}`}>
                      <div className="pac-card-alerta-icon">
                        {enGracia ? '🚨' : nivelUrgencia === 'urgente' ? '⏰' : '📅'}
                      </div>
                      <div className="pac-card-alerta-texto">
                        {enGracia ? (
                          <>
                            <strong>Asignación cerrada</strong>
                            <span>
                              Tienes hasta el <strong>{limiteFormateado}</strong> para subir tus viáticos restantes.
                            </span>
                          </>
                        ) : (
                          <>
                            <strong>Fecha límite de subida</strong>
                            <span>
                              Hasta el <strong>{limiteFormateado}</strong> (incluye 24h de gracia tras cierre).
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Contador regresivo en vivo */}
                    <div className="pac-card-timer-row">
                      <span className="pac-card-timer-label">Tiempo restante:</span>
                      <span className={`pac-card-timer-badge pac-card-timer-badge--${nivelUrgencia}`}>
                        ⏱️ {tiempoRestanteStr}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div className="pac-card-actions">
                      {puedeSubir ? (
                        <button
                          type="button"
                          className="pac-btn-subir"
                          onClick={() => {
                            setAbierto(false);
                            navigate(`/nuevo-viatico?asignacion_id=${a.id}`);
                          }}
                        >
                          <span>➕</span> Cargar viático ahora
                        </button>
                      ) : (
                        <span className="pac-bloqueado-tag">
                          🔒 Carga bloqueada (plazo expirado)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer informativo */}
        <div className="pac-footer">
          <span className="pac-footer-info">
            💡 <strong>Regla Global Security:</strong> Al cerrarse una asignación, dispones de 24 horas continuas para legalizar tus viáticos.
          </span>
        </div>
      </aside>
    </>
  );
}
