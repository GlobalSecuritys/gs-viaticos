import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './SeleccionModulo.css';

export default function TalentoHumano() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const isMasterAdmin = (user?.correo || '').trim().toLowerCase() === 'admin@gsbank.com';
    const nombreMostrado = user?.nombre || user?.correo || 'Super Administrador';

    return (
        <div className="sel-root">
            <header className="sel-header">
                <div className="sel-user-info">
                    <span className="sel-user-avatar">
                        {(user?.nombre || user?.correo || 'U')[0].toUpperCase()}
                    </span>
                    <div>
                        <strong className="sel-user-name">
                            {nombreMostrado}
                        </strong>
                        <span className="sel-user-email">
                            {user?.correo}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {user?.acceso_viaticos && (
                        <button
                            className="sel-logout-btn"
                            onClick={() => navigate('/seleccion-modulo')}
                        >
                            ← Cambiar módulo
                        </button>
                    )}
                    <button
                        className="sel-logout-btn"
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                    >
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <main className="sel-main">
                <div className="sel-title-box">
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                    <h1>Módulo de Talento Humano</h1>
                    <p>Espacio reservado para la gestión de colaboradores y personal de la organización.</p>
                </div>
            </main>
        </div>
    );
}
