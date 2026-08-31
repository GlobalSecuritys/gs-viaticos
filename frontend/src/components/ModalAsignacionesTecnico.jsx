import { useState, useEffect, useMemo } from 'react';
import api, { exportarViaticosAsignacion, exportarViaticosIndependientes, descargarBlob } from '../services/api';
import { listarAsignaciones, crearAsignacion, actualizarAsignacion, finalizarAsignacion, eliminarAsignacion, extenderFechaAsignacion } from '../services/asignaciones';
import { formatCOP, formatFechaCorta, iniciales } from '../utils/personal';
import { LABEL_TIPO_ASIGNACION, LABEL_ESTADO_ASIGNACION, CLASE_ESTADO_ASIGNACION } from '../utils/asignaciones';
import AsignacionForm from './AsignacionForm';
import ModalCuentaCobro from './ModalCuentaCobro';
import './ModalAsignacionesTecnico.css';

export default function ModalAsignacionesTecnico({ tecnico, onClose, onAsignacionActualizada }) {
    const [asignaciones, setAsignaciones] = useState([]);
    const [tecnicos, setTecnicos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mensajeFeedback, setMensajeFeedback] = useState('');

    // Control de formulario crear / editar
    const [modoForm, setModoForm] = useState(null); // 'crear' | 'editar' | null
    const [asignacionEnEdicion, setAsignacionEnEdicion] = useState(null);
    const [enviando, setEnviando] = useState(false);

    // Modal de cuenta de cobro y exportación
    const [cuentaCobroSeleccionada, setCuentaCobroSeleccionada] = useState(null);
    const [exportandoId, setExportandoId] = useState(null);
    const [exportandoConsolidado, setExportandoConsolidado] = useState(false);

    // Extender fecha de fin
    const [extendiendoId, setExtendiendoId] = useState(null); // id de la asignación en edición de fecha
    const [nuevaFechaFin, setNuevaFechaFin] = useState('');   // valor del input date

    // Filtro rápido de estado
    const [filtroEstado, setFiltroEstado] = useState('todas');

    async function cargarDatos() {
        setLoading(true);
        setError('');
        try {
            const [resAsig, resUsuarios] = await Promise.all([
                listarAsignaciones(),
                api.get('/admin/usuarios'),
            ]);

            const usuariosMap = new Map(resUsuarios.data.map((u) => [String(u.id), u]));
            setTecnicos(resUsuarios.data.filter((u) => u.rol === 'tecnico' && u.activo));

            const delTecnico = resAsig.data
                .filter((a) => String(a.tecnico_id) === String(tecnico.id))
                .map((a) => ({
                    ...a,
                    tecnico_nombre: usuariosMap.get(String(a.tecnico_id))?.nombre || a.tecnico_nombre || tecnico.nombre,
                }));

            setAsignaciones(delTecnico);
        } catch {
            setError('No se pudieron cargar las asignaciones del técnico.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarDatos();
    }, [tecnico.id]);

    const asignacionesFiltradas = useMemo(() => {
        if (filtroEstado === 'todas') return asignaciones;
        if (filtroEstado === 'activas') {
            return asignaciones.filter((a) => a.estado === 'pendiente' || a.estado === 'en_curso');
        }
        return asignaciones.filter((a) => a.estado === filtroEstado);
    }, [asignaciones, filtroEstado]);

    async function handleCrear(payload) {
        setEnviando(true);
        setError('');
        try {
            await crearAsignacion(payload);
            setModoForm(null);
            setMensajeFeedback('✅ Asignación creada exitosamente.');
            await cargarDatos();
            if (onAsignacionActualizada) onAsignacionActualizada();
        } catch {
            setError('No se pudo crear la asignación.');
        } finally {
            setEnviando(false);
        }
    }

    async function handleActualizar(payload) {
        if (!asignacionEnEdicion) return;
        setEnviando(true);
        setError('');
        try {
            await actualizarAsignacion(asignacionEnEdicion.id, payload);
            setModoForm(null);
            setAsignacionEnEdicion(null);
            setMensajeFeedback('✅ Asignación actualizada exitosamente.');
            await cargarDatos();
            if (onAsignacionActualizada) onAsignacionActualizada();
        } catch {
            setError('No se pudo actualizar la asignación.');
        } finally {
            setEnviando(false);
        }
    }

    async function handleFinalizar(asignacionId) {
        if (!window.confirm('¿Deseas finalizar esta asignación? Pasará al historial de asignaciones finalizadas.')) return;
        try {
            await finalizarAsignacion(asignacionId);
            setMensajeFeedback('✅ Asignación finalizada correctamente.');
            await cargarDatos();
            if (onAsignacionActualizada) onAsignacionActualizada();
        } catch {
            setError('No se pudo finalizar la asignación.');
        }
    }

    async function handleBorrar(asignacionId) {
        if (!window.confirm('¿Deseas borrar esta asignación? Se ocultará del sistema y se eliminará permanentemente de la base de datos en 24 horas.')) return;
        try {
            await eliminarAsignacion(asignacionId);
            setMensajeFeedback('✅ Asignación borrada correctamente.');
            await cargarDatos();
            if (onAsignacionActualizada) onAsignacionActualizada();
        } catch {
            setError('No se pudo borrar la asignación.');
        }
    }

    async function handleExportarAsignacion(asignacionId) {
        setExportandoId(asignacionId);
        try {
            const res = await exportarViaticosAsignacion(asignacionId);
            descargarBlob(res.data, `asignacion_${asignacionId}_${tecnico.nombre?.replace(/\s+/g, '_')}.xlsx`);
        } catch {
            alert('No se pudo exportar el Excel de la asignación.');
        } finally {
            setExportandoId(null);
        }
    }

    async function handleExportarConsolidado() {
        setExportandoConsolidado(true);
        try {
            const res = await exportarViaticosIndependientes(tecnico.id);
            descargarBlob(res.data, `viaticos_${tecnico.nombre?.replace(/\s+/g, '_')}.xlsx`);
        } catch {
            alert('No se pudo exportar el consolidado de viáticos.');
        } finally {
            setExportandoConsolidado(false);
        }
    }

    async function handleExtenderFecha(asignacionId) {
        if (!nuevaFechaFin) {
            alert('Selecciona una nueva fecha de fin.');
            return;
        }
        try {
            await extenderFechaAsignacion(asignacionId, nuevaFechaFin);
            setMensajeFeedback('✅ Fecha de fin extendida correctamente.');
            setExtendiendoId(null);
            setNuevaFechaFin('');
            await cargarDatos();
            if (onAsignacionActualizada) onAsignacionActualizada();
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(detail || 'No se pudo extender la fecha.');
        }
    }

    return (
        <div className="mat-overlay" onClick={onClose}>
            <div className="mat-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header del Modal */}
                <div className="mat-header">
                    <div className="mat-header-user">
                        <div className="mat-avatar">{iniciales(tecnico.nombre)}</div>
                        <div>
                            <div className="mat-user-title-row">
                                <h2 className="mat-user-nombre">{tecnico.nombre}</h2>
                                <span className="mat-badge-tecnico">Técnico</span>
                            </div>
                            <p className="mat-user-sub">
                                {tecnico.codigo_empleado ? `Cédula: ${tecnico.codigo_empleado}` : 'Sin cédula'} • {tecnico.correo}
                            </p>
                        </div>
                    </div>
                    <button className="mat-close-btn" onClick={onClose} title="Cerrar">✕</button>
                </div>

                {mensajeFeedback && (
                    <div className="mat-alert mat-alert--success">
                        <span>{mensajeFeedback}</span>
                        <button onClick={() => setMensajeFeedback('')}>×</button>
                    </div>
                )}

                {error && (
                    <div className="mat-alert mat-alert--error">
                        <span>{error}</span>
                        <button onClick={() => setError('')}>×</button>
                    </div>
                )}

                {/* Barra de Acciones Principales */}
                {!modoForm && (
                    <div className="mat-toolbar">
                        <div className="mat-toolbar-left">
                            <span className="mat-toolbar-title">
                                Asignaciones individuales ({asignaciones.length})
                            </span>
                            <div className="mat-filter-pills">
                                <button
                                    className={`mat-pill ${filtroEstado === 'todas' ? 'mat-pill--activo' : ''}`}
                                    onClick={() => setFiltroEstado('todas')}
                                >
                                    Todas ({asignaciones.length})
                                </button>
                                <button
                                    className={`mat-pill ${filtroEstado === 'activas' ? 'mat-pill--activo' : ''}`}
                                    onClick={() => setFiltroEstado('activas')}
                                >
                                    Activas ({asignaciones.filter((a) => a.estado === 'pendiente' || a.estado === 'en_curso').length})
                                </button>
                                <button
                                    className={`mat-pill ${filtroEstado === 'finalizada' ? 'mat-pill--activo' : ''}`}
                                    onClick={() => setFiltroEstado('finalizada')}
                                >
                                    Finalizadas ({asignaciones.filter((a) => a.estado === 'finalizada').length})
                                </button>
                            </div>
                        </div>

                        <div className="mat-toolbar-right">
                            <button
                                type="button"
                                className="mat-btn-export"
                                onClick={handleExportarConsolidado}
                                disabled={exportandoConsolidado}
                                title="Descargar reporte Excel de viáticos del técnico"
                            >
                                {exportandoConsolidado ? '⌛ Exportando...' : '📊 Reporte Excel Técnico'}
                            </button>
                            <button
                                type="button"
                                className="mat-btn-nueva"
                                onClick={() => {
                                    setAsignacionEnEdicion(null);
                                    setModoForm('crear');
                                }}
                            >
                                ✨ + Nueva Asignación
                            </button>
                        </div>
                    </div>
                )}

                {/* Cuerpo del Modal: Formulario o Lista */}
                <div className="mat-body">
                    {modoForm ? (
                        <div className="mat-form-wrap">
                            <div className="mat-form-header">
                                <h3>{modoForm === 'crear' ? 'Nueva Asignación para ' + tecnico.nombre : 'Editar Asignación'}</h3>
                                <button
                                    className="admin-back-btn"
                                    onClick={() => {
                                        setModoForm(null);
                                        setAsignacionEnEdicion(null);
                                    }}
                                >
                                    ← Volver al listado
                                </button>
                            </div>
                            <AsignacionForm
                                tecnicos={tecnicos.length ? tecnicos : [tecnico]}
                                inicial={asignacionEnEdicion}
                                tecnicoPreseleccionado={tecnico.id}
                                onSubmit={modoForm === 'crear' ? handleCrear : handleActualizar}
                                onCancelar={() => {
                                    setModoForm(null);
                                    setAsignacionEnEdicion(null);
                                }}
                                enviando={enviando}
                            />
                        </div>
                    ) : loading ? (
                        <div className="mat-loading">
                            <p>Cargando asignaciones de {tecnico.nombre}...</p>
                        </div>
                    ) : asignacionesFiltradas.length === 0 ? (
                        <div className="mat-empty">
                            <span className="mat-empty-icon">📁</span>
                            <h4>No hay asignaciones registradas</h4>
                            <p>Este técnico no tiene asignaciones con el filtro seleccionado.</p>
                            <button
                                className="mat-btn-nueva"
                                style={{ marginTop: '1rem' }}
                                onClick={() => setModoForm('crear')}
                            >
                                ✨ Crear primera asignación
                            </button>
                        </div>
                    ) : (
                        <div className="mat-cards-grid">
                            {asignacionesFiltradas.map((a) => {
                                const anticipo = Number(a.monto_anticipo || 0);
                                const gastado = Number(a.total_gastado || 0);
                                const saldo = Number(a.saldo_restante || Math.max(0, anticipo - gastado));
                                const esActiva = a.estado === 'pendiente' || a.estado === 'en_curso';

                                return (
                                    <div key={a.id} className={`mat-asig-card mat-asig-card--${a.estado}`}>
                                        {/* Cabecera de la tarjeta */}
                                        <div className="mat-asig-card-top">
                                            <div className="mat-asig-tipo-badge">
                                                🏷️ {LABEL_TIPO_ASIGNACION[a.tipo] || a.tipo}
                                            </div>
                                            <span className={`asig-card-badge ${CLASE_ESTADO_ASIGNACION[a.estado] || ''}`}>
                                                {LABEL_ESTADO_ASIGNACION[a.estado] || a.estado}
                                            </span>
                                        </div>

                                        {/* Datos del Proyecto & Oficina */}
                                        <div className="mat-asig-info">
                                            <h4 className="mat-asig-proyecto">{a.cliente}</h4>
                                            <p className="mat-asig-oficina-ciudad">
                                                {a.empresa && <strong>{a.empresa} • </strong>}
                                                <span>📍 {a.ciudad}</span>
                                            </p>
                                        </div>

                                        {/* Fechas */}
                                        <div className="mat-asig-fechas">
                                            <span>📅 {formatFechaCorta(a.fecha_inicio)} → {formatFechaCorta(a.fecha_fin)}</span>
                                        </div>

                                        {/* Métricas Financieras */}
                                        <div className="mat-asig-fin-grid">
                                            <div className="mat-asig-fin-item">
                                                <span className="mat-fin-lbl">Anticipo</span>
                                                <span className="mat-fin-val">{formatCOP(anticipo)}</span>
                                            </div>
                                            <div className="mat-asig-fin-item">
                                                <span className="mat-fin-lbl">Gastado</span>
                                                <span className="mat-fin-val" style={{ color: '#0284C7' }}>{formatCOP(gastado)}</span>
                                            </div>
                                            <div className="mat-asig-fin-item">
                                                <span className="mat-fin-lbl">Saldo</span>
                                                <span className="mat-fin-val" style={{ color: '#16A34A' }}>{formatCOP(saldo)}</span>
                                            </div>
                                            {gastado > anticipo && (
                                                <div className="mat-asig-fin-item" style={{ background: '#FEF2F2', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
                                                    <span className="mat-fin-lbl" style={{ color: '#991B1B', fontWeight: 700 }}>Favor Técnico</span>
                                                    <span className="mat-fin-val" style={{ color: '#DC2626', fontWeight: 800 }}>{formatCOP(gastado - anticipo)}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Acciones de la Tarjeta */}
                                        <div className="mat-asig-actions">
                                            <div className="mat-asig-actions-row">
                                                <button
                                                    type="button"
                                                    className="mat-btn-action"
                                                    onClick={() => handleExportarAsignacion(a.id)}
                                                    disabled={exportandoId === a.id}
                                                    title="Descargar Excel de viáticos de esta asignación"
                                                >
                                                    {exportandoId === a.id ? '⌛' : '📊'} Excel
                                                </button>

                                                {a.cuenta_cobro?.secure_url ? (
                                                    <button
                                                        type="button"
                                                        className="mat-btn-action mat-btn-action--cc"
                                                        onClick={() => setCuentaCobroSeleccionada(a)}
                                                    >
                                                        📄 Cuenta Cobro
                                                    </button>
                                                ) : (
                                                    <span className="mat-badge-no-cc">
                                                        ⏳ Sin cuenta cobro
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mat-asig-actions-row mat-asig-actions-row--admin">
                                                <button
                                                    type="button"
                                                    className="mat-btn-edit"
                                                    onClick={() => {
                                                        setAsignacionEnEdicion(a);
                                                        setModoForm('editar');
                                                    }}
                                                >
                                                    ✏️ Editar / Reasignar
                                                </button>

                                                {esActiva && (
                                                    <button
                                                        type="button"
                                                        className="mat-btn-finalizar"
                                                        onClick={() => handleFinalizar(a.id)}
                                                    >
                                                        ✅ Finalizar asignación
                                                    </button>
                                                )}

                                                {/* Botón Extender fecha de fin */}
                                                {extendiendoId === a.id ? (
                                                    <div className="mat-extender-fecha-form">
                                                        <label className="mat-extender-label">
                                                            📅 Nueva fecha de fin:
                                                            <input
                                                                type="date"
                                                                className="mat-extender-input"
                                                                value={nuevaFechaFin}
                                                                min={a.fecha_inicio}
                                                                onChange={(e) => setNuevaFechaFin(e.target.value)}
                                                            />
                                                        </label>
                                                        <div className="mat-extender-btns">
                                                            <button
                                                                type="button"
                                                                className="mat-btn-confirmar"
                                                                onClick={() => handleExtenderFecha(a.id)}
                                                            >
                                                                ✔️ Confirmar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="mat-btn-cancelar-ext"
                                                                onClick={() => { setExtendiendoId(null); setNuevaFechaFin(''); }}
                                                            >
                                                                ✕ Cancelar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="mat-btn-extender"
                                                        onClick={() => {
                                                            setExtendiendoId(a.id);
                                                            setNuevaFechaFin(a.fecha_fin || '');
                                                        }}
                                                        title="Extender o ajustar la fecha de fin para que el técnico pueda volver a subir viáticos"
                                                    >
                                                        📅 Extender fecha
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    className="mat-btn-borrar"
                                                    onClick={() => handleBorrar(a.id)}
                                                    title="Borrar asignación"
                                                >
                                                    🗑️ Borrar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Modal de Cuenta de Cobro */}
                {cuentaCobroSeleccionada && (
                    <ModalCuentaCobro
                        archivoUrl={cuentaCobroSeleccionada.cuenta_cobro?.secure_url}
                        cuenta={{
                            consecutivo: `ASIG-${cuentaCobroSeleccionada.id}`,
                            fecha: cuentaCobroSeleccionada.fecha_inicio,
                            ciudad: cuentaCobroSeleccionada.ciudad,
                            titular_nombre: tecnico.nombre,
                            identificacion: tecnico.codigo_empleado || '—',
                            concepto_servicio: `Servicios de viáticos y comisión técnica - ${cuentaCobroSeleccionada.cliente} (${LABEL_TIPO_ASIGNACION[cuentaCobroSeleccionada.tipo] || cuentaCobroSeleccionada.tipo})`,
                            total: cuentaCobroSeleccionada.total_gastado || cuentaCobroSeleccionada.monto_anticipo || 0,
                            items: [
                                {
                                    oficina: cuentaCobroSeleccionada.empresa || cuentaCobroSeleccionada.ciudad || 'SEDE',
                                    fecha_inicio: cuentaCobroSeleccionada.fecha_inicio,
                                    fecha_fin: cuentaCobroSeleccionada.fecha_fin,
                                    num_tecnicos: 1,
                                    valor_diario: cuentaCobroSeleccionada.total_gastado || cuentaCobroSeleccionada.monto_anticipo || 0,
                                    valor_total: cuentaCobroSeleccionada.total_gastado || cuentaCobroSeleccionada.monto_anticipo || 0,
                                }
                            ]
                        }}
                        onClose={() => setCuentaCobroSeleccionada(null)}
                    />
                )}
            </div>
        </div>
    );
}
