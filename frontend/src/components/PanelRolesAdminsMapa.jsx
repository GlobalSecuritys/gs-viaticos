import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { esPilarAdmin } from '../utils/permisos';
import {
  listarPermisosAdminsMapa,
  listarAccesosProcesos,
  actualizarAccesoProceso,
} from '../services/calidadProcesos';
import './PanelRolesAdminsMapa.css';

// ──────────────────────────────────────────────────────────────────────────────
// Definición de procesos del mapa SGC (Dirección, Misionales, Apoyo)
// ──────────────────────────────────────────────────────────────────────────────
const GRUPOS_PROCESOS = [
  {
    grupo: 'PROCESOS DE DIRECCIÓN',
    icono: '🎯',
    procesos: [
      { codigo: 'GR', nombre: 'Gerencia' },
      { codigo: 'MC', nombre: 'Mejora Continua' },
    ],
  },
  {
    grupo: 'PROCESOS MISIONALES',
    icono: '⚙️',
    procesos: [
      { codigo: 'CO', nombre: 'Comercial' },
      { codigo: 'CI', nombre: 'Compras e Inventario' },
      { codigo: 'OP', nombre: 'Operaciones', moduloActivo: true, moduloNombre: 'Viáticos' },
    ],
  },
  {
    grupo: 'PROCESOS DE APOYO',
    icono: '🤝',
    procesos: [
      { codigo: 'SA', nombre: 'Ambiental' },
      { codigo: 'AD', nombre: 'Administrativo' },
      { codigo: 'SS', nombre: 'SG - SST' },
    ],
  },
];

const TODOS_PROCESOS = GRUPOS_PROCESOS.flatMap((g) => g.procesos);

const NIVEL_LABELS = {
  ninguno: '❌ Sin acceso',
  lector: '👁️ Lector de Sección',
  admin: '🛡️ Administrador de Sección',
};

// Obtiene iniciales para el avatar
function getInitials(nombre) {
  if (!nombre) return 'AD';
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Determina el rol del usuario para las reglas de presentación
function obtenerRolUsuario(admin) {
  if (admin.es_pilar || (admin.correo && admin.correo.trim().toLowerCase() === 'pilaradmin@gsbank.com')) {
    return 'master';
  }
  if (admin.rol === 'tecnico') {
    return 'tecnico';
  }
  return 'admin';
}

// ──────────────────────────────────────────────────────────────────────────────
export default function PanelRolesAdminsMapa() {
  const { user } = useAuth();
  const isPilar = esPilarAdmin(user);

  // ── Datos cargados ──
  const [admins, setAdmins] = useState([]);
  const [loadingMapa, setLoadingMapa] = useState(true);
  const [errorMapa, setErrorMapa] = useState('');

  const [accesosData, setAccesosData] = useState(null); // { procesos, administradores }
  const [loadingAccesos, setLoadingAccesos] = useState(true);
  const [errorAccesos, setErrorAccesos] = useState('');
  const [guardandoAccesoKey, setGuardandoAccesoKey] = useState(null); // `${userId}_${codigo}`

  // ── Filtros y búsqueda ──
  const [busqueda, setBusqueda] = useState('');
  const [filtroAcceso, setFiltroAcceso] = useState('todos');
  const [mensajeExito, setMensajeExito] = useState('');

  // ── Acordeón: solo 1 fila expandida a la vez ──
  const [expandedAdminId, setExpandedAdminId] = useState(null);

  // ── Proceso seleccionado por cada admin en Accesos por Proceso (por defecto 'OP') ──
  const [procesoActivoPorAdmin, setProcesoActivoPorAdmin] = useState({});

  // Solo se renderiza si el usuario es PilarAdmin
  if (!isPilar) {
    return null;
  }

  // ── Carga inicial: administradores ──
  useEffect(() => {
    let activo = true;
    async function cargarAdmins() {
      try {
        setLoadingMapa(true);
        setErrorMapa('');
        const data = await listarPermisosAdminsMapa();
        if (activo) setAdmins(data || []);
      } catch (err) {
        if (activo) {
          setErrorMapa(
            err.response?.data?.detail ||
              'No se pudieron cargar los administradores.'
          );
        }
      } finally {
        if (activo) setLoadingMapa(false);
      }
    }
    cargarAdmins();
    return () => { activo = false; };
  }, []);

  // ── Carga inicial: accesos por proceso ──
  useEffect(() => {
    let activo = true;
    async function cargarAccesos() {
      try {
        setLoadingAccesos(true);
        setErrorAccesos('');
        const data = await listarAccesosProcesos();
        if (activo) setAccesosData(data || null);
      } catch (err) {
        if (activo) {
          setErrorAccesos(
            err.response?.data?.detail ||
              'No se pudieron cargar los accesos por proceso.'
          );
        }
      } finally {
        if (activo) setLoadingAccesos(false);
      }
    }
    cargarAccesos();
    return () => { activo = false; };
  }, []);

  // ── Feedback toast ──
  const mostrarFeedback = (msg) => {
    setMensajeExito(msg);
    setTimeout(() => setMensajeExito(''), 4000);
  };

  // ── Handlers: Accesos por Proceso ──
  const handleCambiarAccesoProceso = async (adminId, procesoCodigo, nuevoNivel) => {
    const key = `${adminId}_${procesoCodigo}`;
    // Actualización optimista en el estado
    setAccesosData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        administradores: prev.administradores.map((a) =>
          a.id === adminId
            ? { ...a, accesos: { ...a.accesos, [procesoCodigo]: nuevoNivel } }
            : a
        ),
      };
    });
    setGuardandoAccesoKey(key);
    try {
      const updated = await actualizarAccesoProceso(adminId, procesoCodigo, nuevoNivel);
      setAccesosData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          administradores: prev.administradores.map((a) =>
            a.id === adminId ? { ...a, accesos: updated.accesos || a.accesos } : a
          ),
        };
      });
      const adminNombre = admins.find((a) => a.id === adminId)?.nombre || '';
      const nivelLabel = NIVEL_LABELS[nuevoNivel] || nuevoNivel;
      mostrarFeedback(`✓ ${adminNombre} → ${nivelLabel} en proceso ${procesoCodigo}`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const errorMsg =
        (typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg || d.message).join(', ')
            : err.message) || 'Error al guardar acceso por proceso.';
      setErrorAccesos(errorMsg);
      // Revertir recargando los datos reales del backend
      try {
        const fresh = await listarAccesosProcesos();
        if (fresh) setAccesosData(fresh);
      } catch {
        // Silenciar si falla reload
      }
    } finally {
      setGuardandoAccesoKey(null);
    }
  };

  const handleSeleccionarProcesoAdmin = (adminId, procesoCodigo) => {
    setProcesoActivoPorAdmin((prev) => ({
      ...prev,
      [adminId]: procesoCodigo,
    }));
  };

  // ── Helpers de cálculo de procesos ──
  const tieneProcesoAsignado = (admin) => {
    if (admin.es_pilar) return true;
    const adminAcc = accesosData?.administradores?.find((acc) => acc.id === admin.id);
    if (!adminAcc || !adminAcc.accesos) return false;
    return Object.values(adminAcc.accesos).some((lvl) => lvl === 'admin' || lvl === 'lector');
  };

  const contarProcesosAsignados = (admin) => {
    if (admin.es_pilar) return TODOS_PROCESOS.length;
    const adminAcc = accesosData?.administradores?.find((acc) => acc.id === admin.id);
    if (!adminAcc || !adminAcc.accesos) return 0;
    return Object.values(adminAcc.accesos).filter((lvl) => lvl === 'admin' || lvl === 'lector').length;
  };

  // ── Métricas Superiores (3 Tarjetas KPI solicitadas) ──
  const totalAdmins = admins.length;
  const conAccesosProceso = admins.filter(tieneProcesoAsignado).length;
  const sinAccesosProceso = admins.filter((a) => !tieneProcesoAsignado(a)).length;

  // ── Filtrado y Búsqueda ──
  const adminsFiltrados = useMemo(() => {
    return admins.filter((a) => {
      const q = busqueda.trim().toLowerCase();
      const match =
        !q ||
        (a.nombre && a.nombre.toLowerCase().includes(q)) ||
        (a.correo && a.correo.toLowerCase().includes(q)) ||
        (a.codigo_empleado && a.codigo_empleado.toLowerCase().includes(q));
      if (!match) return false;

      if (filtroAcceso === 'con_accesos') return tieneProcesoAsignado(a);
      if (filtroAcceso === 'sin_accesos') return !tieneProcesoAsignado(a);
      return true;
    });
  }, [admins, busqueda, filtroAcceso, accesosData]);

  // Manejo del acordeón: solo 1 fila expandida a la vez
  const handleToggleAccordion = (adminId) => {
    setExpandedAdminId((prev) => (prev === adminId ? null : adminId));
  };

  const estaCargando = loadingMapa || loadingAccesos;

  return (
    <section className="sgc-admin-panel-card" aria-label="Control de Accesos Operativos por Proceso">
      {/* ── ENCABEZADO DESTACADO ── */}
      <div className="sgc-ap-header">
        <div className="sgc-ap-header-left">
          <div className="sgc-ap-badge-exclusive">
            <span className="sgc-ap-badge-crown">👑</span>
            <span>CONTROL EXCLUSIVO · PILAR ARISTIZÁBAL</span>
          </div>
          <h2 className="sgc-ap-title">Gestión de Administradores &amp; Accesos por Proceso</h2>
          <p className="sgc-ap-desc">
            El acceso de lectura al Mapa SGC es automático y permanente para todos los colaboradores. Solo tu cuenta (<strong>PilarAdmin@gsbank.com</strong>) tiene el poder
            exclusivo de configurar y asignar los accesos operativos por proceso a cada administrador.
          </p>
        </div>
        <div className="sgc-ap-header-avatar">
          <div className="sgc-ap-avatar-halo">
            <span className="sgc-ap-avatar-text">PA</span>
          </div>
          <div className="sgc-ap-avatar-meta">
            <span className="sgc-ap-avatar-name">Pilar Aristizábal</span>
            <span className="sgc-ap-avatar-role">Administradora Master SGC</span>
          </div>
        </div>
      </div>

      {/* ── TOASTS DE FEEDBACK ── */}
      {mensajeExito && (
        <div className="sgc-ap-toast sgc-ap-toast--success" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{mensajeExito}</span>
        </div>
      )}
      {(errorMapa || errorAccesos) && (
        <div className="sgc-ap-toast sgc-ap-toast--error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMapa || errorAccesos}</span>
          <button
            type="button"
            className="sgc-ap-toast-close"
            onClick={() => { setErrorMapa(''); setErrorAccesos(''); }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── INDICADORES SUPERIORES (3 TARJETAS KPI SOLICITADAS) ── */}
      <div className="sgc-ap-kpis">
        <div className="sgc-ap-kpi-box">
          <span className="sgc-ap-kpi-val">{totalAdmins}</span>
          <span className="sgc-ap-kpi-lbl">Total Administradores</span>
        </div>
        <div className="sgc-ap-kpi-box sgc-ap-kpi-box--blue">
          <span className="sgc-ap-kpi-val">{conAccesosProceso}</span>
          <span className="sgc-ap-kpi-lbl">Con Accesos por Proceso Asignados</span>
        </div>
        <div className="sgc-ap-kpi-box sgc-ap-kpi-box--amber">
          <span className="sgc-ap-kpi-val">{sinAccesosProceso}</span>
          <span className="sgc-ap-kpi-lbl">Sin Accesos por Proceso</span>
        </div>
      </div>

      {/* ── TOOLBAR: BUSCADOR & FILTROS RÁPIDOS ── */}
      <div className="sgc-ap-toolbar">
        <div className="sgc-ap-search-wrap">
          <svg className="sgc-ap-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="sgc-ap-search-input"
            placeholder="Buscar por nombre, correo o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda && (
            <button
              type="button"
              className="sgc-ap-search-clear"
              onClick={() => setBusqueda('')}
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        <div className="sgc-ap-filter-pills">
          {[
            { key: 'todos', label: `Todos (${totalAdmins})` },
            { key: 'con_accesos', label: `Con Accesos (${conAccesosProceso})` },
            { key: 'sin_accesos', label: `Sin Accesos (${sinAccesosProceso})` },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              className={`sgc-ap-pill ${filtroAcceso === f.key ? 'sgc-ap-pill--active' : ''}`}
              onClick={() => setFiltroAcceso(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABLA ÚNICA DE ADMINISTRADORES (ACORDEÓN) ── */}
      <div className="sgc-ap-table-wrapper">
        {estaCargando ? (
          <div className="sgc-ap-loading">
            <div className="sgc-ap-spinner" />
            <span>Cargando administradores y accesos...</span>
          </div>
        ) : adminsFiltrados.length === 0 ? (
          <div className="sgc-ap-empty">
            <p>No se encontraron administradores con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="sgc-ap-accordion-list">
            {/* Cabecera de la tabla */}
            <div className="sgc-ap-table-head">
              <div className="sgc-ap-th sgc-ap-th--admin">Administrador</div>
              <div className="sgc-ap-th sgc-ap-th--email">Correo Electrónico</div>
              <div className="sgc-ap-th sgc-ap-th--code">Código</div>
              <div className="sgc-ap-th sgc-ap-th--summary">Accesos por Proceso</div>
              <div className="sgc-ap-th sgc-ap-th--arrow"></div>
            </div>

            {/* Filas */}
            {adminsFiltrados.map((admin) => {
              const rol = obtenerRolUsuario(admin);
              const isExpanded = expandedAdminId === admin.id;
              const cantProcesos = contarProcesosAsignados(admin);
              const adminAccesos = accesosData?.administradores?.find((a) => a.id === admin.id)?.accesos || {};

              // Proceso activo para este admin
              const procActivoCodigo = procesoActivoPorAdmin[admin.id] || 'OP';
              const procesoActivoInfo = TODOS_PROCESOS.find((p) => p.codigo === procActivoCodigo);
              const nivelActualProceso = adminAccesos[procActivoCodigo] || 'ninguno';

              return (
                <div
                  key={admin.id}
                  className={`sgc-ap-accordion-item ${isExpanded ? 'sgc-ap-accordion-item--expanded' : ''} ${admin.es_pilar ? 'sgc-ap-accordion-item--pilar' : ''}`}
                >
                  {/* Fila colapsada */}
                  <div
                    className="sgc-ap-row-collapsed"
                    onClick={() => handleToggleAccordion(admin.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleAccordion(admin.id);
                      }
                    }}
                  >
                    {/* 1. Avatar, Nombre y Badge de Rol */}
                    <div className="sgc-ap-td sgc-ap-td--admin">
                      <div className={`sgc-ap-avatar-mini ${rol === 'master' ? 'sgc-ap-avatar-mini--pilar' : rol === 'tecnico' ? 'sgc-ap-avatar-mini--tecnico' : ''}`}>
                        {getInitials(admin.nombre)}
                      </div>
                      <div className="sgc-ap-admin-text">
                        <div className="sgc-ap-admin-name-row">
                          <span className="sgc-ap-admin-name">{admin.nombre}</span>
                          {rol === 'master' && (
                            <span className="sgc-ap-badge-master">👑 Master</span>
                          )}
                          {rol === 'admin' && (
                            <span className="sgc-ap-badge-sysrole">🛡️ Administrador</span>
                          )}
                          {rol === 'tecnico' && (
                            <span className="sgc-ap-badge-tecnico">🔧 Técnico</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 2. Correo */}
                    <div className="sgc-ap-td sgc-ap-td--email">
                      <span className="sgc-ap-admin-email">{admin.correo}</span>
                    </div>

                    {/* 3. Código */}
                    <div className="sgc-ap-td sgc-ap-td--code">
                      {admin.codigo_empleado ? (
                        <span className="sgc-ap-admin-code-badge">{admin.codigo_empleado}</span>
                      ) : (
                        <span className="sgc-ap-admin-code-none">—</span>
                      )}
                    </div>

                    {/* 4. Resumen de Permisos por Proceso */}
                    <div className="sgc-ap-td sgc-ap-td--summary">
                      <div className="sgc-ap-summary-badges">
                        {rol === 'master' ? (
                          <>
                            <span className="sgc-ap-mini-status sgc-ap-mini-status--gold">👑 Acceso Total</span>
                            <span className="sgc-ap-mini-status sgc-ap-mini-status--blue">8/8 Procesos</span>
                          </>
                        ) : rol === 'tecnico' ? (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--tecnico">👁️ Lectura Mapa (automático)</span>
                        ) : cantProcesos > 0 ? (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--blue">{cantProcesos}/8 Procesos Asignados</span>
                        ) : (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--muted">Sin Accesos Asignados</span>
                        )}
                      </div>
                    </div>

                    {/* 5. Flecha para expandir */}
                    <div className="sgc-ap-td sgc-ap-td--arrow">
                      <div className={`sgc-ap-expand-circle ${isExpanded ? 'sgc-ap-expand-circle--open' : ''}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* ── PANEL EXPANDIDO (ÚNICAMENTE ACCESOS POR PROCESO A ANCHO COMPLETO) ── */}
                  {isExpanded && (
                    <div
                      className="sgc-ap-accordion-panel"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Caso 1: Técnico (Sin panel de procesos, tarjeta informativa de lectura automática) */}
                      {rol === 'tecnico' ? (
                        <div className="sgc-ap-role-info-card sgc-ap-role-info-card--tecnico sgc-ap-role-info-card--fullwidth">
                          <div className="sgc-ap-role-info-badge">👁️ Acceso de solo lectura al mapa (automático)</div>
                          <p className="sgc-ap-role-info-desc">
                            El personal técnico cuenta con acceso permanente y automático de solo lectura para consultar el Mapa de Procesos SGC y su documentación. Los módulos y accesos operativos por proceso son exclusivos para Administradores y Master.
                          </p>
                        </div>
                      ) : rol === 'master' ? (
                        /* Caso 2: Master / Pilar (Privilegios totales informativos) */
                        <div className="sgc-ap-role-info-card sgc-ap-role-info-card--gold sgc-ap-role-info-card--fullwidth">
                          <div className="sgc-ap-role-info-badge">👑 Acceso Total Permanente</div>
                          <div className="sgc-ap-role-info-subtitle">Administradora de Sección en todos los procesos</div>
                          <p className="sgc-ap-role-info-desc">
                            Pilar administra de forma global todos los módulos operativos (Dirección, Misionales y Apoyo) sin restricciones.
                          </p>
                        </div>
                      ) : (
                        /* Caso 3: Administrador (Bloque B a ancho completo) */
                        <div className="sgc-ap-block sgc-ap-block--procesos sgc-ap-block--fullwidth">
                          <div className="sgc-ap-block-header">
                            <span className="sgc-ap-block-icon">🔐</span>
                            <div>
                              <h4 className="sgc-ap-block-title">Accesos por Proceso</h4>
                              <p className="sgc-ap-block-desc">
                                Nivel operativo por proceso (GR, MC, CO, CI, OP, SA, AD, SS). Configura varios procesos sin cerrar el panel.
                              </p>
                            </div>
                          </div>

                          <div className="sgc-ap-block-content">
                            {/* 1. Tabs de proceso en una sola fila superior */}
                            <div className="sgc-ap-proc-pills-row">
                              {TODOS_PROCESOS.map((proc) => {
                                const nivelProc = adminAccesos[proc.codigo] || 'ninguno';
                                const isSelected = procActivoCodigo === proc.codigo;
                                return (
                                  <button
                                    key={proc.codigo}
                                    type="button"
                                    className={`sgc-ap-proc-chip ${isSelected ? 'sgc-ap-proc-chip--selected' : ''} sgc-ap-proc-chip--${nivelProc} ${proc.moduloActivo ? 'sgc-ap-proc-chip--live' : ''}`}
                                    onClick={() => handleSeleccionarProcesoAdmin(admin.id, proc.codigo)}
                                    title={`${proc.codigo}: ${proc.nombre} (${NIVEL_LABELS[nivelProc] || nivelProc})`}
                                  >
                                    <span className="sgc-ap-chip-code">{proc.codigo}</span>
                                    <span className="sgc-ap-chip-name">{proc.nombre}</span>
                                    <span className="sgc-ap-chip-indicator">
                                      {nivelProc === 'admin' ? '🛡️' : nivelProc === 'lector' ? '👁️' : '·'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* 2. Tarjeta del proceso seleccionado a todo el ancho */}
                            {procesoActivoInfo && (
                              <div className={`sgc-ap-proc-detail-box ${procesoActivoInfo.moduloActivo ? 'sgc-ap-proc-detail-box--live' : ''}`}>
                                <div className="sgc-ap-proc-detail-header">
                                  <div className="sgc-ap-proc-detail-left">
                                    <span className="sgc-ap-proc-tag">{procesoActivoInfo.codigo}</span>
                                    <div className="sgc-ap-proc-meta">
                                      <span className="sgc-ap-proc-name">{procesoActivoInfo.nombre}</span>
                                      {procesoActivoInfo.moduloActivo ? (
                                        <span className="sgc-ap-live-badge">⚡ Módulo activo · {procesoActivoInfo.moduloNombre}</span>
                                      ) : (
                                        <span className="sgc-ap-pending-badge">⏳ Módulo aún no disponible</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="sgc-ap-proc-detail-right">
                                    <span className="sgc-ap-proc-status-lbl">Nivel actual:</span>
                                    <span className={`sgc-ap-proc-current-status sgc-ap-proc-current-status--${nivelActualProceso}`}>
                                      {NIVEL_LABELS[nivelActualProceso]}
                                    </span>
                                  </div>
                                </div>

                                {/* 3. Botones de nivel más grandes y con más espaciado a todo el ancho */}
                                <div className="sgc-ap-nivel-selector-group">
                                  <span className="sgc-ap-nivel-prompt">Asignar nivel operativo en {procesoActivoInfo.codigo} ({procesoActivoInfo.nombre}):</span>
                                  <div className="sgc-ap-nivel-buttons">
                                    {[
                                      {
                                        nivel: 'ninguno',
                                        icon: '❌',
                                        label: 'Sin acceso',
                                        desc: 'Módulo bloqueado para este administrador',
                                      },
                                      {
                                        nivel: 'lector',
                                        icon: '👁️',
                                        label: 'Lector de Sección',
                                        desc: 'Solo consulta y visualización de la pantalla general',
                                      },
                                      {
                                        nivel: 'admin',
                                        icon: '🛡️',
                                        label: 'Administrador de Sección',
                                        desc: 'Control operativo y gestión total del módulo',
                                      },
                                    ].map(({ nivel, icon, label, desc }) => {
                                      const isCurrent = nivelActualProceso === nivel;
                                      const isSaving = guardandoAccesoKey === `${admin.id}_${procesoActivoInfo.codigo}`;
                                      return (
                                        <button
                                          key={nivel}
                                          type="button"
                                          disabled={isSaving}
                                          className={`sgc-ap-nivel-opt-btn sgc-ap-nivel-opt-btn--${nivel} ${isCurrent ? 'sgc-ap-nivel-opt-btn--active' : ''}`}
                                          onClick={() => {
                                            if (nivelActualProceso !== nivel) {
                                              handleCambiarAccesoProceso(admin.id, procesoActivoInfo.codigo, nivel);
                                            }
                                          }}
                                        >
                                          <div className="sgc-ap-nivel-btn-top">
                                            <span className="sgc-ap-nivel-btn-icon">{icon}</span>
                                            <span className="sgc-ap-nivel-btn-title">{label}</span>
                                            {isCurrent && <span className="sgc-ap-nivel-btn-check">✓ Activo</span>}
                                          </div>
                                          <span className="sgc-ap-nivel-btn-desc">{desc}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {guardandoAccesoKey === `${admin.id}_${procesoActivoInfo.codigo}` && (
                                  <div className="sgc-ap-saving-indicator">
                                    <span className="sgc-ap-spinner-mini" />
                                    <span>Guardando nivel en {procesoActivoInfo.codigo}...</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CUADRO INFORMATIVO FINAL: GUÍA DE LOS 3 NIVELES DE ACCESOS POR PROCESO ── */}
      <div className="sgc-ap-unified-info-card">
        <div className="sgc-ap-unified-info-header">
          <span className="sgc-ap-unified-info-icon">ℹ️</span>
          <div>
            <h4 className="sgc-ap-unified-info-title">Guía de Niveles de Acceso por Proceso</h4>
            <p className="sgc-ap-unified-info-desc">
              Todos los administradores cuentan con acceso permanente al Mapa SGC. Los siguientes 3 niveles definen los permisos operativos dentro de cada proceso o módulo del sistema:
            </p>
          </div>
        </div>

        <div className="sgc-ap-unified-levels-grid">
          {/* Nivel 1: Sin Acceso */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--sin-acceso">❌ Sin Acceso</div>
            <p className="sgc-ap-level-text">
              <strong>Módulo por Proceso:</strong> El módulo operativo del proceso aparece bloqueado. El usuario no puede ingresar a la sección y debe solicitar autorización a Pilar.
            </p>
          </div>

          {/* Nivel 2: Lector de Sección */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--lector-sec">👁️ Lector de Sección</div>
            <p className="sgc-ap-level-text">
              <strong>Módulo por Proceso:</strong> Permite ingresar y visualizar la pantalla general del módulo (KPIs, listados resumen), sin permisos de edición ni manipulación operativa interna.
            </p>
          </div>

          {/* Nivel 3: Administrador de Sección */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--admin-sec">🛡️ Administrador de Sección</div>
            <p className="sgc-ap-level-text">
              <strong>Módulo por Proceso:</strong> Control operativo total sobre el módulo (ej. Viáticos en Operaciones). Puede crear, editar, eliminar y gestionar registros y tarjetas internas.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
