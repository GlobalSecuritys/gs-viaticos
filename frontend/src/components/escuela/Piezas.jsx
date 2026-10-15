/* Piezas visuales compartidas de la Escuela GSB (estética académica). */

export function Sello({ disponible }) {
    return (
        <span className={`esc-sello ${disponible ? 'esc-sello--ok' : 'esc-sello--sin'}`}>
            {disponible ? 'Módulo disponible' : 'Sin módulo'}
        </span>
    );
}

export function AccionesFicha({ disponible, onAbrir }) {
    return (
        <div className="esc-ficha-acciones">
            <Sello disponible={disponible} />
            {disponible && onAbrir && (
                <button type="button" className="esc-btn-abrir" onClick={onAbrir}>
                    Abrir lección →
                </button>
            )}
        </div>
    );
}

export function Leccion({ numero }) {
    return (
        <div className="esc-leccion" aria-label={`Ítem ${numero}`}>
            <span className="esc-leccion-label">Lección</span>
            <span className="esc-leccion-num">{numero}</span>
        </div>
    );
}

export function Calificacion({ valor }) {
    return (
        <span className={`esc-calif esc-calif--${valor}`} title="Calificación del jefe (escala 1 a 4)">
            {valor}<small>/4</small>
        </span>
    );
}

export function Cargando({ texto }) {
    return <div className="esc-cargando"><span className="esc-cargando-punto" />{texto}</div>;
}
