/**
 * "Material académico" de un estudiante (solo encargada). Los archivos son
 * privados: para abrir uno se pide un enlace firmado que caduca en 5 minutos.
 */
import { useRef, useState } from 'react';
import {
    eliminarMaterialEstudiante,
    obtenerEnlaceMaterial,
    subirMaterialEstudiante,
} from '../../services/escuela';
import { formatApiError } from '../../utils/formatError';
import { fmtFecha, fmtTamano, MATERIAL_EXTENSIONES, MATERIAL_MAX_BYTES } from '../../utils/escuela';

const ICONO_EXT = {
    pdf: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼', webp: '🖼', heic: '🖼',
    doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📽', pptx: '📽',
};

export default function MaterialAcademico({ estudianteId, archivos, onCambio }) {
    const inputRef = useRef(null);
    const [archivo, setArchivo] = useState(null);
    const [descripcion, setDescripcion] = useState('');
    const [subiendo, setSubiendo] = useState(false);
    const [ocupadoId, setOcupadoId] = useState(null);
    const [error, setError] = useState('');
    const [ok, setOk] = useState('');

    function elegir(ev) {
        const f = ev.target.files?.[0] || null;
        setError('');
        setOk('');
        if (!f) { setArchivo(null); return; }
        const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
        if (!MATERIAL_EXTENSIONES.includes(ext)) {
            setError('Tipo no permitido. Usa PDF, imágenes (JPG, PNG, WEBP, HEIC) u Office (Word, Excel, PowerPoint).');
            ev.target.value = '';
            return;
        }
        if (f.size > MATERIAL_MAX_BYTES) {
            setError(`"${f.name}" pesa ${fmtTamano(f.size)}; el máximo es 10 MB.`);
            ev.target.value = '';
            return;
        }
        setArchivo(f);
    }

    async function subir() {
        if (!archivo) return;
        setSubiendo(true);
        setError('');
        try {
            const { data } = await subirMaterialEstudiante(estudianteId, archivo, descripcion.trim());
            onCambio([data, ...archivos]);
            setArchivo(null);
            setDescripcion('');
            if (inputRef.current) inputRef.current.value = '';
            setOk(`"${data.nombre_original}" quedó guardado.`);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo subir el archivo.'));
        } finally {
            setSubiendo(false);
        }
    }

    async function abrir(a) {
        // La pestaña se abre en el clic (evita el bloqueo de ventanas emergentes)
        // y recibe el enlace firmado cuando llega.
        const ventana = window.open('', '_blank');
        setOcupadoId(a.id);
        setError('');
        try {
            const { data } = await obtenerEnlaceMaterial(estudianteId, a.id);
            if (ventana) ventana.location.replace(data.url);
            else window.location.assign(data.url);
        } catch (err) {
            if (ventana) ventana.close();
            setError(formatApiError(err, 'No se pudo abrir el archivo.'));
        } finally {
            setOcupadoId(null);
        }
    }

    async function eliminar(a) {
        if (!window.confirm(`¿Eliminar "${a.nombre_original}"? Se borrará definitivamente.`)) return;
        setOcupadoId(a.id);
        setError('');
        setOk('');
        try {
            await eliminarMaterialEstudiante(estudianteId, a.id);
            onCambio(archivos.filter((x) => x.id !== a.id));
        } catch (err) {
            setError(formatApiError(err, 'No se pudo eliminar el archivo.'));
        } finally {
            setOcupadoId(null);
        }
    }

    return (
        <section className="esc-material">
            <h3 className="esc-seccion-titulo">Material académico <span>({archivos.length})</span></h3>

            <div className="esc-subida">
                <label className="esc-subida-elegir">
                    <input
                        ref={inputRef}
                        type="file"
                        accept={MATERIAL_EXTENSIONES.map((e) => `.${e}`).join(',')}
                        onChange={elegir}
                    />
                    <span>{archivo ? `${archivo.name} · ${fmtTamano(archivo.size)}` : '+ Elegir archivo'}</span>
                </label>
                <input
                    type="text"
                    className="esc-subida-desc"
                    placeholder="Descripción (opcional)"
                    maxLength={300}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                />
                <button type="button" className="esc-btn-abrir" disabled={!archivo || subiendo} onClick={subir}>
                    {subiendo ? 'Subiendo…' : 'Subir'}
                </button>
            </div>
            <p className="esc-subida-ayuda">PDF, imágenes u Office · máx. 10 MB · privado: solo la encargada puede abrirlo.</p>

            {error && <div className="esc-error">{error}</div>}
            {ok && <div className="esc-ok">{ok}</div>}

            {archivos.length === 0 ? (
                <p className="esc-grupo-vacio">Aún no hay material académico para este estudiante.</p>
            ) : (
                <ul className="esc-archivos">
                    {archivos.map((a) => (
                        <li key={a.id} className="esc-archivo">
                            <span className="esc-archivo-icono" aria-hidden="true">{ICONO_EXT[a.extension] || '📎'}</span>
                            <span className="esc-archivo-cuerpo">
                                <span className="esc-archivo-nombre">{a.nombre_original}</span>
                                {a.descripcion && <span className="esc-archivo-desc">{a.descripcion}</span>}
                                <span className="esc-archivo-meta">
                                    {fmtTamano(a.tamano_bytes)} · {a.subido_por_nombre} · {fmtFecha(a.subido_en)}
                                </span>
                            </span>
                            <span className="esc-archivo-acciones">
                                <button type="button" className="esc-link-btn" disabled={ocupadoId === a.id} onClick={() => abrir(a)}>
                                    Abrir
                                </button>
                                <button
                                    type="button"
                                    className="esc-link-btn esc-link-btn--peligro"
                                    disabled={ocupadoId === a.id}
                                    onClick={() => eliminar(a)}
                                    title="Eliminar"
                                >
                                    Eliminar
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
