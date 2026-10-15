/** Sección "Estudiantes" (solo encargada): una ficha por persona en dos grupos. */
import { useMemo, useState } from 'react';
import { GRUPO_LABEL } from '../../utils/escuela';
import { Cargando } from './Piezas';

function TarjetaEstudiante({ e, onAbrir }) {
    const conFalencias = e.total_falencias > 0;
    return (
        <button
            type="button"
            className={`esc-est${conFalencias ? ' esc-est--alerta' : ''}`}
            onClick={() => onAbrir(e.id)}
        >
            <span className="esc-est-inicial" aria-hidden="true">{e.nombre.trim().charAt(0)}</span>
            <span className="esc-est-cuerpo">
                <span className="esc-est-nombre">{e.nombre}</span>
                <span className="esc-est-meta">
                    {conFalencias
                        ? <span className="esc-est-falencias">⚠ {e.total_falencias} {e.total_falencias === 1 ? 'falencia' : 'falencias'}</span>
                        : <span className="esc-est-ok">✓ Sin falencias</span>}
                    <span>📎 {e.total_archivos} {e.total_archivos === 1 ? 'archivo' : 'archivos'}</span>
                </span>
            </span>
        </button>
    );
}

export default function ListaEstudiantes({ estudiantes, error, onAbrir }) {
    const [busqueda, setBusqueda] = useState('');

    const grupos = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const filtrados = (estudiantes || []).filter((e) =>
            !q || e.nombre.toLowerCase().includes(q) || e.correo.toLowerCase().includes(q)
        );
        return ['administrativos', 'tecnicos'].map((g) => ({
            id: g,
            items: filtrados.filter((e) => e.grupo === g),
        }));
    }, [estudiantes, busqueda]);

    if (error) return <div className="esc-error">{error}</div>;
    if (!estudiantes) return <Cargando texto="Cargando estudiantes..." />;

    return (
        <>
            <div className="esc-toolbar">
                <div className="admin-search-wrap">
                    <span className="admin-search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Buscar estudiante..."
                        className="admin-search-input"
                        value={busqueda}
                        onChange={(ev) => setBusqueda(ev.target.value)}
                    />
                </div>
                <span className="esc-total">{estudiantes.length} estudiantes</span>
            </div>

            {grupos.map((g) => (
                <section key={g.id} className="esc-grupo">
                    <h3 className="esc-grupo-titulo">
                        {GRUPO_LABEL[g.id]} <span>({g.items.length})</span>
                    </h3>
                    {g.items.length === 0 ? (
                        <p className="esc-grupo-vacio">Ningún estudiante en este grupo{busqueda ? ' coincide con la búsqueda' : ''}.</p>
                    ) : (
                        <div className="esc-est-grid">
                            {g.items.map((e) => <TarjetaEstudiante key={e.id} e={e} onAbrir={onAbrir} />)}
                        </div>
                    )}
                </section>
            ))}
        </>
    );
}
