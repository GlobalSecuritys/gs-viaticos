import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { obtenerFalencias, obtenerMiFormacion } from '../services/escuela';
import { esEncargadoEscuela } from '../utils/permisos';
import { formatApiError } from '../utils/formatError';
import { irAtras } from '../utils/navigation';
import './AdminDashboard.css';
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

function EstadoModulo({ disponible }) {
    return (
        <span className={`esc-estado ${disponible ? 'esc-estado--ok' : 'esc-estado--sin'}`}>
            {disponible ? 'Módulo disponible' : 'Sin módulo'}
        </span>
    );
}

function Calificacion({ valor }) {
    return <span className={`esc-calif esc-calif--${valor}`}>{valor}</span>;
}

/* ── Mi formación: lo que ve cada trabajador sobre sí mismo ── */
function MiFormacion() {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        obtenerMiFormacion()
            .then(({ data }) => setDatos(data))
            .catch((err) => setError(formatApiError(err, 'No se pudo cargar tu formación.')));
    }, []);

    if (error) return <div className="esc-error">{error}</div>;
    if (!datos) return <div className="admin-loading-state"><p>Cargando tu formación...</p></div>;

    if (datos.falencias.length === 0) {
        return (
            <div className="esc-vacio">
                <span className="esc-vacio-icono">🎓</span>
                <h3>No tienes aspectos por reforzar</h3>
                <p>
                    En tus evaluaciones de desempeño completadas no hay ítems calificados con 1 o 2.
                    Si en una evaluación futura aparece alguno, aquí verás el módulo de formación correspondiente.
                </p>
            </div>
        );
    }

    return (
        <>
            <p className="esc-intro">
                Estos son los aspectos de tu evaluación de desempeño que tu jefe calificó con 1 o 2.
                Cuando haya un módulo de formación para alguno, aparecerá como disponible.
            </p>
            <div className="esc-lista">
                {datos.falencias.map((f) => (
                    <div key={`${f.evaluacion_id}-${f.item_numero}`} className="esc-item">
                        <div className="esc-item-num">{f.item_numero}</div>
                        <div className="esc-item-cuerpo">
                            <div className="esc-item-texto">{f.item_texto}</div>
                            <div className="esc-item-meta">
                                Calificación <Calificacion valor={f.calificacion} /> · {fmtFecha(f.fecha)}
                            </div>
                        </div>
                        <EstadoModulo disponible={f.modulo_disponible} />
                    </div>
                ))}
            </div>
        </>
    );
}

/* ── Falencias detectadas: panel de solo consulta de la encargada ── */
function PanelFalencias() {
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
    if (!falencias) return <div className="admin-loading-state"><p>Cargando falencias...</p></div>;

    const trabajadores = new Set(falencias.map((f) => f.usuario_id)).size;
    const sinModulo = falencias.filter((f) => !f.modulo_disponible).length;

    return (
        <>
            <div className="esc-resumen">
                <div><strong>{falencias.length}</strong><span>falencias</span></div>
                <div><strong>{trabajadores}</strong><span>trabajadores</span></div>
                <div><strong>{sinModulo}</strong><span>sin módulo</span></div>
            </div>

            <div className="admin-card-toolbar">
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
                <div className="esc-vacio">
                    <span className="esc-vacio-icono">📋</span>
                    <p>{falencias.length === 0
                        ? 'Ninguna evaluación completada tiene ítems calificados con 1 o 2 por el jefe.'
                        : 'Ninguna falencia coincide con los filtros.'}</p>
                </div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Trabajador</th>
                                <th>Plantilla</th>
                                <th>Ítem</th>
                                <th style={{ textAlign: 'center' }}>Calif.</th>
                                <th>Fecha</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.map((f) => (
                                <tr key={`${f.evaluacion_id}-${f.item_numero}`}>
                                    <td><strong style={{ color: 'var(--color-text)' }}>{f.trabajador}</strong></td>
                                    <td>{PLANTILLA_LABEL[f.plantilla] || f.plantilla}</td>
                                    <td><span className="esc-tabla-num">{f.item_numero}</span> {f.item_texto}</td>
                                    <td style={{ textAlign: 'center' }}><Calificacion valor={f.calificacion} /></td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha)}</td>
                                    <td><EstadoModulo disponible={f.modulo_disponible} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

    return (
        <div className="admin-root">
            <div className="admin-container">
                <div className="admin-page-header">
                    <div>
                        <button className="admin-back-btn" onClick={() => irAtras(navigate, '/seleccion-modulo')}>
                            ← Volver
                        </button>
                    </div>
                    <h1 className="admin-page-title">🎓 Escuela GSB</h1>
                    <p className="admin-page-sub">
                        Formación a partir de la evaluación de desempeño AD-FR-06
                    </p>
                </div>

                {esEncargada && (
                    <div className="esc-tabs">
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
                    </div>
                )}

                <div className="admin-card-container">
                    {esEncargada && tab === 'falencias' ? <PanelFalencias /> : <MiFormacion />}
                </div>
            </div>
        </div>
    );
}
