import { useState, useEffect, useMemo } from 'react';
import { listarAsignaciones } from '../services/asignaciones';
import api from '../services/api';
import { formatCOP, formatFechaCorta, iniciales } from '../utils/personal';
import { LABEL_TIPO_ASIGNACION, labelAsignacion } from '../utils/asignaciones';
import ModalCuentaCobro from './ModalCuentaCobro';
import './ModalCuentasCobroTecnico.css';

export default function ModalCuentasCobroTecnico({ tecnico, onClose }) {
    const [asignaciones, setAsignaciones] = useState([]);
    const [cuentasGenerales, setCuentasGenerales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('todas'); // 'todas' | 'con_cuenta' | 'sin_cuenta'
    const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);

    async function cargarDatos() {
        setLoading(true);
        setError('');
        try {
            const [resAsig, resCuentas] = await Promise.all([
                listarAsignaciones(),
                api.get('/cuentas-cobro').catch(() => ({ data: [] })),
            ]);

            // Filtrar asignaciones exclusivas de este técnico
            const asigsTecnico = (resAsig.data || []).filter(
                (a) => String(a.tecnico_id) === String(tecnico.id)
            );
            setAsignaciones(asigsTecnico);

            // Filtrar cuentas de cobro emitidas por este técnico
            const ctesTecnico = (resCuentas.data || []).filter(
                (c) => String(c.usuario_id) === String(tecnico.id)
            );
            setCuentasGenerales(ctesTecnico);
        } catch {
            setError('No se pudieron cargar las cuentas de cobro del técnico.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarDatos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tecnico.id]);

    // Estadísticas
    const stats = useMemo(() => {
        const totalAsignaciones = asignaciones.length;
        const conCuenta = asignaciones.filter((a) => a.cuenta_cobro?.secure_url).length;
        const sinCuenta = totalAsignaciones - conCuenta;
        const totalGastado = asignaciones.reduce((acc, a) => acc + Number(a.total_gastado || 0), 0);
        return { totalAsignaciones, conCuenta, sinCuenta, totalGastado };
    }, [asignaciones]);

    // Asignaciones filtradas
    const asignacionesFiltradas = useMemo(() => {
        if (filtroEstado === 'con_cuenta') {
            return asignaciones.filter((a) => a.cuenta_cobro?.secure_url);
        }
        if (filtroEstado === 'sin_cuenta') {
            return asignaciones.filter((a) => !a.cuenta_cobro?.secure_url);
        }
        return asignaciones;
    }, [asignaciones, filtroEstado]);

    function abrirDetalleCuenta(asig) {
        // Si hay una cuenta digital adjunta en la asignación
        if (asig.cuenta_cobro?.secure_url) {
            setCuentaSeleccionada({
                archivoUrl: asig.cuenta_cobro.secure_url,
                cuenta: {
                    consecutivo: `ASIG-${asig.id}`,
                    fecha: asig.fecha_inicio,
                    ciudad: asig.ciudad,
                    titular_nombre: tecnico.nombre,
                    identificacion: tecnico.codigo_empleado || '—',
                    concepto_servicio: `Servicios de viáticos y comisión técnica - ${asig.cliente} (${LABEL_TIPO_ASIGNACION[asig.tipo] || asig.tipo})`,
                    total: asig.total_gastado || asig.monto_anticipo || 0,
                    items: [
                        {
                            oficina: asig.empresa || asig.ciudad || 'SEDE',
                            fecha_inicio: asig.fecha_inicio,
                            fecha_fin: asig.fecha_fin,
                            num_tecnicos: 1,
                            valor_diario: asig.total_gastado || asig.monto_anticipo || 0,
                            valor_total: asig.total_gastado || asig.monto_anticipo || 0,
                        },
                    ],
                },
            });
            return;
        }

        // Si existe un registro general emitido por el técnico para esta fecha/ciudad
        const encontrada = cuentasGenerales.find(
            (c) => c.ciudad?.toLowerCase() === asig.ciudad?.toLowerCase()
        );
        if (encontrada) {
            setCuentaSeleccionada({ cuenta: encontrada });
        }
    }

    return (
        <div className="mcct-overlay" onClick={onClose}>
            <div className="mcct-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header del Modal */}
                <div className="mcct-header">
                    <div className="mcct-header-user">
                        <div className="mcct-avatar">{iniciales(tecnico.nombre)}</div>
                        <div>
                            <div className="mcct-user-title-row">
                                <h2 className="mcct-user-nombre">{tecnico.nombre}</h2>
                                <span className="mcct-badge-tech">Técnico</span>
                            </div>
                            <p className="mcct-user-sub">
                                {tecnico.codigo_empleado ? `Cédula: ${tecnico.codigo_empleado}` : 'Sin cédula'} • {tecnico.correo}
                            </p>
                        </div>
                    </div>
                    <button className="mcct-close-btn" onClick={onClose} title="Cerrar">✕</button>
                </div>

                {error && (
                    <div className="mcct-alert mcct-alert--error">
                        <span>{error}</span>
                        <button onClick={() => setError('')}>×</button>
                    </div>
                )}

                {/* Resumen KPIs del Técnico */}
                <div className="mcct-kpis-row">
                    <div className="mcct-kpi-card">
                        <span className="mcct-kpi-lbl">Total Asignaciones</span>
                        <span className="mcct-kpi-val">{stats.totalAsignaciones}</span>
                    </div>
                    <div className="mcct-kpi-card mcct-kpi-card--success">
                        <span className="mcct-kpi-lbl">Con Cuenta Adjunta</span>
                        <span className="mcct-kpi-val">{stats.conCuenta}</span>
                    </div>
                    <div className="mcct-kpi-card mcct-kpi-card--warning">
                        <span className="mcct-kpi-lbl">Pendientes</span>
                        <span className="mcct-kpi-val">{stats.sinCuenta}</span>
                    </div>
                    <div className="mcct-kpi-card mcct-kpi-card--money">
                        <span className="mcct-kpi-lbl">Total Gastos Asignaciones</span>
                        <span className="mcct-kpi-val">{formatCOP(stats.totalGastado)}</span>
                    </div>
                </div>

                {/* Barra de Filtros */}
                <div className="mcct-toolbar">
                    <div className="mcct-filter-pills">
                        <button
                            className={`mcct-pill ${filtroEstado === 'todas' ? 'mcct-pill--activo' : ''}`}
                            onClick={() => setFiltroEstado('todas')}
                        >
                            Todas ({asignaciones.length})
                        </button>
                        <button
                            className={`mcct-pill ${filtroEstado === 'con_cuenta' ? 'mcct-pill--activo' : ''}`}
                            onClick={() => setFiltroEstado('con_cuenta')}
                        >
                            Con Cuenta de Cobro ({stats.conCuenta})
                        </button>
                        <button
                            className={`mcct-pill ${filtroEstado === 'sin_cuenta' ? 'mcct-pill--activo' : ''}`}
                            onClick={() => setFiltroEstado('sin_cuenta')}
                        >
                            Pendientes ({stats.sinCuenta})
                        </button>
                    </div>
                </div>

                {/* Listado de Asignaciones y Cuentas de Cobro */}
                <div className="mcct-body">
                    {loading ? (
                        <div className="mcct-loading">
                            <p>Cargando cuentas de cobro de {tecnico.nombre}...</p>
                        </div>
                    ) : asignacionesFiltradas.length === 0 ? (
                        <div className="mcct-empty">
                            <span className="mcct-empty-icon">💵</span>
                            <h4>No hay registros de cuentas de cobro</h4>
                            <p>No se encontraron asignaciones con el filtro seleccionado para este técnico.</p>
                        </div>
                    ) : (
                        <div className="mcct-cards-grid">
                            {asignacionesFiltradas.map((a) => {
                                const tieneCuenta = Boolean(a.cuenta_cobro?.secure_url);
                                const anticipo = Number(a.monto_anticipo || 0);
                                const gastado = Number(a.total_gastado || 0);
                                const saldo = Number(a.saldo_restante || Math.max(0, anticipo - gastado));

                                return (
                                    <div key={a.id} className={`mcct-card ${tieneCuenta ? 'mcct-card--con-doc' : 'mcct-card--sin-doc'}`}>
                                        {/* Cabecera de la tarjeta con Asignación Asociada */}
                                        <div className="mcct-card-top">
                                            <div className="mcct-card-asig-badge">
                                                <span className="mcct-asig-num" title={`ID interno: #${a.id}`}>{labelAsignacion(a.cliente, a.tipo, a.id)}</span>
                                                <span className="mcct-asig-tipo">{LABEL_TIPO_ASIGNACION[a.tipo] || a.tipo}</span>
                                            </div>
                                            {tieneCuenta ? (
                                                <span className="mcct-status-badge mcct-status-badge--adjunta">
                                                    ✓ Documento Adjunto
                                                </span>
                                            ) : (
                                                <span className="mcct-status-badge mcct-status-badge--pendiente">
                                                    ⏳ Sin adjuntar
                                                </span>
                                            )}
                                        </div>

                                        {/* Detalles del Proyecto y Oficina */}
                                        <div className="mcct-card-info">
                                            <h4 className="mcct-card-proyecto" title={a.cliente}>
                                                {a.cliente}
                                            </h4>
                                            <p className="mcct-card-ubicacion">
                                                {a.empresa && <strong>{a.empresa} • </strong>}
                                                <span>📍 {a.ciudad}</span>
                                            </p>
                                            <p className="mcct-card-fechas">
                                                📅 {formatFechaCorta(a.fecha_inicio)} → {formatFechaCorta(a.fecha_fin)}
                                            </p>
                                        </div>

                                        {/* Métricas Financieras */}
                                        <div className="mcct-card-fin-grid">
                                            <div className="mcct-fin-item">
                                                <span className="mcct-fin-lbl">Anticipo</span>
                                                <span className="mcct-fin-val">{formatCOP(anticipo)}</span>
                                            </div>
                                            <div className="mcct-fin-item">
                                                <span className="mcct-fin-lbl">Total Gastado</span>
                                                <span className="mcct-fin-val" style={{ color: '#0284C7' }}>{formatCOP(gastado)}</span>
                                            </div>
                                            <div className="mcct-fin-item">
                                                <span className="mcct-fin-lbl">Saldo</span>
                                                <span className="mcct-fin-val" style={{ color: '#16A34A' }}>{formatCOP(saldo)}</span>
                                            </div>
                                        </div>

                                        {/* Acciones */}
                                        <div className="mcct-card-actions">
                                            {tieneCuenta ? (
                                                <button
                                                    type="button"
                                                    className="mcct-btn-ver-doc"
                                                    onClick={() => abrirDetalleCuenta(a)}
                                                >
                                                    📄 Ver Cuenta de Cobro Oficial
                                                </button>
                                            ) : (
                                                <span className="mcct-msg-pendiente">
                                                    El técnico no ha cargado aún el soporte digital de esta asignación.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Modal Visualizador de Cuenta de Cobro */}
                {cuentaSeleccionada && (
                    <ModalCuentaCobro
                        archivoUrl={cuentaSeleccionada.archivoUrl}
                        cuenta={cuentaSeleccionada.cuenta}
                        onClose={() => setCuentaSeleccionada(null)}
                    />
                )}
            </div>
        </div>
    );
}
