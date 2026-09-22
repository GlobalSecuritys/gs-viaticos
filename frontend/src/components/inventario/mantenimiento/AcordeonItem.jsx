import React from 'react';
import './Acordeon.css';

/**
 * Acordeón reutilizable para listas de inventario.
 * Por defecto muestra solo el nombre/título + badges + flecha (chevron).
 * Al hacer clic, rota 90° y despliega el detalle con transición suave.
 *
 * Accesibilidad:
 * - aria-expanded
 * - aria-controls
 * - Teclado: Enter/Espacio para conmutar, Escape para cerrar.
 */
export default function AcordeonItem({
    id,
    abierto = false,
    onToggle,
    titulo,
    subtitulo,
    badges,
    acciones,
    children,
    className = '',
}) {
    const contenidoId = `acordeon-panel-${id}`;

    function handleKeyDown(e) {
        if (e.key === 'Escape' && abierto) {
            e.stopPropagation();
            onToggle(false);
        }
    }

    return (
        <div
            className={`inv-acordeon-item ${abierto ? 'inv-acordeon-item--abierto' : ''} ${className}`}
            onKeyDown={handleKeyDown}
        >
            <button
                type="button"
                className="inv-acordeon-header"
                onClick={() => onToggle(!abierto)}
                aria-expanded={abierto}
                aria-controls={contenidoId}
            >
                <div className="inv-acordeon-izq">
                    <div className="inv-acordeon-titulo-fila">
                        <span className="inv-acordeon-titulo">{titulo}</span>
                    </div>
                    {subtitulo && <span className="inv-acordeon-subtitulo">{subtitulo}</span>}
                </div>

                <div className="inv-acordeon-der">
                    {badges && <div className="inv-acordeon-badges">{badges}</div>}

                    {acciones && (
                        <div className="inv-acordeon-acciones" onClick={(e) => e.stopPropagation()}>
                            {acciones}
                        </div>
                    )}

                    <span
                        className={`inv-acordeon-chevron ${abierto ? 'inv-acordeon-chevron--rotado' : ''}`}
                        aria-hidden="true"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </span>
                </div>
            </button>

            <div
                id={contenidoId}
                className={`inv-acordeon-panel ${abierto ? 'inv-acordeon-panel--expandido' : ''}`}
                role="region"
                aria-labelledby={`acordeon-header-${id}`}
            >
                <div className="inv-acordeon-contenido">
                    {abierto && <div className="inv-acordeon-body">{children}</div>}
                </div>
            </div>
        </div>
    );
}
