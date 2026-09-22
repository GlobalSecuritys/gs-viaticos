import React, { useEffect, useState } from 'react';
import { formatApiError } from '../../../utils/formatError';
import {
    actualizarItem,
    actualizarPrestamo,
    crearItem,
    listarDespachos,
} from '../../../services/inventario';
import ModalInventario from '../ModalInventario';
import TarjetasBotonesRTC from './TarjetasBotonesRTC';
import SeccionEquipos from './SeccionEquipos';
import SeccionMovimientos from './SeccionMovimientos';
import SeccionTecnicos from './SeccionTecnicos';
import SeccionVentas from './SeccionVentas';
import { esEntidadCorporativa, normalizarObservacionRTC } from './rtcUtils';
import '../mantenimiento/Mantenimiento.css';

const ITEM_VACIO_RTC = {
    union_temporal: 'RTC',
    descripcion: '',
    codigo_barras: '',
    serial_gsb: '',
    id_equipo: '',
    no_sds: '',
    numero_articulo: '',
    tiempo_entrega: '',
    factura: '',
    fecha_compra: '',
    cantidad_stock: 0,
};

/**
 * Vista principal de "Unión Temporal RTC American Global".
 * Reemplaza las 4 pestañas estándar por 4 botones/tarjetas ejecutivas (Opción A):
 * Equipos, Movimientos, Técnicos y Ventas.
 */
export default function VistaRTC({
    datosResumen,
    puedeEditar,
    version,
    avisar,
    onDespachar,
    onNuevoDespacho,
    onEditarDespacho,
}) {
    const [seccionActiva, setSeccionActiva] = useState('equipos');

    // Métricas para las tarjetas de navegación de RTC
    const [conteoVentas, setConteoVentas] = useState(0);
    const [conteoTecnicosActivos, setConteoTecnicosActivos] = useState(0);

    // Modales de creación/edición de Ítems y Préstamos
    const [modalItem, setModalItem] = useState(null); // null | {} (nuevo) | item
    const [formItem, setFormItem] = useState(ITEM_VACIO_RTC);
    const [guardandoItem, setGuardandoItem] = useState(false);
    const [errorItem, setErrorItem] = useState('');

    const [modalPrestamo, setModalPrestamo] = useState(null); // null | prestamo
    const [formPrestamo, setFormPrestamo] = useState({ descripcion: '', cantidad: 1 });
    const [guardandoPrestamo, setGuardandoPrestamo] = useState(false);
    const [errorPrestamo, setErrorPrestamo] = useState('');

    // Pre-calcular conteo de ventas y técnicos activos
    useEffect(() => {
        let activo = true;
        async function cargarMetricasRTC() {
            try {
                const data = await listarDespachos({ unionTemporal: 'RTC', limit: 1000 });
                if (!activo) return;

                const despachos = data?.despachos || [];
                let ventas = 0;
                const setTecnicos = new Set();

                for (const d of despachos) {
                    if (normalizarObservacionRTC(d.observacion) === 'VENTA') {
                        ventas += 1;
                    }
                    const nom = d.tecnico_nombre || d.tecnico_nombre_origen || '';
                    if (nom && !esEntidadCorporativa(nom)) {
                        setTecnicos.add(nom);
                    }
                }

                setConteoVentas(ventas);
                setConteoTecnicosActivos(setTecnicos.size);
            } catch {
                // Silencioso
            }
        }
        cargarMetricasRTC();
        return () => {
            activo = false;
        };
    }, [version]);

    function abrirModalItem(item = null) {
        setErrorItem('');
        setModalItem(item || {});
        setFormItem(
            item
                ? Object.fromEntries(Object.keys(ITEM_VACIO_RTC).map((k) => [k, item[k] ?? '']))
                : { ...ITEM_VACIO_RTC }
        );
    }

    async function guardarItem(e) {
        e.preventDefault();
        setGuardandoItem(true);
        setErrorItem('');
        const cuerpo = {
            ...formItem,
            union_temporal: 'RTC',
            fecha_compra: formItem.fecha_compra || null,
            cantidad_stock: Number(formItem.cantidad_stock) || 0,
        };
        try {
            if (modalItem.id) {
                await actualizarItem(modalItem.id, cuerpo);
                avisar('Equipo de RTC actualizado.');
            } else {
                await crearItem(cuerpo);
                avisar('Equipo de RTC registrado.');
            }
            setModalItem(null);
        } catch (err) {
            setErrorItem(formatApiError(err, 'No se pudo guardar el equipo.'));
        } finally {
            setGuardandoItem(false);
        }
    }

    function abrirModalPrestamo(prestamo) {
        setErrorPrestamo('');
        setModalPrestamo(prestamo);
        setFormPrestamo({
            descripcion: prestamo.descripcion || '',
            cantidad: prestamo.cantidad || 1,
        });
    }

    async function guardarPrestamo(e) {
        e.preventDefault();
        setGuardandoPrestamo(true);
        setErrorPrestamo('');
        try {
            await actualizarPrestamo(modalPrestamo.id, {
                descripcion: formPrestamo.descripcion,
                cantidad: Number(formPrestamo.cantidad) || 1,
            });
            avisar('Préstamo actualizado.');
            setModalPrestamo(null);
        } catch (err) {
            setErrorPrestamo(formatApiError(err, 'No se pudo guardar el préstamo.'));
        } finally {
            setGuardandoPrestamo(false);
        }
    }

    const campoItem = (k) => ({
        value: formItem[k],
        onChange: (e) => setFormItem({ ...formItem, [k]: e.target.value }),
    });

    return (
        <div className="inv-vista-mantenimiento">
            {/* 4 Botones de navegación ejecutiva directa para RTC */}
            <TarjetasBotonesRTC
                seccionActiva={seccionActiva}
                onCambiarSeccion={setSeccionActiva}
                datosResumen={datosResumen}
                conteoVentas={conteoVentas}
                conteoTecnicosActivos={conteoTecnicosActivos}
            />

            {/* Contenido de la sección seleccionada */}
            {seccionActiva === 'equipos' && (
                <SeccionEquipos
                    puedeEditar={puedeEditar}
                    version={version}
                    onDespachar={onDespachar}
                    onNuevoItem={puedeEditar ? () => abrirModalItem(null) : undefined}
                    onEditarItem={puedeEditar ? (item) => abrirModalItem(item) : undefined}
                />
            )}

            {seccionActiva === 'movimientos' && (
                <SeccionMovimientos
                    puedeEditar={puedeEditar}
                    version={version}
                    onNuevoDespacho={onNuevoDespacho}
                    onEditarDespacho={onEditarDespacho}
                    onEditarPrestamo={puedeEditar ? (p) => abrirModalPrestamo(p) : undefined}
                    avisar={avisar}
                />
            )}

            {seccionActiva === 'tecnicos' && (
                <SeccionTecnicos version={version} />
            )}

            {seccionActiva === 'ventas' && (
                <SeccionVentas version={version} />
            )}

            {/* Modal para Crear / Editar Equipo RTC */}
            {modalItem && (
                <ModalInventario
                    titulo={modalItem.id ? 'Editar equipo RTC' : 'Nuevo equipo RTC'}
                    subtitulo="Unión Temporal RTC American Global"
                    onCerrar={() => setModalItem(null)}
                    ocupado={guardandoItem}
                    ancho
                >
                    <form className="sgc-inv-form" onSubmit={guardarItem}>
                        <div className="sgc-inv-grid2">
                            <label className="sgc-inv-label">
                                Cantidad en stock
                                <input
                                    type="number"
                                    min="0"
                                    className="sgc-inv-input"
                                    required
                                    {...campoItem('cantidad_stock')}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Fecha de compra <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    type="date"
                                    className="sgc-inv-input"
                                    {...campoItem('fecha_compra')}
                                />
                            </label>
                        </div>

                        <label className="sgc-inv-label">
                            Descripción
                            <input
                                className="sgc-inv-input"
                                required
                                maxLength={255}
                                {...campoItem('descripcion')}
                            />
                        </label>

                        <div className="sgc-inv-grid2">
                            <label className="sgc-inv-label">
                                Código de barras <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    {...campoItem('codigo_barras')}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Serial GSB <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    {...campoItem('serial_gsb')}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                ID. equipo <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    {...campoItem('id_equipo')}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                No SDS <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    {...campoItem('no_sds')}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                No. Artículo <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    {...campoItem('numero_articulo')}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Factura <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    className="sgc-inv-input"
                                    maxLength={60}
                                    {...campoItem('factura')}
                                />
                            </label>
                            <label className="sgc-inv-label">
                                Tiempo entrega / notas <span className="sgc-inv-opcional">opcional</span>
                                <input
                                    className="sgc-inv-input"
                                    maxLength={80}
                                    {...campoItem('tiempo_entrega')}
                                />
                            </label>
                        </div>

                        {errorItem && <div className="sgc-inv-alerta sgc-inv-alerta--err">{errorItem}</div>}

                        <div className="sgc-inv-modal-acciones">
                            <button
                                type="button"
                                className="sgc-inv-btn sgc-inv-btn--ghost"
                                onClick={() => setModalItem(null)}
                                disabled={guardandoItem}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="sgc-inv-btn sgc-inv-btn--primario"
                                disabled={guardandoItem}
                            >
                                {guardandoItem ? 'Guardando…' : modalItem.id ? 'Guardar cambios' : 'Crear equipo'}
                            </button>
                        </div>
                    </form>
                </ModalInventario>
            )}

            {/* Modal para Editar Préstamo */}
            {modalPrestamo && (
                <ModalInventario
                    titulo="Editar préstamo RTC"
                    subtitulo="Unión Temporal RTC American Global"
                    onCerrar={() => setModalPrestamo(null)}
                    ocupado={guardandoPrestamo}
                >
                    <form className="sgc-inv-form" onSubmit={guardarPrestamo}>
                        <label className="sgc-inv-label">
                            Descripción
                            <input
                                className="sgc-inv-input"
                                required
                                maxLength={255}
                                value={formPrestamo.descripcion}
                                onChange={(e) =>
                                    setFormPrestamo({ ...formPrestamo, descripcion: e.target.value })
                                }
                            />
                        </label>
                        <label className="sgc-inv-label">
                            Cantidad
                            <input
                                type="number"
                                min="1"
                                className="sgc-inv-input"
                                required
                                value={formPrestamo.cantidad}
                                onChange={(e) =>
                                    setFormPrestamo({ ...formPrestamo, cantidad: e.target.value })
                                }
                            />
                        </label>

                        {errorPrestamo && (
                            <div className="sgc-inv-alerta sgc-inv-alerta--err">{errorPrestamo}</div>
                        )}

                        <div className="sgc-inv-modal-acciones">
                            <button
                                type="button"
                                className="sgc-inv-btn sgc-inv-btn--ghost"
                                onClick={() => setModalPrestamo(null)}
                                disabled={guardandoPrestamo}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="sgc-inv-btn sgc-inv-btn--primario"
                                disabled={guardandoPrestamo}
                            >
                                {guardandoPrestamo ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </div>
                    </form>
                </ModalInventario>
            )}
        </div>
    );
}
