import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Login.css';
import logoGSB from '../assets/logo-gsb.png';

export default function Login() {
  const { login } = useAuth();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(correo, password);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al iniciar sesión. Verifique sus credenciales.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo">
            {/* Aquí reemplazamos el SVG por tu logo importado */}
            <img src={logoGSB} alt="Global Security Bank" className="login-logo-img" />
          </div>
          <div>
            <h1 className="login-brand-name">GLOBAL SECURITY</h1>
            <p className="login-brand-sub">Sistema de Viáticos y Gastos Operativos</p>
          </div>
        </div>
        <ul className="login-features">
          <li>
            <span className="feature-icon">✓</span>
            Registro y aprobación de viáticos
          </li>
          <li>
            <span className="feature-icon">✓</span>
            Trazabilidad completa por usuario
          </li>
          <li>
            <span className="feature-icon">✓</span>
            Gestión de gastos operativos
          </li>
        </ul>
      </div>

      <div className="login-right">
        <div className="login-card">
          <h2 className="login-card-title">Iniciar sesión</h2>
          <p className="login-card-sub">Ingrese sus credenciales para continuar</p>

          {error && (
            <div className="login-error" role="alert">
              <span>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                id="correo"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="usuario@globalsecurity.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Iniciando sesión (despertando servidor)…' : 'Ingresar al sistema'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}