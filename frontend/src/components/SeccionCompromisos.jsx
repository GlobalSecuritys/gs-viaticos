import React, { useState, useEffect, useCallback } from 'react';
import {
    obtenerCompromisos,
    guardarCompromisos,
    cerrarCompromisos,
} from '../services/evaluacionDesempeno';
import { generarPdfCompromisos } from '../utils/pdfCompromisos';
import './SeccionCompromisos.css';

/**
 * Sección independiente de Compromisos (AD-FR-06).
 * Ciclo de vida propio: 'abierto' / 'cerrado', control de concurrencia optimista (version),
 * exactamente 8 compromisos descriptivos y generación de PDF oficial.
 */
export default function SeccionCompromisos({
    evaluacionId,
    evaluacion,
    colaboradorNombre,
    plantillaId,
    cargo,
}) {
    const [compromisos, setCompromisos] = useState(() => Array(8).fill(''));
    const [estado, setEstado] = useState('abierto');
    const [version, setVersion] = useState(1);
    const [nombreEvaluador, setNombreEvaluador] = useState('');
    const [cerradoEn, setCerradoEn] = useState(null);
    const [puedeEditar, setPuedeEditar] = useState(false);
    const [puedeCerrar, setPuedeCerrar] = useState(false);

    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [cerrando, setCerrando] = useState(false);

    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [conflictoConcurrencia, setConflictoConcurrencia] = useState(false);
    const [mostrarModalCierre, setMostrarModalCierre] = useState(false);
    const [descargandoPdf, setDescargandoPdf] = useState(false);

    const cargarDatos = useCallback(async () => {
        if (!evaluacionId) return;
        setCargando(true);
        setErrorMsg('');
        setConflictoConcurrencia(false);
        try {
            const { data } = await obtenerCompromisos(evaluacionId);
            const lista = Array.isArray(data.compromisos) ? [...data.compromisos] : [];
            while (lista.length < 8) lista.push('');
            setCompromisos(lista.slice(0, 8));
            setEstado(data.estado || 'abierto');
            setVersion(data.version || 1);
            setNombreEvaluador(data.nombre_evaluador || evaluacion?.nombre_evaluador || '');
            setCerradoEn(data.cerrado_en || null);
            setPuedeEditar(Boolean(data.puede_editar));
            setPuedeCerrar(Boolean(data.puede_cerrar));
        } catch (err) {
            let msg = err.response?.data?.detail;
            if (msg === 'Not Found' || err.response?.status === 404) {
                msg = 'El servidor terminó o está completando el despliegue. Haz clic en "Reintentar" para cargar los compromisos.';
            } else if (!msg) {
                msg = 'No se pudo cargar la sección de compromisos.';
            }
            setErrorMsg(msg);
        } finally {
            setCargando(false);
        }
    }, [evaluacionId, evaluacion]);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    const handleCompromisoChange = (idx, valor) => {
        if (!puedeEditar || estado !== 'abierto') return;
        setCompromisos((prev) => {
            const next = [...prev];
            next[idx] = valor.slice(0, 500); // Límite de 500 caracteres
            return next;
        });
        if (successMsg) setSuccessMsg('');
    };

    const handleGuardar = async () => {
        if (!puedeEditar || estado !== 'abierto') return;
        setGuardando(true);
        setErrorMsg('');
        setSuccessMsg('');
        setConflictoConcurrencia(false);
        try {
            const { data } = await guardarCompromisos(evaluacionId, {
                compromisos,
                version,
            });
            const lista = Array.isArray(data.compromisos) ? [...data.compromisos] : [];
            while (lista.length < 8) lista.push('');
            setCompromisos(lista.slice(0, 8));
            setVersion(data.version);
            setEstado(data.estado);
            setPuedeEditar(Boolean(data.puede_editar));
            setPuedeCerrar(Boolean(data.puede_cerrar));
            setSuccessMsg('Compromisos guardados exitosamente.');
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            if (err.response?.status === 409) {
                setConflictoConcurrencia(true);
                setErrorMsg('Conflicto de edición: La otra persona guardó cambios más recientes. Para evitar sobrescribir su trabajo, recargue la sección.');
            } else {
                const msg = err.response?.data?.detail || 'Error al guardar los compromisos.';
                setErrorMsg(msg);
            }
        } finally {
            setGuardando(false);
        }
    };

    const handleConfirmarCierre = async () => {
        setCerrando(true);
        setErrorMsg('');
        try {
            const { data } = await cerrarCompromisos(evaluacionId);
            setEstado('cerrado');
            setVersion(data.version);
            setCerradoEn(data.cerrado_en);
            setPuedeEditar(false);
            setPuedeCerrar(false);
            setMostrarModalCierre(false);
            setSuccessMsg('La sección de compromisos ha sido cerrada formalmente.');
        } catch (err) {
            const msg = err.response?.data?.detail || 'Error al cerrar la sección de compromisos.';
            setErrorMsg(msg);
        } finally {
            setCerrando(false);
        }
    };

    const handleDescargarPdf = async () => {
        setDescargandoPdf(true);
        try {
            await generarPdfCompromisos({
                nombreEvaluado: colaboradorNombre || evaluacion?.usuario_evaluado?.nombre || 'Colaborador',
                plantillaId: plantillaId || evaluacion?.plantilla || 'directivos',
                cargo: cargo || evaluacion?.cargo || '',
                fechaEvaluacion: evaluacion?.fecha || new Date().toISOString().slice(0, 10),
                nombreEvaluador: nombreEvaluador || evaluacion?.nombre_evaluador || 'Evaluador',
                compromisos,
                estado,
                cerradoEn,
            });
        } catch (err) {
            console.error('Error generando PDF de compromisos:', err);
            setErrorMsg('No se pudo generar el PDF de compromisos.');
        } finally {
            setDescargandoPdf(false);
        }
    };

    if (cargando) {
        return (
            <div className="sc-container" style={{ textAlign: 'center', padding: '2rem' }}>
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
                <p style={{ color: '#64748B', marginTop: '0.5rem' }}>Cargando sección de compromisos...</p>
            </div>
        );
    }

    const estaCerrado = estado === 'cerrado';

    return (
        <div className="sc-container">
            {/* Encabezado de la Sección */}
            <div className="sc-header">
                <div className="sc-header-left">
                    <div className="sc-icon">📝</div>
                    <div>
                        <h3 className="sc-title">Compromisos Generados (AD-FR-06)</h3>
                        <p className="sc-subtitle">
                            Plan de mejoramiento y acuerdos establecidos para el período evaluado.
                        </p>
                    </div>
                </div>

                <div className="sc-header-badges">
                    <span className={`sc-badge sc-badge--${estaCerrado ? 'cerrado' : 'abierto'}`}>
                        {estaCerrado ? '🔒 CERRADO' : '🟢 ABIERTO (EN EDICIÓN)'}
                    </span>
                    <span className="sc-badge sc-badge--version">
                        v{version}
                    </span>
                </div>
            </div>

            {/* Mensajes de Alerta y Concurrencia */}
            {conflictoConcurrencia && (
                <div className="sc-alert sc-alert--conflict">
                    <div className="sc-alert-content">
                        <span>⚠️</span>
                        <div>
                            <strong>Conflicto de concurrencia:</strong> La otra persona editó y guardó antes que tú.
                            Recarga para cargar los datos más recientes y evitar pérdida de información.
                        </div>
                    </div>
                    <button type="button" className="sc-btn-reload" onClick={cargarDatos}>
                        ↻ Recargar cambios
                    </button>
                </div>
            )}

            {errorMsg && !conflictoConcurrencia && (
                <div className="sc-alert sc-alert--error">
                    <div className="sc-alert-content">
                        <span>❌</span>
                        <div>{errorMsg}</div>
                    </div>
                    <button type="button" className="sc-btn-reload" onClick={cargarDatos} style={{ marginLeft: 'auto' }}>
                        ↻ Reintentar
                    </button>
                </div>
            )}

            {successMsg && (
                <div className="sc-alert sc-alert--success">
                    <div className="sc-alert-content">
                        <span>✓</span>
                        <div>{successMsg}</div>
                    </div>
                </div>
            )}

            {estaCerrado && (
                <div className="sc-alert sc-alert--info">
                    <div className="sc-alert-content">
                        <span>🔒</span>
                        <div>
                            Esta sección fue <strong>cerrada formalmente por el evaluador</strong> el{' '}
                            {cerradoEn ? new Date(cerradoEn).toLocaleDateString('es-CO') : 'recientemente'}.
                            Se encuentra en modo de solo lectura para ambas partes.
                        </div>
                    </div>
                </div>
            )}

            {/* Grilla de 8 compromisos */}
            <div className="sc-grid">
                {compromisos.map((comp, idx) => (
                    <div
                        key={idx}
                        className={`sc-row ${estaCerrado || !puedeEditar ? 'sc-row--disabled' : ''}`}
                    >
                        <div className="sc-row-num">{idx + 1}</div>
                        <div className="sc-row-body">
                            <textarea
                                className="sc-textarea"
                                rows={2}
                                placeholder={
                                    estaCerrado
                                        ? '(Sin compromiso registrado en este renglón)'
                                        : `Escriba el compromiso #${idx + 1} acordado...`
                                }
                                value={comp}
                                onChange={(e) => handleCompromisoChange(idx, e.target.value)}
                                disabled={estaCerrado || !puedeEditar}
                                maxLength={500}
                            />
                            {!estaCerrado && puedeEditar && (
                                <div className="sc-row-footer">
                                    <span>{comp.length} / 500 caracteres</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Barra de Acciones */}
            <div className="sc-actions-bar">
                <div className="sc-actions-left">
                    <button
                        type="button"
                        className="sc-btn sc-btn--outline"
                        onClick={handleDescargarPdf}
                        disabled={descargandoPdf}
                    >
                        <span>📄</span>
                        <span>{descargandoPdf ? 'Generando PDF...' : 'Descargar PDF de Compromisos'}</span>
                    </button>
                </div>

                <div className="sc-actions-right">
                    {!estaCerrado && puedeEditar && (
                        <button
                            type="button"
                            className="sc-btn sc-btn--success"
                            onClick={handleGuardar}
                            disabled={guardando}
                        >
                            <span>💾</span>
                            <span>{guardando ? 'Guardando...' : 'Guardar Compromisos'}</span>
                        </button>
                    )}

                    {!estaCerrado && puedeCerrar && (
                        <button
                            type="button"
                            className="sc-btn sc-btn--danger"
                            onClick={() => setMostrarModalCierre(true)}
                        >
                            <span>🔒</span>
                            <span>Cerrar Compromisos</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Modal de Confirmación de Cierre */}
            {mostrarModalCierre && (
                <div className="sc-modal-overlay">
                    <div className="sc-modal">
                        <h4 className="sc-modal-title">
                            <span>⚠️</span> ¿Cerrar sección de compromisos?
                        </h4>
                        <div className="sc-modal-body">
                            Al cerrar esta sección, los compromisos quedarán en <strong>modo de solo lectura definitiva</strong>{' '}
                            tanto para usted como para el colaborador evaluado. No se podrán realizar modificaciones posteriores.
                            <div className="sc-modal-warning">
                                <strong>Importante:</strong> Esta acción es irreversible y deja el formato listo para su registro y archivo oficial.
                            </div>
                        </div>
                        <div className="sc-modal-actions">
                            <button
                                type="button"
                                className="sc-btn sc-btn--outline"
                                onClick={() => setMostrarModalCierre(false)}
                                disabled={cerrando}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="sc-btn sc-btn--danger"
                                onClick={handleConfirmarCierre}
                                disabled={cerrando}
                            >
                                {cerrando ? 'Cerrando...' : 'Sí, Cerrar Definitivamente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
