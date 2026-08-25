import { useState } from 'react';
import './SelectorEvidencias.css';
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_ARCHIVOS = 5;
const MAX_TAMANO_BYTES = 10 * 1024 * 1024;

export default function SelectorEvidencias({ archivos, setArchivos, error, setError }) {
    const [dragActivo, setDragActivo] = useState(false);

    function validarYAgregar(nuevosArchivos) {
        setError('');
        const lista = Array.from(nuevosArchivos);

        if (archivos.length + lista.length > MAX_ARCHIVOS) {
            setError(`Máximo ${MAX_ARCHIVOS} archivos permitidos.`);
            return;
        }

        for (const file of lista) {
            const esValido = TIPOS_PERMITIDOS.includes(file.type) || file.name.toLowerCase().endsWith('.pdf');
            if (!esValido) {
                setError(`Formato no permitido: ${file.name}. Usa JPG, PNG, WEBP o PDF.`);
                return;
            }
            if (file.size > MAX_TAMANO_BYTES) {
                setError(`"${file.name}" supera los 10 MB permitidos.`);
                return;
            }
        }

        const conPreview = lista.map((file) => ({
            file,
            preview: URL.createObjectURL(file),
            isPdf: file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
            id: crypto.randomUUID(),
        }));

        setArchivos([...archivos, ...conPreview]);
    }

    function eliminarArchivo(id) {
        setArchivos(archivos.filter((a) => a.id !== id));
    }

    function handleDrop(e) {
        e.preventDefault();
        setDragActivo(false);
        validarYAgregar(e.dataTransfer.files);
    }

    return (
        <div className="selector-evidencias">
            <label className="form-group-label">Fotografías o Documentos PDF (opcional, hasta 5, máx. 10MB c/u)</label>

            <div
                className={`evidencias-dropzone ${dragActivo ? 'evidencias-dropzone--activo' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragActivo(true); }}
                onDragLeave={() => setDragActivo(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('input-evidencias').click()}
            >
                <input
                    id="input-evidencias"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    hidden
                    onChange={(e) => validarYAgregar(e.target.files)}
                />
                <p className="dropzone-icon">⬆</p>
                <p className="dropzone-text">Subir aquí</p>
                <p className="dropzone-subtext">Haz clic o arrastra tus fotografías o documentos PDF</p>            </div>

            {error && <p className="evidencias-error">{error}</p>}

            {archivos.length > 0 && (
                <div className="evidencias-preview-grid">
                    {archivos.map((a) => (
                        <div key={a.id} className="evidencia-thumb">
                            {a.isPdf ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#FEF2F2', color: '#DC2626' }}>
                                    <span style={{ fontSize: '1.5rem' }}>📄</span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>PDF</span>
                                </div>
                            ) : (
                                <img src={a.preview} alt="evidencia" />
                            )}
                            <button
                                type="button"
                                className="evidencia-remove-btn"
                                onClick={() => eliminarArchivo(a.id)}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}