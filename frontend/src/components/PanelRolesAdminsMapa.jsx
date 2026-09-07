import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { esPilarAdmin } from '../utils/permisos';
import {
  listarPermisosAdminsMapa,
  actualizarPermisoAdminMapa,
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

  // ── Datos de los dos sistemas independientes ──
  const [admins, setAdmins] = useState([]);
  const [loadingMapa, setLoadingMapa] = useState(true);
  const [errorMapa, setErrorMapa] = useState('');
  const [guardandoMapaId, setGuardandoMapaId] = useState(null);

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

  // ── Proceso seleccionado por cada admin en Bloque B (por defecto 'OP') ──
  const [procesoActivoPorAdmin, setProcesoActivoPorAdmin] = useState({});

  // Solo se renderiza si el usuario es PilarAdmin
  if (!isPilar) {
    return null;
  }

  // ── Carga inicial: permisos del mapa SGC ──
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
              'No se pudieron cargar los permisos de administradores.'
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

  // ── Handlers: Bloque A (Mapa SGC) ──
  const handleToggleAcceso = async (admin) => {
    if (admin.es_pilar) return;
    const nuevoAcceso = !admin.acceso_mapa;
    setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, acceso_mapa: nuevoAcceso } : a)));
    setGuardandoMapaId(admin.id);
    try {
      const updated = await actualizarPermisoAdminMapa(admin.id, {
        acceso_mapa: nuevoAcceso,
        rol_mapa: admin.rol_mapa || 'lector',
      });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? updated : a)));
      mostrarFeedback(`Acceso al Mapa SGC ${nuevoAcceso ? 'habilitado' : 'denegado'} para ${admin.nombre}`);
    } catch (err) {
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, acceso_mapa: admin.acceso_mapa } : a)));
      setErrorMapa(err.response?.data?.detail || 'Error al guardar cambios.');
    } finally {
      setGuardandoMapaId(null);
    }
  };

  const handleCambiarRol = async (admin, nuevoRol) => {
    if (admin.es_pilar || admin.rol_mapa === nuevoRol) return;
    setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, rol_mapa: nuevoRol } : a)));
    setGuardandoMapaId(admin.id);
    try {
      const updated = await actualizarPermisoAdminMapa(admin.id, {
        acceso_mapa: admin.acceso_mapa,
        rol_mapa: nuevoRol,
      });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? updated : a)));
      mostrarFeedback(`Rol SGC de ${admin.nombre}: ${nuevoRol === 'editor' ? 'Editor SGC' : 'Lector'}`);
    } catch (err) {
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, rol_mapa: admin.rol_mapa } : a)));
      setErrorMapa(err.response?.data?.detail || 'Error al actualizar rol.');
    } finally {
      setGuardandoMapaId(null);
    }
  };

  // ── Handlers: Bloque B (Accesos por Proceso) ──
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
      setErrorAccesos(err.response?.data?.detail || 'Error al guardar acceso por proceso.');
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

  // ── Métricas Superiores (KPIs) ──
  const totalAdmins = admins.length;
  const autorizadosMapa = admins.filter((a) => a.acceso_mapa || a.es_pilar).length;
  const editoresSGC = admins.filter((a) => (a.acceso_mapa || a.es_pilar) && (a.rol_mapa === 'editor' || a.es_pilar)).length;
  const conAccesosProceso = admins.filter(tieneProcesoAsignado).length;
  const sinAccesosProceso = admins.filter((a) => !tieneProcesoAsignado(a)).length;

  // Criterio combinado para "Sin Acceso"
  const esSinAccesoCombinado = (a) => {
    const tieneMapa = a.acceso_mapa || a.es_pilar;
    const tieneProceso = tieneProcesoAsignado(a);
    return !tieneMapa && !tieneProceso;
  };
  const totalSinAccesoCombinado = admins.filter(esSinAccesoCombinado).length;

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

      if (filtroAcceso === 'con_acceso') return a.acceso_mapa || a.es_pilar;
      if (filtroAcceso === 'editores') return (a.acceso_mapa || a.es_pilar) && (a.rol_mapa === 'editor' || a.es_pilar);
      if (filtroAcceso === 'sin_acceso') return esSinAccesoCombinado(a);
      return true;
    });
  }, [admins, busqueda, filtroAcceso, accesosData]);

  // Manejo del acordeón: solo 1 fila expandida a la vez
  const handleToggleAccordion = (adminId) => {
    setExpandedAdminId((prev) => (prev === adminId ? null : adminId));
  };

  const estaCargando = loadingMapa || loadingAccesos;

  return (
    <section className="sgc-admin-panel-card" aria-label="Control de Acceso y Roles SGC">
      {/* ── ENCABEZADO DESTACADO ── */}
      <div className="sgc-ap-header">
        <div className="sgc-ap-header-left">
          <div className="sgc-ap-badge-exclusive">
            <span className="sgc-ap-badge-crown">👑</span>
            <span>CONTROL EXCLUSIVO · PILAR ARISTIZÁBAL</span>
          </div>
          <h2 className="sgc-ap-title">Gestión Unificada de Administradores &amp; Permisos SGC</h2>
          <p className="sgc-ap-desc">
            Solo tu cuenta (<strong>PilarAdmin@gsbank.com</strong>) tiene el poder
            de autorizar el ingreso al Mapa de Procesos SGC y asignar los accesos operativos por proceso a cada administrador.
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

      {/* ── INDICADORES SUPERIORES (5 TARJETAS KPI) ── */}
      <div className="sgc-ap-kpis">
        <div className="sgc-ap-kpi-box">
          <span className="sgc-ap-kpi-val">{totalAdmins}</span>
          <span className="sgc-ap-kpi-lbl">Total Administradores</span>
        </div>
        <div className="sgc-ap-kpi-box sgc-ap-kpi-box--green">
          <span className="sgc-ap-kpi-val">{autorizadosMapa}</span>
          <span className="sgc-ap-kpi-lbl">Con Acceso al Mapa</span>
        </div>
        <div className="sgc-ap-kpi-box sgc-ap-kpi-box--purple">
          <span className="sgc-ap-kpi-val">{editoresSGC}</span>
          <span className="sgc-ap-kpi-lbl">Editores SGC</span>
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
            { key: 'con_acceso', label: `Con Acceso (${autorizadosMapa})` },
            { key: 'editores', label: `Editores (${editoresSGC})` },
            { key: 'sin_acceso', label: `Sin Acceso (${totalSinAccesoCombinado})` },
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
              <div className="sgc-ap-th sgc-ap-th--summary">Resumen de Permisos</div>
              <div className="sgc-ap-th sgc-ap-th--arrow"></div>
            </div>

            {/* Filas */}
            {adminsFiltrados.map((admin) => {
              const rol = obtenerRolUsuario(admin);
              const isExpanded = expandedAdminId === admin.id;
              const tieneAccesoMapa = admin.acceso_mapa || admin.es_pilar;
              const cantProcesos = contarProcesosAsignados(admin);
              const adminAccesos = accesosData?.administradores?.find((a) => a.id === admin.id)?.accesos || {};

              // Proceso activo en Bloque B para este admin
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

                    {/* 4. Resumen de Permisos */}
                    <div className="sgc-ap-td sgc-ap-td--summary">
                      <div className="sgc-ap-summary-badges">
                        {rol === 'master' ? (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--gold">👑 Acceso Total</span>
                        ) : rol === 'tecnico' ? (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--lector">👁️ Mapa: Lector</span>
                        ) : tieneAccesoMapa ? (
                          admin.rol_mapa === 'editor' ? (
                            <span className="sgc-ap-mini-status sgc-ap-mini-status--editor">✏️ Mapa: Editor</span>
                          ) : (
                            <span className="sgc-ap-mini-status sgc-ap-mini-status--lector">👁️ Mapa: Lector</span>
                          )
                        ) : (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--blocked">✕ Mapa: Bloqueado</span>
                        )}

                        {rol === 'master' ? (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--blue">8/8 Procesos</span>
                        ) : rol === 'tecnico' ? (
                          null
                        ) : cantProcesos > 0 ? (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--blue">{cantProcesos}/8 Procesos</span>
                        ) : (
                          <span className="sgc-ap-mini-status sgc-ap-mini-status--muted">0 Procesos</span>
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

                  {/* ── PANEL EXPANDIDO (BLOQUES A & B) ── */}
                  {isExpanded && (
                    <div
                      className="sgc-ap-accordion-panel"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="sgc-ap-blocks-grid">
                        {/* ════════════════════════════════════════════ */}
                        {/* BLOQUE A: ACCESO AL MAPA SGC */}
                        {/* ════════════════════════════════════════════ */}
                        <div className={`sgc-ap-block sgc-ap-block--mapa ${rol === 'tecnico' ? 'sgc-ap-block--full' : ''}`}>
                          <div className="sgc-ap-block-header">
                            <span className="sgc-ap-block-icon">🗺️</span>
                            <div>
                              <h4 className="sgc-ap-block-title">BLOQUE A · Acceso al Mapa SGC</h4>
                              <p className="sgc-ap-block-desc">
                                {rol === 'master' && 'Titularidad de calidad y visualización y edición total del mapa.'}
                                {rol === 'tecnico' && 'Visualización predeterminada de solo lectura para el personal técnico.'}
                                {rol === 'admin' && 'Autorización de ingreso y rol editorial en la documentación del mapa.'}
                              </p>
                            </div>
                          </div>

                          <div className="sgc-ap-block-content">
                            {rol === 'master' ? (
                              <div className="sgc-ap-role-info-card sgc-ap-role-info-card--gold">
                                <div className="sgc-ap-role-info-badge">🔒 Acceso Total Permanente</div>
                                <div className="sgc-ap-role-info-subtitle">Editora &amp; Propietaria SGC</div>
                                <p className="sgc-ap-role-info-desc">
                                  La administradora titular posee privilegios absolutos para consultar, editar y gestionar la documentación de calidad de todos los procesos.
                                </p>
                              </div>
                            ) : rol === 'tecnico' ? (
                              <div className="sgc-ap-role-info-card sgc-ap-role-info-card--tecnico">
                                <div className="sgc-ap-role-info-badge">👁️ Lector (por defecto)</div>
                                <p className="sgc-ap-role-info-desc">
                                  Los técnicos cuentan con permiso fijo de solo lectura en el Mapa SGC. No disponen de facultades para editar fichas ni documentación.
                                </p>
                              </div>
                            ) : (
                              <div className="sgc-ap-block-controls">
                                {/* Toggle Autorizado/Bloqueado */}
                                <div className="sgc-ap-control-group">
                                  <label className="sgc-ap-control-label">Estado de Acceso al Mapa</label>
                                  <div className="sgc-ap-switch-group">
                                    <label className={`sgc-ap-switch ${tieneAccesoMapa ? 'sgc-ap-switch--on' : ''} ${guardandoMapaId === admin.id ? 'sgc-ap-switch--busy' : ''}`}>
                                      <input
                                        type="checkbox"
                                        checked={!!tieneAccesoMapa}
                                        disabled={guardandoMapaId === admin.id}
                                        onChange={() => handleToggleAcceso(admin)}
                                      />
                                      <span className="sgc-ap-switch-slider" />
                                    </label>
                                    <span className={`sgc-ap-switch-label ${tieneAccesoMapa ? 'sgc-ap-switch-label--on' : 'sgc-ap-switch-label--off'}`}>
                                      {tieneAccesoMapa ? 'Autorizado' : 'Bloqueado'}
                                    </span>
                                  </div>
                                </div>

                                {/* Selector Rol SGC */}
                                <div className="sgc-ap-control-group">
                                  <label className="sgc-ap-control-label">Rol Asignado en SGC</label>
                                  <div className="sgc-ap-role-selector">
                                    <button
                                      type="button"
                                      disabled={!tieneAccesoMapa || guardandoMapaId === admin.id}
                                      className={`sgc-ap-role-btn ${admin.rol_mapa !== 'editor' && tieneAccesoMapa ? 'sgc-ap-role-btn--active' : ''} ${!tieneAccesoMapa ? 'sgc-ap-role-btn--disabled' : ''}`}
                                      onClick={() => handleCambiarRol(admin, 'lector')}
                                      title="Solo visualización del mapa y fichas"
                                    >
                                      👁️ Lector
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!tieneAccesoMapa || guardandoMapaId === admin.id}
                                      className={`sgc-ap-role-btn sgc-ap-role-btn--editor ${admin.rol_mapa === 'editor' && tieneAccesoMapa ? 'sgc-ap-role-btn--active-editor' : ''} ${!tieneAccesoMapa ? 'sgc-ap-role-btn--disabled' : ''}`}
                                      onClick={() => handleCambiarRol(admin, 'editor')}
                                      title="Puede editar fichas y documentación"
                                    >
                                      ✏️ Editor SGC
                                    </button>
                                  </div>
                                </div>

                                {guardandoMapaId === admin.id && (
                                  <div className="sgc-ap-saving-indicator">
                                    <span className="sgc-ap-spinner-mini" />
                                    <span>Guardando cambios en el mapa...</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ════════════════════════════════════════════ */}
                        {/* BLOQUE B: ACCESOS POR PROCESO */}
                        {/* ════════════════════════════════════════════ */}
                        {rol !== 'tecnico' && (
                          <div className="sgc-ap-block sgc-ap-block--procesos">
                            <div className="sgc-ap-block-header">
                              <span className="sgc-ap-block-icon">🔐</span>
                              <div>
                                <h4 className="sgc-ap-block-title">BLOQUE B · Accesos por Proceso</h4>
                                <p className="sgc-ap-block-desc">
                                  Nivel operativo por proceso (GR, MC, CO, CI, OP, SA, AD, SS). Configura varios procesos sin cerrar el panel.
                                </p>
                              </div>
                            </div>

                            <div className="sgc-ap-block-content">
                              {rol === 'master' ? (
                                <div className="sgc-ap-role-info-card sgc-ap-role-info-card--blue">
                                  <div className="sgc-ap-role-info-badge sgc-ap-role-info-badge--blue">🛡️ Acceso Total Permanente</div>
                                  <div className="sgc-ap-role-info-subtitle">Administradora de Sección en todos los procesos</div>
                                  <p className="sgc-ap-role-info-desc">
                                    Pilar administra de forma global todos los módulos operativos (Dirección, Misionales y Apoyo) sin restricciones.
                                  </p>
                                </div>
                              ) : (
                                <>
                                  {/* Selector de Procesos (Píldoras con indicador de nivel) */}
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
                                          <span className="sgc-ap-chip-indicator">
                                            {nivelProc === 'admin' ? '🛡️' : nivelProc === 'lector' ? '👁️' : '·'}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Detalle y Selector de Nivel del Proceso Seleccionado */}
                                  {procesoActivoInfo && (
                                    <div className={`sgc-ap-proc-detail-box ${procesoActivoInfo.moduloActivo ? 'sgc-ap-proc-detail-box--live' : ''}`}>
                                      <div className="sgc-ap-proc-detail-header">
                                        <div className="sgc-ap-proc-detail-left">
                                          <span className="sgc-ap-proc-tag">{procesoActivoInfo.codigo}</span>
                                          <div>
                                            <span className="sgc-ap-proc-name">{procesoActivoInfo.nombre}</span>
                                            {procesoActivoInfo.moduloActivo ? (
                                              <span className="sgc-ap-live-badge">⚡ Módulo activo · {procesoActivoInfo.moduloNombre}</span>
                                            ) : (
                                              <span className="sgc-ap-pending-badge">Módulo en desarrollo</span>
                                            )}
                                          </div>
                                        </div>
                                        <span className={`sgc-ap-proc-current-status sgc-ap-proc-current-status--${nivelActualProceso}`}>
                                          {NIVEL_LABELS[nivelActualProceso]}
                                        </span>
                                      </div>

                                      {/* Botones de Selección de Nivel */}
                                      <div className="sgc-ap-nivel-selector-group">
                                        <span className="sgc-ap-nivel-prompt">Asignar nivel en {procesoActivoInfo.codigo}:</span>
                                        <div className="sgc-ap-nivel-buttons">
                                          {(['ninguno', 'lector', 'admin']).map((nivel) => {
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
                                                {nivel === 'ninguno' && '❌ Sin acceso'}
                                                {nivel === 'lector' && '👁️ Lector de Sección'}
                                                {nivel === 'admin' && '🛡️ Administrador de Sección'}
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
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CUADRO INFORMATIVO ÚNICO: EXPLICACIÓN DE LOS 5 NIVELES ── */}
      <div className="sgc-ap-unified-info-card">
        <div className="sgc-ap-unified-info-header">
          <span className="sgc-ap-unified-info-icon">ℹ️</span>
          <div>
            <h4 className="sgc-ap-unified-info-title">Guía de Privilegios y Niveles de Acceso</h4>
            <p className="sgc-ap-unified-info-desc">
              El sistema combina dos dimensiones de permisos independientes: el acceso a la documentación del <strong>Mapa SGC</strong> y el nivel operativo por <strong>Proceso</strong>.
            </p>
          </div>
        </div>

        <div className="sgc-ap-unified-levels-grid">
          {/* Nivel 1 */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--lector-sgc">👁️ Lector SGC</div>
            <p className="sgc-ap-level-text">
              <strong>Mapa SGC:</strong> Puede navegar el mapa de calidad, consultar la caracterización de procesos y visualizar los documentos vigentes (modo lectura).
            </p>
          </div>

          {/* Nivel 2 */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--editor-sgc">✏️ Editor SGC</div>
            <p className="sgc-ap-level-text">
              <strong>Mapa SGC:</strong> Puede modificar fichas, asignar responsables operativos y subir, clasificar, actualizar o eliminar documentación del SGC.
            </p>
          </div>

          {/* Nivel 3 */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--admin-sec">🛡️ Administrador de Sección</div>
            <p className="sgc-ap-level-text">
              <strong>Módulo por Proceso:</strong> Control operativo total sobre el módulo (ej. Viáticos en Operaciones). Puede crear, editar, eliminar y gestionar tarjetas internas.
            </p>
          </div>

          {/* Nivel 4 */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--lector-sec">👁️ Lector de Sección</div>
            <p className="sgc-ap-level-text">
              <strong>Módulo por Proceso:</strong> Permite ingresar y visualizar la pantalla general (KPIs, listados), sin permisos de edición ni gestión operativa interna.
            </p>
          </div>

          {/* Nivel 5 */}
          <div className="sgc-ap-level-item">
            <div className="sgc-ap-level-badge sgc-ap-level-badge--sin-acceso">❌ Sin Acceso</div>
            <p className="sgc-ap-level-text">
              <strong>Módulo por Proceso:</strong> El módulo operativo aparece bloqueado. El usuario no puede ingresar y debe solicitar autorización a Pilar.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
