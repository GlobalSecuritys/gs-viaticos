import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import {
    listarDespachos,
    listarItemsTecnico,
    listarResumenTecnicosInventario,
} from '../../../services/inventario';
import AcordeonItem from './AcordeonItem';
import BadgesInventario from './BadgesInventario';
import Paginador from './Paginador';
import './Mantenimiento.css';

const LIMIT_PAGINA = 25;

const COLORES_AVATAR = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'
];

function obtenerIniciales(nombre) {
    if (!nombre) return 'TC';
    return nombre
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');
}

/**
 * Botón 3 — Técnicos (Custodia individual de hojas de técnico + Despachos asignados).
 */
export default function SeccionTecnicos({ puedeEditar, version, avisar }) {
    const [resumenTecnicos, setResumenTecnicos] = useState([]);
    const [tecnicoSeleccionadoId, setTecnicoSeleccionadoId] = useState(null);
    const [itemsTecnico, setItemsTecnico] = useState([]);
    const [despachosTecnico, setDespachosTecnico] = useState([]);

    const [q, setQ] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos' | 'custodia' | 'despachos'
    const [offset, setOffset] = useState(0);

    const [cargandoResumen, setCargandoResumen] = useState(true);
    const [cargandoDetalles, setCargandoDetalles] = useState(false);
    const [error, setError] = useState('');

    // Acordeón exclusivo
    const [itemAbiertoId, setItemAbiertoId] = useState(null);

    // 1. Cargar resumen de técnicos
    const cargarResumen = useCallback(async () => {
        setCargandoResumen(true);
        try {
            const data = await listarResumenTecnicosInventario('MANTENIMIENTO');
            setResumenTecnicos(data || []);
            // Auto-seleccionar el primer técnico si aún no hay uno
            if (data && data.length > 0 && !tecnicoSeleccionadoId) {
                setTecnicoSeleccionadoId(data[0].tecnico_id);
            }
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar el listado de técnicos.'));
        } finally {
            setCargandoResumen(false);
        }
    }, [tecnicoSeleccionadoId]);

    useEffect(() => {
        cargarResumen();
    }, [cargarResumen, version]);

    // 2. Cargar inventario y despachos del técnico seleccionado
    const cargarDetallesTecnico = useCallback(async () => {
        if (!tecnicoSeleccionadoId) {
            setItemsTecnico([]);
            setDespachosTecnico([]);
            return;
        }

        setCargandoDetalles(true);
        try {
            const [dataItems, dataDespachos] = await Promise.all([
                listarItemsTecnico(tecnicoSeleccionadoId, {
                    unionTemporal: 'MANTENIMIENTO',
                    q: q.trim(),
                }),
                listarDespachos({
                    unionTemporal: 'MANTENIMIENTO',
                    tecnicoId: tecnicoSeleccionadoId,
                    q: q.trim(),
                    limit: 100,
                }),
            ]);

            setItemsTecnico(dataItems || []);
            setDespachosTecnico(dataDespachos?.despachos || []);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los registros del técnico.'));
        } finally {
            setCargandoDetalles(false);
        }
    }, [tecnicoSeleccionadoId, q]);

    useEffect(() => {
        const timer = setTimeout(cargarDetallesTecnico, 200);
        return () => clearTimeout(timer);
    }, [cargarDetallesTecnico, version]);

    // Unificación de la lista para el técnico seleccionado
    const listaCombinada = useMemo(() => {
        const combinados = [];

        // Ítems de la hoja de custodia individual
        if (filtroTipo !== 'despachos') {
            for (const item of itemsTecnico) {
                combinados.push({
                    idUnico: `custodia-${item.id}`,
                    origen: 'custodia',
                    id: item.id,
                    titulo: item.descripcion,
                    tecnico: item.tecnico_nombre,
                    cantidad: item.cantidad,
                    oficina: item.oficina,
                    oficinaInstalada: item.oficina_instalada,
                    fechaDespacho: item.fecha_despacho,
                    fechaCompra: item.fecha_compra,
                    fechaInstalacion: item.fecha_instalacion,
                    estado: item.oficina_instalada ? 'instalado' : 'en_poder',
                    numeroOrden: item.numero_orden,
                    observacion: item.observacion,
                    serialGsb: item.serial_gsb,
                    idEquipo: item.id_equipo,
                    codigoBarras: item.codigo_barras,
                    factura: item.factura,
                });
            }
        }

        // Despachos realizados al técnico
        if (filtroTipo !== 'custodia') {
            for (const d of despachosTecnico) {
                combinados.push({
                    idUnico: `despacho-${d.id}`,
                    origen: 'despacho',
                    id: d.id,
                    titulo: d.item_descripcion || 'Equipo despachado',
                    tecnico: d.tecnico_nombre || 'Técnico',
                    cantidad: d.cantidad,
                    oficina: d.oficina_destino,
                    oficinaInstalada: d.oficina_instalada,
                    fechaDespacho: d.fecha_despacho,
                    fechaInstalacion: d.fecha_instalacion,
                    estado: d.estado,
                    numeroOrden: d.numero_orden,
                    observacion: d.observacion,
                    serialGsb: d.item_serial_gsb,
                    codigoBarras: d.item_codigo_barras,
                    asignacion: d.asignacion_etiqueta,
                });
            }
        }

        return combinados;
    }, [itemsTecnico, despachosTecnico, filtroTipo]);

    const listaPaginada = useMemo(() => {
        return listaCombinada.slice(offset, offset + LIMIT_PAGINA);
    }, [listaCombinada, offset]);

    const tecnicoActual = resumenTecnicos.find((t) => t.tecnico_id === tecnicoSeleccionadoId);

    return (
        <section className="inv-seccion" aria-label="Inventario por Técnico">
            {/* Selector de técnico en tarjetas horizontales / galería */}
            <div className="inv-tecnicos-grid">
                {resumenTecnicos.map((t, idx) => {
                    const seleccionado = t.tecnico_id === tecnicoSeleccionadoId;
                    const colorAvatar = COLORES_AVATAR[idx % COLORES_AVATAR.length];

                    return (
                        <button
                            key={t.tecnico_id}
                            type="button"
                            className={`inv-tecnico-card ${seleccionado ? 'inv-tecnico-card--seleccionado' : ''}`}
                            onClick={() => {
                                setTecnicoSeleccionadoId(t.tecnico_id);
                                setOffset(0);
                                setItemAbiertoId(null);
                            }}
                        >
                            <div className="inv-tecnico-avatar" style={{ backgroundColor: colorAvatar }}>
                                {obtenerIniciales(t.tecnico_nombre)}
                            </div>
                            <div className="inv-tecnico-info">
                                <strong className="inv-tecnico-nombre">{t.tecnico_nombre}</strong>
                                <span className="inv-tecnico-stats">
                                    {t.total_items} ítems · {t.total_unidades} unidades
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Barra de Filtros para el técnico seleccionado */}
            <div className="inv-toolbar">
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder={`Buscar en inventario de ${tecnicoActual?.tecnico_nombre || 'técnico'}…`}
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Buscar en inventario del técnico"
                />

                <select
                    className="sgc-inv-select"
                    value={filtroTipo}
                    onChange={(e) => {
                        setFiltroTipo(e.target.value);
                        setOffset(0);
                    }}
                    aria-label="Filtrar por origen"
                >
                    <option value="todos">Todos los artículos</option>
                    <option value="custodia">Solo Custodia Personal (Hoja de técnico)</option>
                    <option value="despachos">Solo Despachos activos/asignados</option>
                </select>

                <div className="inv-toolbar-der">
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        {listaCombinada.length} registro(s) encontrado(s)
                    </span>
                </div>
            </div>

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {cargandoDetalles ? (
                <p className="sgc-inv-cargando">Cargando inventario del técnico…</p>
            ) : listaPaginada.length === 0 ? (
                <p className="sgc-inv-vacio">
                    {tecnicoActual?.tecnico_nombre} no tiene artículos registrados con los filtros seleccionados.
                </p>
            ) : (
                <div className="inv-acordeon-lista" role="list">
                    {listaPaginada.map((item) => {
                        const abierto = itemAbiertoId === item.idUnico;

                        return (
                            <AcordeonItem
                                key={item.idUnico}
                                id={item.idUnico}
                                abierto={abierto}
                                onToggle={(abrir) => setItemAbiertoId(abrir ? item.idUnico : null)}
                                titulo={item.titulo}
                                subtitulo={`${item.tecnico} · ${
                                    item.oficina || item.oficinaInstalada || 'Oficina no registrada'
                                }`}
                                badges={
                                    <>
                                        {item.origen === 'custodia' ? (
                                            <BadgesInventario tipo="custodia" />
                                        ) : (
                                            <BadgesInventario tipo="salida" />
                                        )}
                                        {item.estado && item.estado !== 'en_poder' && (
                                            <BadgesInventario estado={item.estado} />
                                        )}
                                        <BadgesInventario tipo="stock" cantidad={item.cantidad} />
                                    </>
                                }
                            >
                                <div className="inv-grid-detalles">
                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Técnico</span>
                                        <span className="inv-dato-valor">{item.tecnico}</span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Cantidad asignada</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 700 }}>
                                            {item.cantidad} unidad(es)
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Oficina / Destino</span>
                                        <span className="inv-dato-valor">
                                            {item.oficina || (
                                                <span className="inv-dato-valor--vacio">Sin oficina</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Oficina Instalada</span>
                                        <span className="inv-dato-valor">
                                            {item.oficinaInstalada || (
                                                <span className="inv-dato-valor--vacio">Pendiente</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha de Despacho</span>
                                        <span className="inv-dato-valor">
                                            {item.fechaDespacho || (
                                                <span className="inv-dato-valor--vacio">Sin fecha</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha de Instalación</span>
                                        <span className="inv-dato-valor">
                                            {item.fechaInstalacion || (
                                                <span className="inv-dato-valor--vacio">Pendiente</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">N° de Orden</span>
                                        <span className="inv-dato-valor">
                                            {item.numeroOrden ? (
                                                <span className="inv-dato-valor--mono">{item.numeroOrden}</span>
                                            ) : (
                                                <span className="inv-dato-valor--vacio">Sin orden</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Serial GSB / Código</span>
                                        <span className="inv-dato-valor inv-dato-valor--mono">
                                            {item.serialGsb || item.codigoBarras || item.idEquipo || 'N/A'}
                                        </span>
                                    </div>

                                    {item.factura && (
                                        <div className="inv-dato-item">
                                            <span className="inv-dato-label">Factura</span>
                                            <span className="inv-dato-valor inv-dato-valor--mono">{item.factura}</span>
                                        </div>
                                    )}

                                    {item.observacion && (
                                        <div className="inv-dato-item" style={{ gridColumn: '1 / -1' }}>
                                            <span className="inv-dato-label">Observación</span>
                                            <span className="inv-dato-valor">{item.observacion}</span>
                                        </div>
                                    )}
                                </div>
                            </AcordeonItem>
                        );
                    })}
                </div>
            )}

            <Paginador
                total={listaCombinada.length}
                limit={LIMIT_PAGINA}
                offset={offset}
                onCambiarOffset={(nuevo) => {
                    setOffset(nuevo);
                    setItemAbiertoId(null);
                }}
                cargando={cargandoDetalles}
            />
        </section>
    );
}
