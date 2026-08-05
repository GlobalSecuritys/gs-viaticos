import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import logoGSB from '../assets/logo-gsb.png';
import './AdminDashboard.css';

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ total: 0, pendientes: 0, aprobados: 0, rechazados: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function cargarStats() {
            try {
                const { data } = await api.get('/admin/viaticos');
                setStats({
                    total: data.length,
                    pendientes: data.filter((v) => v.estado === 'pendiente').length,
                    aprobados: data.filter((v) => v.estado === 'aprobado').length,
                    rechazados: data.filter((v) => v.estado === 'rechazado').length,
                });
            } catch (err) {
                console.error('Error cargando estadísticas', err);
            } finally {
                setLoading(false);
            }
        }
        cargarStats();
    }, []);

    return (
        <div className="admin-root">
            <header className="admin-header">
                <div className="admin-header-brand">
                    <img src={logoGSB} alt="Global Security Bank" className="admin-logo-img" />
                    <div>
                        <span className="admin-brand-name">PANEL ADMINISTRATIVO</span>
                        <span className="admin-brand-sub">GS-Viáticos</span>
                    </div>
                </div>
                <div className="admin-header-right">
                    <div className="admin-user-pill">
                        <span className="admin-user-avatar">{user?.correo?.[0]?.toUpperCase()}</span>
                        <span className="admin-user-email">{user?.correo}</span>
                    </div>
                    <button
                        className="btn-logout"
                        onClick={() => {
                            logout();
                            navigate("/login");
                        }}
                    >Cerrar sesión</button>
                </div>
            </header>

            <main className="admin-main">
                <div className="admin-welcome">
                    <h1>Bienvenido, Administrador</h1>
                    <p>{user?.nombre || user?.correo}</p>                </div>

                <h2 className="admin-section-title">Operación General</h2>
                {loading ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando estadísticas...</p>
                ) : (
                    <div className="admin-stats-grid">
                        <div className="admin-stat-card">
                            <span className="stat-label">Total viáticos</span>
                            <span className="stat-value">{stats.total}</span>
                        </div>
                        <div className="admin-stat-card admin-stat-card--pendiente">
                            <span className="stat-label">Pendientes</span>
                            <span className="stat-value">{stats.pendientes}</span>
                        </div>
                        <div className="admin-stat-card admin-stat-card--aprobado">
                            <span className="stat-label">Aprobados</span>
                            <span className="stat-value">{stats.aprobados}</span>
                        </div>
                        <div className="admin-stat-card admin-stat-card--rechazado">
                            <span className="stat-label">Rechazados</span>
                            <span className="stat-value">{stats.rechazados}</span>
                        </div>
                    </div>
                )}

                <h2 className="admin-section-title">Acciones rápidas</h2>

                <div className="admin-actions-grid">
                    <button
                        className="admin-action-btn"
                        onClick={() => navigate('/admin/personal')}
                    >
                        Personal
                    </button>
                </div>
            </main>
        </div>
    );
}