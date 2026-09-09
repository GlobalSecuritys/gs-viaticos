import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CapturaFoto from '../components/inventario/CapturaFoto';
import PanelTraspasos from '../components/inventario/PanelTraspasos';
import TablaKardex from '../components/inventario/TablaKardex';
import { formatApiError } from '../utils/formatError';
import {
    actualizarItem,
    actualizarPlanilla,
    crearItem,
    crearPlanilla,
    crearTraspaso,
    eliminarItem,
    etiquetaEntidad,
    listarItems,
    listarPlanillas,
    obtenerKardex,
    obtenerReporteGlobal,
    obtenerSiguienteCodigo,
    subirFotoItem,
} from '../services/inventario';
import './Inventario.css';

const EDIT_VACIO = { descripcion: '', codigo: '', marca: '', planillaId: '' };
const NUEVO_VACIO = { codigo: '', descripcion: '', marca: '', planillaId: '', stockInicial: 1 };

/**
 * Panel de supervisión de Inventario (proceso CI del Mapa SGC).
 * `soloLectura` corresponde al nivel "lector" de accesos_procesos['CI']:
 * ve todo el consolidado, pero no edita, no elimina y no crea planillas.
 *
 * `scope` acota el panel a una entidad de la jerarquía (una tarjeta de Global o
 * una unión temporal); `empresas` es la estructura completa, y solo se usa para
 * ofrecer los destinos posibles de un traspaso.
 */
export default function InventarioPanel({ scope, empresas = [], soloLectura = false }) {
    const navigate = useNavigate();
    const [pestana, setPestana] = useState('inventario');

    const [reporte, setReporte] = useState(null);
    const [planillas, setPlanillas] = useState([]);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [busqueda, setBusqueda] = useState('');
    const [planillaFiltro, setPlanillaFiltro] = useState('');
    const [soloAgotados, setSoloAgotados] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');

    const [itemEditando, setItemEditando] = useState(null);
    const [formEdit, setFormEdit] = useState(EDIT_VACIO);
    const [guardando, setGuardando] = useState(false);

    const [confirmarBorrado, setConfirmarBorrado] = useState(null);
    const [kardex, setKardex] = useState(null);
    const [cargandoKardex, setCargandoKardex] = useState(false);

    const [modalPlanillas, setModalPlanillas] = useState(false);
    const [nuevaPlanilla, setNuevaPlanilla] = useState('');
    const [guardandoPlanilla, setGuardandoPlanilla] = useState(false);

    // Alta de artículo
    const [modalNuevo, setModalNuevo] = useState(false);
    const [formNuevo, setFormNuevo] = useState(NUEVO_VACIO);
    const [fotoNueva, setFotoNueva] = useState(null);
    const [generandoCodigo, setGenerandoCodigo] = useState(false);
    const [creando, setCreando] = useState(false);
    const [errorNuevo, setErrorNuevo] = useState('');

    // Traspaso de stock hacia otra entidad
    const [itemTraspaso, setItemTraspaso] = useState(null);
    const [formTraspaso, setFormTraspaso] = useState({ destino: '', cantidad: 1, notas: '' });
    const [traspasando, setTraspasando] = useState(false);
    const [errorTraspaso, setErrorTraspaso] = useState('');
    // Sube en cada traspaso creado para que la pestaña se vuelva a leer.
    const [versionTraspasos, setVersionTraspasos] = useState(0);

    // Destinos posibles: todas las entidades de la jerarquía menos esta.
    // La clave "empresaId:clienteId" es lo que viaja en el <select>.
    const destinos = useMemo(() => {
        const lista = [];
        for (const empresa of empresas) {
            if (empresa.tipo === 'global') {
                for (const cliente of empresa.clientes || []) {
                    lista.push({
                        clave: `${empresa.id}:${cliente.id}`,
                        empresaId: empresa.id,
                        clienteId: cliente.id,
                        label: etiquetaEntidad(empresa.nombre, cliente.nombre),
                    });
                }
                // El inventario general de Global solo se ofrece si ya existe.
                if (empresa.total_items_directo > 0) {
                    lista.push({
                        clave: `${empresa.id}:`,
                        empresaId: empresa.id,
                        clienteId: null,
                        label: `${empresa.nombre} · Inventario general`,
                    });
                }
            } else {
                lista.push({
                    clave: `${empresa.id}:`,
                    empresaId: empresa.id,
                    clienteId: null,
                    label: empresa.nombre,
                });
            }
        }
        const propia = `${scope?.empresaId}:${scope?.clienteId || ''}`;
        return lista.filter((d) => d.clave !== propia);
    }, [empresas, scope]);

    const mostrarFeedback = useCallback((mensaje) => {
        setFeedback(mensaje);
        setTimeout(() => setFeedback(''), 4500);
    }, []);

    const cargarResumen = useCallback(async () => {
        try {
            const [rep, pls] = await Promise.all([
                obtenerReporteGlobal(scope),
                listarPlanillas(true, scope),
            ]);
            setReporte(rep);
            setPlanillas(pls);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el consolidado de inventario.'));
        }
    }, [scope]);

    const cargarItems = useCallback(async () => {
        setCargando(true);
        try {
            const data = await listarItems({
                q: busqueda.trim() || undefined,
                planillaId: planillaFiltro || undefined,
                limit: 500,
                scope,
            });
            const listado = soloAgotados ? data.items.filter((i) => i.stock_actual === 0) : data.items;
            setItems(listado);
            setTotal(data.total);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el listado de ítems.'));
        } finally {
            setCargando(false);
        }
    }, [busqueda, planillaFiltro, soloAgotados, scope]);

    useEffect(() => {
        cargarResumen();
    }, [cargarResumen]);

    useEffect(() => {
        const t = setTimeout(cargarItems, 300);
        return () => clearTimeout(t);
    }, [cargarItems]);

    const generarCodigo = useCallback(async () => {
        setGenerandoCodigo(true);
        try {
            const { codigo } = await obtenerSiguienteCodigo();
            setFormNuevo((prev) => ({ ...prev, codigo }));
            return codigo;
        } catch (err) {
            // Sin código sugerido el alta sigue siendo posible: el campo es editable.
            setErrorNuevo(formatApiError(err, 'No se pudo generar el código automático.'));
            return null;
        } finally {
            setGenerandoCodigo(false);
        }
    }, []);

    async function abrirNuevo() {
        const planillaInicial =
            planillaFiltro ||
            (planillas.find((p) => p.activa) ? String(planillas.find((p) => p.activa).id) : '');
        setFormNuevo({ ...NUEVO_VACIO, planillaId: planillaInicial });
        setFotoNueva(null);
        setErrorNuevo('');
        setModalNuevo(true);
        await generarCodigo();
    }

    async function handleCrearArticulo(e) {
        e.preventDefault();

        const descripcion = formNuevo.descripcion.trim();
        const marca = formNuevo.marca.trim();
        const stockInicial = Number(formNuevo.stockInicial);

        if (!descripcion || !marca || !formNuevo.planillaId) {
            setErrorNuevo('Descripción, marca y planilla son obligatorias.');
            return;
        }
        if (!Number.isInteger(stockInicial) || stockInicial < 0) {
            setErrorNuevo('El stock inicial debe ser un número entero mayor o igual a 0.');
            return;
        }

        setCreando(true);
        setErrorNuevo('');
        try {
            const item = await crearItem({
                descripcion,
                marca,
                planillaId: Number(formNuevo.planillaId),
                codigo: formNuevo.codigo.trim() || null,
                cantidadInicial: stockInicial,
                observacion: 'Alta de artículo desde el panel de Inventario.',
            });

            let mensaje = `Artículo "${item.descripcion}" creado con ${item.stock_actual} unidades.`;
            if (fotoNueva) {
                try {
                    await subirFotoItem(item.id, fotoNueva);
                } catch (errFoto) {
                    // El artículo ya quedó registrado: la foto es accesoria.
                    mensaje += ` La foto no se pudo subir: ${formatApiError(errFoto, 'error de carga')}`;
                }
            }

            setModalNuevo(false);
            setFormNuevo(NUEVO_VACIO);
            setFotoNueva(null);
            mostrarFeedback(mensaje);
            await Promise.all([cargarItems(), cargarResumen()]);
        } catch (err) {
            setErrorNuevo(formatApiError(err, 'No se pudo crear el artículo.'));
        } finally {
            setCreando(false);
        }
    }

    function abrirEdicion(item) {
        setItemEditando(item);
        setFormEdit({
            descripcion: item.descripcion,
            codigo: item.codigo || '',
            marca: item.marca,
            planillaId: String(item.planilla_id),
        });
    }

    async function handleGuardarEdicion(e) {
        e.preventDefault();
        if (!itemEditando) return;
        setGuardando(true);
        setError('');
        try {
            await actualizarItem(itemEditando.id, {
                descripcion: formEdit.descripcion,
                codigo: formEdit.codigo || null,
                marca: formEdit.marca,
                planilla_id: Number(formEdit.planillaId),
            });
            mostrarFeedback('Ficha del ítem actualizada.');
            setItemEditando(null);
            await Promise.all([cargarItems(), cargarResumen()]);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo actualizar el ítem.'));
        } finally {
            setGuardando(false);
        }
    }

    async function handleEliminar() {
        if (!confirmarBorrado) return;
        setGuardando(true);
        setError('');
        try {
            await eliminarItem(confirmarBorrado.id);
            mostrarFeedback(`"${confirmarBorrado.descripcion}" fue retirado del inventario.`);
            setConfirmarBorrado(null);
            await Promise.all([cargarItems(), cargarResumen()]);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo eliminar el ítem.'));
        } finally {
            setGuardando(false);
        }
    }

    function abrirTraspaso(item) {
        setItemTraspaso(item);
        setFormTraspaso({ destino: destinos[0]?.clave || '', cantidad: 1, notas: '' });
        setErrorTraspaso('');
    }

    async function handleCrearTraspaso(e) {
        e.preventDefault();
        if (!itemTraspaso) return;

        const destino = destinos.find((d) => d.clave === formTraspaso.destino);
        const cantidad = Number(formTraspaso.cantidad);
        if (!destino) {
            setErrorTraspaso('Selecciona la entidad de destino.');
            return;
        }
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > itemTraspaso.stock_actual) {
            setErrorTraspaso(
                `La cantidad debe estar entre 1 y ${itemTraspaso.stock_actual} unidades disponibles.`
            );
            return;
        }

        setTraspasando(true);
        setErrorTraspaso('');
        try {
            await crearTraspaso({
                itemOrigenId: itemTraspaso.id,
                cantidad,
                empresaDestinoId: destino.empresaId,
                clienteDestinoId: destino.clienteId,
                notas: formTraspaso.notas || null,
            });
            setItemTraspaso(null);
            // El stock sale del origen ya: el destino solo confirma la recepción.
            mostrarFeedback(
                `Traspaso enviado a ${destino.label}. Las ${cantidad} und. ya salieron de este ` +
                    'inventario y quedan pendientes de que el destino confirme la recepción.'
            );
            setVersionTraspasos((v) => v + 1);
            await Promise.all([cargarItems(), cargarResumen()]);
        } catch (err) {
            setErrorTraspaso(formatApiError(err, 'No se pudo crear el traspaso.'));
        } finally {
            setTraspasando(false);
        }
    }

    async function abrirKardex(item) {
        setKardex({ item, movimientos: [] });
        setCargandoKardex(true);
        try {
            setKardex(await obtenerKardex(item.id));
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el historial del ítem.'));
            setKardex(null);
        } finally {
            setCargandoKardex(false);
        }
    }

    async function handleCrearPlanilla(e) {
        e.preventDefault();
        if (!nuevaPlanilla.trim()) return;
        setGuardandoPlanilla(true);
        setError('');
        try {
            await crearPlanilla({
                nombre: nuevaPlanilla,
                empresaId: scope.empresaId,
                clienteId: scope.clienteId,
            });
            setNuevaPlanilla('');
            mostrarFeedback('Planilla creada.');
            await cargarResumen();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo crear la planilla.'));
        } finally {
            setGuardandoPlanilla(false);
        }
    }

    async function handleAlternarPlanilla(planilla) {
        setError('');
        try {
            await actualizarPlanilla(planilla.id, { activa: !planilla.activa });
            await cargarResumen();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo actualizar la planilla.'));
        }
    }

    return (
        <div className="sgc-inv-panel">
            <header className="sgc-inv-panel-header">
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
                            Inventario (IN) · Panel de supervisión
                            {soloLectura && ' · solo lectura'}
                        </p>
                    </div>
                </div>
                {!soloLectura && pestana === 'inventario' && (
                    <button
                        type="button"
                        className="sgc-inv-btn sgc-inv-btn--primary"
                        onClick={() => setModalPlanillas(true)}
                    >
                        Gestionar planillas
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

            {pestana === 'traspasos' && (
                <PanelTraspasos
                    key={versionTraspasos}
                    scope={scope}
                    puedeGestionar={!soloLectura}
                    onCambio={() => {
                        cargarItems();
                        cargarResumen();
                    }}
                />
            )}

            {pestana === 'inventario' && (
              <>
            {reporte && (
                <section className="sgc-inv-kpis">
                    <article className="sgc-inv-kpi">
                        <span className="sgc-inv-kpi-label">Elementos</span>
                        <strong className="sgc-inv-kpi-valor">{reporte.total_items}</strong>
                    </article>
                    <article className="sgc-inv-kpi">
                        <span className="sgc-inv-kpi-label">Unidades en stock</span>
                        <strong className="sgc-inv-kpi-valor">{reporte.total_unidades}</strong>
                    </article>
                    <article className="sgc-inv-kpi sgc-inv-kpi--alerta">
                        <span className="sgc-inv-kpi-label">Agotados</span>
                        <strong className="sgc-inv-kpi-valor">{reporte.items_en_cero}</strong>
                    </article>
                    <article className="sgc-inv-kpi">
                        <span className="sgc-inv-kpi-label">Movimientos</span>
                        <strong className="sgc-inv-kpi-valor">{reporte.total_movimientos}</strong>
                    </article>
                </section>
            )}

            {reporte?.por_planilla?.length > 0 && (
                <section className="sgc-inv-planillas-resumen">
                    {reporte.por_planilla.map((p) => (
                        <button
                            key={p.planilla_id}
                            type="button"
                            className={`sgc-inv-planilla-chip ${
                                String(planillaFiltro) === String(p.planilla_id) ? 'sgc-inv-planilla-chip--activa' : ''
                            }`}
                            onClick={() =>
                                setPlanillaFiltro(
                                    String(planillaFiltro) === String(p.planilla_id) ? '' : String(p.planilla_id)
                                )
                            }
                        >
                            <span className="sgc-inv-planilla-nombre">{p.planilla_nombre}</span>
                            <span className="sgc-inv-planilla-meta">
                                {p.total_items} ítems · {p.total_unidades} und.
                                {p.items_en_cero > 0 && ` · ${p.items_en_cero} agotados`}
                            </span>
                        </button>
                    ))}
                </section>
            )}

            <div className="sgc-inv-filtros">
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Buscar por descripción, código o marca…"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
                <label className="sgc-inv-check">
                    <input
                        type="checkbox"
                        checked={soloAgotados}
                        onChange={(e) => setSoloAgotados(e.target.checked)}
                    />
                    Solo agotados
                </label>
            </div>

            <div className="sgc-inv-tabla-wrap">
                <table className="sgc-inv-tabla">
                    <thead>
                        <tr>
                            <th>Descripción</th>
                            <th>Código</th>
                            <th>Marca</th>
                            <th>Planilla</th>
                            <th className="sgc-inv-num">Stock</th>
                            <th className="sgc-inv-acciones-col">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr>
                                <td colSpan={6} className="sgc-inv-tabla-vacio">
                                    Cargando ítems…
                                </td>
                            </tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="sgc-inv-tabla-vacio">
                                    No hay ítems que coincidan con el filtro.
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => (
                                <tr key={item.id}>
                                    <td className="sgc-inv-td-desc">
                                        {item.foto_referencia_url && (
                                            <img
                                                src={item.foto_referencia_url}
                                                alt=""
                                                className="sgc-inv-thumb"
                                            />
                                        )}
                                        {item.descripcion}
                                    </td>
                                    <td className="sgc-inv-mono">{item.codigo || '—'}</td>
                                    <td>{item.marca}</td>
                                    <td>{item.planilla_nombre}</td>
                                    <td
                                        className={`sgc-inv-num ${item.stock_actual === 0 ? 'sgc-inv-neg' : ''}`}
                                    >
                                        {item.stock_actual}
                                    </td>
                                    <td className="sgc-inv-acciones-col">
                                        <button
                                            type="button"
                                            className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost"
                                            onClick={() => abrirKardex(item)}
                                        >
                                            Kardex
                                        </button>
                                        {!soloLectura && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost"
                                                    onClick={() => abrirEdicion(item)}
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost"
                                                    onClick={() => abrirTraspaso(item)}
                                                    disabled={item.stock_actual === 0 || destinos.length === 0}
                                                    title={
                                                        item.stock_actual === 0
                                                            ? 'Sin unidades para traspasar'
                                                            : 'Traspasar unidades a otra entidad'
                                                    }
                                                >
                                                    Traspasar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--peligro"
                                                    onClick={() => setConfirmarBorrado(item)}
                                                >
                                                    Eliminar
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {!cargando && items.length > 0 && (
                <p className="sgc-inv-conteo">
                    Mostrando {items.length} de {total} elementos registrados.
                </p>
            )}
              </>
            )}

            {/* Alta rápida: siempre alcanzable sin volver al tope de la tabla. */}
            {!soloLectura && pestana === 'inventario' && (
                <button
                    type="button"
                    className="sgc-inv-fab"
                    onClick={abrirNuevo}
                    title="Registrar un artículo nuevo"
                >
                    <span className="sgc-inv-fab-icono" aria-hidden="true">+</span>
                    <span className="sgc-inv-fab-texto">Nuevo Artículo</span>
                </button>
            )}

            {/* ── Modal: nuevo artículo ── */}
            {modalNuevo && (
                <div className="sgc-inv-modal-overlay" onClick={() => !creando && setModalNuevo(false)}>
                    <div className="sgc-inv-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="sgc-inv-modal-head">
                            <h2 className="sgc-inv-modal-title">Nuevo Artículo</h2>
                            <button
                                type="button"
                                className="sgc-inv-modal-cerrar"
                                onClick={() => setModalNuevo(false)}
                                disabled={creando}
                                aria-label="Cerrar"
                            >
                                ✕
                            </button>
                        </div>

                        {errorNuevo && <div className="sgc-inv-alerta sgc-inv-alerta--err">{errorNuevo}</div>}

                        <form onSubmit={handleCrearArticulo} className="sgc-inv-form">
                            <div className="sgc-inv-label">
                                Foto <span className="sgc-inv-opcional">(opcional)</span>
                                <CapturaFoto onArchivo={setFotoNueva} deshabilitado={creando} />
                            </div>

                            <label className="sgc-inv-label">
                                Código <span className="sgc-inv-opcional">(auto-generado)</span>
                                <div className="sgc-inv-campo-accion">
                                    <input
                                        type="text"
                                        className="sgc-inv-input"
                                        value={formNuevo.codigo}
                                        onChange={(e) => setFormNuevo({ ...formNuevo, codigo: e.target.value })}
                                        placeholder={generandoCodigo ? 'Generando…' : 'INV-0000-0000'}
                                        maxLength={60}
                                    />
                                    <button
                                        type="button"
                                        className="sgc-inv-btn sgc-inv-btn--ghost"
                                        onClick={generarCodigo}
                                        disabled={generandoCodigo || creando}
                                        title="Generar el siguiente código disponible"
                                    >
                                        🔄
                                    </button>
                                </div>
                                <span className="sgc-inv-hint">
                                    Puedes reemplazarlo por el código de fábrica del elemento.
                                </span>
                            </label>

                            <label className="sgc-inv-label">
                                Descripción *
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    placeholder="Ej: BASE DETECTOR BOSCH FCA-350"
                                    value={formNuevo.descripcion}
                                    onChange={(e) => setFormNuevo({ ...formNuevo, descripcion: e.target.value })}
                                    required
                                />
                            </label>

                            <label className="sgc-inv-label">
                                Marca *
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    placeholder="Ej: BOSCH"
                                    value={formNuevo.marca}
                                    onChange={(e) => setFormNuevo({ ...formNuevo, marca: e.target.value })}
                                    required
                                />
                            </label>

                            <div className="sgc-inv-grid2">
                                <label className="sgc-inv-label">
                                    Planilla *
                                    <select
                                        className="sgc-inv-input sgc-inv-input--select"
                                        value={formNuevo.planillaId}
                                        onChange={(e) => setFormNuevo({ ...formNuevo, planillaId: e.target.value })}
                                        required
                                    >
                                        <option value="">Selecciona…</option>
                                        {planillas
                                            .filter((p) => p.activa)
                                            .map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.nombre}
                                                </option>
                                            ))}
                                    </select>
                                </label>

                                <label className="sgc-inv-label">
                                    Stock inicial
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="sgc-inv-input"
                                        value={formNuevo.stockInicial}
                                        onChange={(e) => setFormNuevo({ ...formNuevo, stockInicial: e.target.value })}
                                    />
                                    <span className="sgc-inv-hint">
                                        Queda registrado como movimiento de ajuste inicial.
                                    </span>
                                </label>
                            </div>

                            <div className="sgc-inv-modal-acciones">
                                <button
                                    type="button"
                                    className="sgc-inv-btn sgc-inv-btn--ghost"
                                    onClick={() => setModalNuevo(false)}
                                    disabled={creando}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="sgc-inv-btn sgc-inv-btn--primary" disabled={creando}>
                                    {creando ? 'Guardando…' : 'Guardar Artículo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: editar ficha ── */}
            {itemEditando && (
                <div className="sgc-inv-modal-overlay" onClick={() => setItemEditando(null)}>
                    <div className="sgc-inv-modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Editar ficha del ítem</h2>
                        <p className="sgc-inv-modal-sub">
                            El stock no se edita aquí: cambia solo a través de movimientos, para que el kardex
                            siempre cuadre.
                        </p>
                        <form onSubmit={handleGuardarEdicion} className="sgc-inv-form">
                            <label className="sgc-inv-label">
                                Descripción
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    value={formEdit.descripcion}
                                    onChange={(e) => setFormEdit({ ...formEdit, descripcion: e.target.value })}
                                    required
                                />
                            </label>
                            <div className="sgc-inv-grid2">
                                <label className="sgc-inv-label">
                                    Código
                                    <input
                                        type="text"
                                        className="sgc-inv-input"
                                        value={formEdit.codigo}
                                        onChange={(e) => setFormEdit({ ...formEdit, codigo: e.target.value })}
                                    />
                                </label>
                                <label className="sgc-inv-label">
                                    Marca
                                    <input
                                        type="text"
                                        className="sgc-inv-input"
                                        value={formEdit.marca}
                                        onChange={(e) => setFormEdit({ ...formEdit, marca: e.target.value })}
                                    />
                                </label>
                            </div>
                            <label className="sgc-inv-label">
                                Planilla
                                <select
                                    className="sgc-inv-input sgc-inv-input--select"
                                    value={formEdit.planillaId}
                                    onChange={(e) => setFormEdit({ ...formEdit, planillaId: e.target.value })}
                                >
                                    {planillas
                                        .filter((p) => p.activa || String(p.id) === formEdit.planillaId)
                                        .map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.nombre}
                                            </option>
                                        ))}
                                </select>
                            </label>
                            <div className="sgc-inv-modal-acciones">
                                <button
                                    type="button"
                                    className="sgc-inv-btn sgc-inv-btn--ghost"
                                    onClick={() => setItemEditando(null)}
                                    disabled={guardando}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="sgc-inv-btn sgc-inv-btn--primary" disabled={guardando}>
                                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: traspaso a otra entidad ── */}
            {itemTraspaso && (
                <div
                    className="sgc-inv-modal-overlay"
                    onClick={() => !traspasando && setItemTraspaso(null)}
                >
                    <div className="sgc-inv-modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Traspasar a otra entidad</h2>
                        <p className="sgc-inv-modal-sub">
                            <strong>{itemTraspaso.descripcion}</strong> · disponible:{' '}
                            <strong>{itemTraspaso.stock_actual}</strong> und. en{' '}
                            {etiquetaEntidad(scope?.empresaNombre, scope?.clienteNombre)}.
                        </p>

                        {errorTraspaso && (
                            <div className="sgc-inv-alerta sgc-inv-alerta--err">{errorTraspaso}</div>
                        )}

                        <form onSubmit={handleCrearTraspaso} className="sgc-inv-form">
                            <label className="sgc-inv-label">
                                Entidad de destino *
                                <select
                                    className="sgc-inv-input sgc-inv-input--select"
                                    value={formTraspaso.destino}
                                    onChange={(e) =>
                                        setFormTraspaso({ ...formTraspaso, destino: e.target.value })
                                    }
                                    required
                                >
                                    <option value="">Selecciona…</option>
                                    {destinos.map((d) => (
                                        <option key={d.clave} value={d.clave}>
                                            {d.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="sgc-inv-label">
                                Cantidad *
                                <input
                                    type="number"
                                    min="1"
                                    max={itemTraspaso.stock_actual}
                                    step="1"
                                    className="sgc-inv-input"
                                    value={formTraspaso.cantidad}
                                    onChange={(e) =>
                                        setFormTraspaso({ ...formTraspaso, cantidad: e.target.value })
                                    }
                                    required
                                />
                                <span className="sgc-inv-hint">
                                    Las unidades salen de este inventario apenas envías el traspaso; el
                                    destino solo confirma que las recibió. Si lo rechaza, vuelven aquí
                                    automáticamente.
                                </span>
                            </label>

                            <label className="sgc-inv-label">
                                Notas <span className="sgc-inv-opcional">(opcional)</span>
                                <textarea
                                    className="sgc-inv-input sgc-inv-textarea"
                                    rows={2}
                                    placeholder="Ej: préstamo para la OT 4521"
                                    value={formTraspaso.notas}
                                    onChange={(e) =>
                                        setFormTraspaso({ ...formTraspaso, notas: e.target.value })
                                    }
                                />
                            </label>

                            <div className="sgc-inv-modal-acciones">
                                <button
                                    type="button"
                                    className="sgc-inv-btn sgc-inv-btn--ghost"
                                    onClick={() => setItemTraspaso(null)}
                                    disabled={traspasando}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="sgc-inv-btn sgc-inv-btn--primary"
                                    disabled={traspasando}
                                >
                                    {traspasando ? 'Enviando…' : 'Enviar traspaso'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: confirmar eliminación ── */}
            {confirmarBorrado && (
                <div className="sgc-inv-modal-overlay" onClick={() => setConfirmarBorrado(null)}>
                    <div className="sgc-inv-modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Eliminar ítem</h2>
                        <p className="sgc-inv-modal-sub">
                            <strong>{confirmarBorrado.descripcion}</strong> dejará de aparecer en el inventario.
                            Su historial de movimientos se conserva para auditoría.
                        </p>
                        <div className="sgc-inv-modal-acciones">
                            <button
                                type="button"
                                className="sgc-inv-btn sgc-inv-btn--ghost"
                                onClick={() => setConfirmarBorrado(null)}
                                disabled={guardando}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="sgc-inv-btn sgc-inv-btn--peligro"
                                onClick={handleEliminar}
                                disabled={guardando}
                            >
                                {guardando ? 'Eliminando…' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: planillas ── */}
            {modalPlanillas && (
                <div className="sgc-inv-modal-overlay" onClick={() => setModalPlanillas(false)}>
                    <div className="sgc-inv-modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Planillas de inventario</h2>
                        <p className="sgc-inv-modal-sub">
                            Cada planilla agrupa los elementos de una línea de trabajo (mantenimiento, RTC, …).
                        </p>

                        <ul className="sgc-inv-planillas-lista">
                            {planillas.map((p) => (
                                <li key={p.id} className="sgc-inv-planilla-fila">
                                    <div>
                                        <strong>{p.nombre}</strong>
                                        <span className="sgc-inv-planilla-meta">
                                            {p.total_items} ítems · {p.total_unidades} und.
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost"
                                        onClick={() => handleAlternarPlanilla(p)}
                                    >
                                        {p.activa ? 'Desactivar' : 'Activar'}
                                    </button>
                                </li>
                            ))}
                        </ul>

                        <form onSubmit={handleCrearPlanilla} className="sgc-inv-planilla-form">
                            <input
                                type="text"
                                className="sgc-inv-input"
                                placeholder="Nombre de la nueva planilla"
                                value={nuevaPlanilla}
                                onChange={(e) => setNuevaPlanilla(e.target.value)}
                                maxLength={50}
                            />
                            <button
                                type="submit"
                                className="sgc-inv-btn sgc-inv-btn--primary"
                                disabled={guardandoPlanilla || !nuevaPlanilla.trim()}
                            >
                                {guardandoPlanilla ? 'Creando…' : 'Crear'}
                            </button>
                        </form>

                        <div className="sgc-inv-modal-acciones">
                            <button
                                type="button"
                                className="sgc-inv-btn sgc-inv-btn--ghost"
                                onClick={() => setModalPlanillas(false)}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: kardex ── */}
            {kardex && (
                <div className="sgc-inv-modal-overlay" onClick={() => setKardex(null)}>
                    <div className="sgc-inv-modal sgc-inv-modal--ancho" onClick={(e) => e.stopPropagation()}>
                        <h2 className="sgc-inv-modal-title">Kardex del ítem</h2>
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
        </div>
    );
}
