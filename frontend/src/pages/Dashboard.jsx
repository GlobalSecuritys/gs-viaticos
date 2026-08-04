import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';
import logoGSB from '../assets/logo-gsb.png';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const now = new Date();
  const hora = now.getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="dash-root">
      <header className="dash-header">
        <div className="dash-header-brand">
          <img src={logoGSB} alt="Global Security Bank" className="dash-logo-img" />          <div>
            <span className="dash-brand-name">GLOBAL SECURITY</span>
            <span className="dash-brand-sub">Sistema de Viáticos</span>
          </div>
        </div>
        <div className="dash-header-right">
          <div className="dash-user-pill">
            <span className="dash-user-avatar">{user?.correo?.[0]?.toUpperCase()}</span>
            <span className="dash-user-email">{user?.correo}</span>
          </div>
          <button className="btn-logout" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-welcome">
          <h1 className="dash-welcome-title">
            {saludo} 👋
          </h1>
          <p className="dash-welcome-sub">
            Bienvenido al sistema de gestión de viáticos y gastos operativos.
          </p>
        </div>

        <div className="dash-cards">
          <button
            className="dash-action-card dash-action-card--primary"
            onClick={() => navigate('/nuevo-viatico')}
            id="btn-nuevo-viatico"
          >
            <div className="dac-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="dac-content">
              <h2>Nuevo Viático</h2>
              <p>Registra un nuevo gasto operativo o viático para aprobación.</p>
            </div>
            <span className="dac-arrow">→</span>
          </button>

          <button
            className="dash-action-card dash-action-card--secondary"
            onClick={() => navigate('/mis-viaticos')}
            id="btn-mis-viaticos"
          >
            <div className="dac-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="dac-content">
              <h2>Mis Viáticos</h2>
              <p>Consulta el historial y estado de tus viáticos registrados.</p>
            </div>
            <span className="dac-arrow">→</span>
          </button>
        </div>

        <div className="dash-info-bar">
          <div className="info-badge">
            <span className="info-dot info-dot--yellow"></span>
            Pendiente: en espera de aprobación
          </div>
          <div className="info-badge">
            <span className="info-dot info-dot--green"></span>
            Aprobado: gasto autorizado
          </div>
          <div className="info-badge">
            <span className="info-dot info-dot--red"></span>
            Rechazado: requiere revisión
          </div>
        </div>
      </main>
    </div>
  );
}
