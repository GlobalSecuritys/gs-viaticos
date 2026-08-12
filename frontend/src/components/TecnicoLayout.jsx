import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoGSB from '../assets/logo-gsb.png';
import './TecnicoLayout.css';

function iniciales(nombre = '') {
    return nombre
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');
}

import NotificationBell from './NotificationBell';

export default function TecnicoLayout({ children }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { path: '/dashboard', label: 'Inicio', icon: '🏠' },
        { path: '/nuevo-viatico', label: 'Registrar viático', icon: '📝' },
        { path: '/mis-viaticos', label: 'Mis viáticos', icon: '📄' },
        { path: '/mis-asignaciones', label: 'Mis asignaciones', icon: '📋' },
        { path: '/cuenta-cobro', label: 'Cuenta de cobro', icon: '💵' },
    ];

    const nombreMostrado = user?.nombre || user?.correo || 'Técnico';
    const init = iniciales(nombreMostrado) || user?.correo?.[0]?.toUpperCase() || 'T';
    const cargoMostrado = user?.rol === 'superadmin' ? 'SuperAdmin' : user?.rol === 'admin' ? 'Administrador' : 'Técnico Instalador';

    return (
        <div className="tec-root">
            {/* Sidebar Left */}
            <aside className="tec-sidebar">
                <div className="tec-sidebar-brand" onClick={() => navigate('/dashboard')}>
                    <img src={logoGSB} alt="Global Security Bank" className="tec-sidebar-logo" />
                    <div className="tec-sidebar-brand-text">
                        <span className="tec-brand-title">Global Security Bank</span>
                        <span className="tec-brand-sub">Plataforma de Viáticos</span>
                    </div>
                </div>

                <div className="tec-sidebar-user">
                    <div className="tec-user-avatar">{init}</div>
                    <div className="tec-user-info">
                        <span className="tec-user-name">{nombreMostrado}</span>
                        <span className="tec-user-role">{cargoMostrado}</span>
                    </div>
                </div>

                <nav className="tec-nav">
                    {menuItems.map((item) => {
                        const activo = location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                className={`tec-nav-item ${activo ? 'tec-nav-item--active' : ''}`}
                                onClick={() => navigate(item.path)}
                            >
                                <span className="tec-nav-icon">{item.icon}</span>
                                <span className="tec-nav-label">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="tec-sidebar-footer">
                    <button
                        className="tec-logout-btn"
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                    >
                        <span className="tec-nav-icon">🚪</span>
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="tec-content">
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0.85rem 1.5rem 0', gap: '1rem' }}>
                    <NotificationBell />
                </div>
                {children}
            </main>
        </div>
    );
}
