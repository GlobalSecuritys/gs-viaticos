import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, {
    exportarViaticosIndependientes,
    exportarViaticosAsignacion,
    descargarBlob,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { puedeGestionarUsuario } from '../utils/permisos';
import { listarAsignaciones } from '../services/asignaciones';
import {
    LABEL_TIPO_ASIGNACION,
    obtenerAsignacionesActivasDeTecnico,
} from '../utils/asignaciones';
import ModalEvidencia from '../components/ModalEvidencia';
import ModalCrearUsuario from '../components/ModalCrearUsuario';
import ModalEditarUsuario from '../components/ModalEditarUsuario';
import ModalCuentaCobro from '../components/ModalCuentaCobro';
import { formatApiError } from '../utils/formatError';
import {
    ICONO_TIPO_GASTO,
    LABEL_CARGO,
    LABEL_TIPO_GASTO,
    filtrarPorRango,
    formatCOP,
    formatFechaLarga,
    hoyISO,
    iniciales,
    resumen,
} from '../utils/personal';
import logoGSB from '../assets/logo-gsb.png';
import './PerfilEmpleado.css';

const FILTROS_PERIODO = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'mes', label: 'Mes' },
    { id: 'personalizado', label: 'Personalizado' },
];

const FILTROS_TIPO_ASIGNACION = [
    { id: 'todas', label: 'Todas' },
    { id: 'rtc', label: 'RTC' },
    { id: 'oficina', label: 'Oficina' },
];

function aISO(date) {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
}

function rangoMesCalendario(fechaBase = new Date()) {
    const year = fechaBase.getFullYear();
    const month = fechaBase.getMonth();
    const ultimoDia = new Date(year, month + 1, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    return {
        inicio: `${year}-${pad(month + 1)}-01`,
        fin: `${year}-${pad(month + 1)}-${pad(ultimoDia)}`,
    };
}

const LABEL_ESTADO_VIATICO = {
    aprobado: 'Aprobado',
    pendiente: 'Pendiente',
    rechazado: 'Rechazado',
};

export default function PerfilEmpleado() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth()

    const [usuario, setUsuario] = useState(null);
    const [viaticos, setViaticos] = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [todosUsuarios, setTodosUsuarios] = useState([]);
    const [todosViaticos, setTodosViaticos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filtroPeriodo, setFiltroPeriodo] = useState('mes');
    const [filtroTipoAsignacion, setFiltroTipoAsignacion] = useState('todas');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [mensajeFeedback, setMensajeFeedback] = useState('');
    const [cuentaCobroVer, setCuentaCobroVer] = useState(null);
    const [seleccionado, setSeleccionado] = useState(null);
    const [errorRol, setErrorRol] = useState('');
    const [cambiandoRol, setCambiandoRol] = useState(false);
    const [mostrarCrearUsuario, setMostrarCrearUsuario] = useState(false);
    const [errorEstado, setErrorEstado] = useState('');
    const [cambiandoEstado, setCambiandoEstado] = useState(false);
    const [mostrarEditarUsuario, setMostrarEditarUsuario] = useState(false);

    async function recargarViaticos() {
        const resViaticos = await api.get('/admin/viaticos');
        setViaticos(resViaticos.data.filter((v) => String(v.usuario_id) === id));
    }

    async function aprobar(viaticoId, comentario) {
        setSeleccionado(null);
        setMensajeFeedback(`✅ Aprobación registrada correctamente${comentario ? ` — Comentario: "${comentario}"` : ''}`);
        recargarViaticos();
    }

    async function rechazar(viaticoId, comentario) {
        setSeleccionado(null);
        setMensajeFeedback(`❌ Rechazo registrado correctamente${comentario ? ` — Motivo enviado: "${comentario}"` : ''}`);
        recargarViaticos();
    }

    // Mismo patrón que ya funciona en AdminUsuarios.jsx (cambiarRol): el
    // backend es la autoridad real (get_current_superadmin puro, ver
    // app/routers/admin.py), esto solo llama al mismo endpoint ya probado.
    async function cambiarRol(nuevoRol) {
        setCambiandoRol(true);
        setErrorRol('');
        try {
            const { data } = await api.put(`/admin/usuarios/${usuario.id}/rol`, {
                rol: nuevoRol,
            });
            setUsuario(data);
        } catch (err) {
            setErrorRol(formatApiError(err, 'No se pudo cambiar el rol.'));
        } finally {
            setCambiandoRol(false);
        }
    }

    async function cambiarEstado(nuevoActivo) {
        setCambiandoEstado(true);
        setErrorEstado('');
        try {
            const { data } = await api.put(`/admin/usuarios/${usuario.id}/estado`, {
                activo: nuevoActivo,
            });
            setUsuario(data);
        } catch (err) {
            setErrorEstado(formatApiError(err, 'No se pudo cambiar el estado.'));
        } finally {
            setCambiandoEstado(false);
        }
    }

    const [hoy] = useState(() => new Date());
    const [inicioMesISO] = useState(() => aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
    const [rangoInicio, setRangoInicio] = useState(inicioMesISO);
    const [rangoFin, setRangoFin] = useState(hoyISO());
    const [tipoAsignacion, setTipoAsignacion] = useState('todas');
    const [busquedaAsignacion, setBusquedaAsignacion] = useState('');
    const [filtroClienteAsignacion, setFiltroClienteAsignacion] = useState('');
    const [exportandoIndependiente, setExportandoIndependiente] = useState(false);
    const [exportandoAsigId, setExportandoAsigId] = useState(null);

    useEffect(() => {
        async function cargar() {
            try {
                const [resUsuarios, resViaticos] = await Promise.all([
                    api.get('/admin/usuarios'),
                    api.get('/admin/viaticos'),
                ]);
                const encontrado = resUsuarios.data.find((u) => String(u.id) === id);
                if (!encontrado) {
                    setError('Empleado no encontrado.');
                } else {
                    setUsuario(encontrado);
                    setViaticos(resViaticos.data.filter((v) => String(v.usuario_id) === id));
                    setTodosUsuarios(resUsuarios.data);
                    setTodosViaticos(resViaticos.data);
                }
            } catch {
                setError('No se pudo cargar la información del empleado.');
            } finally {
                setLoading(false);
            }

            // Aparte y tolerante a fallos: si /admin/asignaciones falla (tabla
            // sin migrar, red, etc.) no debe tumbar la carga del resto del perfil.
            try {
                const resAsignaciones = await listarAsignaciones();
                setAsignaciones(resAsignaciones.data);
            } catch {
                setAsignaciones([]);
            }
        }
        cargar();
    }, [id]);

    const asignacionesActivas = useMemo(
        () => obtenerAsignacionesActivasDeTecnico(asignaciones, id),
        [asignaciones, id]
    );

    const statsControlSistema = useMemo(() => ({
        tecnicosActivos: todosUsuarios.filter((u) => u.rol === 'tecnico' && u.activo).length,
        adminsActivos: todosUsuarios.filter((u) => (u.rol === 'admin' || u.rol === 'superadmin') && u.activo).length,
        asignacionesActivas: asignaciones.filter((a) => a.estado === 'en_curso').length,
        viaticosPendientes: todosViaticos.filter((v) => v.estado === 'pendiente').length,
    }), [todosUsuarios, asignaciones, todosViaticos]);

    const asignacionesFullMap = useMemo(
        () => new Map(asignaciones.map((a) => [a.id, a])),
        [asignaciones]
    );

    const viaticosFiltrados = useMemo(() => {
        let base;
        if (filtroPeriodo === 'hoy') {
            const h = hoyISO();
            base = filtrarPorRango(viaticos, h, h);
        } else if (filtroPeriodo === 'mes') {
            const { inicio, fin } = rangoMesCalendario(hoy);
            base = filtrarPorRango(viaticos, inicio, fin);
        } else {
            // personalizado
            base = filtrarPorRango(viaticos, rangoInicio, rangoFin);
        }

        if (tipoAsignacion !== 'todas') {
            base = base.filter((v) => {
                if (!v.asignacion_id) return false;
                const asig = asignacionesFullMap.get(v.asignacion_id);
                return asig?.tipo === tipoAsignacion;
            });
        }

        if (filtroClienteAsignacion) {
            base = base.filter((v) => {
                if (!v.asignacion_id) return false;
                const asig = asignacionesFullMap.get(v.asignacion_id);
                return asig?.cliente?.toLowerCase().includes(filtroClienteAsignacion);
            });
        }

        return base;
    }, [filtroPeriodo, viaticos, rangoInicio, rangoFin, hoy, tipoAsignacion, filtroClienteAsignacion, asignacionesFullMap]);

    async function handleExportarIndependientes() {
        setExportandoIndependiente(true);
        try {
            let fInicio = null;
            let fFin = null;
            if (filtroPeriodo === 'hoy') {
                const h = hoyISO();
                fInicio = h;
                fFin = h;
            } else if (filtroPeriodo === 'mes') {
                const { inicio, fin } = rangoMesCalendario(hoy);
                fInicio = inicio;
                fFin = fin;
            } else if (filtroPeriodo === 'personalizado') {
                fInicio = rangoInicio;
                fFin = rangoFin;
            }

            const res = await exportarViaticosIndependientes(id, fInicio, fFin);
            descargarBlob(res.data, `viaticos_independientes_${id}.xlsx`);
        } catch {
            alert('No se pudo exportar los viáticos independientes.');
        } finally {
            setExportandoIndependiente(false);
        }
    }

    async function handleExportarAsignacion(asignacionId) {
        setExportandoAsigId(asignacionId);
        try {
            const res = await exportarViaticosAsignacion(asignacionId);
            descargarBlob(res.data, `asignacion_${asignacionId}_viaticos.xlsx`);
        } catch {
            alert('No se pudo exportar los viáticos de la asignación.');
        } finally {
            setExportandoAsigId(null);
        }
    }

    const resumenPeriodo = useMemo(() => resumen(viaticosFiltrados), [viaticosFiltrados]);

    const viaticosOrdenados = useMemo(
        () => [...viaticosFiltrados].sort((a, b) => b.fecha.localeCompare(a.fecha)),
        [viaticosFiltrados]
    );

    if (loading) {
        return (
            <div className="admin-root">
                <div className="admin-main">
                    <p style={{ color: 'var(--color-text-muted)' }}>Cargando perfil...</p>
                </div>
            </div>
        );
    }

    if (error || !usuario) {
        return (
            <div className="admin-root">
                <div className="admin-main">
                    <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                    <p style={{ color: 'var(--color-rechazado, #EF4444)' }}>{error || 'Empleado no encontrado.'}</p>
                </div>
            </div>
        );
    }

    const esAdmin = usuario.rol === 'admin' || usuario.rol === 'superadmin';
    const puedeGestionar = puedeGestionarUsuario(user?.rol, usuario.rol);
    // Cuando un SuperAdmin ve su propia tarjeta, esto no es un perfil de
    // técnico con viáticos que aprobar — es su panel de control. El resto
    // del perfil (asignaciones/viáticos/historial) no aplica aquí.
    const esPropiaTarjeta = user && String(user.id) === id;
    const esSuperAdminPropio = esPropiaTarjeta && usuario.rol === 'superadmin';
    return (
        <div className="admin-root">
            <div className="admin-main pf-main">

                {mensajeFeedback && (
                    <div style={{
                        backgroundColor: '#F0FDF4',
                        border: '1.5px solid #86EFAC',
                        color: '#166534',
                        padding: '0.9rem 1.25rem',
                        borderRadius: '12px',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        marginBottom: '1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(22, 101, 52, 0.1)',
                    }}>
                        <span>{mensajeFeedback}</span>
                        <button
                            onClick={() => setMensajeFeedback('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', color: '#166534' }}
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Sección 1: Cabecera del perfil */}
                <div className="pf-card pf-header-card">
                    <div className="pf-header-top">
                        <div className="pf-header-brand-wrap">
                            <button className="admin-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
                            <img src={logoGSB} alt="Global Security Bank" className="pf-brand-logo" />
                        </div>
                        <span className={`pf-estado-pill ${usuario.activo ? 'pf-estado-pill--activo' : 'pf-estado-pill--inactivo'}`}>
                            <span className="pf-estado-dot" />
                            {usuario.activo ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>

                    <div className="pf-header-body">
                        <div className="pf-avatar">{iniciales(usuario.nombre)}</div>
                        <div className="pf-header-datos">
                            <div className="pf-header-nombre-row">
                                <h1 className="pf-nombre">{usuario.nombre}</h1>
                                <span className={`pf-rol-badge ${esAdmin ? 'pf-rol-badge--admin' : 'pf-rol-badge--tecnico'}`}>
                                    {LABEL_CARGO[usuario.rol] || usuario.rol}
                                </span>
                            </div>
                            <div className="pf-header-meta">
                                <span>Cédula: {usuario.codigo_empleado || '—'}</span>
                                <span className="pf-header-meta-sep">•</span>
                                <span>{usuario.correo}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {esSuperAdminPropio ? (
                    <>
                        {/* Panel de Control del propio Super Admin: contadores reales
                           (calculados de datos ya cargados) + accesos reales a
                           administración. Nada de botones sin funcionalidad detrás. */}
                        <h2 className="pf-section-title">Control del sistema</h2>
                        <div className="pf-resumen-bar">
                            <div className="pf-resumen-item">
                                <span className="pf-resumen-valor">{statsControlSistema.tecnicosActivos}</span>
                                <span className="pf-resumen-label">Técnicos activos</span>
                            </div>
                            <div className="pf-resumen-item">
                                <span className="pf-resumen-valor">{statsControlSistema.adminsActivos}</span>
                                <span className="pf-resumen-label">Administradores activos</span>
                            </div>
                            <div className="pf-resumen-item">
                                <span className="pf-resumen-valor">{statsControlSistema.asignacionesActivas}</span>
                                <span className="pf-resumen-label">Asignaciones activas</span>
                            </div>
                            <div className="pf-resumen-item">
                                <span className="pf-resumen-valor pf-resumen-valor--pendiente">{statsControlSistema.viaticosPendientes}</span>
                                <span className="pf-resumen-label">Viáticos pendientes</span>
                            </div>
                        </div>

                        <h2 className="pf-section-title">Administración</h2>
                        <div className="pf-card pf-gestion-card">
                            <div className="pf-gestion-grupo">
                                <span className="pf-info-label">Usuarios</span>
                                <div className="pf-gestion-acciones">
                                    <button className="pf-viatico-detalle-btn" onClick={() => navigate('/admin/usuarios')}>
                                        👥 Gestión de usuarios y roles
                                    </button>
                                    <button className="pf-viatico-detalle-btn" onClick={() => setMostrarCrearUsuario(true)}>
                                        ➕ Crear usuario
                                    </button>
                                </div>
                            </div>
                            <div className="pf-gestion-grupo">
                                <span className="pf-info-label">Operación</span>
                                <div className="pf-gestion-acciones">
                                    <button className="pf-viatico-detalle-btn" onClick={() => navigate('/admin/asignaciones')}>
                                        📋 Asignaciones
                                    </button>
                                </div>
                            </div>
                            <div className="pf-gestion-grupo">
                                <span className="pf-info-label">Auditoría</span>
                                <div className="pf-gestion-acciones">
                                    <button className="pf-viatico-detalle-btn" onClick={() => navigate('/admin/auditoria')}>
                                        📊 Actividad administrativa
                                    </button>
                                </div>
                            </div>
                            {/* Estas 2 no tienen ningún backend detrás todavía (ni
                               endpoints ni diseño de producto definido) — se listan
                               como hoja de ruta, sin fingir que funcionan. */}
                            <div className="pf-gestion-grupo">
                                <span className="pf-info-label">Próximamente</span>
                                <p className="pf-gestion-proximamente">
                                    🛡️ Gestión de permisos · 📥 Importación / exportación
                                </p>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Sección Gestión: acciones reales que el viewer puede ejecutar
                   sobre este usuario. El backend sigue siendo la autoridad real
                   (verificar_autoridad_sobre_usuario / get_current_superadmin);
                   esto solo decide qué mostrar. */}
                        {puedeGestionar ? (
                            <div className="pf-card pf-gestion-card">
                                <span className="pf-mision-label">⚙️ Gestión</span>
                                <div className="pf-gestion-grupo">
                                    <span className="pf-info-label">Información</span>
                                    <div className="pf-gestion-acciones">
                                        <button
                                            className="pf-viatico-detalle-btn"
                                            onClick={() => setMostrarEditarUsuario(true)}
                                        >
                                            ✏️ Editar información
                                        </button>
                                    </div>
                                </div>
                                <div className="pf-gestion-grupo">
                                    <span className="pf-info-label">Operación</span>
                                    <div className="pf-gestion-acciones">
                                        <button
                                            className="pf-viatico-detalle-btn"
                                            onClick={() => navigate('/admin/asignaciones')}
                                        >
                                            Ver asignaciones
                                        </button>
                                    </div>
                                </div>

                                {user?.rol === 'superadmin' && (
                                    <div className="pf-gestion-grupo">
                                        <span className="pf-info-label">Rol del usuario</span>
                                        <div className="pf-gestion-acciones">
                                            {usuario.rol === 'superadmin' ? (
                                                <select className="pf-rol-select" value="superadmin" disabled>
                                                    <option value="superadmin">SuperAdmin</option>
                                                </select>
                                            ) : (
                                                <select
                                                    className="pf-rol-select"
                                                    value={usuario.rol}
                                                    disabled={cambiandoRol}
                                                    onChange={(e) => cambiarRol(e.target.value)}
                                                >
                                                    <option value="tecnico">Técnico</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="superadmin">SuperAdmin</option>
                                                </select>
                                            )}
                                        </div>
                                        {errorRol && <p className="pf-gestion-error">{errorRol}</p>}
                                    </div>
                                )}

                                {/* No se muestra en la propia tarjeta: el backend bloquea
                                   la autodesactivación (nadie puede desactivarse a sí
                                   mismo) y no tiene sentido ofrecer un botón que siempre
                                   va a fallar. */}
                                {!esPropiaTarjeta && (
                                    <div className="pf-gestion-grupo">
                                        <span className="pf-info-label">Acciones administrativas</span>
                                        <div className="pf-gestion-acciones">
                                            <button
                                                className="pf-viatico-detalle-btn"
                                                disabled={cambiandoEstado}
                                                onClick={() => cambiarEstado(!usuario.activo)}
                                            >
                                                {usuario.activo ? '🚫 Desactivar usuario' : '✅ Activar usuario'}
                                            </button>
                                        </div>
                                        {errorEstado && <p className="pf-gestion-error">{errorEstado}</p>}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="pf-card pf-gestion-card pf-gestion-card--lectura">
                                <span className="pf-estado-pill pf-estado-pill--inactivo">
                                    <span className="pf-estado-dot" />
                                    Solo lectura
                                </span>
                                <p className="pf-info-label" style={{ marginTop: '0.5rem' }}>
                                    No tienes autoridad administrativa sobre este usuario.
                                </p>
                            </div>
                        )}

                        {/* Sección 2: Misión / asignaciones actuales — SOLO para
                           técnicos. Un admin/superadmin no tiene "asignación" ni
                           "viáticos" propios que mostrar en su tarjeta (aplica
                           tanto si es su propia tarjeta como si lo ve otro
                           admin/superadmin con autoridad sobre él). */}
                        {!esAdmin && (
                            <>
                                <h2 className="pf-section-title">Asignación actual</h2>
                                {asignacionesActivas.length > 0 ? (
                                    <div className="pf-mision-lista">
                                        {asignacionesActivas.map((asignacion) => (
                                            <div className="pf-mision-card" key={asignacion.id}>
                                                <div className="pf-mision-top">
                                                    <span className="pf-mision-label">📍 Asignación actual</span>
                                                </div>

                                                <div className="pf-mision-grid">
                                                    <div>
                                                        <span className="pf-info-label">Cliente</span>
                                                        <span className="pf-info-valor">{asignacion.cliente}</span>
                                                    </div>
                                                    <div>
                                                        <span className="pf-info-label">Ciudad</span>
                                                        <span className="pf-info-valor">{asignacion.ciudad}</span>
                                                    </div>
                                                    <div>
                                                        <span className="pf-info-label">Tipo</span>
                                                        <span className="pf-info-valor">
                                                            {LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="pf-info-label">Inicio</span>
                                                        <span className="pf-info-valor">{formatFechaLarga(asignacion.fecha_inicio)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="pf-info-label">Final</span>
                                                        <span className="pf-info-valor">{formatFechaLarga(asignacion.fecha_fin)}</span>
                                                    </div>
                                                </div>

                                                {/* Resumen financiero contextual dentro de la asignación */}
                                                <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.82rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                                        <div>
                                                            <span style={{ color: '#64748B', display: 'block' }}>Anticipo</span>
                                                            <strong style={{ color: '#1E293B' }}>{formatCOP(Number(asignacion.monto_anticipo || 0))}</strong>
                                                        </div>
                                                        <div>
                                                            <span style={{ color: '#64748B', display: 'block' }}>Gastado</span>
                                                            <strong style={{ color: '#0284C7' }}>{formatCOP(Number(asignacion.total_gastado || 0))}</strong>
                                                        </div>
                                                        <div>
                                                            <span style={{ color: '#64748B', display: 'block' }}>Saldo restante</span>
                                                            <strong style={{ color: '#16A34A' }}>{formatCOP(Number(asignacion.saldo_restante || 0))}</strong>
                                                        </div>
                                                        <div>
                                                            <span style={{ color: '#64748B', display: 'block' }}>Ítems</span>
                                                            <strong>{asignacion.cantidad_viaticos || 0}</strong>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="admin-back-btn"
                                                        style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                                        onClick={() => handleExportarAsignacion(asignacion.id)}
                                                        disabled={exportandoAsigId === asignacion.id}
                                                    >
                                                        {exportandoAsigId === asignacion.id ? '⌛ Exportando...' : '📊 Exportar Excel de esta asignación'}
                                                    </button>
                                                </div>

                                                {/* Cuenta de Cobro */}
                                                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                    <span style={{ color: '#64748B', fontWeight: 500 }}>Cuenta de cobro digital:</span>
                                                    {asignacion.cuenta_cobro?.secure_url ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setCuentaCobroVer({
                                                                archivoUrl: asignacion.cuenta_cobro.secure_url,
                                                                cuenta: {
                                                                    consecutivo: `ASIG-${asignacion.id}`,
                                                                    fecha: asignacion.fecha_inicio,
                                                                    ciudad: asignacion.ciudad,
                                                                    titular_nombre: usuario?.nombre || `Técnico #${usuario?.id}`,
                                                                    identificacion: usuario?.codigo_empleado || '—',
                                                                    concepto_servicio: `Servicios de viáticos y comisión - ${asignacion.cliente} (${asignacion.tipo})`,
                                                                    total: asignacion.total_gastado || asignacion.monto_anticipo || 0,
                                                                    items: [
                                                                        {
                                                                            oficina: asignacion.ciudad || 'SEDE',
                                                                            fecha_inicio: asignacion.fecha_inicio,
                                                                            fecha_fin: asignacion.fecha_fin,
                                                                            num_tecnicos: 1,
                                                                            valor_diario: asignacion.total_gastado || asignacion.monto_anticipo || 0,
                                                                            valor_total: asignacion.total_gastado || asignacion.monto_anticipo || 0,
                                                                        }
                                                                    ]
                                                                }
                                                            })}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.3rem',
                                                                background: '#EFF6FF',
                                                                color: '#0284C7',
                                                                fontWeight: 700,
                                                                padding: '0.25rem 0.65rem',
                                                                borderRadius: '7px',
                                                                border: '1px solid #BAE6FD',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            📄 Ver documento
                                                        </button>
                                                    ) : (
                                                        <span style={{ background: '#FEF9EC', color: '#92400E', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: '7px', border: '1px solid #FDE68A' }}>
                                                            ⏳ No adjuntada aún
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="pf-mision-vacia">No tienes asignaciones activas.</div>
                                )}

                                {/* Sección 3: Filtros */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
                                    <h2 className="pf-section-title" style={{ margin: 0 }}>Viáticos</h2>
                                    <button
                                        type="button"
                                        className="asig-btn-nueva"
                                        style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem' }}
                                        onClick={handleExportarIndependientes}
                                        disabled={exportandoIndependiente}
                                    >
                                        {exportandoIndependiente ? '⌛ Exportando...' : '📊 Exportar Excel'}
                                    </button>
                                </div>

                                <div className="pf-filtros-wrap">
                                    <div className="pf-filtro-grupo">
                                        <span className="pf-filtro-grupo-label">Periodo</span>
                                        <div className="pf-tabs">
                                            {FILTROS_PERIODO.map((f) => (
                                                <button
                                                    key={f.id}
                                                    className={`pf-tab ${filtroPeriodo === f.id ? 'pf-tab--activo' : ''}`}
                                                    onClick={() => setFiltroPeriodo(f.id)}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>

                                        {filtroPeriodo === 'personalizado' && (
                                            <div className="pf-rango-personalizado">
                                                <label>
                                                    Desde
                                                    <input type="date" value={rangoInicio} onChange={(e) => setRangoInicio(e.target.value)} />
                                                </label>
                                                <label>
                                                    Hasta
                                                    <input type="date" value={rangoFin} onChange={(e) => setRangoFin(e.target.value)} />
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pf-filtro-grupo">
                                        <span className="pf-filtro-grupo-label">
                                            Tipo de asignación
                                        </span>
                                        <div className="pf-tabs">
                                            {FILTROS_TIPO_ASIGNACION.map((f) => (
                                                <button
                                                    key={f.id}
                                                    className={`pf-tab ${tipoAsignacion === f.id ? 'pf-tab--activo' : ''}`}
                                                    onClick={() => setTipoAsignacion(f.id)}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pf-filtro-grupo">
                                        <span className="pf-filtro-grupo-label">
                                            Buscar asignación
                                        </span>
                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                className="admin-input"
                                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', maxWidth: '190px' }}
                                                placeholder="Nombre de cliente..."
                                                value={busquedaAsignacion}
                                                onChange={(e) => setBusquedaAsignacion(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        setFiltroClienteAsignacion(busquedaAsignacion.trim().toLowerCase());
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="admin-back-btn"
                                                style={{ margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                                onClick={() => setFiltroClienteAsignacion(busquedaAsignacion.trim().toLowerCase())}
                                            >
                                                Buscar
                                            </button>
                                            {filtroClienteAsignacion && (
                                                <button
                                                    type="button"
                                                    style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.8rem' }}
                                                    onClick={() => {
                                                        setBusquedaAsignacion('');
                                                        setFiltroClienteAsignacion('');
                                                    }}
                                                >
                                                    ✕ Limpiar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Sección 4: Resumen compacto */}
                                <div className="pf-resumen-bar">
                                    <div className="pf-resumen-item pf-resumen-item--total">
                                        <span className="pf-resumen-valor">{formatCOP(resumenPeriodo.total)}</span>
                                        <span className="pf-resumen-label">Total gastado</span>
                                    </div>
                                    <div className="pf-resumen-divisor" />
                                    <div className="pf-resumen-item">
                                        <span className="pf-resumen-valor">{resumenPeriodo.cantidad}</span>
                                        <span className="pf-resumen-label">Solicitudes</span>
                                    </div>
                                    <div className="pf-resumen-item">
                                        <span className="pf-resumen-valor pf-resumen-valor--pendiente">{resumenPeriodo.pendientes}</span>
                                        <span className="pf-resumen-label">Pendientes</span>
                                    </div>
                                    <div className="pf-resumen-item">
                                        <span className="pf-resumen-valor pf-resumen-valor--aprobado">{resumenPeriodo.aprobados}</span>
                                        <span className="pf-resumen-label">Aprobadas</span>
                                    </div>
                                    <div className="pf-resumen-item">
                                        <span className="pf-resumen-valor pf-resumen-valor--rechazado">{resumenPeriodo.rechazados}</span>
                                        <span className="pf-resumen-label">Rechazadas</span>
                                    </div>
                                </div>

                                {/* Sección 5: Historial como tarjetas */}
                                <h2 className="pf-section-title">Historial</h2>

                                {viaticosOrdenados.length === 0 ? (
                                    <div className="pf-mision-vacia">Sin viáticos registrados en este periodo.</div>
                                ) : (
                                    <div className="pf-historial-grid">
                                        {viaticosOrdenados.map((v) => {
                                            const miniatura = v.evidencias?.[0]?.secure_url;
                                            return (
                                                <div key={v.id} className="pf-viatico-card">
                                                    <div className="pf-viatico-top">
                                                        <span className="pf-viatico-tipo">
                                                            <span className="pf-viatico-icono">{ICONO_TIPO_GASTO[v.tipo_gasto] || '📦'}</span>
                                                            {LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}
                                                        </span>
                                                        <span className={`pf-estado-badge pf-estado-badge--${v.estado}`}>
                                                            {LABEL_ESTADO_VIATICO[v.estado] || v.estado}
                                                        </span>
                                                    </div>

                                                    <div style={{ margin: '0.35rem 0' }}>
                                                        {v.asignacion_id ? (
                                                            <span style={{ fontSize: '0.75rem', background: '#EFF6FF', color: '#1D4ED8', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                                                📍 Asignación #{v.asignacion_id}
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.75rem', background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 500 }}>
                                                                📄 Viático Independiente
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="pf-viatico-lugar">{v.cliente} · {v.ciudad}</p>
                                                    <p className="pf-viatico-fecha">{formatFechaLarga(v.fecha)}</p>

                                                    {/* El backend no guarda un "motivo de rechazo" separado hoy;
                                       si algún día se agrega, aparece automáticamente aquí. */}
                                                    {v.estado === 'rechazado' && v.motivo_rechazo && (
                                                        <p className="pf-viatico-motivo">Motivo: {v.motivo_rechazo}</p>
                                                    )}

                                                    <div className="pf-viatico-footer">
                                                        <span className="pf-viatico-valor">{formatCOP(v.valor)}</span>
                                                        {miniatura ? (
                                                            <img
                                                                src={miniatura}
                                                                alt="Evidencia"
                                                                className="pf-viatico-thumb"
                                                                onClick={() => setSeleccionado(v)}
                                                            />
                                                        ) : (
                                                            <span className="pf-viatico-sin-evidencia">Sin evidencia</span>
                                                        )}
                                                    </div>

                                                    <button className="pf-viatico-detalle-btn" onClick={() => setSeleccionado(v)}>
                                                        Ver detalle
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {mostrarCrearUsuario && (
                <ModalCrearUsuario
                    onClose={() => setMostrarCrearUsuario(false)}
                    onCreado={() => {
                        setMostrarCrearUsuario(false);
                        api.get('/admin/usuarios').then((res) => setTodosUsuarios(res.data));
                    }}
                />
            )}

            {mostrarEditarUsuario && (
                <ModalEditarUsuario
                    usuario={usuario}
                    onClose={() => setMostrarEditarUsuario(false)}
                    onGuardado={(data) => {
                        setUsuario(data);
                        setMostrarEditarUsuario(false);
                        api.get('/admin/usuarios').then((res) => setTodosUsuarios(res.data));
                    }}
                />
            )}

            {seleccionado && (
                <ModalEvidencia
                    viatico={seleccionado}
                    onClose={() => setSeleccionado(null)}
                    onAprobar={puedeGestionar ? aprobar : undefined}
                    onRechazar={puedeGestionar ? rechazar : undefined}
                    onPresupuestoActualizado={(v) => {
                        setViaticos((prev) => prev.map((x) => (x.id === v.id ? v : x)));
                        setSeleccionado(v);
                    }}
                />
            )}

            {/* Modal Cuenta de Cobro Formal */}
            {cuentaCobroVer && (
                <ModalCuentaCobro
                    archivoUrl={cuentaCobroVer.archivoUrl}
                    cuenta={cuentaCobroVer.cuenta}
                    onClose={() => setCuentaCobroVer(null)}
                />
            )}
        </div>
    );
}
