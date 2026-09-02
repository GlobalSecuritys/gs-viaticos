import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MODULES_CONFIG, GLOBAL_ADMIN_NAV, isAdminMaster, getAvailableModules } from '../../config/modulesConfig';
import NotificationBell from '../NotificationBell';
import logoGSB from '../../assets/logo-gsb.png';
import './GlobalHeader.css';

function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export default function GlobalHeader({ currentModuleId, onToggleSidebar, sidebarOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuAdminAbierto, setMenuAdminAbierto] = useState(false);
  const [menuModulosAbierto, setMenuModulosAbierto] = useState(false);

  const adminMenuRef = useRef(null);
  const modulosMenuRef = useRef(null);

  const isMaster = isAdminMaster(user);
  const availableModules = getAvailableModules(user);
  const currentModule = MODULES_CONFIG.find((m) => m.id === currentModuleId);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) {
        setMenuAdminAbierto(false);
      }
      if (modulosMenuRef.current && !modulosMenuRef.current.contains(e.target)) {
        setMenuModulosAbierto(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const nombreUsuario = user?.nombre || user?.correo || 'Administrador';

  return (
    <header className="gh-root">
      {/* ── IZQUIERDA: TOGGLE MOBILE + BRAND + HUB BTN ── */}
      <div className="gh-left">
        {onToggleSidebar && (
          <button
            type="button"
            className={`gh-btn-hamburger ${sidebarOpen ? 'gh-btn-hamburger--active' : ''}`}
            onClick={onToggleSidebar}
            aria-label="Abrir menú"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        )}

        <div className="gh-hub-btn" onClick={() => navigate('/seleccion-modulo')} title="Ir al Hub de Módulos">
          <div className="gh-logo-box">
            <img src={logoGSB} alt="GSB" className="gh-logo-img" />
          </div>
          <div className="gh-brand-info">
            <span className="gh-brand-name">Global Security Bank</span>
            <span className="gh-hub-tag">‹ Hub de Módulos</span>
          </div>
        </div>

        {/* Selector / Indicador del Módulo Activo */}
        {currentModule && (
          <div className="gh-module-indicator-wrap" ref={modulosMenuRef}>
            <button
              type="button"
              className="gh-module-badge-btn"
              onClick={() => setMenuModulosAbierto(!menuModulosAbierto)}
              title="Cambiar de módulo"
            >
              <span className="gh-module-dot" style={{ backgroundColor: currentModule.color }} />
              <span className="gh-module-name">{currentModule.name}</span>
              <svg className="gh-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuModulosAbierto && (
              <div className="gh-dropdown gh-dropdown--modules">
                <div className="gh-dropdown-header">Módulos del Sistema</div>
                {availableModules.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    className={`gh-dropdown-item ${mod.id === currentModuleId ? 'gh-dropdown-item--active' : ''}`}
                    onClick={() => {
                      setMenuModulosAbierto(false);
                      navigate(mod.route);
                    }}
                  >
                    <span className="gh-mod-item-dot" style={{ backgroundColor: mod.color }} />
                    <div className="gh-mod-item-info">
                      <strong>{mod.name}</strong>
                      <span>{mod.badge}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DERECHA: ADMIN GLOBAL + NOTIFICACIONES + USER PILL + LOGOUT ── */}
      <div className="gh-right">
        {/* Menú de Administración Global (Transversal) */}
        {(user?.rol === 'admin' || user?.rol === 'superadmin') && (
          <div className="gh-admin-menu-wrap" ref={adminMenuRef}>
            <button
              type="button"
              className={`gh-btn-admin-global ${menuAdminAbierto ? 'gh-btn-admin-global--active' : ''}`}
              onClick={() => setMenuAdminAbierto(!menuAdminAbierto)}
              title="Administración Global del Ecosistema"
            >
              <span className="gh-admin-icon">⚙️</span>
              <span className="gh-admin-label">Admin Global</span>
              <svg className="gh-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuAdminAbierto && (
              <div className="gh-dropdown gh-dropdown--admin">
                <div className="gh-dropdown-header">
                  <span>Administración Global</span>
                  <small>Transversal a todos los módulos</small>
                </div>
                {GLOBAL_ADMIN_NAV.map((nav) => {
                  const targetPath = nav.getPath ? nav.getPath(user) : nav.path;
                  if (nav.minRole === 'superadmin' && user?.rol !== 'superadmin') {
                    return null;
                  }
                  const isActive = location.pathname.startsWith(targetPath);
                  return (
                    <button
                      key={nav.id}
                      type="button"
                      className={`gh-dropdown-item ${isActive ? 'gh-dropdown-item--active' : ''}`}
                      onClick={() => {
                        setMenuAdminAbierto(false);
                        navigate(targetPath);
                      }}
                    >
                      <span className="gh-nav-icon">{nav.icon}</span>
                      <div className="gh-nav-text">
                        <strong>{nav.label}</strong>
                        <span>{nav.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Campana de Notificaciones */}
        <NotificationBell />

        {/* User Pill */}
        <div className="gh-user-pill" title={user?.correo}>
          <div className="gh-user-avatar">
            {iniciales(nombreUsuario)}
          </div>
          <div className="gh-user-details">
            <span className="gh-user-name">{nombreUsuario.split(' ')[0]}</span>
            {isMaster ? (
              <span className="gh-master-tag">⭐ Master</span>
            ) : (
              <span className="gh-role-tag">{user?.rol || 'Admin'}</span>
            )}
          </div>
        </div>

        {/* Botón Salir */}
        <button
          type="button"
          className="gh-btn-logout"
          onClick={handleLogout}
          title="Cerrar sesión"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="gh-logout-text">Salir</span>
        </button>
      </div>
    </header>
  );
}
