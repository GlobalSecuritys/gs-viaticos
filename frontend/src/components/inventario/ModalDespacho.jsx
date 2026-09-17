import { useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../utils/formatError';
import {
    ESTADOS_DESPACHO,
    actualizarDespacho,
    crearDespacho,
    etiquetaUnion,
    listarAsignacionesTecnico,
    listarItems,
} from '../../services/inventario';
import ModalInventario from './ModalInventario';

const hoy = () => new Date().toISOString().slice(0, 10);

function descripcionItem(it) {
    const partes = [it.descripcion];
    if (it.serial_gsb) partes.push(`serial ${it.serial_gsb}`);
    if (it.codigo_barras) partes.push(it.codigo_barras);
    return `${partes.join(' · ')} — ${etiquetaUnion(it.union_temporal)} (stock ${it.cantidad_stock})`;
}

/**
 * Crear o editar un despacho.
 *   despacho    -> edición de uno existente
 *   itemInicial -> alta desde la vista de stock (ítem ya elegido)
 * El técnico sale de la lista real de usuarios y la asignación es opcional.
 */
export default function ModalDespacho({ despacho, itemInicial, unionTemporal, tecnicos, onCerrar, onGuardado }) {
    const editando = Boolean(despacho);
    const [item, setItem] = useState(itemInicial || null);
    const [busquedaItem, setBusquedaItem] = useState('');
    const [opcionesItem, setOpcionesItem] = useState([]);
    const [buscandoItem, setBuscandoItem] = useState(false);

    const [form, setForm] = useState(() => ({
        tecnico_id: despacho?.tecnico_id ? String(despacho.tecnico_id) : '',
        asignacion_id: despacho?.asignacion_id ? String(despacho.asignacion_id) : '',
        cantidad: despacho?.cantidad ?? 1,
        fecha_despacho: despacho?.fecha_despacho || (editando ? '' : hoy()),
        estado: despacho?.estado || 'pendiente_instalacion',
        oficina_destino: despacho?.oficina_destino || '',
        oficina_instalada: despacho?.oficina_instalada || '',
        fecha_instalacion: despacho?.fecha_instalacion || '',
        numero_orden: despacho?.numero_orden || '',
        observacion: despacho?.observacion || '',
    }));
    const [asignaciones, setAsignaciones] = useState([]);
    const [cargandoAsig, setCargandoAsig] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const campo = (k) => ({ value: form[k], onChange: (e) => set(k, e.target.value) });

    // Búsqueda de ítems con stock (solo al crear sin ítem preseleccionado).
    useEffect(() => {
        if (editando || itemInicial) return undefined;
        const t = setTimeout(async () => {
            setBuscandoItem(true);
            try {
                const res = await listarItems({ unionTemporal, q: busquedaItem.trim(), soloConStock: true, limit: 50 });
                setOpcionesItem(res.items);
            } catch {
                setOpcionesItem([]);
            } finally {
                setBuscandoItem(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [busquedaItem, unionTemporal, editando, itemInicial]);

    // Asignaciones activas del técnico elegido (más la ya vinculada, si la hay).
    const tecnicoId = form.tecnico_id;
    useEffect(() => {
        if (!tecnicoId) {
            setAsignaciones([]);
            return;
        }
        let vigente = true;
        setCargandoAsig(true);
        const incluir = String(despacho?.tecnico_id) === tecnicoId ? despacho?.asignacion_id : null;
        listarAsignacionesTecnico(tecnicoId, incluir)
            .then((lista) => vigente && setAsignaciones(lista))
            .catch(() => vigente && setAsignaciones([]))
            .finally(() => vigente && setCargandoAsig(false));
        return () => {
            vigente = false;
        };
    }, [tecnicoId, despacho]);

    // Inactivos solo si ya estaban en el despacho: no se despacha a alguien retirado.
    const opcionesTecnico = useMemo(
        () => tecnicos.filter((t) => t.activo || String(t.id) === String(despacho?.tecnico_id)),
        [tecnicos, despacho]
    );

    async function guardar(e) {
        e.preventDefault();
        setError('');
        if (!editando && !item) {
            setError('Seleccione el ítem a despachar.');
            return;
        }
        const cuerpo = {
            asignacion_id: form.asignacion_id ? Number(form.asignacion_id) : null,
            cantidad: Number(form.cantidad),
            fecha_despacho: form.fecha_despacho || null,
            estado: form.estado,
            oficina_destino: form.oficina_destino,
            oficina_instalada: form.oficina_instalada,
            fecha_instalacion: form.fecha_instalacion || null,
            numero_orden: form.numero_orden,
            observacion: form.observacion,
        };
        if (form.tecnico_id) cuerpo.tecnico_id = Number(form.tecnico_id);

        setGuardando(true);
        try {
            const guardado = editando
                ? await actualizarDespacho(despacho.id, cuerpo)
                : await crearDespacho({ ...cuerpo, item_id: item.id });
            onGuardado(guardado, editando);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo guardar el despacho.'));
        } finally {
            setGuardando(false);
        }
    }

    const itemMostrado = editando
        ? `${despacho.item_descripcion}${despacho.item_serial_gsb ? ` · serial ${despacho.item_serial_gsb}` : ''} — ${etiquetaUnion(despacho.union_temporal)}`
        : item && descripcionItem(item);

    return (
        <ModalInventario
            titulo={editando ? `Editar despacho #${despacho.id}` : 'Nuevo despacho'}
            subtitulo={editando ? null : 'Registra la salida de un elemento hacia un técnico. Descuenta el stock.'}
            onCerrar={onCerrar}
            ocupado={guardando}
            ancho
        >
            <form className="sgc-inv-form" onSubmit={guardar}>
                <div className="sgc-inv-label">
                    Ítem
                    {itemMostrado ? (
                        <div className="sgc-inv-campo-accion">
                            <span className="sgc-inv-input sgc-inv-input--fijo">{itemMostrado}</span>
                            {!editando && !itemInicial && (
                                <button type="button" className="sgc-inv-btn sgc-inv-btn--ghost" onClick={() => setItem(null)}>
                                    Cambiar
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <input
                                type="search"
                                className="sgc-inv-input"
                                placeholder="Buscar ítem con stock por descripción, serial o código…"
                                value={busquedaItem}
                                onChange={(e) => setBusquedaItem(e.target.value)}
                                autoFocus
                            />
                            <div className="sgc-inv-opciones">
                                {buscandoItem && <p className="sgc-inv-hint">Buscando…</p>}
                                {!buscandoItem && opcionesItem.length === 0 && (
                                    <p className="sgc-inv-hint">No hay ítems con stock que coincidan.</p>
                                )}
                                {opcionesItem.map((it) => (
                                    <button key={it.id} type="button" className="sgc-inv-opcion" onClick={() => setItem(it)}>
                                        {descripcionItem(it)}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="sgc-inv-grid2">
                    <label className="sgc-inv-label">
                        Técnico
                        <select
                            className="sgc-inv-input sgc-inv-input--select"
                            required={!editando || Boolean(despacho?.tecnico_id)}
                            value={form.tecnico_id}
                            onChange={(e) => setForm((f) => ({ ...f, tecnico_id: e.target.value, asignacion_id: '' }))}
                        >
                            <option value="">Seleccione un técnico…</option>
                            {opcionesTecnico.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.nombre}{t.activo ? '' : ' (inactivo)'}
                                </option>
                            ))}
                        </select>
                        {editando && !despacho.tecnico_id && despacho.tecnico_nombre_origen && (
                            <span className="sgc-inv-hint">
                                En el Excel figuraba “{despacho.tecnico_nombre_origen}”, que no coincide con ningún usuario.
                            </span>
                        )}
                    </label>
                    <label className="sgc-inv-label">
                        Asignación <span className="sgc-inv-opcional">opcional</span>
                        <select
                            className="sgc-inv-input sgc-inv-input--select"
                            disabled={!form.tecnico_id || cargandoAsig}
                            {...campo('asignacion_id')}
                        >
                            <option value="">
                                {!form.tecnico_id
                                    ? 'Primero elija el técnico'
                                    : cargandoAsig
                                        ? 'Cargando…'
                                        : asignaciones.length
                                            ? 'Sin asignación'
                                            : 'El técnico no tiene asignaciones activas'}
                            </option>
                            {asignaciones.map((a) => (
                                <option key={a.id} value={a.id}>{a.etiqueta}</option>
                            ))}
                        </select>
                    </label>

                    <label className="sgc-inv-label">
                        Estado
                        <select className="sgc-inv-input sgc-inv-input--select" required {...campo('estado')}>
                            {ESTADOS_DESPACHO.map((e) => (
                                <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
                            ))}
                        </select>
                    </label>
                    <label className="sgc-inv-label">
                        Cantidad
                        <input type="number" min="1" className="sgc-inv-input" required {...campo('cantidad')} />
                    </label>

                    <label className="sgc-inv-label">
                        Fecha de despacho
                        <input type="date" className="sgc-inv-input" required={!editando} {...campo('fecha_despacho')} />
                    </label>
                    <label className="sgc-inv-label">
                        Oficina destino <span className="sgc-inv-opcional">opcional</span>
                        <input className="sgc-inv-input" maxLength={120} {...campo('oficina_destino')} />
                    </label>

                    <label className="sgc-inv-label">
                        Número de orden <span className="sgc-inv-opcional">opcional</span>
                        <input className="sgc-inv-input" maxLength={60} {...campo('numero_orden')} />
                    </label>
                    <label className="sgc-inv-label">
                        Oficina instalada <span className="sgc-inv-opcional">opcional</span>
                        <input className="sgc-inv-input" maxLength={120} {...campo('oficina_instalada')} />
                    </label>

                    <label className="sgc-inv-label">
                        Fecha de instalación <span className="sgc-inv-opcional">opcional</span>
                        <input type="date" className="sgc-inv-input" {...campo('fecha_instalacion')} />
                    </label>
                </div>

                <label className="sgc-inv-label">
                    Observación <span className="sgc-inv-opcional">opcional</span>
                    <textarea className="sgc-inv-input sgc-inv-textarea" rows={2} {...campo('observacion')} />
                </label>

                {editando && despacho.nota_migracion && (
                    <p className="sgc-inv-hint">Valores originales del Excel: {despacho.nota_migracion}</p>
                )}
                {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

                <div className="sgc-inv-modal-acciones">
                    <button type="button" className="sgc-inv-btn sgc-inv-btn--ghost" onClick={onCerrar} disabled={guardando}>
                        Cancelar
                    </button>
                    <button type="submit" className="sgc-inv-btn sgc-inv-btn--primary" disabled={guardando}>
                        {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar despacho'}
                    </button>
                </div>
            </form>
        </ModalInventario>
    );
}
