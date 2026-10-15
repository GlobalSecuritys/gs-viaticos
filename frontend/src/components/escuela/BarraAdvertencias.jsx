/**
 * Barra lateral de advertencias (solo encargada): estudiantes con falencias,
 * con el ítem y la calificación. En celular se pliega en un panel desplegable.
 */
import { useMemo, useState } from 'react';
import { Calificacion } from './Piezas';

export default function BarraAdvertencias({ falencias, estudiantesIds, activoId, onAbrir }) {
    const [abierta, setAbierta] = useState(false);

    // Solo estudiantes (la lista de falencias puede incluir a la propia encargada).
    const grupos = useMemo(() => {
        const mapa = new Map();
        for (const f of falencias || []) {
            if (estudiantesIds && !estudiantesIds.has(f.usuario_id)) continue;
            if (!mapa.has(f.usuario_id)) mapa.set(f.usuario_id, { id: f.usuario_id, nombre: f.trabajador, items: [] });
            mapa.get(f.usuario_id).items.push(f);
        }
        return [...mapa.values()].sort((a, b) =>
            Math.min(...a.items.map((i) => i.calificacion)) - Math.min(...b.items.map((i) => i.calificacion))
            || a.nombre.localeCompare(b.nombre)
        );
    }, [falencias, estudiantesIds]);

    return (
        <aside className={`esc-adv${abierta ? ' esc-adv--abierta' : ''}`} aria-label="Advertencias">
            <button
                type="button"
                className="esc-adv-toggle"
                aria-expanded={abierta}
                onClick={() => setAbierta((v) => !v)}
            >
                <span>⚠ Advertencias ({grupos.length})</span>
                <span className="esc-adv-chevron" aria-hidden="true">▾</span>
            </button>
            <h2 className="esc-adv-titulo">⚠ Advertencias <span>{grupos.length}</span></h2>

            <div className="esc-adv-lista">
                {falencias === null ? (
                    <p className="esc-adv-vacio">Cargando…</p>
                ) : grupos.length === 0 ? (
                    <p className="esc-adv-vacio">Ningún estudiante tiene falencias detectadas.</p>
                ) : (
                    grupos.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            className={`esc-adv-item${activoId === g.id ? ' esc-adv-item--activo' : ''}`}
                            onClick={() => { setAbierta(false); onAbrir(g.id); }}
                        >
                            <span className="esc-adv-nombre">
                                {g.nombre}
                                <span className="esc-adv-contador">{g.items.length}</span>
                            </span>
                            {g.items.map((f) => (
                                <span key={`${f.evaluacion_id}-${f.item_numero}`} className="esc-adv-falencia">
                                    <strong>{f.item_numero}</strong>
                                    <span className="esc-adv-texto">{f.item_texto}</span>
                                    <Calificacion valor={f.calificacion} />
                                </span>
                            ))}
                        </button>
                    ))
                )}
            </div>
        </aside>
    );
}
