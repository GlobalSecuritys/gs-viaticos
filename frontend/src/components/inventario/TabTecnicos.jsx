import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../utils/formatError';
import {
    actualizarItemTecnico,
    crearItemTecnico,
    eliminarItemTecnico,
    listarItemsTecnico,
    listarResumenTecnicosInventario,
} from '../../services/inventario';
import ModalInventario, { ModalConfirmar } from './ModalInventario';

const ITEM_VACIO = {
    descripcion: '',
    cantidad: 1,
    codigo_barras: '',
    serial_gsb: '',
    id_equipo: '',
    factura: '',
    fecha_compra: '',
    oficina: '',
    concatenado: '',
    fecha_despacho: '',
    observacion: '',
    numero_orden: '',
    oficina_instalada: '',
    fecha_instalacion: '',
};

// Genera iniciales para el avatar
function obtenerIniciales(nombre) {
    if (!nombre) return 'TC';
    return nombre
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');
}

// Colores consistentes para los avatares según el ID
const COLORES_AVATAR = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'
];

export default function TabTecnicos({ unionTemporal, puedeEditar, version, avisar }) {
    const [resumenTecnicos, setResumenTecnicos] = useState([]);
    const [tecnicoId, setTecnicoId] = useState(null); // null = galería de tarjetas
    const [items, setItems] = useState([]);
    const [q, setQ] = useState('');
    const [filtroFechaTipo, setFiltroFechaTipo] = useState('despacho'); // 'despacho' | 'compra' | 'instalacion'
    const [filtroRango, setFiltroRango] = useState('todos'); // 'todos' | 'hoy' | 'semana' | 'mes' | 'custom'
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const [cargandoResumen, setCargandoResumen] = useState(true);
    const [cargandoItems, setCargandoItems] = useState(false);
    const [error, setError] = useState('');

    // Modal nuevo / editar ítem
    const [modalItem, setModalItem] = useState(null); // null | {} | item
    const [formItem, setFormItem] = useState(ITEM_VACIO);
    const [guardando, setGuardando] = useState(false);
    const [errorModal, setErrorModal] = useState('');

    // Modal confirmar eliminar
    const [borrando, setBorrando] = useState(null);
    const [ocupadoBorrar, setOcupadoBorrar] = useState(false);
    const [errorBorrar, setErrorBorrar] = useState('');

    // Cargar resumen de técnicos
    const cargarResumen = useCallback(async () => {
        setCargandoResumen(true);
        try {
            const data = await listarResumenTecnicosInventario(unionTemporal);
            setResumenTecnicos(data);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el inventario de técnicos.'));
        } finally {
            setCargandoResumen(false);
        }
    }, [unionTemporal]);

    useEffect(() => {
        cargarResumen();
    }, [cargarResumen, version]);

    // Calcular fechas según el rango seleccionado
    const fechasCalculadas = useMemo(() => {
        if (filtroRango === 'todos') {
            return { inicio: null, fin: null };
        }
        const hoy = new Date();
        const hoyStr = hoy.toISOString().slice(0, 10);

        if (filtroRango === 'hoy') {
            return { inicio: hoyStr, fin: hoyStr };
        }
        if (filtroRango === 'semana') {
            const diaSemana = hoy.getDay() || 7; // 1 = lunes
            const primerDia = new Date(hoy);
            primerDia.setDate(hoy.getDate() - diaSemana + 1);
            return {
                inicio: primerDia.toISOString().slice(0, 10),
                fin: hoyStr,
            };
        }
        if (filtroRango === 'mes') {
            const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            return {
                inicio: primerDiaMes.toISOString().slice(0, 10),
                fin: hoyStr,
            };
        }
        if (filtroRango === 'custom') {
            return {
                inicio: fechaDesde || null,
                fin: fechaHasta || null,
            };
        }
        return { inicio: null, fin: null };
    }, [filtroRango, fechaDesde, fechaHasta]);

    // Cargar ítems del técnico seleccionado
    const cargarItems = useCallback(async () => {
        if (!tecnicoId) {
            setItems([]);
            return;
        }
        setCargandoItems(true);
        try {
            const data = await listarItemsTecnico(tecnicoId, {
                unionTemporal,
                q,
                fechaInicio: fechasCalculadas.inicio,
                fechaFin: fechasCalculadas.fin,
                tipoFecha: filtroFechaTipo,
            });
            setItems(data);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los ítems del técnico.'));
        } finally {
            setCargandoItems(false);
        }
    }, [tecnicoId, unionTemporal, q, fechasCalculadas, filtroFechaTipo]);

    useEffect(() => {
        const t = setTimeout(cargarItems, 200);
        return () => clearTimeout(t);
    }, [cargarItems, version]);

    const tecnicoActual = useMemo(
        () => resumenTecnicos.find((t) => t.tecnico_id === Number(tecnicoId)),
        [resumenTecnicos, tecnicoId]
    );

    const tecnicosConInventario = useMemo(
        () => resumenTecnicos.filter((t) => t.total_items > 0),
        [resumenTecnicos]
    );

    const otrosTecnicos = useMemo(
        () => resumenTecnicos.filter((t) => t.total_items === 0),
        [resumenTecnicos]
    );

    function abrirModalItem(item = null) {
        setErrorModal('');
        setModalItem(item || {});
        setFormItem(
            item
                ? {
                      descripcion: item.descripcion || '',
                      cantidad: item.cantidad || 1,
                      codigo_barras: item.codigo_barras || '',
                      serial_gsb: item.serial_gsb || '',
                      id_equipo: item.id_equipo || '',
                      factura: item.factura || '',
                      fecha_compra: item.fecha_compra || '',
                      oficina: item.oficina || '',
                      concatenado: item.concatenado || '',
                      fecha_despacho: item.fecha_despacho || '',
                      observacion: item.observacion || '',
                      numero_orden: item.numero_orden || '',
                      oficina_instalada: item.oficina_instalada || '',
                      fecha_instalacion: item.fecha_instalacion || '',
                  }
                : ITEM_VACIO
        );
    }

    async function guardarItem(e) {
        e.preventDefault();
        if (!formItem.descripcion.trim()) {
            setErrorModal('La descripción es obligatoria.');
            return;
        }
        setGuardando(true);
        setErrorModal('');
        const payload = {
            union_temporal: unionTemporal || 'MANTENIMIENTO',
            tecnico_id: Number(tecnicoId),
            descripcion: formItem.descripcion.trim(),
            cantidad: Number(formItem.cantidad) || 1,
            codigo_barras: formItem.codigo_barras.trim() || null,
            serial_gsb: formItem.serial_gsb.trim() || null,
            id_equipo: formItem.id_equipo.trim() || null,
            factura: formItem.factura.trim() || null,
            fecha_compra: formItem.fecha_compra || null,
            oficina: formItem.oficina.trim() || null,
            concatenado: formItem.concatenado.trim() || null,
            fecha_despacho: formItem.fecha_despacho || null,
            observacion: formItem.observacion.trim() || null,
            numero_orden: formItem.numero_orden.trim() || null,
            oficina_instalada: formItem.oficina_instalada.trim() || null,
            fecha_instalacion: formItem.fecha_instalacion || null,
        };
        try {
            if (modalItem.id) {
                await actualizarItemTecnico(modalItem.id, payload);
                avisar('Ítem del técnico actualizado correctamente.');
            } else {
                await crearItemTecnico(tecnicoId, payload);
                avisar('Ítem registrado en la hoja del técnico.');
            }
            setModalItem(null);
            cargarResumen();
            cargarItems();
        } catch (err) {
            setErrorModal(formatApiError(err, 'No se pudo guardar el ítem.'));
        } finally {
            setGuardando(false);
        }
    }

    async function confirmarBorrado() {
        setOcupadoBorrar(true);
        setErrorBorrar('');
        try {
            await eliminarItemTecnico(borrando.id);
            setBorrando(null);
            avisar('Ítem eliminado del inventario del técnico.');
            cargarResumen();
            cargarItems();
        } catch (err) {
            setErrorBorrar(formatApiError(err, 'No se pudo eliminar el ítem.'));
        } finally {
            setOcupadoBorrar(false);
        }
    }

    // Totales globales para la cabecera de la sección
    const totalArticulosTecnicos = useMemo(
        () => tecnicosConInventario.reduce((acc, t) => acc + t.total_items, 0),
        [tecnicosConInventario]
    );
    const totalUnidadesTecnicos = useMemo(
        () => tecnicosConInventario.reduce((acc, t) => acc + t.total_unidades, 0),
        [tecnicosConInventario]
    );

    // =========================================================================
    // VISTA 1: GALERÍA DE TARJETAS DE TÉCNICOS (Cuando no hay técnico seleccionado)
    // =========================================================================
    if (!tecnicoId) {
        return (
            <section className="sgc-inv-tecnicos-seccion">
                {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

                <header className="sgc-inv-tecnicos-header" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-gold-bright, #c5a059)', fontWeight: 700 }}>
                                Custodia por Técnico
                            </span>
                            <h2 style={{ margin: '4px 0 6px', fontSize: '24px', fontWeight: 700, color: 'var(--color-text, #ffffff)' }}>
                                Inventario en Poder de Técnicos
                            </h2>
                            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary, #94a3b8)', maxWidth: '680px' }}>
                                Cada tarjeta representa la hoja de control individual del archivo Excel. Selecciona un técnico para consultar o editar sus equipos, seriales y fechas.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.03)', padding: '12px 20px', borderRadius: '10px', border: '1px solid var(--color-border, rgba(255,255,255,0.08))' }}>
                            <div>
                                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>Técnicos activos</span>
                                <strong style={{ fontSize: '22px', color: 'var(--color-text, #ffffff)' }}>{tecnicosConInventario.length}</strong>
                            </div>
                            <div>
                                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>Artículos en custodia</span>
                                <strong style={{ fontSize: '22px', color: 'var(--color-gold-bright, #c5a059)' }}>{totalArticulosTecnicos}</strong>
                            </div>
                            <div>
                                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>Unidades físicas</span>
                                <strong style={{ fontSize: '22px', color: '#38bdf8' }}>{totalUnidadesTecnicos}</strong>
                            </div>
                        </div>
                    </div>
                </header>

                {cargandoResumen ? (
                    <p className="sgc-inv-cargando">Cargando hojas de técnicos…</p>
                ) : (
                    <>
                        {/* Grid de Tarjetas de los 6 técnicos principales */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: '20px',
                                marginBottom: '32px',
                            }}
                        >
                            {tecnicosConInventario.map((t, idx) => {
                                const avatarBg = COLORES_AVATAR[idx % COLORES_AVATAR.length];
                                return (
                                    <button
                                        key={t.tecnico_id}
                                        type="button"
                                        className="sgc-inv-card"
                                        style={{
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            borderTop: `3px solid ${avatarBg}`,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            minHeight: '190px',
                                        }}
                                        onClick={() => setTecnicoId(t.tecnico_id)}
                                    >
                                        <header className="sgc-inv-card-head" style={{ marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div
                                                    style={{
                                                        width: '44px',
                                                        height: '44px',
                                                        borderRadius: '10px',
                                                        background: `${avatarBg}22`,
                                                        border: `1px solid ${avatarBg}55`,
                                                        color: avatarBg,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 700,
                                                        fontSize: '16px',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {obtenerIniciales(t.tecnico_nombre)}
                                                </div>
                                                <div>
                                                    <span className="sgc-inv-card-tipo" style={{ color: 'var(--color-gold-bright, #c5a059)' }}>
                                                        Hoja de Técnico
                                                    </span>
                                                    <h3 className="sgc-inv-card-nombre" style={{ margin: '2px 0 0', fontSize: '17px', color: 'var(--color-text, #ffffff)' }}>
                                                        {t.tecnico_nombre}
                                                    </h3>
                                                </div>
                                            </div>
                                        </header>

                                        <dl className="sgc-inv-card-cifras" style={{ margin: '14px 0', gridTemplateColumns: '1fr 1fr' }}>
                                            <div>
                                                <dt style={{ fontSize: '11px' }}>Artículos registrados</dt>
                                                <dd style={{ fontSize: '22px', color: 'var(--color-gold-bright, #c5a059)' }}>{t.total_items}</dd>
                                            </div>
                                            <div>
                                                <dt style={{ fontSize: '11px' }}>Unidades físicas</dt>
                                                <dd style={{ fontSize: '22px', color: 'var(--color-text, #ffffff)' }}>{t.total_unidades}</dd>
                                            </div>
                                        </dl>

                                        <footer className="sgc-inv-card-pie" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #94a3b8)' }}>
                                                Mantenimiento GSB
                                            </span>
                                            <span className="sgc-inv-card-entrar" style={{ fontWeight: 600, color: 'var(--color-accent-blue, #38bdf8)' }}>
                                                Abrir inventario →
                                            </span>
                                        </footer>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Otros técnicos sin inventario en el Excel */}
                        {otrosTecnicos.length > 0 && (
                            <details style={{ marginTop: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.08))', borderRadius: '8px', padding: '12px 16px' }}>
                                <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)' }}>
                                    Otros técnicos registrados sin inventario ({otrosTecnicos.length})
                                </summary>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                    {otrosTecnicos.map((t) => (
                                        <button
                                            key={t.tecnico_id}
                                            type="button"
                                            className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                                            onClick={() => setTecnicoId(t.tecnico_id)}
                                            style={{ fontSize: '12px' }}
                                        >
                                            {t.tecnico_nombre} (0 ítems)
                                        </button>
                                    ))}
                                </div>
                            </details>
                        )}
                    </>
                )}
            </section>
        );
    }

    // =========================================================================
    // VISTA 2: DETALLE DEL INVENTARIO DEL TÉCNICO
    // =========================================================================
    return (
        <section className="sgc-inv-tecnicos-tab">
            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {/* Cabecera y botón Volver a tarjetas */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button
                        type="button"
                        className="sgc-inv-btn sgc-inv-btn--ghost"
                        onClick={() => {
                            setTecnicoId(null);
                            setQ('');
                            setFiltroRango('todos');
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        ← Volver a Técnicos
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--color-text, #ffffff)' }}>
                                {tecnicoActual?.tecnico_nombre || 'Inventario de Técnico'}
                            </h2>
                            <span style={{ fontSize: '11px', background: 'rgba(197,160,89,0.15)', color: 'var(--color-gold-bright, #c5a059)', border: '1px solid rgba(197,160,89,0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                Hoja Excel
                            </span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-muted, #94a3b8)' }}>
                            Custodia y trazabilidad de equipos asignados
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ textAlign: 'right', display: 'flex', gap: '16px' }}>
                        <div>
                            <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>
                                Artículos
                            </span>
                            <strong style={{ fontSize: '20px', color: 'var(--color-gold-bright, #c5a059)' }}>
                                {tecnicoActual?.total_items || 0}
                            </strong>
                        </div>
                        <div>
                            <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>
                                Unidades
                            </span>
                            <strong style={{ fontSize: '20px', color: 'var(--color-text, #ffffff)' }}>
                                {tecnicoActual?.total_unidades || 0}
                            </strong>
                        </div>
                    </div>
                    {puedeEditar && (
                        <button
                            type="button"
                            className="sgc-inv-btn sgc-inv-btn--primary"
                            onClick={() => abrirModalItem()}
                        >
                            + Nuevo ítem
                        </button>
                    )}
                </div>
            </div>

            {/* Barra de Filtros: Buscador + Filtro de Fechas */}
            <div
                style={{
                    background: 'var(--color-bg-secondary, #1e293b)',
                    border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                }}
            >
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Buscador textual */}
                    <div style={{ flex: 1, minWidth: '260px' }}>
                        <input
                            type="search"
                            className="sgc-inv-input sgc-inv-input--search"
                            placeholder="Buscar por descripción, serial GSB, código barras, orden, oficina..."
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                    </div>

                    {/* Selector de técnico directo sin volver a tarjetas si desea saltar */}
                    <div style={{ minWidth: '200px' }}>
                        <select
                            className="sgc-inv-input sgc-inv-input--select"
                            value={tecnicoId}
                            onChange={(e) => setTecnicoId(Number(e.target.value))}
                        >
                            <optgroup label="Técnicos con inventario en Excel">
                                {tecnicosConInventario.map((t) => (
                                    <option key={t.tecnico_id} value={t.tecnico_id}>
                                        {t.tecnico_nombre} ({t.total_items})
                                    </option>
                                ))}
                            </optgroup>
                            {otrosTecnicos.length > 0 && (
                                <optgroup label="Otros técnicos">
                                    {otrosTecnicos.map((t) => (
                                        <option key={t.tecnico_id} value={t.tecnico_id}>
                                            {t.tecnico_nombre} (0)
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </div>
                </div>

                {/* Filtro por Fechas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📅 Filtrar por:
                    </span>
                    <select
                        className="sgc-inv-input sgc-inv-input--select"
                        style={{ width: 'auto', padding: '4px 10px', fontSize: '12px' }}
                        value={filtroFechaTipo}
                        onChange={(e) => setFiltroFechaTipo(e.target.value)}
                    >
                        <option value="despacho">Fecha de Despacho</option>
                        <option value="compra">Fecha Compra / Ingreso</option>
                        <option value="instalacion">Fecha de Instalación</option>
                    </select>

                    <div className="sgc-inv-chips" style={{ margin: 0 }}>
                        {[
                            { id: 'todos', label: 'Todas' },
                            { id: 'hoy', label: 'Hoy' },
                            { id: 'semana', label: 'Esta semana' },
                            { id: 'mes', label: 'Este mes' },
                            { id: 'custom', label: 'Rango…' },
                        ].map((btn) => (
                            <button
                                key={btn.id}
                                type="button"
                                className={`sgc-inv-chip ${filtroRango === btn.id ? 'sgc-inv-chip--activo' : ''}`}
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                onClick={() => setFiltroRango(btn.id)}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    {filtroRango === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                Desde:
                                <input
                                    type="date"
                                    className="sgc-inv-input"
                                    style={{ width: 'auto', padding: '4px 8px', fontSize: '12px', marginLeft: '4px' }}
                                    value={fechaDesde}
                                    onChange={(e) => setFechaDesde(e.target.value)}
                                />
                            </label>
                            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                Hasta:
                                <input
                                    type="date"
                                    className="sgc-inv-input"
                                    style={{ width: 'auto', padding: '4px 8px', fontSize: '12px', marginLeft: '4px' }}
                                    value={fechaHasta}
                                    onChange={(e) => setFechaHasta(e.target.value)}
                                />
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabla de ítems con fidelidad 100% al Excel */}
            {cargandoItems ? (
                <p className="sgc-inv-cargando">Cargando inventario del técnico…</p>
            ) : items.length === 0 ? (
                <div
                    style={{
                        padding: '48px 24px',
                        textAlign: 'center',
                        background: 'var(--color-bg-secondary, #1e293b)',
                        borderRadius: '12px',
                        border: '1px dashed var(--color-border, rgba(255,255,255,0.12))',
                    }}
                >
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
                    <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--color-text, #ffffff)' }}>
                        {tecnicoActual?.total_items === 0
                            ? `El técnico ${tecnicoActual.tecnico_nombre} no tiene artículos en inventario.`
                            : 'No se encontraron artículos con los filtros aplicados.'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted, #94a3b8)' }}>
                        {tecnicoActual?.total_items === 0
                            ? 'En el archivo Excel no registra hoja de inventario asignada a este técnico.'
                            : 'Prueba modificando la búsqueda o el filtro de fechas.'}
                    </p>
                </div>
            ) : (
                <div className="sgc-inv-tabla-wrap">
                    <table className="sgc-inv-tabla">
                        <thead>
                            <tr>
                                <th style={{ width: '36px' }}>#</th>
                                <th>Descripción</th>
                                <th style={{ textAlign: 'center' }}>Cant.</th>
                                <th>Código Barras</th>
                                <th>Serial GSB</th>
                                <th>ID Equipo</th>
                                <th>Factura</th>
                                <th>Fecha Compra</th>
                                <th>Fecha Despacho</th>
                                <th>Oficina / Destino</th>
                                <th>Observación</th>
                                <th>No. Orden</th>
                                <th>Oficina Instalada</th>
                                <th>Fecha Instalación</th>
                                {puedeEditar && <th style={{ textAlign: 'center' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it, idx) => (
                                <tr key={it.id}>
                                    <td style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                                        {idx + 1}
                                    </td>
                                    <td className="sgc-inv-td-desc">
                                        <div>{it.descripcion}</div>
                                        {it.concatenado && (
                                            <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                                {it.concatenado}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                        {it.cantidad}
                                    </td>
                                    <td className="sgc-inv-mono">{it.codigo_barras || '—'}</td>
                                    <td className="sgc-inv-mono">{it.serial_gsb || '—'}</td>
                                    <td className="sgc-inv-mono">{it.id_equipo || '—'}</td>
                                    <td className="sgc-inv-mono">{it.factura || '—'}</td>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                        {it.fecha_compra || '—'}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: it.fecha_despacho ? 'var(--color-gold-bright)' : 'inherit' }}>
                                        {it.fecha_despacho || '—'}
                                    </td>
                                    <td style={{ fontSize: '12px' }}>{it.oficina || '—'}</td>
                                    <td style={{ fontSize: '12px', maxWidth: '200px' }}>
                                        {it.observacion || '—'}
                                    </td>
                                    <td className="sgc-inv-mono">{it.numero_orden || '—'}</td>
                                    <td style={{ fontSize: '12px' }}>{it.oficina_instalada || '—'}</td>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                        {it.fecha_instalacion || '—'}
                                    </td>
                                    {puedeEditar && (
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
                                                    onClick={() => abrirModalItem(it)}
                                                    title="Editar ítem"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="sgc-inv-btn sgc-inv-btn--peligro sgc-inv-btn--sm"
                                                    onClick={() => setBorrando(it)}
                                                    title="Eliminar ítem"
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Crear / Editar Ítem del Técnico */}
            {modalItem && (
                <ModalInventario
                    titulo={modalItem.id ? 'Editar ítem del técnico' : 'Nuevo ítem para técnico'}
                    subtitulo={`Asignado a la hoja de ${tecnicoActual?.tecnico_nombre}`}
                    onCerrar={() => setModalItem(null)}
                    ocupado={guardando}
                    ancho
                >
                    <form onSubmit={guardarItem} className="sgc-inv-form">
                        {errorModal && <div className="sgc-inv-alerta sgc-inv-alerta--err">{errorModal}</div>}
                        
                        <label className="sgc-inv-label">
                            Descripción *
                            <input
                                type="text"
                                className="sgc-inv-input"
                                required
                                maxLength={255}
                                value={formItem.descripcion}
                                onChange={(e) => setFormItem((f) => ({ ...f, descripcion: e.target.value }))}
                            />
                        </label>

                        <div className="sgc-inv-grid2">
                            <label className="sgc-inv-label">
                                Cantidad *
                                <input
                                    type="number"
                                    min="1"
                                    className="sgc-inv-input"
                                    required
                                    value={formItem.cantidad}
                                    onChange={(e) => setFormItem((f) => ({ ...f, cantidad: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Código de barras <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    value={formItem.codigo_barras}
                                    onChange={(e) => setFormItem((f) => ({ ...f, codigo_barras: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Serial GSB <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    value={formItem.serial_gsb}
                                    onChange={(e) => setFormItem((f) => ({ ...f, serial_gsb: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                ID Equipo <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    value={formItem.id_equipo}
                                    onChange={(e) => setFormItem((f) => ({ ...f, id_equipo: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Factura <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    value={formItem.factura}
                                    onChange={(e) => setFormItem((f) => ({ ...f, factura: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Fecha de compra / ingreso <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="date"
                                    className="sgc-inv-input"
                                    value={formItem.fecha_compra}
                                    onChange={(e) => setFormItem((f) => ({ ...f, fecha_compra: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Fecha de despacho <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="date"
                                    className="sgc-inv-input"
                                    value={formItem.fecha_despacho}
                                    onChange={(e) => setFormItem((f) => ({ ...f, fecha_despacho: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Oficina / Destino <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={120}
                                    value={formItem.oficina}
                                    onChange={(e) => setFormItem((f) => ({ ...f, oficina: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Número de orden <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    value={formItem.numero_orden}
                                    onChange={(e) => setFormItem((f) => ({ ...f, numero_orden: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Oficina instalada <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={120}
                                    value={formItem.oficina_instalada}
                                    onChange={(e) => setFormItem((f) => ({ ...f, oficina_instalada: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Fecha de instalación <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="date"
                                    className="sgc-inv-input"
                                    value={formItem.fecha_instalacion}
                                    onChange={(e) => setFormItem((f) => ({ ...f, fecha_instalacion: e.target.value }))}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Concatenado <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="text"
                                    className="sgc-inv-input"
                                    maxLength={120}
                                    value={formItem.concatenado}
                                    onChange={(e) => setFormItem((f) => ({ ...f, concatenado: e.target.value }))}
                                />
                            </label>
                        </div>

                        <label className="sgc-inv-label">
                            Observación <span className="sgc-inv-opcional">opcional</span>
                            <textarea
                                className="sgc-inv-input sgc-inv-input--textarea"
                                rows={2}
                                value={formItem.observacion}
                                onChange={(e) => setFormItem((f) => ({ ...f, observacion: e.target.value }))}
                            />
                        </label>

                        <div className="sgc-inv-modal-acciones">
                            <button
                                type="button"
                                className="sgc-inv-btn sgc-inv-btn--ghost"
                                onClick={() => setModalItem(null)}
                                disabled={guardando}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="sgc-inv-btn sgc-inv-btn--primary"
                                disabled={guardando}
                            >
                                {guardando ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                </ModalInventario>
            )}

            {/* Modal Confirmar Eliminar */}
            {borrando && (
                <ModalConfirmar
                    titulo="¿Eliminar ítem del técnico?"
                    mensaje={`Se eliminará "${borrando.descripcion}" (${borrando.cantidad} unidad/es) de la hoja de ${tecnicoActual?.tecnico_nombre}. Esta acción no se puede deshacer.`}
                    ocupado={ocupadoBorrar}
                    error={errorBorrar}
                    onConfirmar={confirmarBorrado}
                    onCancelar={() => setBorrando(null)}
                />
            )}
        </section>
    );
}
