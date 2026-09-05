import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { esPilarAdmin, puedeVerMapa, puedeEditarMapa } from '../utils/permisos';
import logoGSB from '../assets/logo-gsb.png';
import MapaProcesosSGC from '../components/MapaProcesosSGC';
import PanelRolesAdminsMapa from '../components/PanelRolesAdminsMapa';
import './CalidadProcesos.css';

export default function CalidadProcesos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPilar = esPilarAdmin(user);
  const hasAccess = puedeVerMapa(user);
  const canEdit = puedeEditarMapa(user);

  return (
    <div className="sgc-root">
      {/* ── HEADER SUPERIOR ── */}
      <header className="sgc-topbar">
        <div className="sgc-topbar-left">
          <div className="sgc-logo-halo">
            <img src={logoGSB} alt="GSB Shield" className="sgc-logo-img" />
          </div>
          <div>
            <h1 className="sgc-topbar-title">MAPA DE PROCESOS SGC</h1>
            <span className="sgc-topbar-sub">GLOBAL SECURITY BANK · CALIDAD DE PROCESOS</span>
          </div>
        </div>

        <div className="sgc-topbar-right">
          {isPilar ? (
            <div className="sgc-admin-mode-pill sgc-admin-mode-pill--pilar">
              <span className="sgc-admin-crown">👑</span>
              <span>Master Calidad SGC</span>
            </div>
          ) : canEdit ? (
            <div className="sgc-admin-mode-pill sgc-admin-mode-pill--editor">
              <span className="sgc-admin-crown">✏️</span>
              <span>Modo Editor SGC</span>
            </div>
          ) : hasAccess ? (
            <div className="sgc-admin-mode-pill sgc-admin-mode-pill--lector">
              <span className="sgc-admin-crown">👁️</span>
              <span>Modo Lector SGC</span>
            </div>
          ) : null}

          <button
            type="button"
            className="sgc-btn-nav"
            onClick={() => navigate('/seleccion-modulo')}
            title="Volver al menú principal"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Inicio
          </button>
        </div>
      </header>

      {/* ── CUERPO PRINCIPAL DEL MAPA O ACCESO RESTRINGIDO ── */}
      <main className="sgc-main">
        {!hasAccess ? (
          <div className="sgc-restricted-wrapper">
            <div className="sgc-restricted-card">
              <div className="sgc-restricted-icon-box">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="sgc-restricted-title">Acceso al Mapa de Procesos Restringido</h2>
              <p className="sgc-restricted-text">
                Tu cuenta actualmente no tiene autorización para ingresar ni visualizar el Mapa de Procesos SGC.
              </p>
              <div className="sgc-restricted-authority-badge">
                <span>🔐 Autorización Exclusiva:</span>
                <strong>Pilar Aristizábal (PilarAdmin@gsbank.com)</strong>
              </div>
              <p className="sgc-restricted-note">
                Por favor comunícate con la administradora de calidad para que habilite tu acceso al mapa y defina tu rol de permisos.
              </p>
              <button
                type="button"
                className="sgc-restricted-btn"
                onClick={() => navigate('/seleccion-modulo')}
              >
                ← Volver al Menú Principal
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 1. Mapa de Procesos SGC */}
            <MapaProcesosSGC mostrarEncabezadoCategoria={true} />

            {/* 2. Sección debajo del mapa exclusiva para PilarAdmin */}
            {isPilar && <PanelRolesAdminsMapa />}
          </>
        )}
      </main>
    </div>
  );
}
