import { useCallback, useEffect, useState } from 'react';
import { formatApiError } from '../../utils/formatError';
import {
    UNIONES_TEMPORALES,
    actualizarPrestamo,
    crearPrestamo,
    eliminarPrestamo,
    etiquetaUnion,
    listarPrestamos,
} from '../../services/inventario';
import ModalInventario, { ModalConfirmar } from './ModalInventario';

const VACIO = { union_temporal: '', descripcion: '', cantidad: 1 };

/** Vista de préstamos: equivalente a la hoja PRESTAMOS (descripción + cantidad). */
export default function TabPrestamos({ unionTemporal, puedeEditar, avisar }) {
    const [q, setQ] = useState('');
    const [prestamos, setPrestamos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(VACIO);
    const [borrando, setBorrando] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [errorForm, setErrorForm] = useState('');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setPrestamos(await listarPrestamos({ unionTemporal, q: q.trim() }));
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los préstamos.'));
        } finally {
            setCargando(false);
        }
    }, [unionTemporal, q]);

    useEffect(() => {
        const t = setTimeout(cargar, 250);
        return () => clearTimeout(t);
    }, [cargar]);

    function abrir(p) {
        setErrorForm('');
        setEditando(p || {});
        setForm(
            p
                ? { union_temporal: p.union_temporal, descripcion: p.descripcion, cantidad: p.cantidad }
                : { ...VACIO, union_temporal: unionTemporal || '' }
        );
    }

    async function guardar(e) {
        e.preventDefault();
        setOcupado(true);
        setErrorForm('');
        const cuerpo = { ...form, cantidad: Number(form.cantidad) };
        try {
            if (editando.id) await actualizarPrestamo(editando.id, cuerpo);
            else await crearPrestamo(cuerpo);
            avisar(editando.id ? 'Préstamo actualizado.' : 'Préstamo registrado.');
            setEditando(null);
            cargar();
        } catch (err) {
            setErrorForm(formatApiError(err, 'No se pudo guardar el préstamo.'));
        } finally {
            setOcupado(false);
        }
    }

    async function confirmarBorrado() {
        setOcupado(true);
        setErrorForm('');
        try {
            await eliminarPrestamo(borrando.id);
            setBorrando(null);
            avisar('Préstamo eliminado.');
            cargar();
        } catch (err) {
            setErrorForm(formatApiError(err, 'No se pudo eliminar el préstamo.'));
        } finally {
            setOcupado(false);
        }
    }

    const total = prestamos.reduce((acc, p) => acc + p.cantidad, 0);
    const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

    return (
        <>
            <section className="sgc-inv-kpis">
                <article className="sgc-inv-kpi">
                    <span className="sgc-inv-kpi-label">Registros</span>
                    <strong className="sgc-inv-kpi-valor">{prestamos.length}</strong>
                </article>
                <article className="sgc-inv-kpi">
                    <span className="sgc-inv-kpi-label">Unidades prestadas</span>
                    <strong className="sgc-inv-kpi-valor">{total}</strong>
                </article>
            </section>

            <div className="sgc-inv-filtros">
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Buscar por descripción…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                {puedeEditar && (
                    <button type="button" className="sgc-inv-btn sgc-inv-btn--primary" onClick={() => abrir(null)}>
                        + Nuevo préstamo
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
                            <th className="sgc-inv-num">Cantidad</th>
                            {puedeEditar && <th className="sgc-inv-acciones-col">Acciones</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando && prestamos.length === 0 ? (
                            <tr><td colSpan={4} className="sgc-inv-tabla-vacio">Cargando préstamos…</td></tr>
                        ) : prestamos.length === 0 ? (
                            <tr><td colSpan={4} className="sgc-inv-tabla-vacio">No hay préstamos registrados.</td></tr>
                        ) : (
                            prestamos.map((p) => (
                                <tr key={p.id}>
                                    <td className="sgc-inv-td-desc">{p.descripcion}</td>
                                    <td>{etiquetaUnion(p.union_temporal)}</td>
                                    <td className="sgc-inv-num">{p.cantidad}</td>
                                    {puedeEditar && (
                                        <td className="sgc-inv-acciones-col">
                                            <button type="button" className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost" onClick={() => abrir(p)}>
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--peligro"
                                                onClick={() => { setErrorForm(''); setBorrando(p); }}
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

            {editando && (
                <ModalInventario
                    titulo={editando.id ? 'Editar préstamo' : 'Nuevo préstamo'}
                    onCerrar={() => setEditando(null)}
                    ocupado={ocupado}
                >
                    <form className="sgc-inv-form" onSubmit={guardar}>
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
                            Descripción
                            <input className="sgc-inv-input" required maxLength={255} {...campo('descripcion')} />
                        </label>
                        <label className="sgc-inv-label">
                            Cantidad
                            <input type="number" min="1" className="sgc-inv-input" required {...campo('cantidad')} />
                        </label>
                        {errorForm && <div className="sgc-inv-alerta sgc-inv-alerta--err">{errorForm}</div>}
                        <div className="sgc-inv-modal-acciones">
                            <button type="button" className="sgc-inv-btn sgc-inv-btn--ghost" onClick={() => setEditando(null)} disabled={ocupado}>
                                Cancelar
                            </button>
                            <button type="submit" className="sgc-inv-btn sgc-inv-btn--primary" disabled={ocupado}>
                                {ocupado ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                </ModalInventario>
            )}

            {borrando && (
                <ModalConfirmar
                    titulo="Eliminar préstamo"
                    mensaje={`Se eliminará el préstamo de ${borrando.cantidad} × "${borrando.descripcion}".`}
                    onConfirmar={confirmarBorrado}
                    onCerrar={() => setBorrando(null)}
                    ocupado={ocupado}
                    error={errorForm}
                />
            )}
        </>
    );
}
