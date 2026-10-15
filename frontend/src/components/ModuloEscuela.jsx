/**
 * ModuloEscuela.jsx
 * Visor de un módulo didáctico de la Escuela GSB (contenido de escuela_modulos.json).
 * Bloques: texto (plano, sin HTML), enlace, video (YouTube/Vimeo incrustado) y pdf
 * (archivos servidos desde frontend/public/escuela/).
 */
import { useEffect, useState } from 'react';
import { obtenerModulo } from '../services/escuela';
import { formatApiError } from '../utils/formatError';

function urlSegura(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

function urlEmbedVideo(url) {
    const segura = urlSegura(url);
    if (!segura) return null;
    const yt = segura.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
    if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
    const vimeo = segura.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return null;
}

function rutaPdf(archivo) {
    return typeof archivo === 'string' && archivo.startsWith('/escuela/') && !archivo.includes('..')
        ? archivo
        : null;
}

function Bloque({ bloque }) {
    const titulo = bloque.titulo ? <h4 className="esc-bloque-titulo">{bloque.titulo}</h4> : null;

    if (bloque.tipo === 'texto') {
        const parrafos = String(bloque.contenido || '').split(/\n\s*\n/).filter((p) => p.trim());
        return (
            <section className="esc-bloque">
                {titulo}
                {parrafos.map((p, i) => <p key={i} className="esc-bloque-texto">{p}</p>)}
            </section>
        );
    }

    if (bloque.tipo === 'video') {
        const embed = urlEmbedVideo(bloque.url);
        const segura = urlSegura(bloque.url);
        return (
            <section className="esc-bloque">
                {titulo}
                {embed ? (
                    <div className="esc-video">
                        <iframe
                            src={embed}
                            title={bloque.titulo || 'Video'}
                            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                ) : segura ? (
                    <a href={segura} target="_blank" rel="noopener noreferrer" className="esc-bloque-link">▶ Ver video</a>
                ) : null}
            </section>
        );
    }

    if (bloque.tipo === 'enlace') {
        const segura = urlSegura(bloque.url);
        if (!segura) return null;
        return (
            <section className="esc-bloque">
                {titulo}
                {bloque.descripcion && <p className="esc-bloque-texto">{bloque.descripcion}</p>}
                <a href={segura} target="_blank" rel="noopener noreferrer" className="esc-bloque-link">🔗 Abrir enlace</a>
            </section>
        );
    }

    if (bloque.tipo === 'pdf') {
        const ruta = rutaPdf(bloque.archivo);
        if (!ruta) return null;
        return (
            <section className="esc-bloque">
                {titulo}
                <a href={ruta} target="_blank" rel="noopener noreferrer" className="esc-bloque-link">📄 Abrir PDF</a>
            </section>
        );
    }

    return null;
}

export default function ModuloEscuela({ clave, onVolver }) {
    const [modulo, setModulo] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        obtenerModulo(clave)
            .then(({ data }) => setModulo(data.contenido))
            .catch((err) => setError(formatApiError(err, 'No se pudo abrir el módulo.')));
    }, [clave]);

    return (
        <div className="esc-modulo">
            <button type="button" className="admin-back-btn" onClick={onVolver}>← Volver</button>

            {error && <div className="esc-error">{error}</div>}
            {!error && !modulo && <div className="admin-loading-state"><p>Cargando módulo...</p></div>}

            {modulo && (
                <>
                    <h2 className="esc-modulo-titulo">{modulo.titulo}</h2>
                    {modulo.duracion_min ? (
                        <span className="esc-modulo-duracion">⏱ {modulo.duracion_min} min</span>
                    ) : null}
                    {modulo.objetivo && (
                        <div className="esc-modulo-objetivo">
                            <strong>Objetivo:</strong> {modulo.objetivo}
                        </div>
                    )}
                    {(modulo.bloques || []).map((b, i) => <Bloque key={i} bloque={b} />)}
                </>
            )}
        </div>
    );
}
