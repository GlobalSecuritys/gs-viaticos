import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminMaster, GLOBAL_ADMIN_NAV } from '../config/modulesConfig';
import { obtenerNombreUsuario, obtenerPrimerNombre } from '../utils/personal';
import MapaProcesosSGC from '../components/MapaProcesosSGC';
import PanelContactoTecnicos from '../components/PanelContactoTecnicos';
import logoGSB from '../assets/logo-gsb.png';
import './SeleccionModulo.css';

const LABEL_ROL = {
  superadmin: 'Super Administrador',
  admin: 'Administrador',
  tecnico: 'Técnico',
};

export default function SeleccionModulo() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [globalLockAlert, setGlobalLockAlert] = useState(null);

  const isMaster = isAdminMaster(user);
  const nombreMostrado = obtenerNombreUsuario(user, 'Administrador');
  const primerNombre = obtenerPrimerNombre(user, 'Admin');
  const inicial = nombreMostrado[0].toUpperCase();
  const rolLabel = LABEL_ROL[user?.rol] || user?.rol || 'Administrador';

  const now = new Date();
  const hora = now.getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

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
            <span className="sm-brand-sub">Sistema de Gestión & Mapa de Procesos SGC</span>
          </div>
        </div>

        <div className="sm-header-right">
          <div className="sm-user-pill">
            <span className="sm-pill-avatar">{inicial}</span>
            <span className="sm-pill-name">{primerNombre}</span>
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

      {/* ── HUB LAYOUT: Contenido Principal Unificado ── */}
      <div className="sm-hub-layout">
        <main className="sm-main">
          {/* ── HERO SECTION ── */}
          <div className="sm-hero">
            <div className="sm-hero-badge">
              <span className="sm-hero-badge-dot" />
              Ecosistema Operativo Activo · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>

            <h1 className="sm-hero-title">
              {saludo},<br />
              <span className="sm-hero-name">{primerNombre}</span>
            </h1>
            <p className="sm-hero-sub">
              Mapa de Procesos SGC · Navegue e ingrese a las operaciones y módulos de la organización
            </p>

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

          {/* ── 1. MAPA DE CALIDAD DE PROCESOS (CONTENIDO PRINCIPAL) ── */}
          <section className="sm-mapa-section" aria-label="Mapa de Procesos SGC">
            <MapaProcesosSGC mostrarEncabezadoCategoria={true} />
          </section>

          {/* ── 2. SECCIÓN DE ADMINISTRACIÓN GLOBAL (TRANSVERSAL) ── */}
          {(user?.rol === 'admin' || user?.rol === 'superadmin') && (
            <div className="sm-global-admin-bar">
              <div className="sm-global-admin-header">
                <span className="sm-global-admin-icon">⚙️</span>
                <div className="sm-global-admin-text">
                  <h4>Administración Global del Ecosistema</h4>
                  <p>Gestión de usuarios, auditoría de trazabilidad y ajustes transversales.</p>
                </div>
              </div>

              <div className="sm-global-admin-links">
                {GLOBAL_ADMIN_NAV.map((nav) => {
                  const isLocked = nav.minRole === 'superadmin' && user?.rol !== 'superadmin';
                  const targetPath = nav.getPath ? nav.getPath(user) : nav.path;
                  return (
                    <button
                      key={nav.id}
                      type="button"
                      className={`sm-btn-global-link ${isLocked ? 'sm-btn-global-link--locked' : ''}`}
                      onClick={() => {
                        if (isLocked) {
                          setGlobalLockAlert({
                            modulo: nav.label,
                            razon: 'Esta sección está reservada exclusivamente para usuarios con perfil de Superadministrador.',
                          });
                        } else {
                          navigate(targetPath);
                        }
                      }}
                      title={isLocked ? `🔒 Acceso restringido (Solo Superadministradores)` : `Ir a ${nav.label}`}
                    >
                      <span>{isLocked ? '🔒' : nav.icon}</span>
                      <span>{nav.label}</span>
                      {isLocked ? (
                        <span className="sm-global-lock-pill">Solo Superadmin</span>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 3. BARRA HORIZONTAL DE CONTACTOS WHATSAPP (PARTE INFERIOR) ── */}
          {(user?.rol === 'admin' || user?.rol === 'superadmin') && (
            <PanelContactoTecnicos />
          )}

          {/* Footer institucional */}
          <footer className="sm-footer">
            <span>© 2025 Global Security Bank · Sistema GS-VIÁTICOS & Ecosistema de Calidad SGC</span>
          </footer>
        </main>
      </div>

      {/* ── MODAL / DIÁLOGO DE ACCESO RESTRINGIDO GLOBAL (CANDADO) ── */}
      {globalLockAlert && (
        <div className="sgc-lock-backdrop" onClick={() => setGlobalLockAlert(null)}>
          <div className="sgc-lock-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <div className="sgc-lock-dialog-icon">🔒</div>
            <div className="sgc-lock-dialog-content">
              <h3 className="sgc-lock-dialog-title">Acceso Restringido</h3>
              <div className="sgc-lock-dialog-module">{globalLockAlert.modulo}</div>
              <p className="sgc-lock-dialog-text">{globalLockAlert.razon}</p>
            </div>
            <div className="sgc-lock-dialog-actions">
              <button
                type="button"
                className="sgc-lock-dialog-btn"
                onClick={() => setGlobalLockAlert(null)}
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
