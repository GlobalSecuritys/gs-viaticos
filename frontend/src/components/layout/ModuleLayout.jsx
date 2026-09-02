import { useState } from 'react';
import GlobalHeader from './GlobalHeader';
import ModuleSidebar from './ModuleSidebar';
import './ModuleLayout.css';

export default function ModuleLayout({
  moduleId,
  activeItemId,
  onSelectItem,
  children,
  customSidebar,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="ml-root">
      {/* ── HEADER GLOBAL DEL ECOSISTEMA ── */}
      <GlobalHeader
        currentModuleId={moduleId}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* ── CUERPO: SIDEBAR CONTEXTUAL + CONTENIDO ── */}
      <div className="ml-body">
        {customSidebar ? (
          customSidebar({
            isOpen: sidebarOpen,
            onClose: () => setSidebarOpen(false),
          })
        ) : (
          <ModuleSidebar
            moduleId={moduleId}
            activeItemId={activeItemId}
            onSelectItem={onSelectItem}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        <main className="ml-content">
          {children}
        </main>
      </div>
    </div>
  );
}
