import { useCallback, useEffect, useState } from 'react';
import { formatApiError } from '../../utils/formatError';
import {
    UNIONES_TEMPORALES,
    actualizarItem,
    crearItem,
    eliminarItem,
    etiquetaUnion,
    listarItems,
} from '../../services/inventario';
import ModalInventario, { ModalConfirmar } from './ModalInventario';

const ITEM_VACIO = {
    union_temporal: '',
    descripcion: '',
    codigo_barras: '',
    serial_gsb: '',
    id_equipo: '',
    no_sds: '',
    factura: '',
    fecha_compra: '',
    cantidad_stock: 0,
};

/** Vista de stock: equivalente a la hoja INVENTARIO GENERAL. */
export default function TabStock({ unionTemporal, puedeEditar, version, onDespachar, avisar }) {
    const [q, setQ] = useState('');
    const [soloConStock, setSoloConStock] = useState(true);
    const [datos, setDatos] = useState({ total: 0, total_unidades: 0, items: [] });
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    const [editando, setEditando] = useState(null); // null | {} (nuevo) | item
    const [form, setForm] = useState(ITEM_VACIO);
    const [guardando, setGuardando] = useState(false);
    const [errorForm, setErrorForm] = useState('');
    const [borrando, setBorrando] = useState(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setDatos(await listarItems({ unionTemporal, q: q.trim(), soloConStock }));
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el stock.'));
        } finally {
            setCargando(false);
        }
    }, [unionTemporal, q, soloConStock]);

    useEffect(() => {
        const t = setTimeout(cargar, 250);
        return () => clearTimeout(t);
    }, [cargar, version]);

    function abrir(item) {
        setErrorForm('');
        setEditando(item || {});
        setForm(
            item
                ? Object.fromEntries(Object.keys(ITEM_VACIO).map((k) => [k, item[k] ?? '']))
                : { ...ITEM_VACIO, union_temporal: unionTemporal || '' }
        );
    }

    async function guardar(e) {
        e.preventDefault();
        setGuardando(true);
        setErrorForm('');
        const cuerpo = {
            ...form,
            fecha_compra: form.fecha_compra || null,
            cantidad_stock: Number(form.cantidad_stock) || 0,
        };
        try {
            if (editando.id) {
                await actualizarItem(editando.id, cuerpo);
                avisar('Ítem actualizado.');
            } else {
                await crearItem(cuerpo);
                avisar('Ítem registrado.');
            }
            setEditando(null);
            cargar();
        } catch (err) {
            setErrorForm(formatApiError(err, 'No se pudo guardar el ítem.'));
        } finally {
            setGuardando(false);
        }
    }

    async function confirmarBorrado() {
        setGuardando(true);
        setErrorForm('');
        try {
            await eliminarItem(borrando.id);
            setBorrando(null);
            avisar('Ítem eliminado.');
            cargar();
        } catch (err) {
            setErrorForm(formatApiError(err, 'No se pudo eliminar el ítem.'));
        } finally {
            setGuardando(false);
        }
    }

    const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

    return (
        <>
            <section className="sgc-inv-kpis">
                <article className="sgc-inv-kpi">
                    <span className="sgc-inv-kpi-label">Ítems</span>
                    <strong className="sgc-inv-kpi-valor">{datos.total}</strong>
                </article>
                <article className="sgc-inv-kpi">
                    <span className="sgc-inv-kpi-label">Unidades en stock</span>
                    <strong className="sgc-inv-kpi-valor">{datos.total_unidades}</strong>
                </article>
            </section>

            <div className="sgc-inv-filtros">
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Buscar por descripción, código de barras, serial GSB, ID. equipo o factura…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <label className="sgc-inv-check">
                    <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
                    Solo con stock
                </label>
                {puedeEditar && (
                    <button type="button" className="sgc-inv-btn sgc-inv-btn--primary" onClick={() => abrir(null)}>
                        + Nuevo ítem
                    </button>
                )}
            </div>

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            <div className="sgc-inv-tabla-wrap">
                <table className="sgc-inv-tabla">
                    <thead>
                        <tr>
                            <th>Descripción</th>
                            <th>UT</th>
                            <th>Código de barras</th>
                            <th>Serial GSB</th>
                            <th>ID. equipo</th>
                            <th>Factura</th>
                            <th>Fecha compra</th>
                            <th className="sgc-inv-num">Stock</th>
                            <th className="sgc-inv-num">Despachos</th>
                            {puedeEditar && <th className="sgc-inv-acciones-col">Acciones</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando && datos.items.length === 0 ? (
                            <tr><td colSpan={10} className="sgc-inv-tabla-vacio">Cargando stock…</td></tr>
                        ) : datos.items.length === 0 ? (
                            <tr><td colSpan={10} className="sgc-inv-tabla-vacio">No hay ítems que coincidan con el filtro.</td></tr>
                        ) : (
                            datos.items.map((it) => (
                                <tr key={it.id}>
                                    <td className="sgc-inv-td-desc">{it.descripcion}</td>
                                    <td>{etiquetaUnion(it.union_temporal)}</td>
                                    <td className="sgc-inv-mono">{it.codigo_barras || '—'}</td>
                                    <td className="sgc-inv-mono">{it.serial_gsb || '—'}</td>
                                    <td className="sgc-inv-mono">{it.id_equipo || '—'}</td>
                                    <td className="sgc-inv-mono">{it.factura || '—'}</td>
                                    <td>{it.fecha_compra || '—'}</td>
                                    <td className={`sgc-inv-num ${it.cantidad_stock === 0 ? 'sgc-inv-neg' : ''}`}>
                                        {it.cantidad_stock}
                                    </td>
                                    <td className="sgc-inv-num">{it.total_despachos}</td>
                                    {puedeEditar && (
                                        <td className="sgc-inv-acciones-col">
                                            <button
                                                type="button"
                                                className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--primary"
                                                onClick={() => onDespachar(it)}
                                                disabled={it.cantidad_stock === 0}
                                                title={it.cantidad_stock === 0 ? 'Sin stock para despachar' : 'Despachar a un técnico'}
                                            >
                                                Despachar
                                            </button>
                                            <button type="button" className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost" onClick={() => abrir(it)}>
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--peligro"
                                                onClick={() => { setErrorForm(''); setBorrando(it); }}
                                                disabled={it.total_despachos > 0}
                                                title={it.total_despachos > 0 ? 'Tiene despachos registrados' : 'Eliminar ítem'}
                                            >
                                                Eliminar
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            {datos.items.length > 0 && (
                <p className="sgc-inv-conteo">Mostrando {datos.items.length} de {datos.total} ítems.</p>
            )}

            {editando && (
                <ModalInventario
                    titulo={editando.id ? 'Editar ítem' : 'Nuevo ítem de inventario'}
                    subtitulo="Los elementos sin serial agrupan sus unidades en el stock."
                    onCerrar={() => setEditando(null)}
                    ocupado={guardando}
                    ancho
                >
                    <form className="sgc-inv-form" onSubmit={guardar}>
                        <div className="sgc-inv-grid2">
                            <label className="sgc-inv-label">
                                Unión temporal
                                <select className="sgc-inv-input sgc-inv-input--select" required {...campo('union_temporal')}>
                                    <option value="">Seleccione…</option>
                                    {UNIONES_TEMPORALES.map((u) => (
                                        <option key={u.valor} value={u.valor}>{u.etiqueta}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="sgc-inv-label">
                                Cantidad en stock
                                <input type="number" min="0" className="sgc-inv-input" required {...campo('cantidad_stock')} />
                            </label>
                        </div>
                        <label className="sgc-inv-label">
                            Descripción
                            <input className="sgc-inv-input" required maxLength={255} {...campo('descripcion')} />
                        </label>
                        <div className="sgc-inv-grid2">
                            <label className="sgc-inv-label">
                                Código de barras <span className="sgc-inv-opcional">opcional</span>
                                <input className="sgc-inv-input" maxLength={60} {...campo('codigo_barras')} />
                            </label>
                            <label className="sgc-inv-label">
                                Serial GSB <span className="sgc-inv-opcional">opcional</span>
                                <input className="sgc-inv-input" maxLength={60} {...campo('serial_gsb')} />
                            </label>
                            <label className="sgc-inv-label">
                                ID. equipo <span className="sgc-inv-opcional">opcional</span>
                                <input className="sgc-inv-input" maxLength={60} {...campo('id_equipo')} />
                            </label>
                            <label className="sgc-inv-label">
                                No SDS <span className="sgc-inv-opcional">opcional</span>
                                <input className="sgc-inv-input" maxLength={60} {...campo('no_sds')} />
                            </label>
                            <label className="sgc-inv-label">
                                Factura <span className="sgc-inv-opcional">opcional</span>
                                <input className="sgc-inv-input" maxLength={60} {...campo('factura')} />
                            </label>
                            <label className="sgc-inv-label">
                                Fecha de compra <span className="sgc-inv-opcional">opcional</span>
                                <input type="date" className="sgc-inv-input" {...campo('fecha_compra')} />
                            </label>
                        </div>
                        {errorForm && <div className="sgc-inv-alerta sgc-inv-alerta--err">{errorForm}</div>}
                        <div className="sgc-inv-modal-acciones">
                            <button type="button" className="sgc-inv-btn sgc-inv-btn--ghost" onClick={() => setEditando(null)} disabled={guardando}>
                                Cancelar
                            </button>
                            <button type="submit" className="sgc-inv-btn sgc-inv-btn--primary" disabled={guardando}>
                                {guardando ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                </ModalInventario>
            )}

            {borrando && (
                <ModalConfirmar
                    titulo="Eliminar ítem"
                    mensaje={`Se eliminará "${borrando.descripcion}"${borrando.serial_gsb ? ` (serial ${borrando.serial_gsb})` : ''}.`}
                    onConfirmar={confirmarBorrado}
                    onCerrar={() => setBorrando(null)}
                    ocupado={guardando}
                    error={errorForm}
                />
            )}
        </>
    );
}
