import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import { listarDespachos } from '../../../services/inventario';
import AcordeonItem from '../mantenimiento/AcordeonItem';
import BadgesInventario from '../mantenimiento/BadgesInventario';
import Paginador from '../mantenimiento/Paginador';
import { esEntidadCorporativa, normalizarObservacionRTC } from './rtcUtils';
import '../mantenimiento/Mantenimiento.css';

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
 * Botón 3 — Técnicos (RTC American Global).
 * Agrupa despachos de RTC por técnico real (excluyendo entidades como SDS, GSB, Banco Agrario).
 * Solo lista técnicos con actividad real y muestra su conteo de movimientos.
 */
export default function SeccionTecnicos({ version }) {
    const [despachos, setDespachos] = useState([]);
    const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState(null);
    const [busquedaTecnico, setBusquedaTecnico] = useState('');
    const [qItem, setQItem] = useState('');
    const [offset, setOffset] = useState(0);

    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Acordeón exclusivo
    const [itemAbiertoId, setItemAbiertoId] = useState(null);

    // Cargar todos los despachos de RTC
    const cargarDatos = useCallback(async () => {
        setCargando(true);
        try {
            const data = await listarDespachos({
                unionTemporal: 'RTC',
                limit: 1000,
            });
            setDespachos(data?.despachos || []);
            setError('');
        } catch (err) {
            setError(formatApiError(err, 'No se pudieron cargar los despachos de técnicos RTC.'));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos, version]);

    // Agrupar despachos por técnico real (filtrando entidades corporativas)
    const mapaTecnicos = useMemo(() => {
        const mapa = new Map();

        for (const d of despachos) {
            const nombre = d.tecnico_nombre || d.tecnico_nombre_origen || '';
            if (!nombre) continue;

            // Excluir entidades corporativas de la lista de técnicos
            if (esEntidadCorporativa(nombre)) continue;

            if (!mapa.has(nombre)) {
                mapa.set(nombre, {
                    nombre,
                    tecnicoId: d.tecnico_id,
                    totalDespachos: 0,
                    totalUnidades: 0,
                    despachos: [],
                });
            }

            const info = mapa.get(nombre);
            info.totalDespachos += 1;
            info.totalUnidades += d.cantidad || 1;
            info.despachos.push(d);
        }

        // Convertir a array ordenado por mayor cantidad de despachos
        const lista = Array.from(mapa.values()).sort(
            (a, b) => b.totalDespachos - a.totalDespachos || a.nombre.localeCompare(b.nombre)
        );

        return lista;
    }, [despachos]);

    // Auto-seleccionar el primer técnico cuando se carguen los datos
    useEffect(() => {
        if (mapaTecnicos.length > 0 && !tecnicoSeleccionado) {
            setTecnicoSeleccionado(mapaTecnicos[0].nombre);
        }
    }, [mapaTecnicos, tecnicoSeleccionado]);

    // Técnicos filtrados por búsqueda en el selector
    const tecnicosFiltrados = useMemo(() => {
        if (!busquedaTecnico.trim()) return mapaTecnicos;
        const patron = busquedaTecnico.trim().toLowerCase();
        return mapaTecnicos.filter((t) => t.nombre.toLowerCase().includes(patron));
    }, [mapaTecnicos, busquedaTecnico]);

    // Movimientos del técnico actualmente seleccionado
    const datosTecnicoActual = useMemo(() => {
        return mapaTecnicos.find((t) => t.nombre === tecnicoSeleccionado);
    }, [mapaTecnicos, tecnicoSeleccionado]);

    // Filtrar movimientos del técnico seleccionado por texto q
    const movimientosFiltrados = useMemo(() => {
        if (!datosTecnicoActual) return [];
        const lista = datosTecnicoActual.despachos;
        if (!qItem.trim()) return lista;

        const patron = qItem.trim().toLowerCase();
        return lista.filter((d) => {
            const desc = (d.item_descripcion || '').toLowerCase();
            const orden = (d.numero_orden || '').toLowerCase();
            const serial = (d.item_serial_gsb || '').toLowerCase();
            const oficina = (d.oficina_destino || '').toLowerCase();
            return (
                desc.includes(patron) ||
                orden.includes(patron) ||
                serial.includes(patron) ||
                oficina.includes(patron)
            );
        });
    }, [datosTecnicoActual, qItem]);

    const movimientosPaginados = useMemo(() => {
        return movimientosFiltrados.slice(offset, offset + LIMIT_PAGINA);
    }, [movimientosFiltrados, offset]);

    return (
        <section className="inv-seccion" aria-label="Técnicos de RTC American Global">
            {/* Cabecera del selector con buscador de técnicos */}
            <div className="inv-toolbar" style={{ marginBottom: 12 }}>
                <input
                    type="search"
                    className="sgc-inv-input"
                    placeholder="Buscar técnico por nombre…"
                    value={busquedaTecnico}
                    onChange={(e) => setBusquedaTecnico(e.target.value)}
                    style={{ maxWidth: 300 }}
                    aria-label="Buscar técnico"
                />

                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginLeft: 'auto' }}>
                    <strong>{mapaTecnicos.length}</strong> técnicos con movimientos registrados
                </span>
            </div>

            {/* Galería de técnicos reales con conteos de actividad */}
            <div className="inv-tecnicos-grid">
                {tecnicosFiltrados.map((t, idx) => {
                    const seleccionado = t.nombre === tecnicoSeleccionado;
                    const colorAvatar = COLORES_AVATAR[idx % COLORES_AVATAR.length];

                    return (
                        <button
                            key={t.nombre}
                            type="button"
                            className={`inv-tecnico-card ${
                                seleccionado ? 'inv-tecnico-card--seleccionado' : ''
                            }`}
                            onClick={() => {
                                setTecnicoSeleccionado(t.nombre);
                                setOffset(0);
                                setItemAbiertoId(null);
                            }}
                        >
                            <div className="inv-tecnico-avatar" style={{ backgroundColor: colorAvatar }}>
                                {obtenerIniciales(t.nombre)}
                            </div>
                            <div className="inv-tecnico-info">
                                <strong className="inv-tecnico-nombre">{t.nombre}</strong>
                                <span className="inv-tecnico-stats">
                                    {t.totalDespachos} movimiento{t.totalDespachos === 1 ? '' : 's'} (
                                    {t.totalUnidades} unid.)
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Barra de Filtros para los movimientos del técnico seleccionado */}
            {datosTecnicoActual && (
                <div className="inv-toolbar" style={{ marginTop: 16 }}>
                    <input
                        type="search"
                        className="sgc-inv-input"
                        placeholder={`Buscar en movimientos de ${datosTecnicoActual.nombre}…`}
                        value={qItem}
                        onChange={(e) => {
                            setQItem(e.target.value);
                            setOffset(0);
                        }}
                        aria-label="Buscar en movimientos del técnico"
                    />

                    <div className="inv-toolbar-der">
                        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            {movimientosFiltrados.length} despacho(s) para {datosTecnicoActual.nombre}
                        </span>
                    </div>
                </div>
            )}

            {error && <div className="sgc-inv-alerta sgc-inv-alerta--err">{error}</div>}

            {cargando ? (
                <p className="sgc-inv-cargando">Cargando técnicos de RTC…</p>
            ) : !datosTecnicoActual ? (
                <p className="sgc-inv-vacio">Selecciona un técnico para ver sus movimientos.</p>
            ) : movimientosPaginados.length === 0 ? (
                <p className="sgc-inv-vacio">
                    No hay despachos registrados para este técnico con los filtros indicados.
                </p>
            ) : (
                <div className="inv-acordeon-lista" role="list">
                    {movimientosPaginados.map((mov) => {
                        const abierto = itemAbiertoId === mov.id;
                        const tipoNorm = normalizarObservacionRTC(mov.observacion);
                        const esVenta = tipoNorm === 'VENTA';

                        return (
                            <AcordeonItem
                                key={mov.id}
                                id={mov.id}
                                abierto={abierto}
                                onToggle={(abrir) => setItemAbiertoId(abrir ? mov.id : null)}
                                titulo={mov.item_descripcion || 'Equipo despachado'}
                                subtitulo={`${mov.oficina_destino || 'Destino no registrado'} · ${
                                    mov.fecha_despacho || 'Sin fecha'
                                }`}
                                badges={
                                    <>
                                        {esVenta ? (
                                            <BadgesInventario tipo="venta" />
                                        ) : (
                                            <BadgesInventario
                                                tipo="salida"
                                                etiqueta={tipoNorm || 'Salida'}
                                            />
                                        )}
                                        {mov.estado && <BadgesInventario estado={mov.estado} />}
                                    </>
                                }
                            >
                                <div className="inv-grid-detalles">
                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Técnico</span>
                                        <span className="inv-dato-valor">{datosTecnicoActual.nombre}</span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Cantidad</span>
                                        <span className="inv-dato-valor" style={{ fontWeight: 700 }}>
                                            {mov.cantidad} unidad(es)
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha de Despacho</span>
                                        <span className="inv-dato-valor">
                                            {mov.fecha_despacho || (
                                                <span className="inv-dato-valor--vacio">Sin fecha</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Fecha de Instalación</span>
                                        <span className="inv-dato-valor">
                                            {mov.fecha_instalacion || (
                                                <span className="inv-dato-valor--vacio">Pendiente</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Oficina Destino</span>
                                        <span className="inv-dato-valor">
                                            {mov.oficina_destino || (
                                                <span className="inv-dato-valor--vacio">No especificada</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Oficina Instalada</span>
                                        <span className="inv-dato-valor">
                                            {mov.oficina_instalada || (
                                                <span className="inv-dato-valor--vacio">Pendiente</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">N° de Orden</span>
                                        <span className="inv-dato-valor">
                                            {mov.numero_orden ? (
                                                <span className="inv-dato-valor--mono">{mov.numero_orden}</span>
                                            ) : (
                                                <span className="inv-dato-valor--vacio">Sin orden</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="inv-dato-item">
                                        <span className="inv-dato-label">Serial GSB / Código</span>
                                        <span className="inv-dato-valor inv-dato-valor--mono">
                                            {mov.item_serial_gsb || mov.item_codigo_barras || 'N/A'}
                                        </span>
                                    </div>

                                    {mov.observacion && (
                                        <div className="inv-dato-item" style={{ gridColumn: '1 / -1' }}>
                                            <span className="inv-dato-label">Observación</span>
                                            <span className="inv-dato-valor">{mov.observacion}</span>
                                        </div>
                                    )}
                                </div>
                            </AcordeonItem>
                        );
                    })}
                </div>
            )}

            <Paginador
                total={movimientosFiltrados.length}
                limit={LIMIT_PAGINA}
                offset={offset}
                onCambiarOffset={(nuevo) => {
                    setOffset(nuevo);
                    setItemAbiertoId(null);
                }}
                cargando={cargando}
            />
        </section>
    );
}
