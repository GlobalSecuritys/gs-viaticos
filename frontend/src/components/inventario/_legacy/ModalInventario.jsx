import { etiquetaEstado } from '../../services/inventario';

/**
 * Colores de estado de despacho, tomados de la paleta de estados que ya usa la
 * app (estado-badge--activo / --inactivo y los tokens --color-pendiente y
 * --color-accent-blue de index.css). Ver Inventario.css.
 */
export function EstadoBadge({ estado }) {
    const clase = estado === 'dañado' ? 'danado' : estado;
    return (
        <span className={`estado-badge sgc-inv-estado sgc-inv-estado--${clase}`}>
            {etiquetaEstado(estado)}
        </span>
    );
}

/** Contenedor de modal con la misma estructura que el resto del módulo. */
export default function ModalInventario({ titulo, subtitulo, onCerrar, ocupado = false, ancho = false, children }) {
    return (
        <div className="sgc-inv-modal-overlay" onClick={() => !ocupado && onCerrar()}>
            <div
                className={`sgc-inv-modal ${ancho ? 'sgc-inv-modal--ancho' : ''}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="sgc-inv-modal-head">
                    <div>
                        <h2 className="sgc-inv-modal-title">{titulo}</h2>
                        {subtitulo && <p className="sgc-inv-modal-sub">{subtitulo}</p>}
                    </div>
                    <button
                        type="button"
                        className="sgc-inv-modal-cerrar"
                        onClick={onCerrar}
                        disabled={ocupado}
                        aria-label="Cerrar"
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

/** Confirmación simple para eliminar. */
export function ModalConfirmar({ titulo, mensaje, onConfirmar, onCerrar, ocupado, error }) {
    return (
        <ModalInventario titulo={titulo} onCerrar={onCerrar} ocupado={ocupado}>
            <p className="sgc-inv-modal-sub">{mensaje}</p>
            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}
            <div className="sgc-inv-modal-acciones">
                <button type="button" className="sgc-inv-btn sgc-inv-btn--ghost" onClick={onCerrar} disabled={ocupado}>
                    Cancelar
                </button>
                <button type="button" className="sgc-inv-btn sgc-inv-btn--peligro" onClick={onConfirmar} disabled={ocupado}>
                    {ocupado ? 'Eliminando…' : 'Eliminar'}
                </button>
            </div>
        </ModalInventario>
    );
}
