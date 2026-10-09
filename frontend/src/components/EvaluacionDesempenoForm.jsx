import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PLANTILLAS_EVALUACION } from '../data/plantillasEvaluacion';
import {
    obtenerMiEvaluacion,
    enviarAutoevaluacion,
    enviarEvaluacion,
} from '../services/evaluacionDesempeno';
import './EvaluacionDesempenoForm.css';

export default function EvaluacionDesempenoForm({ user, plantillaId, usuarioEvaluadoId, readOnly = false }) {
    const { user: authUser } = useAuth();
    const esUsuarioYeimy = authUser?.correo?.toLowerCase() === 'secretaria@gsbsecurity.com';

    // Resolver plantilla activa (parámetro o fallback por correo)
    const activePlantillaId = plantillaId || (
        (user?.correo?.toLowerCase() === 'secretaria@gsbsecurity.com' || esUsuarioYeimy) ? 'contable' : 'directivos'
    );
    const plantilla = PLANTILLAS_EVALUACION[activePlantillaId] || PLANTILLAS_EVALUACION['directivos'];

    // Si quien ve es Yeimy, solo ve el paso de autoevaluación (sin paso de jefe ni resumen)
    const esSoloAuto = esUsuarioYeimy || (!plantilla.requiere_evaluador && (plantilla.pasos_disponibles || []).length === 1);
    const esContable = activePlantillaId === 'contable';
    const cantCompromisos = plantilla.compromisos_cantidad || (esSoloAuto ? 8 : 4);

    // Total de ítems de la plantilla
    const todosLosItems = useMemo(() => {
        const items = [];
        plantilla.secciones.forEach((sec) => {
            sec.items.forEach((it) => {
                items.push({ ...it, seccionNumero: sec.numero, seccionTitulo: sec.titulo });
            });
        });
        return items;
    }, [plantilla]);

    const totalItemsCount = todosLosItems.length;

    // Estado local del formulario
    const [seccionActivaIdx, setSeccionActivaIdx] = useState(0);
    const [pasoActivo, setPasoActivo] = useState('auto'); // 'auto' | 'eval' | 'resumen'
    const [descripcionesAbiertas, setDescripcionesAbiertas] = useState({});

    // Datos de identificación
    const fechaHoy = useMemo(() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
    }, []);

    const nombreEvaluado = user?.nombre || (esContable ? (plantilla.identificacion.nombre_default || 'Yeimy Rocio Riaño') : 'Pilar Aristizábal');
    const cargo = plantilla.identificacion.cargo_default || (esContable ? 'AUXILIAR CONTABLE ' : 'DIRECTORA ADMINSITRATIVA ');
    const cedula = esContable ? (plantilla.identificacion.cedula_default || user?.cedula || '1014202829') : '';

    const [fecha, setFecha] = useState(fechaHoy);
    const [nombreEvaluador, setNombreEvaluador] = useState('');

    // Calificaciones: { [numItem]: { calificacion: number, observacion: string } }
    const [autoevaluacion, setAutoevaluacion] = useState({});
    const [evaluacionJefe, setEvaluacionJefe] = useState({});
    const [compromisos, setCompromisos] = useState(() => Array(cantCompromisos).fill(''));

    // Estado del backend
    const [evaluacionGuardada, setEvaluacionGuardada] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardandoPaso, setGuardandoPaso] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [exitoMsg, setExitoMsg] = useState('');
    const [faltantesResaltados, setFaltantesResaltados] = useState([]);

    const targetUserId = usuarioEvaluadoId || user?.id || (esContable ? 34 : 'anon');
    const getStorageKey = (paso) => `draft_evaluacion_${activePlantillaId}_${targetUserId}_${paso}`;

    // ── 1. Cargar datos del backend una sola vez al entrar ────────────────────
    useEffect(() => {
        let activo = true;
        setCargando(true);
        setErrorMsg('');

        obtenerMiEvaluacion(activePlantillaId, usuarioEvaluadoId)
            .then((res) => {
                if (!activo) return;
                const data = res.data;

                // Reiniciar SIEMPRE el estado al cargar la evaluación de este evaluado/plantilla.
                // Evita que datos de otro evaluado (p. ej. al cambiar de pestaña, donde React
                // reutiliza la instancia si no hay key) contaminen "Enviada" y el paso de jefe.
                setEvaluacionGuardada(data || null);
                setAutoevaluacion(data?.autoevaluacion || {});
                setEvaluacionJefe(!esSoloAuto && data?.evaluacion ? data.evaluacion : {});
                setNombreEvaluador(data?.nombre_evaluador || '');
                setFecha(data?.fecha ? String(data.fecha) : fechaHoy);
                setFaltantesResaltados([]);
                setExitoMsg('');

                const autoRealEnviada = Boolean(
                    data?.autoevaluacion_enviada_en &&
                    data?.autoevaluacion_enviada_por_id &&
                    (data.estado === 'autoevaluado' || data.estado === 'completado')
                );

                if (data) {
                    if (Array.isArray(data.compromisos) && data.compromisos.length > 0) {
                        const compArr = [...data.compromisos];
                        while (compArr.length < cantCompromisos) compArr.push('');
                        setCompromisos(compArr.slice(0, cantCompromisos));
                    } else {
                        setCompromisos(Array(cantCompromisos).fill(''));
                    }

                    if (esSoloAuto) {
                        setPasoActivo('auto');
                    } else if (data.estado === 'completado') {
                        setPasoActivo('resumen');
                    } else if (autoRealEnviada) {
                        setPasoActivo('eval');
                    } else {
                        setPasoActivo('auto');
                    }
                } else {
                    // Sin registro en backend: no hay autoevaluación enviada de ESTE evaluado.
                    // Partir de cero y restaurar borrador local por paso si existe.
                    setCompromisos(Array(cantCompromisos).fill(''));
                    setPasoActivo('auto');
                    try {
                        const rawAuto = localStorage.getItem(getStorageKey('auto'));
                        if (rawAuto) {
                            const draftAuto = JSON.parse(rawAuto);
                            if (draftAuto.autoevaluacion) setAutoevaluacion(draftAuto.autoevaluacion);
                            if (esSoloAuto && Array.isArray(draftAuto.compromisos)) {
                                const compArr = [...draftAuto.compromisos];
                                while (compArr.length < cantCompromisos) compArr.push('');
                                setCompromisos(compArr.slice(0, cantCompromisos));
                            }
                        }
                        if (!esSoloAuto) {
                            const rawEval = localStorage.getItem(getStorageKey('eval'));
                            if (rawEval) {
                                const draftEval = JSON.parse(rawEval);
                                if (draftEval.evaluacionJefe) setEvaluacionJefe(draftEval.evaluacionJefe);
                                if (draftEval.nombreEvaluador) setNombreEvaluador(draftEval.nombreEvaluador);
                                if (Array.isArray(draftEval.compromisos)) {
                                    const compArr = [...draftEval.compromisos];
                                    while (compArr.length < cantCompromisos) compArr.push('');
                                    setCompromisos(compArr.slice(0, cantCompromisos));
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('No se pudo leer borrador de localStorage', e);
                    }
                }
            })
            .catch((err) => {
                if (!activo) return;
                console.error('Error cargando evaluación de desempeño:', err);
                setErrorMsg('No se pudo consultar el estado actual de la evaluación.');
            })
            .finally(() => {
                if (activo) setCargando(false);
            });

        return () => {
            activo = false;
        };
    }, [activePlantillaId, cantCompromisos, esSoloAuto, usuarioEvaluadoId, targetUserId]);

    // ── Cálculos derivados del estado del backend ────────────────────────────
    // IMPORTANTE: deben ir ANTES del segundo useEffect que las referencia
    // "Enviada" exige un envío REAL registrado por el backend (fecha/hora + cuenta
    // de envío) de ESTA autoevaluación; no basta con que exista la fila o el estado.
    const autoevalEnviada = Boolean(
        evaluacionGuardada?.autoevaluacion_enviada_en &&
        evaluacionGuardada?.autoevaluacion_enviada_por_id &&
        (evaluacionGuardada?.estado === 'autoevaluado' || evaluacionGuardada?.estado === 'completado')
    );
    const evaluacionCompletada = evaluacionGuardada?.estado === 'completado';
    const modoSoloLectura = readOnly || (esSoloAuto ? autoevalEnviada : false);

    // ── 2. Guardar borrador en localStorage en silencio (cero requests) ──────
    useEffect(() => {
        if (cargando) return;
        try {
            if (pasoActivo === 'auto' && !autoevalEnviada) {
                const draftAuto = {
                    autoevaluacion,
                    compromisos: esSoloAuto ? compromisos : undefined,
                };
                localStorage.setItem(getStorageKey('auto'), JSON.stringify(draftAuto));
            } else if (pasoActivo === 'eval' && !evaluacionCompletada) {
                const draftEval = {
                    evaluacionJefe,
                    nombreEvaluador,
                    compromisos,
                };
                localStorage.setItem(getStorageKey('eval'), JSON.stringify(draftEval));
            }
        } catch (e) {
            console.warn('Error guardando en localStorage', e);
        }
    }, [autoevaluacion, evaluacionJefe, nombreEvaluador, compromisos, pasoActivo, cargando, activePlantillaId, targetUserId, esSoloAuto, autoevalEnviada, evaluacionCompletada]);

    // Diccionario activo según el paso
    const califsActivas = pasoActivo === 'auto' ? autoevaluacion : evaluacionJefe;

    // Ítems calificados en el paso actual
    const cantCalificadosPaso = useMemo(() => {
        return todosLosItems.filter((it) => {
            const val = califsActivas[it.numero]?.calificacion;
            return typeof val === 'number' && val >= 1 && val <= 4;
        }).length;
    }, [todosLosItems, califsActivas]);

    // Promedio total del paso activo
    const promedioTotalPaso = useMemo(() => {
        const validos = todosLosItems
            .map((it) => califsActivas[it.numero]?.calificacion)
            .filter((v) => typeof v === 'number' && v >= 1 && v <= 4);
        if (validos.length === 0) return 0;
        const suma = validos.reduce((a, b) => a + b, 0);
        return (suma / validos.length).toFixed(2);
    }, [todosLosItems, califsActivas]);

    // Promedios por sección para el paso activo
    const promediosPorSeccion = useMemo(() => {
        const mapa = {};
        plantilla.secciones.forEach((sec) => {
            const califsSec = sec.items
                .map((it) => califsActivas[it.numero]?.calificacion)
                .filter((v) => typeof v === 'number' && v >= 1 && v <= 4);
            const cant = califsSec.length;
            const prom = cant > 0 ? (califsSec.reduce((a, b) => a + b, 0) / cant).toFixed(2) : '—';
            mapa[sec.numero] = {
                promedio: prom,
                calificados: cant,
                total: sec.items.length,
            };
        });
        return mapa;
    }, [plantilla, califsActivas]);

    // Promedios finales para el resumen (ambas columnas)
    const promediosResumen = useMemo(() => {
        const calcs = { auto: {}, jefe: {}, totalAuto: 0, totalJefe: 0 };

        const valsAuto = todosLosItems
            .map((it) => autoevaluacion[it.numero]?.calificacion)
            .filter((v) => typeof v === 'number' && v >= 1 && v <= 4);
        calcs.totalAuto = valsAuto.length > 0 ? (valsAuto.reduce((a, b) => a + b, 0) / valsAuto.length).toFixed(2) : '—';

        const valsJefe = todosLosItems
            .map((it) => evaluacionJefe[it.numero]?.calificacion)
            .filter((v) => typeof v === 'number' && v >= 1 && v <= 4);
        calcs.totalJefe = valsJefe.length > 0 ? (valsJefe.reduce((a, b) => a + b, 0) / valsJefe.length).toFixed(2) : '—';

        plantilla.secciones.forEach((sec) => {
            const arrA = sec.items
                .map((it) => autoevaluacion[it.numero]?.calificacion)
                .filter((v) => typeof v === 'number' && v >= 1 && v <= 4);
            const arrJ = sec.items
                .map((it) => evaluacionJefe[it.numero]?.calificacion)
                .filter((v) => typeof v === 'number' && v >= 1 && v <= 4);

            calcs.auto[sec.numero] = arrA.length > 0 ? (arrA.reduce((a, b) => a + b, 0) / arrA.length).toFixed(2) : '—';
            calcs.jefe[sec.numero] = arrJ.length > 0 ? (arrJ.reduce((a, b) => a + b, 0) / arrJ.length).toFixed(2) : '—';
        });

        return calcs;
    }, [plantilla, todosLosItems, autoevaluacion, evaluacionJefe]);

    // ── Handlers de interacción ──────────────────────────────────────────────
    function handleCalificar(itemNumero, valor) {
        if (modoSoloLectura) return;
        setFaltantesResaltados((prev) => prev.filter((n) => n !== itemNumero));
        if (pasoActivo === 'auto') {
            setAutoevaluacion((prev) => ({
                ...prev,
                [itemNumero]: {
                    calificacion: valor,
                    observacion: prev[itemNumero]?.observacion || '',
                },
            }));
        } else if (pasoActivo === 'eval') {
            setEvaluacionJefe((prev) => ({
                ...prev,
                [itemNumero]: {
                    calificacion: valor,
                    observacion: prev[itemNumero]?.observacion || '',
                },
            }));
        }
    }

    function handleObservacion(itemNumero, texto) {
        if (modoSoloLectura) return;
        if (pasoActivo === 'auto') {
            setAutoevaluacion((prev) => ({
                ...prev,
                [itemNumero]: {
                    calificacion: prev[itemNumero]?.calificacion || 0,
                    observacion: texto,
                },
            }));
        } else if (pasoActivo === 'eval') {
            setEvaluacionJefe((prev) => ({
                ...prev,
                [itemNumero]: {
                    calificacion: prev[itemNumero]?.calificacion || 0,
                    observacion: texto,
                },
            }));
        }
    }

    function toggleDescripcion(itemNumero) {
        setDescripcionesAbiertas((prev) => ({
            ...prev,
            [itemNumero]: !prev[itemNumero],
        }));
    }

    function handleCompromisoChange(idx, val) {
        if (modoSoloLectura || evaluacionCompletada) return;
        setCompromisos((prev) => {
            const next = [...prev];
            next[idx] = val;
            return next;
        });
    }

    // ── Envío de Paso 1: Autoevaluación ──────────────────────────────────────
    async function handleEnviarAutoevaluacion() {
        setErrorMsg('');
        setExitoMsg('');

        // Validar que todos los ítems de la plantilla estén calificados
        const faltantes = todosLosItems
            .filter((it) => {
                const val = autoevaluacion[it.numero]?.calificacion;
                return typeof val !== 'number' || val < 1 || val > 4;
            })
            .map((it) => it.numero);

        if (faltantes.length > 0) {
            setFaltantesResaltados(faltantes);
            setErrorMsg(`No se puede enviar: faltan ${faltantes.length} ítems por calificar (${faltantes.join(', ')}).`);
            // Ir a la sección del primer ítem faltante
            const primerFaltante = todosLosItems.find((it) => it.numero === faltantes[0]);
            if (primerFaltante) {
                const idxSec = plantilla.secciones.findIndex((s) => s.numero === primerFaltante.seccionNumero);
                if (idxSec >= 0) setSeccionActivaIdx(idxSec);
            }
            return;
        }

        setGuardandoPaso(true);
        try {
            const res = await enviarAutoevaluacion({
                plantilla: activePlantillaId,
                autoevaluacion,
                cargo,
                fecha,
                compromisos: esSoloAuto ? compromisos : undefined,
            });
            setEvaluacionGuardada(res.data);
            setFaltantesResaltados([]);

            try {
                localStorage.removeItem(getStorageKey('auto'));
            } catch (e) {
                // Ignore
            }

            if (esSoloAuto) {
                setExitoMsg('✅ Autoevaluación enviada exitosamente. El formulario ha quedado registrado en modo solo lectura.');
            } else {
                setExitoMsg('✅ Autoevaluación enviada exitosamente. Ahora puedes diligenciar el paso de Evaluación.');
                setPasoActivo('eval');
                setSeccionActivaIdx(0);
            }
        } catch (err) {
            console.error('Error enviando autoevaluación:', err);
            const detail = err.response?.data?.detail;
            setErrorMsg(detail || 'Ocurrió un error al enviar la autoevaluación.');
        } finally {
            setGuardandoPaso(false);
        }
    }

    // ── Envío de Paso 2: Evaluación (solo plantillas con jefe) ────────────────
    async function handleEnviarEvaluacionJefe() {
        setErrorMsg('');
        setExitoMsg('');

        if (!nombreEvaluador.trim()) {
            setErrorMsg('El NOMBRE DEL EVALUADOR es obligatorio para enviar la evaluación.');
            return;
        }

        // Validar que todos los ítems estén calificados en evaluación
        const faltantes = todosLosItems
            .filter((it) => {
                const val = evaluacionJefe[it.numero]?.calificacion;
                return typeof val !== 'number' || val < 1 || val > 4;
            })
            .map((it) => it.numero);

        if (faltantes.length > 0) {
            setFaltantesResaltados(faltantes);
            setErrorMsg(`No se puede enviar: faltan ${faltantes.length} ítems por calificar en la evaluación (${faltantes.join(', ')}).`);
            const primerFaltante = todosLosItems.find((it) => it.numero === faltantes[0]);
            if (primerFaltante) {
                const idxSec = plantilla.secciones.findIndex((s) => s.numero === primerFaltante.seccionNumero);
                if (idxSec >= 0) setSeccionActivaIdx(idxSec);
            }
            return;
        }

        setGuardandoPaso(true);
        try {
            const res = await enviarEvaluacion({
                plantilla: activePlantillaId,
                usuario_evaluado_id: targetUserId,
                nombre_evaluador: nombreEvaluador.trim(),
                evaluacion: evaluacionJefe,
                compromisos,
            });
            setEvaluacionGuardada(res.data);
            setExitoMsg('✅ Evaluación de desempeño completada y enviada exitosamente.');
            setFaltantesResaltados([]);
            setPasoActivo('resumen');
            try {
                localStorage.removeItem(getStorageKey('eval'));
            } catch (e) {
                // Ignore
            }
        } catch (err) {
            console.error('Error enviando evaluación del jefe:', err);
            const detail = err.response?.data?.detail;
            setErrorMsg(detail || 'Ocurrió un error al enviar la evaluación.');
        } finally {
            setGuardandoPaso(false);
        }
    }

    if (cargando) {
        return (
            <div className="edf-loading-card">
                <div className="edf-spinner" />
                <p>Cargando formato de evaluación de desempeño...</p>
            </div>
        );
    }

    const seccionActual = plantilla.secciones[seccionActivaIdx];
    const esAdminViendoAutoContable = !esUsuarioYeimy && esContable && pasoActivo === 'auto';
    const bloqueadoPaso = modoSoloLectura || esAdminViendoAutoContable || (pasoActivo === 'auto' && autoevalEnviada) || (pasoActivo === 'eval' && evaluacionCompletada);

    return (
        <div className="edf-container">
            {/* ── Encabezado Institucional Literal del Excel ── */}
            <div className="edf-header-box">
                <div className="edf-header-left">
                    <span className="edf-header-corp">{plantilla.encabezado.empresa}</span>
                    <h2 className="edf-header-title">{plantilla.encabezado.titulo}</h2>
                    <span className="edf-header-sheet">{plantilla.nombre}</span>
                </div>
                <div className="edf-header-meta">
                    <div className="edf-meta-cell">
                        <span className="edf-meta-k">Código:</span>
                        <span className="edf-meta-v">{plantilla.encabezado.codigo}</span>
                    </div>
                    <div className="edf-meta-cell">
                        <span className="edf-meta-k">Versión:</span>
                        <span className="edf-meta-v">{plantilla.encabezado.version}</span>
                    </div>
                    <div className="edf-meta-cell">
                        <span className="edf-meta-k">Fecha Act:</span>
                        <span className="edf-meta-v">{plantilla.encabezado.fecha_act}</span>
                    </div>
                    <div className="edf-meta-cell">
                        <span className="edf-meta-k">Página:</span>
                        <span className="edf-meta-v">{plantilla.encabezado.pagina}</span>
                    </div>
                </div>
            </div>

            {/* ── Banner de Alertas / Feedback ── */}
            {errorMsg && <div className="edf-banner edf-banner--error">{errorMsg}</div>}
            {exitoMsg && <div className="edf-banner edf-banner--success">{exitoMsg}</div>}

            {/* ── Identificación ── */}
            <div className="edf-card edf-id-card">
                <div className="edf-id-grid">
                    <div className="edf-id-field">
                        <label className="edf-field-label">{plantilla.identificacion.nombre_label}</label>
                        <input
                            type="text"
                            className="edf-input edf-input--readonly"
                            value={nombreEvaluado}
                            readOnly
                        />
                    </div>
                    {plantilla.identificacion.cedula_label && (
                        <div className="edf-id-field">
                            <label className="edf-field-label">{plantilla.identificacion.cedula_label}</label>
                            <input
                                type="text"
                                className="edf-input edf-input--readonly"
                                value={cedula}
                                readOnly
                            />
                        </div>
                    )}
                    <div className="edf-id-field">
                        <label className="edf-field-label">{plantilla.identificacion.cargo_label}</label>
                        <input
                            type="text"
                            className="edf-input edf-input--readonly"
                            value={cargo}
                            readOnly
                        />
                    </div>
                    <div className="edf-id-field">
                        <label className="edf-field-label">{plantilla.identificacion.fecha_label}</label>
                        <input
                            type="date"
                            className="edf-input"
                            value={fecha}
                            onChange={(e) => setFecha(e.target.value)}
                            disabled={bloqueadoPaso}
                        />
                    </div>
                    {plantilla.requiere_evaluador && (
                        <div className="edf-id-field">
                            <label className="edf-field-label">
                                {plantilla.identificacion.evaluador_label}
                                {pasoActivo === 'eval' && <span className="edf-req">*</span>}
                            </label>
                            <input
                                type="text"
                                className="edf-input"
                                placeholder="Nombre y apellido del evaluador"
                                value={nombreEvaluador}
                                onChange={(e) => setNombreEvaluador(e.target.value)}
                                disabled={evaluacionCompletada}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Selector de Pasos en la misma pantalla ── */}
            {esSoloAuto ? (
                <div className="edf-steps-bar">
                    <div className={`edf-step-btn edf-step-btn--active ${autoevalEnviada ? 'edf-step-btn--completed' : ''}`}>
                        <span className="edf-step-num">1</span>
                        <span className="edf-step-label">
                            Autoevaluación
                            {autoevalEnviada && <span className="edf-check">✓ Enviada (Solo lectura)</span>}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="edf-steps-bar">
                    <button
                        type="button"
                        className={`edf-step-btn ${pasoActivo === 'auto' ? 'edf-step-btn--active' : ''} ${autoevalEnviada ? 'edf-step-btn--completed' : ''}`}
                        onClick={() => setPasoActivo('auto')}
                    >
                        <span className="edf-step-num">1</span>
                        <span className="edf-step-label">
                            Autoevaluación
                            {autoevalEnviada && <span className="edf-check">✓ Enviada</span>}
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`edf-step-btn ${pasoActivo === 'eval' ? 'edf-step-btn--active' : ''} ${evaluacionCompletada ? 'edf-step-btn--completed' : ''}`}
                        onClick={() => {
                            if (autoevalEnviada) setPasoActivo('eval');
                        }}
                        disabled={!autoevalEnviada}
                        title={!autoevalEnviada ? 'Debes enviar la autoevaluación primero' : undefined}
                    >
                        <span className="edf-step-num">2</span>
                        <span className="edf-step-label">
                            Evaluación (Jefe)
                            {evaluacionCompletada && <span className="edf-check">✓ Completada</span>}
                            {!autoevalEnviada && <span className="edf-lock">🔒 Bloqueada</span>}
                        </span>
                    </button>

                    {evaluacionCompletada && (
                        <button
                            type="button"
                            className={`edf-step-btn ${pasoActivo === 'resumen' ? 'edf-step-btn--active' : ''}`}
                            onClick={() => setPasoActivo('resumen')}
                        >
                            <span className="edf-step-num">📊</span>
                            <span className="edf-step-label">Cuadro Consolidado</span>
                        </button>
                    )}
                </div>
            )}

            {/* ── VISTA DE CONSOLIDADO FINAL (Cuando ambos pasos están completados) ── */}
            {pasoActivo === 'resumen' ? (
                <div className="edf-card edf-resumen-card">
                    <div className="edf-resumen-header">
                        <div>
                            <h3 className="edf-resumen-title">Cuadro Consolidado de Calificaciones</h3>
                            <p className="edf-resumen-sub">
                                Vista comparativa final entre Autoevaluación y Evaluación por Jefe Inmediato.
                            </p>
                        </div>
                        <div className="edf-resumen-badges">
                            <div className="edf-badge-total">
                                <span className="edf-badge-k">Prom. Autoevaluación</span>
                                <span className="edf-badge-v">{promediosResumen.totalAuto}</span>
                            </div>
                            <div className="edf-badge-total edf-badge-total--jefe">
                                <span className="edf-badge-k">Prom. Evaluación Jefe</span>
                                <span className="edf-badge-v">{promediosResumen.totalJefe}</span>
                            </div>
                        </div>
                    </div>

                    <div className="edf-table-wrap">
                        <table className="edf-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '4%' }}>{plantilla.columnas.no}</th>
                                    <th style={{ width: '38%' }}>{plantilla.columnas.factores}</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>{plantilla.columnas.calif_auto}</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>{plantilla.columnas.calif_jefe}</th>
                                    <th style={{ width: '34%' }}>{plantilla.columnas.observacion}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plantilla.secciones.map((sec) => (
                                    <>
                                        <tr key={`sec-head-${sec.numero}`} className="edf-tr-seccion">
                                            <td colSpan={2}>
                                                <strong>{sec.titulo}</strong>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                                {promediosResumen.auto[sec.numero]}
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                                {promediosResumen.jefe[sec.numero]}
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                Promedio de sección
                                            </td>
                                        </tr>
                                        {sec.items.map((it) => {
                                            const cAuto = autoevaluacion[it.numero]?.calificacion || '—';
                                            const cJefe = evaluacionJefe[it.numero]?.calificacion || '—';
                                            const obsAuto = autoevaluacion[it.numero]?.observacion;
                                            const obsJefe = evaluacionJefe[it.numero]?.observacion;

                                            return (
                                                <tr key={`res-${it.numero}`}>
                                                    <td className="edf-td-num">{it.numero}</td>
                                                    <td>
                                                        <div className="edf-td-factor-txt">{it.texto}</div>
                                                        <div className="edf-td-factor-desc">{it.descripcion}</div>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className={`edf-badge-val edf-val-${cAuto}`}>{cAuto}</span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span className={`edf-badge-val edf-val-${cJefe}`}>{cJefe}</span>
                                                    </td>
                                                    <td className="edf-td-obs">
                                                        {obsAuto && <div><small><strong>Auto:</strong> {obsAuto}</small></div>}
                                                        {obsJefe && <div><small><strong>Jefe:</strong> {obsJefe}</small></div>}
                                                        {!obsAuto && !obsJefe && <span className="edf-muted">—</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Compromisos en Resumen */}
                    <div className="edf-compromisos-resumen">
                        <h4>{plantilla.compromisos_label}</h4>
                        <ol className="edf-compromisos-lista">
                            {compromisos.map((c, i) => (
                                <li key={i}>{c || <span className="edf-muted">(Sin compromiso registrado)</span>}</li>
                            ))}
                        </ol>
                    </div>
                </div>
            ) : (
                /* ── FORMULARIO PASO A PASO (Autoevaluación o Evaluación Jefe) ── */
                <>
                    {/* Guía de Escala */}
                    <div className="edf-escala-box">
                        <div className="edf-escala-instruccion">{plantilla.escala_instruccion}</div>
                        <div className="edf-escala-grid">
                            {plantilla.escala.map((esc) => (
                                <div key={esc.valor} className="edf-escala-item">
                                    <span className={`edf-escala-badge edf-val-${esc.valor}`}>{esc.valor}</span>
                                    <div className="edf-escala-textos">
                                        <strong>{esc.etiqueta}</strong>
                                        <span>{esc.significado}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Barra de Progreso y Promedio en tiempo real */}
                    <div className="edf-stats-bar">
                        <div className="edf-progress-info">
                            <span className="edf-progress-txt">
                                Progreso: <strong>{cantCalificadosPaso} de {totalItemsCount} ítems calificados</strong>
                            </span>
                            <div className="edf-progress-track">
                                <div
                                    className="edf-progress-fill"
                                    style={{ width: `${(cantCalificadosPaso / totalItemsCount) * 100}%` }}
                                />
                            </div>
                        </div>

                        <div className="edf-live-avg">
                            <span className="edf-avg-label">
                                {esSoloAuto
                                    ? 'Promedio Autoevaluación:'
                                    : (pasoActivo === 'auto' ? 'Promedio Autoevaluación:' : 'Promedio Evaluación Jefe:')}
                            </span>
                            <span className="edf-avg-val">{promedioTotalPaso}</span>
                            <span className="edf-avg-scale">/ 4.00</span>
                        </div>
                    </div>

                    {/* Tabs de Secciones */}
                    <div className="edf-sections-tabs">
                        {plantilla.secciones.map((sec, idx) => {
                            const statsSec = promediosPorSeccion[sec.numero] || { calificados: 0, total: 0, promedio: '—' };
                            const completa = statsSec.calificados === statsSec.total;

                            return (
                                <button
                                    key={sec.numero}
                                    type="button"
                                    className={`edf-sec-tab ${seccionActivaIdx === idx ? 'edf-sec-tab--active' : ''} ${completa ? 'edf-sec-tab--complete' : ''}`}
                                    onClick={() => setSeccionActivaIdx(idx)}
                                >
                                    <div className="edf-sec-tab-top">
                                        <span>Sección {sec.numero}</span>
                                        {completa && <span className="edf-tab-check">✓</span>}
                                    </div>
                                    <div className="edf-sec-tab-title">{sec.titulo}</div>
                                    <div className="edf-sec-tab-stats">
                                        {statsSec.calificados}/{statsSec.total} ítems · Prom: {statsSec.promedio}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Sección Activa y sus Ítems */}
                    <div className="edf-card edf-section-card">
                        <div className="edf-section-header">
                            <div>
                                <span className="edf-sec-tag">Sección {seccionActual.numero} de {plantilla.secciones.length}</span>
                                <h3 className="edf-section-title">{seccionActual.titulo}</h3>
                            </div>
                            <div className="edf-sec-metric">
                                <span className="edf-metric-k">Promedio Sección:</span>
                                <span className="edf-metric-v">{promediosPorSeccion[seccionActual.numero]?.promedio}</span>
                            </div>
                        </div>

                        <div className="edf-items-list">
                            {seccionActual.items.map((it) => {
                                const califObj = califsActivas[it.numero] || { calificacion: 0, observacion: '' };
                                const seleccionada = califObj.calificacion;
                                const abiertaDesc = descripcionesAbiertas[it.numero];
                                const esFaltante = faltantesResaltados.includes(it.numero);

                                return (
                                    <div
                                        key={it.numero}
                                        className={`edf-item-row ${esFaltante ? 'edf-item-row--faltante' : ''}`}
                                        id={`item-row-${it.numero}`}
                                    >
                                        <div className="edf-item-left">
                                            <div className="edf-item-top">
                                                <span className="edf-item-number">{it.numero}</span>
                                                <h4 className="edf-item-text">{it.texto}</h4>
                                                <button
                                                    type="button"
                                                    className="edf-btn-desc-toggle"
                                                    onClick={() => toggleDescripcion(it.numero)}
                                                    title="Ver u ocultar descripción"
                                                >
                                                    {abiertaDesc ? '▲ Ocultar descripción' : '▼ Ver descripción'}
                                                </button>
                                            </div>

                                            {abiertaDesc && (
                                                <div className="edf-item-desc-panel">
                                                    {it.descripcion}
                                                </div>
                                            )}

                                            <div className="edf-obs-field">
                                                <input
                                                    type="text"
                                                    className="edf-obs-input"
                                                    placeholder="Observación opcional para este factor..."
                                                    value={califObj.observacion || ''}
                                                    onChange={(e) => handleObservacion(it.numero, e.target.value)}
                                                    disabled={bloqueadoPaso}
                                                />
                                            </div>
                                        </div>

                                        <div className="edf-item-right">
                                            <div className="edf-scale-buttons">
                                                {plantilla.escala.map((esc) => {
                                                    const esActivo = seleccionada === esc.valor;
                                                    return (
                                                        <button
                                                            key={esc.valor}
                                                            type="button"
                                                            className={`edf-btn-grade edf-grade-${esc.valor} ${esActivo ? 'edf-btn-grade--active' : ''}`}
                                                            onClick={() => handleCalificar(it.numero, esc.valor)}
                                                            disabled={bloqueadoPaso}
                                                        >
                                                            <span className="edf-grade-val">{esc.valor}</span>
                                                            <span className="edf-grade-lbl">{esc.etiqueta}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Navegación entre secciones */}
                        <div className="edf-section-nav-footer">
                            <button
                                type="button"
                                className="edf-btn-nav"
                                onClick={() => setSeccionActivaIdx((i) => Math.max(0, i - 1))}
                                disabled={seccionActivaIdx === 0}
                            >
                                ← Sección Anterior
                            </button>

                            <span className="edf-nav-indicator">
                                Sección {seccionActivaIdx + 1} de {plantilla.secciones.length}
                            </span>

                            <button
                                type="button"
                                className="edf-btn-nav"
                                onClick={() => setSeccionActivaIdx((i) => Math.min(plantilla.secciones.length - 1, i + 1))}
                                disabled={seccionActivaIdx === plantilla.secciones.length - 1}
                            >
                                Siguiente Sección →
                            </button>
                        </div>
                    </div>

                    {/* ── COMPROMISOS GENERADOS ── */}
                    {(!plantilla.requiere_evaluador || pasoActivo === 'eval' || (esSoloAuto && pasoActivo === 'auto')) && (
                        <div className="edf-card edf-compromisos-card">
                            <h3 className="edf-compromisos-title">{plantilla.compromisos_label}</h3>
                            <p className="edf-compromisos-sub">
                                {plantilla.requiere_evaluador
                                    ? `Diligencia los compromisos acordados para el plan de mejoramiento (${cantCompromisos} espacios según formato):`
                                    : `Registre los compromisos generados (${cantCompromisos} espacios según formato):`}
                            </p>
                            <div className="edf-compromisos-grid">
                                {compromisos.map((comp, idx) => (
                                    <div key={idx} className="edf-comp-item">
                                        <span className="edf-comp-num">{idx + 1}</span>
                                        <textarea
                                            className="edf-comp-textarea"
                                            rows={2}
                                            placeholder={`Compromiso #${idx + 1}...`}
                                            value={comp}
                                            onChange={(e) => handleCompromisoChange(idx, e.target.value)}
                                            disabled={bloqueadoPaso}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── BOTONES DE ENVÍO DE CADA PASO ── */}
                    <div className="edf-submit-panel">
                        {pasoActivo === 'auto' && (
                            <div className="edf-submit-wrap">
                                {autoevalEnviada ? (
                                    <div className="edf-already-sent">
                                        <span>✓ Esta autoevaluación ya fue enviada el{' '}
                                            <strong>{evaluacionGuardada.autoevaluacion_enviada_en ? new Date(evaluacionGuardada.autoevaluacion_enviada_en).toLocaleDateString() : 'recientemente'}</strong>.
                                            {esSoloAuto ? ' El formulario se encuentra en modo solo lectura.' : ''}
                                        </span>
                                        {!esSoloAuto && (
                                            <button
                                                type="button"
                                                className="edf-btn-primary"
                                                onClick={() => setPasoActivo('eval')}
                                            >
                                                Ir al Paso 2: Evaluación del Jefe →
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="edf-submit-row">
                                        <div className="edf-submit-info">
                                            <span>Ítems listos: <strong>{cantCalificadosPaso} de {totalItemsCount}</strong></span>
                                            {cantCalificadosPaso < totalItemsCount && (
                                                <span className="edf-faltan-txt">
                                                    (Faltan {totalItemsCount - cantCalificadosPaso} por calificar)
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className="edf-btn-primary"
                                            disabled={guardandoPaso}
                                            onClick={handleEnviarAutoevaluacion}
                                        >
                                            {guardandoPaso ? 'Enviando Autoevaluación...' : 'Enviar Autoevaluación'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {pasoActivo === 'eval' && (
                            <div className="edf-submit-wrap">
                                {evaluacionCompletada ? (
                                    <div className="edf-already-sent">
                                        <span>✓ La evaluación completa ya fue enviada.</span>
                                        <button
                                            type="button"
                                            className="edf-btn-primary"
                                            onClick={() => setPasoActivo('resumen')}
                                        >
                                            Ver Cuadro Consolidado Final →
                                        </button>
                                    </div>
                                ) : (
                                    <div className="edf-submit-row">
                                        <div className="edf-submit-info">
                                            <span>Ítems de evaluación: <strong>{cantCalificadosPaso} de {totalItemsCount}</strong></span>
                                            {!nombreEvaluador.trim() && (
                                                <span className="edf-faltan-txt">
                                                    (Falta ingresar Nombre del Evaluador)
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className="edf-btn-primary edf-btn-primary--jefe"
                                            disabled={guardandoPaso}
                                            onClick={handleEnviarEvaluacionJefe}
                                        >
                                            {guardandoPaso ? 'Guardando Evaluación...' : 'Completar y Enviar Evaluación (Paso 2)'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
