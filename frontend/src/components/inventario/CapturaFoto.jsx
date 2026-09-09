import { useEffect, useRef, useState } from 'react';
import './CapturaFoto.css';

/**
 * Selector de foto de referencia del ítem. En móvil abre la cámara trasera
 * directamente (capture="environment"), que es como el técnico la va a usar en campo.
 *
 * Hoy la foto es solo documental: se guarda como referencia visual del elemento.
 * La lectura automática de la etiqueta (código, descripción y marca) queda para
 * una fase posterior; cuando llegue, el archivo que entrega este componente es
 * el mismo que se enviará a analizar.
 */
export default function CapturaFoto({ onArchivo, deshabilitado = false, urlActual = null }) {
    const inputRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [nombreArchivo, setNombreArchivo] = useState('');

    // Liberar el object URL al cambiar de foto o desmontar.
    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    function handleCambio(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (preview) URL.revokeObjectURL(preview);
        setPreview(URL.createObjectURL(file));
        setNombreArchivo(file.name);
        onArchivo(file);
    }

    function handleQuitar() {
        if (preview) URL.revokeObjectURL(preview);
        setPreview(null);
        setNombreArchivo('');
        if (inputRef.current) inputRef.current.value = '';
        onArchivo(null);
    }

    const imagenMostrada = preview || urlActual;

    return (
        <div className="sgc-inv-foto">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCambio}
                disabled={deshabilitado}
                className="sgc-inv-foto-input"
                id="sgc-inv-foto-input"
            />

            {imagenMostrada ? (
                <div className="sgc-inv-foto-preview">
                    <img src={imagenMostrada} alt="Foto de referencia del ítem" />
                    <div className="sgc-inv-foto-acciones">
                        <span className="sgc-inv-foto-nombre">{nombreArchivo || 'Foto actual del ítem'}</span>
                        <div className="sgc-inv-foto-botones">
                            <label htmlFor="sgc-inv-foto-input" className="sgc-inv-btn sgc-inv-btn--sm">
                                Cambiar
                            </label>
                            {preview && (
                                <button
                                    type="button"
                                    className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost"
                                    onClick={handleQuitar}
                                    disabled={deshabilitado}
                                >
                                    Quitar
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <label htmlFor="sgc-inv-foto-input" className="sgc-inv-foto-drop">
                    <span className="sgc-inv-foto-icon">📷</span>
                    <span className="sgc-inv-foto-titulo">Tomar o adjuntar foto</span>
                    <span className="sgc-inv-foto-hint">
                        Foto de referencia del elemento o de su etiqueta. Opcional.
                    </span>
                </label>
            )}
        </div>
    );
}
