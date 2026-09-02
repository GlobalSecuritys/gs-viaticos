import { useNavigate, useLocation } from 'react-router-dom';
import { MODULES_CONFIG } from '../../config/modulesConfig';
import logoGSB from '../../assets/logo-gsb.png';
import './ModuleSidebar.css';

export default function ModuleSidebar({
  moduleId,
  activeItemId,
  onSelectItem,
  isOpen,
  onClose,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const moduleConfig = MODULES_CONFIG.find((m) => m.id === moduleId);
  const navItems = moduleConfig?.sidebarNav || [];

  const handleItemClick = (item) => {
    if (onSelectItem) {
      onSelectItem(item.id);
    }
    if (item.action) {
      item.action();
    } else if (item.path) {
      navigate(item.path);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      <aside className={`ms-sidebar ${isOpen ? 'ms-sidebar--open' : ''}`}>
        {/* ── HEADER DEL MÓDULO ── */}
        <div className="ms-sidebar-header">
          <div className="ms-module-icon-wrap" style={{ borderColor: moduleConfig?.color }}>
            <img src={logoGSB} alt="GSB" className="ms-sidebar-logo" />
          </div>
          <div className="ms-module-title-box">
            <span className="ms-module-badge" style={{ backgroundColor: `${moduleConfig?.color}25`, color: moduleConfig?.color }}>
              {moduleConfig?.badge || 'MÓDULO'}
            </span>
            <h3 className="ms-module-title">{moduleConfig?.name || 'Sistema GSB'}</h3>
          </div>
        </div>

        {/* ── NAVEGACIÓN CONTEXTUAL DEL MÓDULO ── */}
        <div className="ms-sidebar-section-label">Navegación del Módulo</div>
        <nav className="ms-sidebar-nav">
          {navItems.map((item) => {
            const isCurrentActive =
              activeItemId === item.id ||
              (item.path && location.pathname === item.path && !activeItemId);

            return (
              <button
                key={item.id}
                type="button"
                className={`ms-nav-item ${isCurrentActive ? 'ms-nav-item--active' : ''}`}
                onClick={() => handleItemClick(item)}
              >
                <span className="ms-nav-icon">{item.icon}</span>
                <span className="ms-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── VOLVER AL HUB & FOOTER ── */}
        <div className="ms-sidebar-footer">
          <button
            type="button"
            className="ms-btn-return-hub"
            onClick={() => navigate('/seleccion-modulo')}
            title="Regresar a la selección de módulos"
          >
            <span className="ms-hub-icon">🔲</span>
            <div className="ms-hub-text">
              <strong>Hub de Módulos</strong>
              <small>Cambiar de sistema</small>
            </div>
          </button>

          <div className="ms-trust-badge">
            <img src={logoGSB} alt="Shield" className="ms-trust-icon" />
            <div className="ms-trust-text">
              <span>Seguridad</span>
              <span>Tecnología</span>
              <span>Confianza</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop en móviles */}
      {isOpen && <div className="ms-sidebar-backdrop" onClick={onClose} />}
    </>
  );
}
