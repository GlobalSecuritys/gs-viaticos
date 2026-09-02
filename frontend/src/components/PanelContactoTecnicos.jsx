import { TECNICOS_CONTACTO } from '../config/tecnicosContacto';
import './PanelContactoTecnicos.css';

/**
 * Ícono SVG de WhatsApp (monocromo, se colorea con CSS)
 */
function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="wap-icon"
    >
      <path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12a11.93 11.93 0 0 0 1.64 6.06L0 24l6.1-1.6A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12a11.93 11.93 0 0 0-3.48-8.52zM12 21.9a9.88 9.88 0 0 1-5.04-1.38l-.36-.22-3.72.97.99-3.63-.23-.37A9.89 9.89 0 0 1 2.1 12C2.1 6.53 6.53 2.1 12 2.1S21.9 6.53 21.9 12 17.47 21.9 12 21.9zm5.44-7.38c-.3-.15-1.76-.87-2.03-.96-.27-.1-.47-.15-.66.15s-.76.96-.93 1.16c-.17.2-.34.22-.64.07a8.1 8.1 0 0 1-2.38-1.47 8.9 8.9 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.91-2.2-.24-.57-.48-.5-.66-.5h-.56c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
    </svg>
  );
}

/**
 * PanelContactoTecnicos
 *
 * Panel lateral fijo con accesos directos de WhatsApp a los técnicos de campo.
 * Solo visible para el Super Admin (Admin Master) en la pantalla Hub.
 *
 * Cada tarjeta abre `https://wa.me/<telefono>` en una pestaña nueva.
 */
export default function PanelContactoTecnicos() {
  return (
    <aside className="pct-aside" aria-label="Contacto rápido técnicos">
      {/* Encabezado del panel */}
      <div className="pct-header">
        <span className="pct-header-icon">
          <WhatsAppIcon />
        </span>
        <div className="pct-header-text">
          <span className="pct-header-title">Técnicos</span>
          <span className="pct-header-sub">Contacto directo</span>
        </div>
        <span className="pct-header-badge">{TECNICOS_CONTACTO.length}</span>
      </div>

      {/* Lista de técnicos */}
      <div className="pct-list">
        {TECNICOS_CONTACTO.map((tecnico) => (
          <a
            key={tecnico.telefono}
            href={`https://wa.me/${tecnico.telefono}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pct-card"
            title={`Abrir chat de WhatsApp con ${tecnico.nombre}`}
            aria-label={`Contactar a ${tecnico.nombre} por WhatsApp`}
          >
            {/* Avatar inicial */}
            <span className="pct-avatar">
              {tecnico.nombre[0].toUpperCase()}
            </span>

            {/* Nombre */}
            <span className="pct-name">{tecnico.nombre}</span>

            {/* Ícono WhatsApp */}
            <span className="pct-wa-icon" aria-hidden="true">
              <WhatsAppIcon />
            </span>
          </a>
        ))}
      </div>

      {/* Footer del panel */}
      <div className="pct-footer">
        <span>wa.me · abre en nueva pestaña</span>
      </div>
    </aside>
  );
}
