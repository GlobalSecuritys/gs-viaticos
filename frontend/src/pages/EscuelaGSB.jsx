import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ModuloEscuela from '../components/ModuloEscuela';
import { obtenerFalencias, obtenerMiFormacion } from '../services/escuela';
import { esEncargadoEscuela } from '../utils/permisos';
import { formatApiError } from '../utils/formatError';
import { irAtras } from '../utils/navigation';
import './AdminUsuarios.css';
import './EscuelaGSB.css';

const PLANTILLA_LABEL = {
    directivos: 'Directivos',
    contable: 'Contable',
    operaciones: 'Operaciones',
    tecnico: 'Técnico de planta',
};

function fmtFecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Iconos SVG inline (sin imágenes) ── */
function IconoBirrete({ size = 30 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 6 2 12.5 16 19l14-6.5L16 6Z" fill="currentColor" />
            <path d="M8 15.5v5.2c0 1.9 3.6 3.8 8 3.8s8-1.9 8-3.8v-5.2L16 19l-8-3.5Z" fill="currentColor" opacity=".78" />
            <path d="M28 13.5v7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="28" cy="22.3" r="1.6" fill="currentColor" />
        </svg>
    );
}

function IconoInsignia() {
    return (
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <circle cx="32" cy="27" r="17" fill="#ECFDF5" stroke="#10B981" strokeWidth="2.5" />
            <path d="m24.5 27.5 5 5 10-10.5" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 41.5 18 56l7-3.5 4 6 3.5-14M42 41.5 46 56l-7-3.5-4 6-3.5-14" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

function Sello({ disponible }) {
    return (
        <span className={`esc-sello ${disponible ? 'esc-sello--ok' : 'esc-sello--sin'}`}>
            {disponible ? 'Módulo disponible' : 'Sin módulo'}
        </span>
    );
}

function AccionesFicha({ disponible, onAbrir }) {
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

function Leccion({ numero }) {
    return (
        <div className="esc-leccion" aria-label={`Ítem ${numero}`}>
            <span className="esc-leccion-label">Lección</span>
            <span className="esc-leccion-num">{numero}</span>
        </div>
    );
}

function Calificacion({ valor }) {
    return (
        <span className={`esc-calif esc-calif--${valor}`} title="Calificación del jefe (escala 1 a 4)">
            {valor}<small>/4</small>
        </span>
    );
}

function Cargando({ texto }) {
    return <div className="esc-cargando"><span className="esc-cargando-punto" />{texto}</div>;
}

/* ── Mi formación: lo que ve cada trabajador sobre sí mismo ── */
function MiFormacion({ onAbrir }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        obtenerMiFormacion()
            .then(({ data }) => setDatos(data))
            .catch((err) => setError(formatApiError(err, 'No se pudo cargar tu formación.')));
    }, []);

    if (error) return <div className="esc-error">{error}</div>;
    if (!datos) return <Cargando texto="Cargando tu formación..." />;

    if (datos.falencias.length === 0) {
        return (
            <div className="esc-vacio">
                <IconoInsignia />
                <h3>No tienes aspectos por reforzar</h3>
                <p>
                    ¡Buen trabajo! En tus evaluaciones de desempeño completadas no hay ítems calificados con 1 o 2.
                    Si en una evaluación futura aparece alguno, aquí encontrarás la lección para reforzarlo.
                </p>
            </div>
        );
    }

    return (
        <>
            <p className="esc-intro">
                Estos son los aspectos de tu evaluación de desempeño que tu jefe calificó con 1 o 2.
                Cuando haya una lección para alguno, podrás abrirla desde aquí.
            </p>
            <div className="esc-fichas">
                {datos.falencias.map((f) => (
                    <article key={`${f.evaluacion_id}-${f.item_numero}`} className={`esc-ficha${f.modulo_disponible ? ' esc-ficha--ok' : ''}`}>
                        <Leccion numero={f.item_numero} />
                        <div className="esc-ficha-cuerpo">
                            <h3 className="esc-ficha-titulo">{f.item_texto}</h3>
                            <div className="esc-ficha-meta">
                                Calificación <Calificacion valor={f.calificacion} /> · {fmtFecha(f.fecha)}
                            </div>
                        </div>
                        <AccionesFicha disponible={f.modulo_disponible} onAbrir={() => onAbrir(f.clave_modulo)} />
                    </article>
                ))}
            </div>
        </>
    );
}

/* ── Falencias detectadas: panel de solo consulta de la encargada ── */
function PanelFalencias({ onAbrir }) {
    const [falencias, setFalencias] = useState(null);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [plantilla, setPlantilla] = useState('');
    const [soloSinModulo, setSoloSinModulo] = useState(false);

    useEffect(() => {
        obtenerFalencias()
            .then(({ data }) => setFalencias(data))
            .catch((err) => setError(formatApiError(err, 'No se pudieron cargar las falencias.')));
    }, []);

    const filtradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return (falencias || []).filter((f) =>
            (!q || f.trabajador.toLowerCase().includes(q) || f.item_texto.toLowerCase().includes(q)) &&
            (!plantilla || f.plantilla === plantilla) &&
            (!soloSinModulo || !f.modulo_disponible)
        );
    }, [falencias, busqueda, plantilla, soloSinModulo]);

    if (error) return <div className="esc-error">{error}</div>;
    if (!falencias) return <Cargando texto="Cargando falencias..." />;

    const trabajadores = new Set(falencias.map((f) => f.usuario_id)).size;
    const sinModulo = falencias.filter((f) => !f.modulo_disponible).length;

    return (
        <>
            <div className="esc-resumen">
                <div><strong>{falencias.length}</strong><span>falencias</span></div>
                <div><strong>{trabajadores}</strong><span>trabajadores</span></div>
                <div><strong>{sinModulo}</strong><span>sin módulo</span></div>
            </div>

            <div className="esc-toolbar">
                <div className="admin-search-wrap">
                    <span className="admin-search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Buscar por trabajador o ítem..."
                        className="admin-search-input"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                </div>
                <div className="esc-filtros">
                    <select className="admin-select" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
                        <option value="">Todas las plantillas</option>
                        {Object.entries(PLANTILLA_LABEL).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                        ))}
                    </select>
                    <label className="esc-check">
                        <input type="checkbox" checked={soloSinModulo} onChange={(e) => setSoloSinModulo(e.target.checked)} />
                        Solo sin módulo
                    </label>
                </div>
            </div>

            {filtradas.length === 0 ? (
                <div className="esc-vacio esc-vacio--compacto">
                    <p>{falencias.length === 0
                        ? 'Ninguna evaluación completada tiene ítems calificados con 1 o 2 por el jefe.'
                        : 'Ninguna falencia coincide con los filtros.'}</p>
                </div>
            ) : (
                <div className="esc-fichas">
                    {filtradas.map((f) => (
                        <article key={`${f.evaluacion_id}-${f.item_numero}`} className={`esc-ficha${f.modulo_disponible ? ' esc-ficha--ok' : ''}`}>
                            <Leccion numero={f.item_numero} />
                            <div className="esc-ficha-cuerpo">
                                <h3 className="esc-ficha-titulo">{f.item_texto}</h3>
                                <div className="esc-ficha-meta">
                                    <strong>{f.trabajador}</strong>
                                    {' · '}{PLANTILLA_LABEL[f.plantilla] || f.plantilla}
                                    {' · '}<Calificacion valor={f.calificacion} />
                                    {' · '}{fmtFecha(f.fecha)}
                                </div>
                            </div>
                            <AccionesFicha disponible={f.modulo_disponible} onAbrir={() => onAbrir(f.clave_modulo)} />
                        </article>
                    ))}
                </div>
            )}
        </>
    );
}

export default function EscuelaGSB() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const esEncargada = esEncargadoEscuela(user);
    const [tab, setTab] = useState(esEncargada ? 'falencias' : 'formacion');
    const [moduloAbierto, setModuloAbierto] = useState(null);

    return (
        <div className="esc-root">
            <div className="esc-container">
                <button className="admin-back-btn" onClick={() => irAtras(navigate, '/seleccion-modulo')}>
                    ← Volver
                </button>

                <header className="esc-header">
                    <div className="esc-emblema"><IconoBirrete /></div>
                    <div>
                        <span className="esc-kicker">Proceso Administrativo · Formación continua</span>
                        <h1 className="esc-titulo">Escuela GSB</h1>
                        <p className="esc-proposito">
                            Formación a partir de la evaluación de desempeño AD-FR-06: cada aspecto por reforzar tiene su lección.
                        </p>
                    </div>
                </header>

                {esEncargada && !moduloAbierto && (
                    <nav className="esc-tabs" aria-label="Secciones de la Escuela">
                        <button
                            type="button"
                            className={`esc-tab${tab === 'falencias' ? ' esc-tab--activa' : ''}`}
                            onClick={() => setTab('falencias')}
                        >
                            Falencias detectadas
                        </button>
                        <button
                            type="button"
                            className={`esc-tab${tab === 'formacion' ? ' esc-tab--activa' : ''}`}
                            onClick={() => setTab('formacion')}
                        >
                            Mi formación
                        </button>
                    </nav>
                )}

                <section className="esc-hoja">
                    {moduloAbierto ? (
                        <ModuloEscuela clave={moduloAbierto} onVolver={() => setModuloAbierto(null)} />
                    ) : esEncargada && tab === 'falencias' ? (
                        <PanelFalencias onAbrir={setModuloAbierto} />
                    ) : (
                        <MiFormacion onAbrir={setModuloAbierto} />
                    )}
                </section>
            </div>
        </div>
    );
}
