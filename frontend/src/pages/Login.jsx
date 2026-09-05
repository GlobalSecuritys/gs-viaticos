import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './Login.css';
import logoGSB from '../assets/logo-gsb.png';

/* ──────────────────────────────────────────────────────────
   Sub-componente: Modal de Recuperación de Contraseña (3 pasos)
   ────────────────────────────────────────────────────────── */
function RecuperarPasswordModal({ onClose }) {
  // Paso 1 → ingresar correo/usuario
  // Paso 2 → ingresar código OTP
  // Paso 3 → nueva contraseña
  // Paso 4 → éxito
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [correoEnviado, setCorreoEnviado] = useState(''); // correo normalizado retornado en paso 1

  // Campos controlados
  const [cuentaInput, setCuentaInput] = useState('');
  const [codigoInput, setCodigoInput] = useState('');
  const [nuevoPass, setNuevoPass] = useState('');
  const [confirmarPass, setConfirmarPass] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Referencia para el primer input de cada paso
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [paso]);

  // ── Paso 1: Solicitar código ──────────────────────────────
  async function handleSolicitarReset(e) {
    e.preventDefault();
    setError('');
    if (!cuentaInput.trim()) {
      setError('Ingresa tu correo o código de empleado.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/solicitar-reset', {
        correo_o_usuario: cuentaInput.trim(),
      });
      // Guardamos lo que el usuario ingresó para enviarlo como "correo" en pasos siguientes
      setCorreoEnviado(cuentaInput.trim().toLowerCase());
      setPaso(2);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'No se pudo procesar la solicitud. Intenta de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Paso 2: Verificar código ──────────────────────────────
  async function handleVerificarCodigo(e) {
    e.preventDefault();
    setError('');
    if (codigoInput.trim().length !== 6) {
      setError('El código debe tener exactamente 6 dígitos.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/verificar-codigo', {
        correo: correoEnviado,
        codigo: codigoInput.trim(),
      });
      setPaso(3);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Código incorrecto o expirado. Verifica e intenta de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Paso 3: Cambiar contraseña ────────────────────────────
  async function handleCambiarPassword(e) {
    e.preventDefault();
    setError('');
    if (nuevoPass.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (nuevoPass !== confirmarPass) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/cambiar-password', {
        correo: correoEnviado,
        codigo: codigoInput.trim(),
        nueva_password: nuevoPass,
      });
      setPaso(4);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'No se pudo actualizar la contraseña. Intenta de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Reenviar código ────────────────────────────────────────
  async function handleReenviar() {
    setError('');
    setCodigoInput('');
    setLoading(true);
    try {
      await api.post('/auth/solicitar-reset', {
        correo_o_usuario: cuentaInput.trim(),
      });
      setError(''); // limpiar
    } catch {
      setError('No se pudo reenviar el código. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const pasoLabel = ['', 'Identificar cuenta', 'Verificar código', 'Nueva contraseña', '¡Listo!'];

  return (
    <div className="rp-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rp-modal" role="dialog" aria-modal="true" aria-label="Recuperar contraseña">

        {/* ── Header ── */}
        <div className="rp-header">
          <div className="rp-header-icon">🔐</div>
          <div>
            <h2 className="rp-title">Recuperar contraseña</h2>
            <p className="rp-subtitle">
              {paso < 4 ? `Paso ${paso} de 3 — ${pasoLabel[paso]}` : pasoLabel[4]}
            </p>
          </div>
          <button className="rp-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* ── Stepper ── */}
        {paso < 4 && (
          <div className="rp-stepper">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`rp-step ${n < paso ? 'done' : n === paso ? 'active' : ''}`}>
                <span className="rp-step-num">{n < paso ? '✓' : n}</span>
                <span className="rp-step-label">{pasoLabel[n]}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="rp-error" role="alert">
            <span>⚠</span> {error}
          </div>
        )}

        {/* ── Contenido por paso ── */}
        <div className="rp-body">

          {/* ── PASO 1 ── */}
          {paso === 1 && (
            <form onSubmit={handleSolicitarReset} className="rp-form">
              <p className="rp-desc">
                Ingresa tu correo electrónico o código de empleado. Si la cuenta tiene permisos
                de administrador, recibirás el código de verificación en el buzón autorizado.
              </p>
              <div className="form-group">
                <label htmlFor="rp-cuenta">Correo o código de empleado</label>
                <input
                  id="rp-cuenta"
                  ref={inputRef}
                  type="text"
                  value={cuentaInput}
                  onChange={(e) => setCuentaInput(e.target.value)}
                  placeholder="usuario@gsbank.com  ó  EMP-001"
                  autoComplete="off"
                  required
                />
              </div>
              <button type="submit" className="rp-btn-primary" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar código de verificación →'}
              </button>
            </form>
          )}

          {/* ── PASO 2 ── */}
          {paso === 2 && (
            <form onSubmit={handleVerificarCodigo} className="rp-form">
              <p className="rp-desc">
                Se ha enviado un código de 6 dígitos al buzón autorizado{' '}
                <strong>tecnicoplantagsb@gsbsecurity.com</strong>.
                Ingrésalo a continuación.
              </p>
              <div className="form-group">
                <label htmlFor="rp-codigo">Código de 6 dígitos</label>
                <input
                  id="rp-codigo"
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="● ● ● ● ● ●"
                  className="rp-code-input"
                  autoComplete="one-time-code"
                  required
                />
              </div>
              <button type="submit" className="rp-btn-primary" disabled={loading}>
                {loading ? 'Verificando…' : 'Verificar código →'}
              </button>
              <button
                type="button"
                className="rp-btn-ghost"
                onClick={handleReenviar}
                disabled={loading}
              >
                ↺ Reenviar código
              </button>
              <button
                type="button"
                className="rp-btn-ghost"
                onClick={() => { setError(''); setPaso(1); }}
              >
                ← Volver
              </button>
            </form>
          )}

          {/* ── PASO 3 ── */}
          {paso === 3 && (
            <form onSubmit={handleCambiarPassword} className="rp-form">
              <p className="rp-desc">
                Define tu nueva contraseña. Debe tener al menos 8 caracteres.
              </p>
              <div className="form-group">
                <label htmlFor="rp-new-pass">Nueva contraseña</label>
                <div className="rp-pass-wrap">
                  <input
                    id="rp-new-pass"
                    ref={inputRef}
                    type={showPass ? 'text' : 'password'}
                    value={nuevoPass}
                    onChange={(e) => setNuevoPass(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="rp-eye"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="rp-confirm-pass">Confirmar contraseña</label>
                <div className="rp-pass-wrap">
                  <input
                    id="rp-confirm-pass"
                    type={showPass ? 'text' : 'password'}
                    value={confirmarPass}
                    onChange={(e) => setConfirmarPass(e.target.value)}
                    placeholder="Repetir contraseña"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              {/* Indicador de fuerza básico */}
              {nuevoPass.length > 0 && (
                <div className="rp-strength">
                  <div
                    className={`rp-strength-bar ${
                      nuevoPass.length >= 12 ? 'strong' :
                      nuevoPass.length >= 8 ? 'medium' : 'weak'
                    }`}
                    style={{ width: `${Math.min(100, (nuevoPass.length / 14) * 100)}%` }}
                  />
                  <span className="rp-strength-label">
                    {nuevoPass.length < 8 ? 'Muy corta' :
                     nuevoPass.length < 12 ? 'Aceptable' : 'Fuerte'}
                  </span>
                </div>
              )}
              <button
                type="submit"
                className="rp-btn-primary"
                disabled={loading || nuevoPass.length < 8 || nuevoPass !== confirmarPass}
              >
                {loading ? 'Guardando…' : 'Cambiar contraseña →'}
              </button>
            </form>
          )}

          {/* ── PASO 4: Éxito ── */}
          {paso === 4 && (
            <div className="rp-success">
              <div className="rp-success-icon">✅</div>
              <h3>¡Contraseña actualizada!</h3>
              <p>
                Tu contraseña se cambió correctamente.
                Ahora puedes iniciar sesión con tus nuevas credenciales.
              </p>
              <button className="rp-btn-primary" onClick={onClose}>
                Ir al inicio de sesión →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Componente principal: Página de Login
   ────────────────────────────────────────────────────────── */
export default function Login() {
  const { login } = useAuth();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRecuperar, setShowRecuperar] = useState(false);

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

            {/* ── Link de recuperación ── */}
            <div className="login-forgot">
              <button
                type="button"
                id="btn-forgot-password"
                className="login-forgot-btn"
                onClick={() => setShowRecuperar(true)}
              >
                ¿Olvidaste tu contraseña?
              </button>
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

      {/* ── Modal de recuperación ── */}
      {showRecuperar && (
        <RecuperarPasswordModal onClose={() => setShowRecuperar(false)} />
      )}
    </div>
  );
}