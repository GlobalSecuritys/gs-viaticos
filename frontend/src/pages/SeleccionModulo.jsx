import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoGSB from '../assets/logo-gsb.png';
import './SeleccionModulo.css';

const LABEL_ROL = {
    superadmin: 'Super Administrador',
    admin:      'Administrador',
    tecnico:    'Técnico',
};

const MODULES = [
    {
        id: 'viaticos',
        label: 'Viáticos',
        desc: 'Gestión de viáticos, liquidaciones y control operativo de gastos.',
        route: '/admin',
        badge: null,
        accentClass: 'sm-card--viaticos',
        icon: (
            <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="16" width="44" height="30" rx="5" stroke="currentColor" strokeWidth="2.5"/>
                <path d="M6 24h44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M18 10h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="28" cy="37" r="5" stroke="currentColor" strokeWidth="2.2"/>
                <path d="M20 37h2M34 37h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
        ),
        stats: [
            { label: 'Liquidaciones', icon: '📋' },
            { label: 'Gastos', icon: '💳' },
            { label: 'Reportes', icon: '📊' },
        ],
    },
    {
        id: 'talento',
        label: 'Talento Humano',
        desc: 'Gestión de colaboradores, contratos, dotación y administración del personal.',
        route: '/talento-humano',
        badge: null,
        accentClass: 'sm-card--talento',
        icon: (
            <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="28" cy="18" r="7" stroke="currentColor" strokeWidth="2.5"/>
                <path d="M12 46c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="44" cy="17" r="4.5" stroke="currentColor" strokeWidth="2"/>
                <path d="M48 33c0-4.97-2.015-9-4.5-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="17" r="4.5" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 33c0-4.97 2.015-9 4.5-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
        ),
        stats: [
            { label: 'Personal', icon: '👤' },
            { label: 'Contratos', icon: '📄' },
            { label: 'Dotación', icon: '🦺' },
        ],
    },
    {
        id: 'backup',
        label: 'Backup',
        desc: 'Visor de comprobantes, organización por oficinas y descarga masiva de evidencias.',
        route: '/admin/backup',
        badge: '🔒 Solo Admin',
        accentClass: 'sm-card--backup',
        icon: (
            <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8" y="8" width="40" height="12" rx="4" stroke="currentColor" strokeWidth="2.5"/>
                <rect x="8" y="23" width="40" height="12" rx="4" stroke="currentColor" strokeWidth="2.5"/>
                <rect x="8" y="38" width="40" height="12" rx="4" stroke="currentColor" strokeWidth="2.5"/>
                <circle cx="17" cy="14" r="2.2" fill="currentColor"/>
                <circle cx="17" cy="29" r="2.2" fill="currentColor"/>
                <circle cx="17" cy="44" r="2.2" fill="currentColor"/>
                <path d="M36 44l4-4 4 4M40 40v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        ),
        stats: [
            { label: 'Evidencias', icon: '🖼️' },
            { label: 'Oficinas', icon: '🏢' },
            { label: 'ZIP', icon: '📦' },
        ],
    },
];

export default function SeleccionModulo() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const isMasterAdmin = (user?.correo || '').trim().toLowerCase() === 'admin@gsbank.com';
    const nombreMostrado = user?.nombre || user?.correo || 'Administrador';
    const inicial = (user?.nombre || user?.correo || 'A')[0].toUpperCase();
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
                        <span className="sm-brand-sub">Sistema de Gestión Integrado</span>
                    </div>
                </div>

                <div className="sm-header-right">
                    <div className="sm-user-pill">
                        <span className="sm-pill-avatar">{inicial}</span>
                        <span className="sm-pill-name">{nombreMostrado.split(' ')[0]}</span>
                        <span className="sm-pill-dot" title="En línea" />
                    </div>
                    <button
                        className="sm-logout-btn"
                        onClick={() => { logout(); navigate('/login'); }}
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

            {/* ── HERO SECTION ── */}
            <main className="sm-main">
                <div className="sm-hero">
                    <div className="sm-hero-badge">
                        <span className="sm-hero-badge-dot" />
                        Sistema activo · {new Date().toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' })}
                    </div>
                    <h1 className="sm-hero-title">
                        {saludo},<br />
                        <span className="sm-hero-name">{nombreMostrado}</span>
                    </h1>
                    <p className="sm-hero-sub">Seleccione el módulo al que desea ingresar</p>

                    {/* Role badge */}
                    <div className="sm-role-strip">
                        <span className="sm-role-badge">
                            {isMasterAdmin ? '⭐ Admin Master' : `● ${rolLabel}`}
                        </span>
                        <span className="sm-role-email">{user?.correo}</span>
                    </div>
                </div>

                {/* ── TARJETAS ── */}
                <div className="sm-cards-row">
                    {MODULES.map((mod) => (
                        <button
                            key={mod.id}
                            type="button"
                            className={`sm-card ${mod.accentClass}`}
                            onClick={() => navigate(mod.route)}
                        >
                            {/* Brillo hover */}
                            <div className="sm-card-glow" />

                            {/* Badge opcional */}
                            {mod.badge && (
                                <span className="sm-card-badge">{mod.badge}</span>
                            )}

                            {/* Icono */}
                            <div className="sm-card-icon-wrap">
                                {mod.icon}
                            </div>

                            {/* Cuerpo */}
                            <div className="sm-card-body">
                                <h3 className="sm-card-title">{mod.label}</h3>
                                <p className="sm-card-desc">{mod.desc}</p>
                            </div>

                            {/* Mini-stats */}
                            <div className="sm-card-stats">
                                {mod.stats.map((s) => (
                                    <div key={s.label} className="sm-stat-pill">
                                        <span>{s.icon}</span>
                                        <span>{s.label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Footer CTA */}
                            <div className="sm-card-footer">
                                <span className="sm-card-cta">Ingresar al módulo</span>
                                <svg className="sm-card-arrow" viewBox="0 0 20 20" fill="none">
                                    <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Footer mínimo */}
                <footer className="sm-footer">
                    <span>© 2025 Global Security Bank · Sistema GS-VIÁTICOS</span>
                </footer>
            </main>
        </div>
    );
}
