import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerMisAsignacionesActivas } from '../services/asignaciones';
import { calcularAvisoCierre, formatearCierreEn, LABEL_TIPO_ASIGNACION, parsearFechaUtc } from '../utils/asignaciones';
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
      // Guard de visibilidad: no consultar la BD si la pestaña está en segundo plano
      if (document.visibilityState !== 'visible') return;
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
    // Refrescar cada 5 minutos (era 2 min). El guard de visibilidad evita
    // peticiones a la BD cuando la pestaña está minimizada o en segundo plano,
    // permitiendo que Neon duerma tras ~5 min de inactividad real.
    const interval = setInterval(cargar, 300000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, []);

  // Procesar asignaciones con su estado calculado
  const itemsProcesados = useMemo(() => {
    return asignaciones.map((a) => {
      const puedeSubir = a.puede_subir !== false;
      const aviso = calcularAvisoCierre(a.cierre_en);
      return {
        asignacion: a,
        puedeSubir,
        cierraPronto: aviso.cierra,
        tiempoStr: aviso.tiempoStr,
        msRestantes: aviso.msRestantes,
        nivelUrgencia: !puedeSubir ? 'bloqueada' : aviso.cierra ? 'urgente' : 'normal',
      };
    }).filter((i) => i.puedeSubir || !i.puedeSubir) // mostrar todas (activas + cerradas)
      .sort((a, b) => {
        if (a.cierraPronto && !b.cierraPronto) return -1;
        if (!a.cierraPronto && b.cierraPronto) return 1;
        return (a.msRestantes || 9999) - (b.msRestantes || 9999);
      });
  }, [asignaciones, nowTick]);

  // Alertas urgentes: asignaciones que cierran en < 2h
  const alertasUrgentes = itemsProcesados.filter(
    (i) => i.puedeSubir && i.cierraPronto
  );
  const conteoAlertas = alertasUrgentes.length;
  const tieneCierrePronto = alertasUrgentes.length > 0;

  function formatearFechaHora(fecha) {
    if (!fecha) return '—';
    const d = parsearFechaUtc(fecha);
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
        className={`pac-tab-btn ${conteoAlertas > 0 ? 'pac-tab-btn--alerta' : ''} ${tieneCierrePronto ? 'pac-tab-btn--gracia' : ''}`}
        onClick={() => setAbierto((prev) => !prev)}
        title="Ver alertas de cierre de asignaciones"
        aria-label="Panel de alertas de cierre de asignaciones"
      >
        <span className="pac-tab-icon">⏰</span>
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
                Control de plazos activos
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
              {itemsProcesados.map(({ asignacion: a, puedeSubir, cierraPronto, tiempoStr, nivelUrgencia }) => {
                const tipoLabel = LABEL_TIPO_ASIGNACION[a.tipo] || a.tipo;
                const cierreFormateado = formatearCierreEn(a.cierre_en);

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
                      {!puedeSubir ? (
                        <span className="pac-card-status pac-card-status--gracia">
                          🔒 Cerrada
                        </span>
                      ) : cierraPronto ? (
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
                    {cierreFormateado && (
                      <div className={`pac-card-alerta pac-card-alerta--${nivelUrgencia}`}>
                        <div className="pac-card-alerta-icon">
                          {!puedeSubir ? '🔒' : cierraPronto ? '⏰' : '📅'}
                        </div>
                        <div className="pac-card-alerta-texto">
                          <strong>{!puedeSubir ? 'Asignación cerrada' : 'Fecha límite de subida'}</strong>
                          <span>Cierra el <strong>{cierreFormateado}</strong>.</span>
                        </div>
                      </div>
                    )}

                    {/* Contador regresivo en vivo (solo si cierra pronto) */}
                    {cierraPronto && tiempoStr && (
                      <div className="pac-card-timer-row">
                        <span className="pac-card-timer-label">Tiempo restante:</span>
                        <span className={`pac-card-timer-badge pac-card-timer-badge--${nivelUrgencia}`}>
                          ⏱️ {tiempoStr}
                        </span>
                      </div>
                    )}

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
                          🔒 Carga bloqueada
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
            💡 <strong>Regla Global Security:</strong> La subida de viáticos está disponible desde el inicio de la asignación hasta las 23:59 del día de cierre (hora Colombia). No hay período de gracia.
          </span>
        </div>
      </aside>
    </>
  );
}
