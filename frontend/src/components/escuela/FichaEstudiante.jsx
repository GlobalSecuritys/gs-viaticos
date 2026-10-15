/** Ficha individual del estudiante (solo encargada), cargada bajo demanda. */
import { useEffect, useState } from 'react';
import { obtenerFichaEstudiante } from '../../services/escuela';
import { formatApiError } from '../../utils/formatError';
import { fmtFecha, GRUPO_LABEL, PLANTILLA_LABEL } from '../../utils/escuela';
import MaterialAcademico from './MaterialAcademico';
import { AccionesFicha, Calificacion, Cargando, Leccion } from './Piezas';

export default function FichaEstudiante({ estudianteId, onVolver, onAbrirModulo, onArchivosCambian }) {
    const [ficha, setFicha] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let vigente = true;
        setFicha(null);
        setError('');
        obtenerFichaEstudiante(estudianteId)
            .then(({ data }) => { if (vigente) setFicha(data); })
            .catch((err) => { if (vigente) setError(formatApiError(err, 'No se pudo cargar la ficha del estudiante.')); });
        return () => { vigente = false; };
    }, [estudianteId]);

    function cambiarArchivos(archivos) {
        setFicha((f) => ({ ...f, archivos, total_archivos: archivos.length }));
        onArchivosCambian(estudianteId, archivos.length);
    }

    return (
        <div className="esc-ficha-est">
            <button type="button" className="esc-btn-volver-lista" onClick={onVolver}>← Volver a estudiantes</button>

            {error && <div className="esc-error" style={{ marginTop: '0.8rem' }}>{error}</div>}
            {!error && !ficha && <Cargando texto="Cargando ficha..." />}

            {ficha && (
                <>
                    <header className="esc-ficha-est-header">
                        <span className="esc-est-inicial esc-est-inicial--grande" aria-hidden="true">{ficha.nombre.trim().charAt(0)}</span>
                        <div>
                            <span className="esc-kicker">Estudiante · {GRUPO_LABEL[ficha.grupo]}</span>
                            <h2 className="esc-ficha-est-nombre">{ficha.nombre}</h2>
                            <span className="esc-ficha-est-correo">{ficha.correo}</span>
                        </div>
                    </header>

                    <section>
                        <h3 className="esc-seccion-titulo">Falencias detectadas <span>({ficha.falencias.length})</span></h3>
                        {ficha.falencias.length === 0 ? (
                            <p className="esc-grupo-vacio">Sin falencias en sus evaluaciones completadas.</p>
                        ) : (
                            <div className="esc-fichas">
                                {ficha.falencias.map((f) => (
                                    <article key={`${f.evaluacion_id}-${f.item_numero}`} className={`esc-ficha${f.modulo_disponible ? ' esc-ficha--ok' : ''}`}>
                                        <Leccion numero={f.item_numero} />
                                        <div className="esc-ficha-cuerpo">
                                            <h4 className="esc-ficha-titulo">{f.item_texto}</h4>
                                            <div className="esc-ficha-meta">
                                                {PLANTILLA_LABEL[f.plantilla] || f.plantilla}
                                                {' · '}<Calificacion valor={f.calificacion} />
                                                {' · '}{fmtFecha(f.fecha)}
                                            </div>
                                        </div>
                                        <AccionesFicha disponible={f.modulo_disponible} onAbrir={() => onAbrirModulo(f.clave_modulo)} />
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <MaterialAcademico
                        estudianteId={ficha.id}
                        archivos={ficha.archivos}
                        onCambio={cambiarArchivos}
                    />
                </>
            )}
        </div>
    );
}
