import React from 'react';

/**
 * Paginador reutilizable para listas de inventario con limit/offset.
 */
export default function Paginador({ total = 0, limit = 25, offset = 0, onCambiarOffset, cargando = false }) {
    if (total <= limit && offset === 0) {
        return null; // No hace falta paginar si cabe todo en una página
    }

    const paginaActual = Math.floor(offset / limit) + 1;
    const totalPaginas = Math.max(1, Math.ceil(total / limit));
    const desde = total === 0 ? 0 : offset + 1;
    const hasta = Math.min(offset + limit, total);

    const puedeRetroceder = offset > 0 && !cargando;
    const puedeAvanzar = offset + limit < total && !cargando;

    function retroceder() {
        if (puedeRetroceder) {
            onCambiarOffset(Math.max(0, offset - limit));
        }
    }

    function avanzar() {
        if (puedeAvanzar) {
            onCambiarOffset(offset + limit);
        }
    }

    return (
        <div className="inv-paginador">
            <span className="inv-paginador-info">
                Mostrando <strong>{desde}</strong>–<strong>{hasta}</strong> de <strong>{total.toLocaleString('es-CO')}</strong> registros
            </span>

            <div className="inv-paginador-controles">
                <button
                    type="button"
                    className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                    onClick={retroceder}
                    disabled={!puedeRetroceder}
                    aria-label="Página anterior"
                >
                    ← Anterior
                </button>

                <span className="inv-paginador-pagina">
                    Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong>
                </span>

                <button
                    type="button"
                    className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                    onClick={avanzar}
                    disabled={!puedeAvanzar}
                    aria-label="Página siguiente"
                >
                    Siguiente →
                </button>
            </div>
        </div>
    );
}
