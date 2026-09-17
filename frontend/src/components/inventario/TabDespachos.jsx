import { useCallback, useEffect, useState } from 'react';
import { formatApiError } from '../../utils/formatError';
import {
    ESTADOS_DESPACHO,
    cambiarEstadoDespacho,
    eliminarDespacho,
    etiquetaUnion,
    listarDespachos,
} from '../../services/inventario';
import { EstadoBadge, ModalConfirmar } from './ModalInventario';

const SIN_TECNICO = 'sin';

/** Vista de despachos: equivalente a la hoja SALIDAS. */
export default function TabDespachos({ unionTemporal, mostrarUnion, tecnicos, puedeEditar, version, onNuevo, onEditar, avisar }) {
    const [tecnico, setTecnico] = useState('');
    const [oficina, setOficina] = useState('');
    const [estado, setEstado] = useState('');
    const [q, setQ] = useState('');
    const [datos, setDatos] = useState({ total: 0, por_estado: {}, despachos: [] });
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [cambiando, setCambiando] = useState(null);
    const [borrando, setBorrando] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [errorBorrado, setErrorBorrado] = useState('');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setDatos(
                await listarDespachos({
                    unionTemporal,
                    tecnicoId: tecnico && tecnico !== SIN_TECNICO ? tecnico : undefined,
                    sinTecnico: tecnico === SIN_TECNICO,
                    estado,
                    oficina: oficina.trim(),
                    q: q.trim(),
                })
            );
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los despachos.'));
        } finally {
            setCargando(false);
        }
    }, [unionTemporal, tecnico, estado, oficina, q]);

    useEffect(() => {
        const t = setTimeout(cargar, 250);
        return () => clearTimeout(t);
    }, [cargar, version]);

    async function cambiarEstado(d, nuevo) {
        if (nuevo === d.estado) return;
        setCambiando(d.id);
        setError('');
        try {
            // Al marcar instalado sin fecha, se toma hoy como fecha de instalación.
            const fecha = nuevo === 'instalado' && !d.fecha_instalacion ? new Date().toISOString().slice(0, 10) : null;
            await cambiarEstadoDespacho(d.id, nuevo, fecha);
            avisar(`Despacho #${d.id}: ${ESTADOS_DESPACHO.find((e) => e.valor === nuevo)?.etiqueta}.`);
            cargar();
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cambiar el estado.'));
        } finally {
            setCambiando(null);
        }
    }

    async function confirmarBorrado() {
        setOcupado(true);
        setErrorBorrado('');
        try {
            await eliminarDespacho(borrando.id);
            setBorrando(null);
            avisar('Despacho eliminado; las unidades volvieron al stock.');
            cargar();
        } catch (err) {
            setErrorBorrado(formatApiError(err, 'No se pudo eliminar el despacho.'));
        } finally {
            setOcupado(false);
        }
    }

    const totalSinFiltroEstado = Object.values(datos.por_estado).reduce((a, b) => a + b, 0);

    return (
        <>
            <section className="sgc-inv-chips" role="group" aria-label="Filtrar por estado">
                <button
                    type="button"
                    className={`sgc-inv-chip ${estado === '' ? 'sgc-inv-chip--activo' : ''}`}
                    onClick={() => setEstado('')}
                >
                    <span className="sgc-inv-chip-texto">Todos</span>
                    <span className="sgc-inv-chip-conteo">{totalSinFiltroEstado}</span>
                </button>
                {ESTADOS_DESPACHO.map((e) => (
                    <button
                        key={e.valor}
                        type="button"
                        className={`sgc-inv-chip ${estado === e.valor ? 'sgc-inv-chip--activo' : ''}`}
                        onClick={() => setEstado(estado === e.valor ? '' : e.valor)}
                    >
                        <EstadoBadge estado={e.valor} />
                        <span className="sgc-inv-chip-conteo">{datos.por_estado[e.valor] ?? 0}</span>
                    </button>
                ))}
            </section>

            <div className="sgc-inv-toolbar">
                <select className="sgc-inv-input sgc-inv-input--select" value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
                    <option value="">Todos los técnicos</option>
                    <option value={SIN_TECNICO}>— Sin técnico vinculado —</option>
                    {tecnicos.map((t) => (
                        <option key={t.id} value={t.id}>{t.nombre}{t.activo ? '' : ' (inactivo)'}</option>
                    ))}
                </select>
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Oficina destino o instalada…"
                    value={oficina}
                    onChange={(e) => setOficina(e.target.value)}
                />
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Ítem, serial, código u orden…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                {puedeEditar && (
                    <button type="button" className="sgc-inv-btn sgc-inv-btn--primary" onClick={onNuevo}>
                        Nuevo despacho
                    </button>
                )}
            </div>

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            <div className="sgc-inv-tabla-wrap">
                <table className="sgc-inv-tabla">
                    <thead>
                        <tr>
                            <th>Despacho</th>
                            <th>Ítem</th>
                            <th>Técnico</th>
                            <th>Oficina destino</th>
                            <th>Orden</th>
                            <th>Instalación</th>
                            <th>Asignación</th>
                            <th>Estado</th>
                            {puedeEditar && <th className="sgc-inv-acciones-col">Acciones</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando && datos.despachos.length === 0 ? (
                            <tr><td colSpan={9} className="sgc-inv-tabla-vacio">Cargando despachos…</td></tr>
                        ) : datos.despachos.length === 0 ? (
                            <tr><td colSpan={9} className="sgc-inv-tabla-vacio">No hay despachos que coincidan con el filtro.</td></tr>
                        ) : (
                            datos.despachos.map((d) => (
                                <tr key={d.id}>
                                    <td>
                                        <div>{d.fecha_despacho || '—'}</div>
                                        <div className="sgc-inv-sub">
                                            {[mostrarUnion && etiquetaUnion(d.union_temporal), d.cantidad > 1 && `${d.cantidad} und.`]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </div>
                                    </td>
                                    <td className="sgc-inv-td-desc">
                                        <div>{d.item_descripcion}</div>
                                        <div className="sgc-inv-sub sgc-inv-mono">
                                            {[d.item_serial_gsb && `Serial ${d.item_serial_gsb}`, d.item_codigo_barras]
                                                .filter(Boolean)
                                                .join(' · ') || '—'}
                                        </div>
                                    </td>
                                    <td>
                                        {d.tecnico_nombre || (
                                            <span className="sgc-inv-sin-vinculo" title="No coincide con ningún usuario">
                                                {d.tecnico_nombre_origen || 'Sin técnico'}
                                            </span>
                                        )}
                                    </td>
                                    <td>{d.oficina_destino || '—'}</td>
                                    <td className="sgc-inv-mono">{d.numero_orden || '—'}</td>
                                    <td>
                                        <div>{d.oficina_instalada || '—'}</div>
                                        <div className="sgc-inv-sub">{d.fecha_instalacion || ''}</div>
                                    </td>
                                    <td className="sgc-inv-sub">{d.asignacion_etiqueta || '—'}</td>
                                    <td>
                                        <EstadoBadge estado={d.estado} />
                                        {d.nota_migracion && (
                                            <div className="sgc-inv-sub" title={d.nota_migracion}>Nota del Excel</div>
                                        )}
                                    </td>
                                    {puedeEditar && (
                                        <td className="sgc-inv-acciones-col">
                                            <select
                                                className="sgc-inv-input sgc-inv-input--select sgc-inv-input--sm"
                                                value={d.estado}
                                                disabled={cambiando === d.id}
                                                onChange={(e) => cambiarEstado(d, e.target.value)}
                                                aria-label="Cambiar estado"
                                            >
                                                {ESTADOS_DESPACHO.map((e) => (
                                                    <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
                                                ))}
                                            </select>
                                            <button type="button" className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--ghost" onClick={() => onEditar(d)}>
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                className="sgc-inv-btn sgc-inv-btn--sm sgc-inv-btn--peligro"
                                                onClick={() => { setErrorBorrado(''); setBorrando(d); }}
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
            {datos.despachos.length > 0 && (
                <p className="sgc-inv-conteo">Mostrando {datos.despachos.length} de {datos.total} despachos.</p>
            )}

            {borrando && (
                <ModalConfirmar
                    titulo="Eliminar despacho"
                    mensaje={`Se eliminará el despacho #${borrando.id} (${borrando.item_descripcion}) y ${borrando.cantidad} unidad(es) volverán al stock.`}
                    onConfirmar={confirmarBorrado}
                    onCerrar={() => setBorrando(null)}
                    ocupado={ocupado}
                    error={errorBorrado}
                />
            )}
        </>
    );
}
