import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoGSB from '../assets/logo-gsb.png';
import './SeleccionModulo.css';

const LABEL_ROL = {
    superadmin: 'Super Administrador',
    admin:      'Administrador',
    tecnico:    'Técnico',
};

export default function SeleccionModulo() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const isMasterAdmin = (user?.correo || '').trim().toLowerCase() === 'admin@gsbank.com';
    const nombreMostrado = user?.nombre || user?.correo || 'Super Administrador';
    const inicial = (user?.nombre || user?.correo || 'U')[0].toUpperCase();
    const rolLabel = LABEL_ROL[user?.rol] || user?.rol || 'Administrador';

    return (
        <div className="sm-root">
            {/* ─── HEADER ─── */}
            <header className="sm-header">
                <div className="sm-header-brand">
                    <img src={logoGSB} alt="GSB" className="sm-header-logo" />
                    <div className="sm-header-brand-text">
                        <span className="sm-brand-name">Global Security Bank</span>
                        <span className="sm-brand-sub">Sistema de Gestión</span>
                    </div>
                </div>

                <button
                    className="sm-logout-btn"
                    onClick={() => { logout(); navigate('/login'); }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Cerrar sesión
                </button>
            </header>

            {/* ─── MAIN ─── */}
            <main className="sm-main">

                {/* Ficha ejecutiva del usuario */}
                <div className="sm-user-card">
                    <div className="sm-user-avatar-wrap">
                        <div className="sm-user-avatar">{inicial}</div>
                        <span className="sm-user-status-dot" title="Sesión activa" />
                    </div>
                    <div className="sm-user-details">
                        <h2 className="sm-user-name">
                            {nombreMostrado}
                        </h2>
                        <span className="sm-user-email">
                            {user?.correo}
                        </span>
                        <span className="sm-user-role-badge">
                            {isMasterAdmin ? 'ADMIN MASTER' : rolLabel}
                        </span>
                    </div>
                </div>

                {/* Título de selección */}
                <div className="sm-title-block">
                    <h1 className="sm-title">Selección de módulo</h1>
                    <p className="sm-subtitle">Elija el sistema al que desea ingresar</p>
                </div>

                {/* Tarjetas */}
                <div className="sm-cards-row">

                    {/* Viáticos */}
                    <button
                        type="button"
                        className="sm-card"
                        onClick={() => navigate('/admin')}
                    >
                        <div className="sm-card-icon-wrap">
                            <svg className="sm-card-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="6" y="14" width="36" height="26" rx="3" stroke="currentColor" strokeWidth="2.5"/>
                                <path d="M6 20h36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                                <path d="M16 8h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                                <circle cx="24" cy="32" r="4" stroke="currentColor" strokeWidth="2.2"/>
                                <path d="M18 32h2M28 32h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <div className="sm-card-body">
                            <h3 className="sm-card-title">Viáticos</h3>
                            <p className="sm-card-desc">Gestión de viáticos, liquidaciones y control operativo de gastos.</p>
                        </div>
                        <div className="sm-card-footer">
                            <span className="sm-card-cta">Ingresar</span>
                            <svg className="sm-card-arrow" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                    </button>

                    {/* Talento Humano */}
                    <button
                        type="button"
                        className="sm-card"
                        onClick={() => navigate('/talento-humano')}
                    >
                        <div className="sm-card-icon-wrap">
                            <svg className="sm-card-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="24" cy="16" r="6" stroke="currentColor" strokeWidth="2.5"/>
                                <path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                                <circle cx="38" cy="14" r="4" stroke="currentColor" strokeWidth="2"/>
                                <path d="M42 30c0-4.418-1.79-8-4-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                <circle cx="10" cy="14" r="4" stroke="currentColor" strokeWidth="2"/>
                                <path d="M6 30c0-4.418 1.79-8 4-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <div className="sm-card-body">
                            <h3 className="sm-card-title">Talento Humano</h3>
                            <p className="sm-card-desc">Gestión de colaboradores, personal y administración del talento.</p>
                        </div>
                        <div className="sm-card-footer">
                            <span className="sm-card-cta">Ingresar</span>
                            <svg className="sm-card-arrow" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                    </button>

                </div>
            </main>
        </div>
    );
}
