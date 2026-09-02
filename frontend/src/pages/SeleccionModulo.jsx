import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAvailableModules, isAdminMaster, GLOBAL_ADMIN_NAV } from '../config/modulesConfig';
import PanelContactoTecnicos from '../components/PanelContactoTecnicos';
import logoGSB from '../assets/logo-gsb.png';
import './SeleccionModulo.css';

const LABEL_ROL = {
  superadmin: 'Super Administrador',
  admin: 'Administrador',
  tecnico: 'Técnico',
};

// Íconos SVG para cada tipo de módulo
function renderModuleIcon(iconName) {
  switch (iconName) {
    case 'wallet':
      return (
        <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="16" width="44" height="30" rx="5" stroke="currentColor" strokeWidth="2.5" />
          <path d="M6 24h44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M18 10h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="28" cy="37" r="5" stroke="currentColor" strokeWidth="2.2" />
          <path d="M20 37h2M34 37h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="28" cy="18" r="7" stroke="currentColor" strokeWidth="2.5" />
          <path d="M12 46c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="44" cy="17" r="4.5" stroke="currentColor" strokeWidth="2" />
          <path d="M48 33c0-4.97-2.015-9-4.5-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="17" r="4.5" stroke="currentColor" strokeWidth="2" />
          <path d="M8 33c0-4.97 2.015-9 4.5-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'map':
      return (
        <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="10" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="2.4" />
          <rect x="32" y="10" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="2.4" />
          <rect x="20" y="32" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="2.4" />
          <path d="M16 24v4h12v4M40 24v4H28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="28" cy="28" r="2.5" fill="currentColor" />
        </svg>
      );
    case 'database':
    default:
      return (
        <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="8" width="40" height="12" rx="4" stroke="currentColor" strokeWidth="2.5" />
          <rect x="8" y="23" width="40" height="12" rx="4" stroke="currentColor" strokeWidth="2.5" />
          <rect x="8" y="38" width="40" height="12" rx="4" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="17" cy="14" r="2.2" fill="currentColor" />
          <circle cx="17" cy="29" r="2.2" fill="currentColor" />
          <circle cx="17" cy="44" r="2.2" fill="currentColor" />
          <path d="M36 44l4-4 4 4M40 40v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export default function SeleccionModulo() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isMaster = isAdminMaster(user);
  const nombreMostrado = user?.nombre || user?.correo || 'Administrador';
  const inicial = (user?.nombre || user?.correo || 'A')[0].toUpperCase();
  const rolLabel = LABEL_ROL[user?.rol] || user?.rol || 'Administrador';

  const now = new Date();
  const hora = now.getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

  // Obtener módulos disponibles según permisos del usuario
  const availableModules = getAvailableModules(user);

  return (
    <div className="sm-root">
      {/* ── FONDO ANIMADO ── */}
      <div className="sm-bg-canvas">
        <div className="sm-orb sm-orb-1" />
        <div className="sm-orb sm-orb-2" />
        <div className="sm-orb sm-orb-3" />
        <div className="sm-orb sm-orb-4" />
        <div className="sm-grid-overlay" />
      </div>

      {/* ── HEADER FLOTANTE ── */}
      <header className="sm-header">
        <div className="sm-header-brand">
          <div className="sm-logo-halo">
            <img src={logoGSB} alt="GSB" className="sm-header-logo" />
          </div>
          <div className="sm-header-brand-text">
            <span className="sm-brand-name">Global Security Bank</span>
            <span className="sm-brand-sub">Hub de Módulos & Gestión Empresarial</span>
          </div>
        </div>

        <div className="sm-header-right">
          <div className="sm-user-pill">
            <span className="sm-pill-avatar">{inicial}</span>
            <span className="sm-pill-name">{nombreMostrado.split(' ')[0]}</span>
            <span className="sm-pill-dot" title="En línea" />
          </div>
          <button
            type="button"
            className="sm-logout-btn"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Cerrar sesión"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Salir
          </button>
        </div>
      </header>

      {/* ── HUB LAYOUT: contenido principal + sidebar WhatsApp ── */}
      <div className="sm-hub-layout">
      {/* ── HERO SECTION + MÓDULOS ── */}
      <main className="sm-main">
        <div className="sm-hero">
          <div className="sm-hero-badge">
            <span className="sm-hero-badge-dot" />
            Ecosistema Activo · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          <h1 className="sm-hero-title">
            {saludo},<br />
            <span className="sm-hero-name">{nombreMostrado}</span>
          </h1>
          <p className="sm-hero-sub">Seleccione el módulo al que desea ingresar</p>

          {/* Role badge */}
          <div className="sm-role-strip">
            {isMaster ? (
              <span className="sm-role-badge sm-role-badge--master">
                ⭐ Admin Master — <a href={`mailto:${user?.correo}`} className="sm-master-link">{user?.correo}</a>
              </span>
            ) : (
              <>
                <span className="sm-role-badge">● {rolLabel}</span>
                <span className="sm-role-email">{user?.correo}</span>
              </>
            )}
          </div>
        </div>

        {/* ── TARJETAS DE MÓDULOS (DINÁMICAS SEGÚN PERMISOS) ── */}
        <div className="sm-cards-row">
          {availableModules.map((mod) => (
            <button
              key={mod.id}
              type="button"
              className={`sm-card ${mod.accentClass}`}
              onClick={() => navigate(mod.route)}
            >
              {/* Brillo hover */}
              <div className="sm-card-glow" />

              {/* Badge opcional */}
              {mod.badge && <span className="sm-card-badge">{mod.badge}</span>}

              {/* Icono */}
              <div className="sm-card-icon-wrap">
                {renderModuleIcon(mod.iconName)}
              </div>

              {/* Cuerpo */}
              <div className="sm-card-body">
                <h3 className="sm-card-title">{mod.name}</h3>
                <p className="sm-card-desc">{mod.description}</p>
              </div>

              {/* Sub-secciones Chips */}
              <div className="sm-card-stats">
                {mod.chips.map((c) => (
                  <div key={c.label} className="sm-stat-pill">
                    <span>{c.icon}</span>
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>

              {/* Footer CTA */}
              <div className="sm-card-footer">
                <span className="sm-card-cta">Ingresar al módulo</span>
                <svg className="sm-card-arrow" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* ── SECCIÓN DE ADMINISTRACIÓN GLOBAL (TRANSVERSAL) ── */}
        {(user?.rol === 'admin' || user?.rol === 'superadmin') && (
          <div className="sm-global-admin-bar">
            <div className="sm-global-admin-header">
              <span className="sm-global-admin-icon">⚙️</span>
              <div className="sm-global-admin-text">
                <h4>Administración Global del Ecosistema</h4>
                <p>Gestión de usuarios, auditoría de trazabilidad y ajustes de cuenta transversales.</p>
              </div>
            </div>

            <div className="sm-global-admin-links">
              {GLOBAL_ADMIN_NAV.map((nav) => {
                if (nav.minRole === 'superadmin' && user?.rol !== 'superadmin') {
                  return null;
                }
                const targetPath = nav.getPath ? nav.getPath(user) : nav.path;
                return (
                  <button
                    key={nav.id}
                    type="button"
                    className="sm-btn-global-link"
                    onClick={() => navigate(targetPath)}
                  >
                    <span>{nav.icon}</span>
                    <span>{nav.label}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer mínimo */}
        <footer className="sm-footer">
          <span>© 2025 Global Security Bank · Sistema GS-VIÁTICOS & Ecosistema Integrado</span>
        </footer>
      </main>

      {/* ── PANEL LATERAL WHATSAPP (solo Super Admin) ── */}
      {isMaster && <PanelContactoTecnicos />}

      </div>{/* /sm-hub-layout */}
    </div>
  );
}
