import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TecnicoLayout from '../components/TecnicoLayout';
import BannerDuplicado from '../components/inventario/BannerDuplicado';
import CapturaFoto from '../components/inventario/CapturaFoto';
import PanelTraspasos from '../components/inventario/PanelTraspasos';
import TablaKardex from '../components/inventario/TablaKardex';
import { formatApiError } from '../utils/formatError';
import {
    crearItem,
    etiquetaEntidad,
    listarItems,
    listarPlanillas,
    obtenerKardex,
    registrarMovimiento,
    revisarDuplicados,
    subirFotoItem,
} from '../services/inventario';
import './Inventario.css';

const MOVIMIENTOS_TECNICO = [
    { valor: 'salida', label: 'Salida a servicio', ayuda: 'Material que retiras de bodega para instalar.' },
    { valor: 'devolucion', label: 'Devolución', ayuda: 'Material que no usaste y regresas a bodega.' },
    { valor: 'compra', label: 'Ingreso por compra', ayuda: 'Material nuevo que entra al inventario.' },
];

const FORM_VACIO = {
    descripcion: '',
    codigo: '',
    marca: '',
    planillaId: '',
    cantidadInicial: 1,
    observacion: '',
};

export default function InventarioCaptura({ scope }) {
    const navigate = useNavigate();
    const [pestana, setPestana] = useState('inventario');
    const [planillas, setPlanillas] = useState([]);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [busqueda, setBusqueda] = useState('');
    const [planillaFiltro, setPlanillaFiltro] = useState('');
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');

    // Registro de movimiento
    const [itemMovimiento, setItemMovimiento] = useState(null);
    const [tipoMovimiento, setTipoMovimiento] = useState('salida');
    const [cantidad, setCantidad] = useState(1);
    const [observacion, setObservacion] = useState('');
    const [guardandoMovimiento, setGuardandoMovimiento] = useState(false);

    // Alta de ítem nuevo
    const [modoAlta, setModoAlta] = useState(false);
    const [form, setForm] = useState(FORM_VACIO);
    const [foto, setFoto] = useState(null);
    const [duplicados, setDuplicados] = useState(null);
    const [duplicadosIgnorados, setDuplicadosIgnorados] = useState(false);
    const [creando, setCreando] = useState(false);

    // Kardex
    const [kardex, setKardex] = useState(null);
    const [cargandoKardex, setCargandoKardex] = useState(false);

    const mostrarFeedback = useCallback((mensaje) => {
        setFeedback(mensaje);
        setTimeout(() => setFeedback(''), 4500);
    }, []);

    const cargarItems = useCallback(async () => {
        setCargando(true);
        setError('');
        try {
            const data = await listarItems({
                q: busqueda.trim() || undefined,
                planillaId: planillaFiltro || undefined,
                scope,
            });
            setItems(data.items);
            setTotal(data.total);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el inventario.'));
        } finally {
            setCargando(false);
        }
    }, [busqueda, planillaFiltro, scope]);

    useEffect(() => {
        listarPlanillas(false, scope)
            .then(setPlanillas)
            .catch((err) => setError(formatApiError(err, 'No se pudieron cargar las planillas.')));
    }, [scope]);

    // Búsqueda con debounce para no disparar una petición por tecla.
    useEffect(() => {
        const t = setTimeout(cargarItems, 300);
        return () => clearTimeout(t);
    }, [cargarItems]);

    // Revisión de duplicados mientras se escribe el ítem nuevo.
    useEffect(() => {
        if (!modoAlta) return undefined;
        const descripcion = form.descripcion.trim();
        if (descripcion.length < 4) {
            setDuplicados(null);
            return undefined;
        }
        const t = setTimeout(async () => {
            try {
                const res = await revisarDuplicados({
                    descripcion,
                    codigo: form.codigo.trim() || undefined,
                    marca: form.marca.trim() || undefined,
                    scope,
                });
                setDuplicados(res);
                setDuplicadosIgnorados(false);
            } catch {
                setDuplicados(null); // el aviso es una ayuda, nunca un bloqueo
            }
        }, 500);
        return () => clearTimeout(t);
    }, [modoAlta, form.descripcion, form.codigo, form.marca, scope]);

    const planillaPorDefecto = useMemo(
        () => (planillas.length ? String(planillas[0].id) : ''),
        [planillas]
    );

    function abrirAlta() {
        setForm({ ...FORM_VACIO, planillaId: planillaFiltro || planillaPorDefecto });
        setFoto(null);
        setDuplicados(null);
        setDuplicadosIgnorados(false);
        setModoAlta(true);
    }

    function abrirMovimiento(item, tipo = 'salida') {
        setItemMovimiento(item);
        setTipoMovimiento(tipo);
        setCantidad(1);
        setObservacion('');
    }

    async function abrirKardex(item) {
        setKardex({ item, movimientos: [] });
        setCargandoKardex(true);
        try {
            const data = await obtenerKardex(item.id);
            setKardex(data);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el historial del ítem.'));
            setKardex(null);
        } finally {
            setCargandoKardex(false);
        }
    }

    async function handleGuardarMovimiento(e) {
        e.preventDefault();
        if (!itemMovimiento) return;
        setGuardandoMovimiento(true);
        setError('');
        try {
            const mov = await registrarMovimiento(itemMovimiento.id, {
                tipo: tipoMovimiento,
                cantidad: Number(cantidad),
                observacion,
            });
            mostrarFeedback(
                `Movimiento registrado. ${itemMovimiento.descripcion} queda con ${mov.stock_resultante} unidades.`
            );
            setItemMovimiento(null);
            await cargarItems();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo registrar el movimiento.'));
        } finally {
            setGuardandoMovimiento(false);
        }
    }

    async function handleCrearItem(e) {
        e.preventDefault();
        if (duplicados?.tipo === 'exacto') return; // el código ya existe: no se duplica
        setCreando(true);
        setError('');
        try {
            const item = await crearItem({
                descripcion: form.descripcion,
                planillaId: Number(form.planillaId),
                codigo: form.codigo,
                marca: form.marca,
                cantidadInicial: Number(form.cantidadInicial) || 0,
                observacion: form.observacion,
            });

            if (foto) {
                try {
                    await subirFotoItem(item.id, foto);
                } catch (errFoto) {
                    // El ítem ya existe: la foto es accesoria, no se pierde el registro.
                    mostrarFeedback(
                        `Ítem creado, pero la foto no se pudo subir: ${formatApiError(errFoto, 'error de carga')}`
                    );
                }
            }

            mostrarFeedback(`Ítem "${item.descripcion}" registrado con ${item.stock_actual} unidades.`);
            setModoAlta(false);
            setForm(FORM_VACIO);
            setFoto(null);
            await cargarItems();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo crear el ítem.'));
        } finally {
            setCreando(false);
        }
    }

    function usarItemExistente(item) {
        setModoAlta(false);
        abrirMovimiento(item, 'compra');
    }

    const bloqueadoPorDuplicadoExacto = duplicados?.tipo === 'exacto';
    const avisoPosibleSinResolver =
        duplicados?.tipo === 'posible' && !duplicadosIgnorados;

    return (
        <TecnicoLayout>
            <div className="sgc-inv-page">
                <header className="sgc-inv-header">
                    <div className="sgc-inv-panel-head-left">
                        <button
                            type="button"
                            className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                            onClick={() => navigate('/inventario')}
                        >
                            ← Entidades
                        </button>
                        <div>
                            <h1 className="sgc-inv-title">
                                {etiquetaEntidad(scope?.empresaNombre, scope?.clienteNombre)}
                            </h1>
                            <p className="sgc-inv-subtitle">
                                Inventario (IN) · Registra salidas, devoluciones e ingresos de material.
                            </p>
                        </div>
                    </div>
                    {pestana === 'inventario' && (
                        <button type="button" className="sgc-inv-btn sgc-inv-btn--primary" onClick={abrirAlta}>
                            + Registrar elemento
                        </button>
                    )}
                </header>

                <nav className="sgc-inv-tabs">
                    <button
                        type="button"
                        className={`sgc-inv-tab ${pestana === 'inventario' ? 'sgc-inv-tab--activa' : ''}`}
                        onClick={() => setPestana('inventario')}
                    >
                        Inventario
                    </button>
                    <button
                        type="button"
                        className={`sgc-inv-tab ${pestana === 'traspasos' ? 'sgc-inv-tab--activa' : ''}`}
                        onClick={() => setPestana('traspasos')}
                    >
                        Traspasos
                    </button>
                </nav>

                {feedback && <div className="sgc-inv-alerta sgc-inv-alerta--ok">{feedback}</div>}
                {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

                {pestana === 'traspasos' ? (
                    /* El técnico ve el estado de los traspasos de su entidad; solicitarlos
                       y resolverlos requiere nivel admin del proceso IN. */
                    <PanelTraspasos scope={scope} />
                ) : (
                  <>
                <div className="sgc-inv-filtros">
                    <input
                        type="search"
                        className="sgc-inv-input"
                        placeholder="Buscar por descripción, código o marca…"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                    <select
                        className="sgc-inv-input sgc-inv-input--select"
                        value={planillaFiltro}
                        onChange={(e) => setPlanillaFiltro(e.target.value)}
                    >
                        <option value="">Todas las planillas</option>
                        {planillas.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.nombre}
                            </option>
                        ))}
                    </select>
                </div>

                {cargando ? (
                    <p className="sgc-inv-vacio">Cargando inventario…</p>
                ) : items.length === 0 ? (
                    <p className="sgc-inv-vacio">
                        {busqueda
                            ? `Ningún elemento coincide con "${busqueda}".`
                            : 'Todavía no hay elementos registrados en esta planilla.'}
                    </p>
                ) : (
                    <>
                        <p className="sgc-inv-conteo">
                            {items.length} de {total} elementos
                        </p>
                        <ul className="sgc-inv-lista">
                            {items.map((item) => (
                                <li key={item.id} className="sgc-inv-card">
                                    <div className="sgc-inv-card-main">
                                        <span className="sgc-inv-card-desc">{item.descripcion}</span>
                                        <span className="sgc-inv-card-meta">
                                            {item.codigo || 'Sin código'} · {item.marca} · {item.planilla_nombre}
                                        </span>
                                    </div>
                                    <div
                                        className={`sgc-inv-stock ${item.stock_actual === 0 ? 'sgc-inv-stock--cero' : ''}`}
                                    >
                                        <strong>{item.stock_actual}</strong>
                                        <span>und.</span>
                                    </div>
                                    <div className="sgc-inv-card-acciones">
                                        <button
                                            type="button"
                                            className="sgc-inv-btn sgc-inv-btn--sm"
                                            onClick={() => abrirMovimiento(item, 'salida')}
                                            disabled={item.stock_actual === 0}
                                            title={item.stock_actual === 0 ? 'Sin unidades disponibles' : 'Registrar salida'}
                                        >
                                            Salida
                                        </button>
                                        <button
                                            type="button"
                                            className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost"
                                            onClick={() => abrirMovimiento(item, 'devolucion')}
                                        >
                                            Devolución
                                        </button>
                                        <button
                                            type="button"
                                            className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost"
                                            onClick={() => abrirKardex(item)}
                                        >
                                            Historial
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                  </>
                )}
            </div>

            {/* ── Modal: registrar movimiento ── */}
            {itemMovimiento && (
                <div className="sgc-inv-modal-overlay" onClick={() => setItemMovimiento(null)}>
                    <div className="sgc-inv-modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Registrar movimiento</h2>
                        <p className="sgc-inv-modal-sub">
                            {itemMovimiento.descripcion} · disponible: <strong>{itemMovimiento.stock_actual}</strong>
                        </p>

                        <form onSubmit={handleGuardarMovimiento} className="sgc-inv-form">
                            <label className="sgc-inv-label">
                                Tipo de movimiento
                                <select
                                    className="sgc-inv-input sgc-inv-input--select"
                                    value={tipoMovimiento}
                                    onChange={(e) => setTipoMovimiento(e.target.value)}
                                >
                                    {MOVIMIENTOS_TECNICO.map((m) => (
                                        <option key={m.valor} value={m.valor}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                                <span className="sgc-inv-hint">
                                    {MOVIMIENTOS_TECNICO.find((m) => m.valor === tipoMovimiento)?.ayuda}
                                </span>
                            </label>

                            <label className="sgc-inv-label">
                                Cantidad
                                <input
                                    type="number"
                                    min="1"
                                    max={tipoMovimiento === 'salida' ? itemMovimiento.stock_actual : undefined}
                                    className="sgc-inv-input"
                                    value={cantidad}
                                    onChange={(e) => setCantidad(e.target.value)}
                                    required
                                />
                            </label>

                            <label className="sgc-inv-label">
                                Observación <span className="sgc-inv-opcional">(opcional)</span>
                                <textarea
                                    className="sgc-inv-input sgc-inv-textarea"
                                    rows={3}
                                    placeholder="Ej: instalación oficina Chapinero, OT 4521"
                                    value={observacion}
                                    onChange={(e) => setObservacion(e.target.value)}
                                />
                            </label>

                            <div className="sgc-inv-modal-acciones">
                                <button
                                    type="button"
                                    className="sgc-inv-btn sgc-inv-btn--ghost"
                                    onClick={() => setItemMovimiento(null)}
                                    disabled={guardandoMovimiento}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="sgc-inv-btn sgc-inv-btn--primary"
                                    disabled={guardandoMovimiento}
                                >
                                    {guardandoMovimiento ? 'Guardando…' : 'Registrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: alta de ítem ── */}
            {modoAlta && (
                <div className="sgc-inv-modal-overlay" onClick={() => setModoAlta(false)}>
                    <div className="sgc-inv-modal sgc-inv-modal--ancho" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Registrar elemento nuevo</h2>
                        <p className="sgc-inv-modal-sub">
                            Antes de guardar te avisamos si el elemento ya existe con otra redacción.
                        </p>

                        <form onSubmit={handleCrearItem} className="sgc-inv-form">
                            <label className="sgc-inv-label">
                                Descripción del elemento
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    placeholder="Ej: BASE DETECTOR BOSCH FCA-350-B6R12"
                                    value={form.descripcion}
                                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                                    required
                                />
                            </label>

                            <div className="sgc-inv-grid2">
                                <label className="sgc-inv-label">
                                    Código de fábrica <span className="sgc-inv-opcional">(opcional)</span>
                                    <input
                                        type="text"
                                        className="sgc-inv-input"
                                        placeholder="Ej: F01U397739"
                                        value={form.codigo}
                                        onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                                    />
                                </label>
                                <label className="sgc-inv-label">
                                    Marca
                                    <input
                                        type="text"
                                        className="sgc-inv-input"
                                        placeholder="GENERICA"
                                        value={form.marca}
                                        onChange={(e) => setForm({ ...form, marca: e.target.value })}
                                    />
                                </label>
                            </div>

                            <BannerDuplicado
                                resultado={duplicados}
                                onUsarExistente={usarItemExistente}
                                onIgnorar={() => setDuplicadosIgnorados(true)}
                            />

                            <div className="sgc-inv-grid2">
                                <label className="sgc-inv-label">
                                    Planilla
                                    <select
                                        className="sgc-inv-input sgc-inv-input--select"
                                        value={form.planillaId}
                                        onChange={(e) => setForm({ ...form, planillaId: e.target.value })}
                                        required
                                    >
                                        <option value="">Selecciona…</option>
                                        {planillas.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="sgc-inv-label">
                                    Cantidad inicial
                                    <input
                                        type="number"
                                        min="0"
                                        className="sgc-inv-input"
                                        value={form.cantidadInicial}
                                        onChange={(e) => setForm({ ...form, cantidadInicial: e.target.value })}
                                    />
                                </label>
                            </div>

                            <CapturaFoto onArchivo={setFoto} deshabilitado={creando} />

                            <label className="sgc-inv-label">
                                Observación <span className="sgc-inv-opcional">(opcional)</span>
                                <textarea
                                    className="sgc-inv-input sgc-inv-textarea"
                                    rows={2}
                                    value={form.observacion}
                                    onChange={(e) => setForm({ ...form, observacion: e.target.value })}
                                />
                            </label>

                            <div className="sgc-inv-modal-acciones">
                                <button
                                    type="button"
                                    className="sgc-inv-btn sgc-inv-btn--ghost"
                                    onClick={() => setModoAlta(false)}
                                    disabled={creando}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="sgc-inv-btn sgc-inv-btn--primary"
                                    disabled={creando || bloqueadoPorDuplicadoExacto || avisoPosibleSinResolver}
                                    title={
                                        bloqueadoPorDuplicadoExacto
                                            ? 'Ese código ya está registrado'
                                            : avisoPosibleSinResolver
                                              ? 'Revisa primero los posibles duplicados'
                                              : undefined
                                    }
                                >
                                    {creando ? 'Guardando…' : 'Registrar elemento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: kardex ── */}
            {kardex && (
                <div className="sgc-inv-modal-overlay" onClick={() => setKardex(null)}>
                    <div className="sgc-inv-modal sgc-inv-modal--ancho" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Historial de movimientos</h2>
                        <p className="sgc-inv-modal-sub">
                            {kardex.item.descripcion} · stock actual: <strong>{kardex.item.stock_actual}</strong>
                        </p>
                        <TablaKardex movimientos={kardex.movimientos} cargando={cargandoKardex} />
                        <div className="sgc-inv-modal-acciones">
                            <button
                                type="button"
                                className="sgc-inv-btn sgc-inv-btn--ghost"
                                onClick={() => setKardex(null)}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </TecnicoLayout>
    );
}
