import React from 'react';
import { useNavigate } from 'react-router-dom';
import { irAtras } from '../utils/navigation';
import logoGSB from '../assets/logo-gsb.png';
import './SeccionEnConstruccion.css';

export default function SeccionEnConstruccion({
  titulo = 'Módulo en Construcción',
  subtitulo = 'Módulo del Ecosistema GSB',
  icono = '🚀',
  grupoPadre = 'Operaciones',
  descripcion = 'Esta sección se encuentra actualmente en fase de desarrollo y estará disponible muy pronto.',
  colorTheme = 'blue',
}) {
  const navigate = useNavigate();

  return (
    <div className="sec-const-root">
      {/* ── HEADER SUPERIOR ── */}
      <header className="sec-const-header">
        <div className="sec-const-header-left">
          <div className="sec-const-logo-halo" onClick={() => navigate('/seleccion-modulo')} style={{ cursor: 'pointer' }}>
            <img src={logoGSB} alt="GSB Shield" className="sec-const-logo-img" />
          </div>
          <div>
            <h1 className="sec-const-header-title">{titulo.toUpperCase()}</h1>
            <span className="sec-const-header-sub">PROCESO {grupoPadre.toUpperCase()} · GLOBAL SECURITY BANK</span>
          </div>
        </div>

        <div className="sec-const-header-right">
          <button
            type="button"
            className="sec-const-btn-back"
            onClick={() => irAtras(navigate, '/seleccion-modulo')}
            title="Regresar a la página anterior"
          >
            ← Volver
          </button>
        </div>
      </header>

      {/* ── CONTENIDO PRINCIPAL CENTRADO ── */}
      <main className="sec-const-main">
        <div className={`sec-const-card sec-const-card--${colorTheme}`}>
          <div className="sec-const-icon-wrap">
            <span className="sec-const-icon">{icono}</span>
            <div className="sec-const-pulse-ring" />
          </div>

          <div className="sec-const-badge">
            <span className="sec-const-badge-dot" />
            MÓDULO EN DESARROLLO
          </div>

          <h2 className="sec-const-title">{titulo}</h2>
          <p className="sec-const-subtitulo">{subtitulo}</p>

          <p className="sec-const-desc">
            {descripcion}
          </p>

          <div className="sec-const-highlight-box">
            <span className="sec-const-star-icon">✨</span>
            <div className="sec-const-highlight-text">
              <strong>Muy pronto</strong>
              <span>Estamos preparando nuevas herramientas y funcionalidades para este apartado.</span>
            </div>
          </div>

          <div className="sec-const-actions">
            <button
              type="button"
              className="sec-const-btn-primary"
              onClick={() => irAtras(navigate, '/seleccion-modulo')}
            >
              ← Volver al Mapa de Procesos
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
