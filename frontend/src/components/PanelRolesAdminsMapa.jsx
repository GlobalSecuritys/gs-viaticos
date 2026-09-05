import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { esPilarAdmin } from '../utils/permisos';
import { listarPermisosAdminsMapa, actualizarPermisoAdminMapa } from '../services/calidadProcesos';
import './PanelRolesAdminsMapa.css';

export default function PanelRolesAdminsMapa() {
  const { user } = useAuth();
  const isPilar = esPilarAdmin(user);

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroAcceso, setFiltroAcceso] = useState('todos'); // todos, con_acceso, sin_acceso
  const [guardandoId, setGuardandoId] = useState(null);
  const [mensajeExito, setMensajeExito] = useState('');

  // Solo se renderiza si el usuario es PilarAdmin
  if (!isPilar) {
    return null;
  }

  useEffect(() => {
    let activo = true;
    async function cargarAdmins() {
      try {
        setLoading(true);
        setError('');
        const data = await listarPermisosAdminsMapa();
        if (activo) {
          setAdmins(data || []);
        }
      } catch (err) {
        if (activo) {
          setError(
            err.response?.data?.detail ||
              'No se pudieron cargar los permisos de administradores. Verifica tu conexión.'
          );
        }
      } finally {
        if (activo) setLoading(false);
      }
    }
    cargarAdmins();
    return () => {
      activo = false;
    };
  }, []);

  // Manejar cambio de acceso (Switch ON/OFF)
  const handleToggleAcceso = async (admin) => {
    if (admin.es_pilar) return; // Inmutable para Pilar
    const nuevoAcceso = !admin.acceso_mapa;
    const nuevoRol = admin.rol_mapa || 'lector';

    // Optimistic update
    setAdmins((prev) =>
      prev.map((a) => (a.id === admin.id ? { ...a, acceso_mapa: nuevoAcceso } : a))
    );
    setGuardandoId(admin.id);

    try {
      const updated = await actualizarPermisoAdminMapa(admin.id, {
        acceso_mapa: nuevoAcceso,
        rol_mapa: nuevoRol,
      });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? updated : a)));
      mostrarFeedback(
        `Acceso ${nuevoAcceso ? 'habilitado' : 'denegado'} para ${admin.nombre}`
      );
    } catch (err) {
      // Revertir en caso de error
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, acceso_mapa: admin.acceso_mapa } : a))
      );
      setError(
        err.response?.data?.detail || 'Error al guardar cambios. Intente de nuevo.'
      );
    } finally {
      setGuardandoId(null);
    }
  };

  // Manejar cambio de rol SGC (Lector / Editor)
  const handleCambiarRol = async (admin, nuevoRol) => {
    if (admin.es_pilar) return;
    if (admin.rol_mapa === nuevoRol) return;

    // Optimistic update
    setAdmins((prev) =>
      prev.map((a) => (a.id === admin.id ? { ...a, rol_mapa: nuevoRol } : a))
    );
    setGuardandoId(admin.id);

    try {
      const updated = await actualizarPermisoAdminMapa(admin.id, {
        acceso_mapa: admin.acceso_mapa,
        rol_mapa: nuevoRol,
      });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? updated : a)));
      mostrarFeedback(
        `Rol de ${admin.nombre} actualizado a: ${
          nuevoRol === 'editor' ? 'Editor SGC' : 'Lector'
        }`
      );
    } catch (err) {
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, rol_mapa: admin.rol_mapa } : a))
      );
      setError(
        err.response?.data?.detail || 'Error al actualizar rol. Intente de nuevo.'
      );
    } finally {
      setGuardandoId(null);
    }
  };

  const mostrarFeedback = (msg) => {
    setMensajeExito(msg);
    setTimeout(() => {
      setMensajeExito('');
    }, 4000);
  };

  // Métricas
  const totalAdmins = admins.length;
  const autorizados = admins.filter((a) => a.acceso_mapa || a.es_pilar).length;
  const editores = admins.filter(
    (a) => (a.acceso_mapa || a.es_pilar) && a.rol_mapa === 'editor'
  ).length;
  const bloqueados = admins.filter((a) => !a.acceso_mapa && !a.es_pilar).length;

  // Filtrado
  const adminsFiltrados = useMemo(() => {
    return admins.filter((a) => {
      const q = busqueda.trim().toLowerCase();
      const matchBusqueda =
        !q ||
        (a.nombre && a.nombre.toLowerCase().includes(q)) ||
        (a.correo && a.correo.toLowerCase().includes(q)) ||
        (a.codigo_empleado && a.codigo_empleado.toLowerCase().includes(q));

      if (!matchBusqueda) return false;

      const tieneAcceso = a.acceso_mapa || a.es_pilar;
      if (filtroAcceso === 'con_acceso') return tieneAcceso;
      if (filtroAcceso === 'sin_acceso') return !tieneAcceso;
      if (filtroAcceso === 'editores') return tieneAcceso && a.rol_mapa === 'editor';
      if (filtroAcceso === 'lectores') return tieneAcceso && a.rol_mapa === 'lector';

      return true;
    });
  }, [admins, busqueda, filtroAcceso]);

  return (
    <section className="sgc-admin-panel-card" aria-label="Control de Acceso al Mapa SGC">
      {/* ── ENCABEZADO DESTACADO ── */}
      <div className="sgc-ap-header">
        <div className="sgc-ap-header-left">
          <div className="sgc-ap-badge-exclusive">
            <span className="sgc-ap-badge-crown">👑</span>
            <span>CONTROL EXCLUSIVO · PILAR ARISTIZÁBAL</span>
          </div>
          <h2 className="sgc-ap-title">Definición de Roles & Acceso al Mapa SGC</h2>
          <p className="sgc-ap-desc">
            Solo tu cuenta (<strong>PilarAdmin@gsbank.com</strong>) tiene el poder
            de autorizar el ingreso al mapa y definir los privilegios de cada
            administrador en la organización.
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

      {/* ── ALERTA DE ÉXITO O ERROR ── */}
      {mensajeExito && (
        <div className="sgc-ap-toast sgc-ap-toast--success" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{mensajeExito}</span>
        </div>
      )}

      {error && (
        <div className="sgc-ap-toast sgc-ap-toast--error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
          <button type="button" className="sgc-ap-toast-close" onClick={() => setError('')}>
            ✕
          </button>
        </div>
      )}

      {/* ── KPI STATS STRIP ── */}
      <div className="sgc-ap-kpis">
        <div className="sgc-ap-kpi-box">
          <span className="sgc-ap-kpi-val">{totalAdmins}</span>
          <span className="sgc-ap-kpi-lbl">Total Administradores</span>
        </div>
        <div className="sgc-ap-kpi-box sgc-ap-kpi-box--green">
          <span className="sgc-ap-kpi-val">{autorizados}</span>
          <span className="sgc-ap-kpi-lbl">Con Acceso al Mapa</span>
        </div>
        <div className="sgc-ap-kpi-box sgc-ap-kpi-box--purple">
          <span className="sgc-ap-kpi-val">{editores}</span>
          <span className="sgc-ap-kpi-lbl">Editores SGC</span>
        </div>
        <div className="sgc-ap-kpi-box sgc-ap-kpi-box--red">
          <span className="sgc-ap-kpi-val">{bloqueados}</span>
          <span className="sgc-ap-kpi-lbl">Sin Acceso / Bloqueados</span>
        </div>
      </div>

      {/* ── BARRA DE BÚSQUEDA Y FILTROS ── */}
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
          <button
            type="button"
            className={`sgc-ap-pill ${filtroAcceso === 'todos' ? 'sgc-ap-pill--active' : ''}`}
            onClick={() => setFiltroAcceso('todos')}
          >
            Todos ({totalAdmins})
          </button>
          <button
            type="button"
            className={`sgc-ap-pill ${filtroAcceso === 'con_acceso' ? 'sgc-ap-pill--active' : ''}`}
            onClick={() => setFiltroAcceso('con_acceso')}
          >
            Con Acceso ({autorizados})
          </button>
          <button
            type="button"
            className={`sgc-ap-pill ${filtroAcceso === 'editores' ? 'sgc-ap-pill--active' : ''}`}
            onClick={() => setFiltroAcceso('editores')}
          >
            Editores ({editores})
          </button>
          <button
            type="button"
            className={`sgc-ap-pill ${filtroAcceso === 'sin_acceso' ? 'sgc-ap-pill--active' : ''}`}
            onClick={() => setFiltroAcceso('sin_acceso')}
          >
            Sin Acceso ({bloqueados})
          </button>
        </div>
      </div>

      {/* ── TABLA DE ADMINISTRADORES ── */}
      <div className="sgc-ap-table-wrapper">
        {loading ? (
          <div className="sgc-ap-loading">
            <div className="sgc-ap-spinner" />
            <span>Cargando administradores y roles...</span>
          </div>
        ) : adminsFiltrados.length === 0 ? (
          <div className="sgc-ap-empty">
            <p>No se encontraron administradores con los filtros seleccionados.</p>
          </div>
        ) : (
          <table className="sgc-ap-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Administrador</th>
                <th style={{ width: '20%' }}>Acceso al Mapa</th>
                <th style={{ width: '28%' }}>Rol Asignado en el SGC</th>
                <th style={{ width: '20%', textAlign: 'right' }}>Estado de Permiso</th>
              </tr>
            </thead>
            <tbody>
              {adminsFiltrados.map((admin) => {
                const tieneAcceso = admin.acceso_mapa || admin.es_pilar;
                const esEditor = admin.rol_mapa === 'editor' || admin.es_pilar;
                const estaGuardando = guardandoId === admin.id;

                return (
                  <tr
                    key={admin.id}
                    className={`sgc-ap-row ${
                      admin.es_pilar ? 'sgc-ap-row--pilar' : ''
                    } ${!tieneAcceso ? 'sgc-ap-row--blocked' : ''}`}
                  >
                    {/* COLUMNA 1: DATOS DEL ADMIN */}
                    <td>
                      <div className="sgc-ap-admin-info">
                        <div
                          className={`sgc-ap-avatar-mini ${
                            admin.es_pilar ? 'sgc-ap-avatar-mini--pilar' : ''
                          }`}
                        >
                          {admin.nombre ? admin.nombre.substring(0, 2).toUpperCase() : 'AD'}
                        </div>
                        <div className="sgc-ap-admin-text">
                          <div className="sgc-ap-admin-name-row">
                            <span className="sgc-ap-admin-name">{admin.nombre}</span>
                            {admin.es_pilar ? (
                              <span className="sgc-ap-badge-master">👑 Master</span>
                            ) : (
                              <span className="sgc-ap-badge-sysrole">
                                {admin.rol === 'superadmin' ? 'Super Admin' : 'Admin'}
                              </span>
                            )}
                          </div>
                          <span className="sgc-ap-admin-email">{admin.correo}</span>
                          {admin.codigo_empleado && (
                            <span className="sgc-ap-admin-code">
                              Cód: {admin.codigo_empleado}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* COLUMNA 2: ACCESO AL MAPA (SWITCH) */}
                    <td>
                      {admin.es_pilar ? (
                        <div className="sgc-ap-locked-status" title="Acceso permanente de la administradora principal">
                          <span className="sgc-ap-lock-icon">🔒</span>
                          <span className="sgc-ap-status-tag sgc-ap-status-tag--master">
                            Acceso Total Permanente
                          </span>
                        </div>
                      ) : (
                        <div className="sgc-ap-switch-group">
                          <label
                            className={`sgc-ap-switch ${
                              tieneAcceso ? 'sgc-ap-switch--on' : ''
                            } ${estaGuardando ? 'sgc-ap-switch--busy' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={!!tieneAcceso}
                              disabled={estaGuardando}
                              onChange={() => handleToggleAcceso(admin)}
                            />
                            <span className="sgc-ap-switch-slider" />
                          </label>
                          <span
                            className={`sgc-ap-switch-label ${
                              tieneAcceso
                                ? 'sgc-ap-switch-label--on'
                                : 'sgc-ap-switch-label--off'
                            }`}
                          >
                            {tieneAcceso ? 'Autorizado' : 'Bloqueado'}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* COLUMNA 3: ROL SGC (LECTOR O EDITOR) */}
                    <td>
                      {admin.es_pilar ? (
                        <div className="sgc-ap-role-pilar-box">
                          <span className="sgc-ap-role-dot sgc-ap-role-dot--gold" />
                          <span>Editora & Propietaria SGC</span>
                        </div>
                      ) : (
                        <div className="sgc-ap-role-selector">
                          <button
                            type="button"
                            disabled={!tieneAcceso || estaGuardando}
                            className={`sgc-ap-role-btn ${
                              !esEditor && tieneAcceso ? 'sgc-ap-role-btn--active' : ''
                            } ${!tieneAcceso ? 'sgc-ap-role-btn--disabled' : ''}`}
                            onClick={() => handleCambiarRol(admin, 'lector')}
                            title="Puede ingresar y visualizar el mapa y documentos (Solo lectura)"
                          >
                            👁️ Lector
                          </button>
                          <button
                            type="button"
                            disabled={!tieneAcceso || estaGuardando}
                            className={`sgc-ap-role-btn sgc-ap-role-btn--editor ${
                              esEditor && tieneAcceso ? 'sgc-ap-role-btn--active-editor' : ''
                            } ${!tieneAcceso ? 'sgc-ap-role-btn--disabled' : ''}`}
                            onClick={() => handleCambiarRol(admin, 'editor')}
                            title="Puede editar fichas, responsables y subir/eliminar documentación"
                          >
                            ✏️ Editor SGC
                          </button>
                        </div>
                      )}
                    </td>

                    {/* COLUMNA 4: ESTADO VISUAL / FEEDBACK */}
                    <td style={{ textAlign: 'right' }}>
                      {estaGuardando ? (
                        <span className="sgc-ap-saving-badge">
                          <span className="sgc-ap-spinner-mini" /> Guardando...
                        </span>
                      ) : admin.es_pilar ? (
                        <span className="sgc-ap-pill-status sgc-ap-pill-status--gold">
                          👑 Administradora
                        </span>
                      ) : tieneAcceso ? (
                        esEditor ? (
                          <span className="sgc-ap-pill-status sgc-ap-pill-status--editor">
                            ● Autorizado · Editor
                          </span>
                        ) : (
                          <span className="sgc-ap-pill-status sgc-ap-pill-status--lector">
                            ● Autorizado · Lector
                          </span>
                        )
                      ) : (
                        <span className="sgc-ap-pill-status sgc-ap-pill-status--denied">
                          ✕ Acceso Denegado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── FOOTER INFORMATIVO ── */}
      <div className="sgc-ap-footer">
        <div className="sgc-ap-footer-tip">
          <span className="sgc-ap-tip-icon">💡</span>
          <span>
            <strong>Información:</strong> Los administradores autorizados como{' '}
            <em>Lector</em> pueden navegar el mapa y abrir fichas de detalle. Los
            designados como <em>Editor SGC</em> tienen además la capacidad de subir,
            clasificar y eliminar documentos del SGC. Los administradores con acceso{' '}
            <em>Bloqueado</em> verán la pantalla de restricción y no podrán ingresar al
            mapa.
          </span>
        </div>
      </div>
    </section>
  );
}
