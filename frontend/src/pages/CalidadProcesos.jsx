import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { esAdminCalidad } from '../utils/permisos';
import logoGSB from '../assets/logo-gsb.png';
import MapaProcesosSGC from '../components/MapaProcesosSGC';
import './CalidadProcesos.css';

export default function CalidadProcesos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = esAdminCalidad(user);

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
          {isAdmin && (
            <div className="sgc-admin-mode-pill">
              <span className="sgc-admin-crown">👑</span>
              <span>Modo Administrador</span>
            </div>
          )}

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

      {/* ── CUERPO PRINCIPAL DEL MAPA ── */}
      <main className="sgc-main">
        <MapaProcesosSGC mostrarEncabezadoCategoria={true} />
      </main>
    </div>
  );
}
