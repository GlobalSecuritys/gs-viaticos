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

const RECURSO = {
    enlace: { etiqueta: 'Enlace', icono: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /> },
    video: { etiqueta: 'Video', icono: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m10 9 5 3-5 3V9Z" fill="currentColor" /></> },
    pdf: { etiqueta: 'Documento PDF', icono: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></> },
};

function Recurso({ tipo, titulo, children }) {
    const meta = RECURSO[tipo];
    return (
        <section className={`esc-recurso esc-recurso--${tipo}`}>
            <div className="esc-recurso-icono">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {meta.icono}
                </svg>
            </div>
            <div className="esc-recurso-cuerpo">
                <span className="esc-recurso-tipo">{meta.etiqueta}</span>
                {titulo && <h4 className="esc-recurso-titulo">{titulo}</h4>}
                {children}
            </div>
        </section>
    );
}

function Bloque({ bloque }) {
    if (bloque.tipo === 'texto') {
        const parrafos = String(bloque.contenido || '').split(/\n\s*\n/).filter((p) => p.trim());
        return (
            <section className="esc-lectura">
                {bloque.titulo && <h3 className="esc-lectura-titulo">{bloque.titulo}</h3>}
                {parrafos.map((p, i) => <p key={i}>{p}</p>)}
            </section>
        );
    }

    if (bloque.tipo === 'video') {
        const embed = urlEmbedVideo(bloque.url);
        const segura = urlSegura(bloque.url);
        if (!embed && !segura) return null;
        return (
            <Recurso tipo="video" titulo={bloque.titulo}>
                {embed ? (
                    <div className="esc-video">
                        <iframe
                            src={embed}
                            title={bloque.titulo || 'Video'}
                            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                ) : (
                    <a href={segura} target="_blank" rel="noopener noreferrer" className="esc-recurso-link">Ver video →</a>
                )}
            </Recurso>
        );
    }

    if (bloque.tipo === 'enlace') {
        const segura = urlSegura(bloque.url);
        if (!segura) return null;
        return (
            <Recurso tipo="enlace" titulo={bloque.titulo}>
                {bloque.descripcion && <p className="esc-recurso-desc">{bloque.descripcion}</p>}
                <a href={segura} target="_blank" rel="noopener noreferrer" className="esc-recurso-link">Abrir enlace →</a>
            </Recurso>
        );
    }

    if (bloque.tipo === 'pdf') {
        const ruta = rutaPdf(bloque.archivo);
        if (!ruta) return null;
        return (
            <Recurso tipo="pdf" titulo={bloque.titulo}>
                <a href={ruta} target="_blank" rel="noopener noreferrer" className="esc-recurso-link">Abrir PDF →</a>
            </Recurso>
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
            <button type="button" className="esc-btn-volver-lista" onClick={onVolver}>← Volver a la lista</button>

            {error && <div className="esc-error">{error}</div>}
            {!error && !modulo && <div className="esc-cargando"><span className="esc-cargando-punto" />Cargando lección...</div>}

            {modulo && (
                <article className="esc-modulo-cuerpo">
                    <span className="esc-kicker">Lección · Módulo de formación</span>
                    <h2 className="esc-modulo-titulo">{modulo.titulo}</h2>
                    {modulo.duracion_min ? (
                        <span className="esc-modulo-duracion">Lectura de {modulo.duracion_min} min aprox.</span>
                    ) : null}
                    {modulo.objetivo && (
                        <div className="esc-modulo-objetivo">
                            <span>Objetivo de aprendizaje</span>
                            {modulo.objetivo}
                        </div>
                    )}
                    {(modulo.bloques || []).map((b, i) => <Bloque key={i} bloque={b} />)}
                </article>
            )}
        </div>
    );
}
