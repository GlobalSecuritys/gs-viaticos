import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, {
    exportarViaticosIndependientes,
    exportarViaticosAsignacion,
    descargarBlob,
    eliminarUsuario,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { puedeGestionarUsuario } from '../utils/permisos';
import { listarAsignaciones, finalizarAsignacion, eliminarAsignacion } from '../services/asignaciones';
import {
    LABEL_TIPO_ASIGNACION,
    obtenerAsignacionesActivasDeTecnico,
    obtenerAsignacionesFinalizadasDeTecnico,
} from '../utils/asignaciones';
import ModalEvidencia from '../components/ModalEvidencia';
import ModalCrearUsuario from '../components/ModalCrearUsuario';
import ModalEditarUsuario from '../components/ModalEditarUsuario';
import ModalCuentaCobro from '../components/ModalCuentaCobro';
import ModalAsignacionesTecnico from '../components/ModalAsignacionesTecnico';
import ModalCuentasCobroTecnico from '../components/ModalCuentasCobroTecnico';
import { formatApiError } from '../utils/formatError';
import {
    ICONO_TIPO_GASTO,
    LABEL_CARGO,
    LABEL_TIPO_GASTO,
    formatCOP,
    formatFechaLarga,
    iniciales,
} from '../utils/personal';
import logoGSB from '../assets/logo-gsb.png';
import './PerfilEmpleado.css';

const LABEL_ESTADO_VIATICO = {
    aprobado: 'Aprobado',
    pendiente: 'Pendiente',
    rechazado: 'Rechazado',
};

export default function PerfilEmpleado() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [usuario, setUsuario] = useState(null);
    const [viaticos, setViaticos] = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [todosUsuarios, setTodosUsuarios] = useState([]);
    const [todosViaticos, setTodosViaticos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mensajeFeedback, setMensajeFeedback] = useState('');
    const [cuentaCobroVer, setCuentaCobroVer] = useState(null);
    const [seleccionado, setSeleccionado] = useState(null);
    const [errorRol, setErrorRol] = useState('');
    const [cambiandoRol, setCambiandoRol] = useState(false);
    const [mostrarCrearUsuario, setMostrarCrearUsuario] = useState(false);
    const [errorEstado, setErrorEstado] = useState('');
    const [cambiandoEstado, setCambiandoEstado] = useState(false);
    const [mostrarEditarUsuario, setMostrarEditarUsuario] = useState(false);
    const [tecnicoParaAsignaciones, setTecnicoParaAsignaciones] = useState(null);
    const [tecnicoParaCuentasCobro, setTecnicoParaCuentasCobro] = useState(null);

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

    async function cambiarRol(nuevoRol) {
        setCambiandoRol(true);
        setErrorRol('');
        try {
            const { data } = await api.put(`/admin/usuarios/${usuario.id}/rol`, {
                rol: nuevoRol,
            });
            setUsuario(data);
            setMensajeFeedback(`✅ Rol actualizado a "${LABEL_CARGO[nuevoRol] || nuevoRol}"`);
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
            setMensajeFeedback(`✅ Usuario ${nuevoActivo ? 'activado' : 'desactivado'} correctamente.`);
        } catch (err) {
            setErrorEstado(formatApiError(err, 'No se pudo cambiar el estado.'));
        } finally {
            setCambiandoEstado(false);
        }
    }

    const [eliminandoUsuario, setEliminandoUsuario] = useState(false);

    async function handleEliminarUsuarioDefinitivo() {
        if (!usuario) return;
        if (user && String(user.id) === String(usuario.id)) {
            alert('No puedes eliminar tu propia cuenta de usuario.');
            return;
        }

        const confirmacion = window.confirm(
            `⚠️ ATENCIÓN: ¿Estás COMPLETAMENTE seguro de eliminar al usuario '${usuario.nombre}'?\n\n` +
            `Esta acción es DEFINITIVA e IRREVERSIBLE. Se borrarán permanentemente del sistema:\n` +
            `• Todos sus viáticos y fotos/comprobantes de evidencia\n` +
            `• Todas sus asignaciones y cuentas de cobro\n` +
            `• Su ficha de Talento Humano y documentos adjuntos\n` +
            `• Su cuenta de acceso al sistema\n\n` +
            `¿Deseas continuar con la eliminación permanente?`
        );

        if (!confirmacion) return;

        setEliminandoUsuario(true);
        try {
            await eliminarUsuario(usuario.id);
            alert(`✅ Usuario '${usuario.nombre}' y todos sus datos han sido eliminados permanentemente.`);
            navigate('/admin');
        } catch (err) {
            alert(formatApiError(err, 'No se pudo eliminar el usuario.'));
            setEliminandoUsuario(false);
        }
    }

    const [exportandoIndependiente, setExportandoIndependiente] = useState(false);
    const [exportandoAsigId, setExportandoAsigId] = useState(null);
    const [mostrarViaticosIndependientes, setMostrarViaticosIndependientes] = useState(false);

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

            try {
                const resAsignaciones = await listarAsignaciones();
                setAsignaciones(resAsignaciones.data || []);
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

    const asignacionesFinalizadas = useMemo(
        () => obtenerAsignacionesFinalizadasDeTecnico(asignaciones, id),
        [asignaciones, id]
    );

    const [historialAsigExpandidas, setHistorialAsigExpandidas] = useState({});
    const toggleExpandirHistorialAsig = (asigId) => {
        setHistorialAsigExpandidas((prev) => ({ ...prev, [asigId]: !prev[asigId] }));
    };

    const totalGastadoViaticos = useMemo(() => {
        return viaticos.reduce((sum, v) => sum + Number(v.valor || 0), 0);
    }, [viaticos]);

    const cuentasCobroGeneradas = useMemo(() => {
        return asignaciones.filter((a) => {
            const pertenece = (a.tecnicos || []).some((t) => String(t.id || t.usuario_id) === id) || String(a.tecnico_id) === id;
            return pertenece && a.cuenta_cobro?.secure_url;
        }).length;
    }, [asignaciones, id]);

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

    async function handleExportarIndependientes() {
        setExportandoIndependiente(true);
        try {
            const res = await exportarViaticosIndependientes(id);
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

    const viaticosIndependientes = useMemo(() => {
        return viaticos.filter((v) => !v.asignacion_id);
    }, [viaticos]);

    async function handleBorrarAsignacion(asignacionId) {
        if (!window.confirm('¿Deseas borrar esta asignación? Se ocultará del sistema y se eliminará permanentemente de la base de datos en 24 horas.')) return;
        try {
            await eliminarAsignacion(asignacionId);
            setAsignaciones((prev) => prev.filter((a) => a.id !== asignacionId));
            setMensajeFeedback('✅ Asignación borrada correctamente.');
        } catch {
            alert('No se pudo borrar la asignación.');
        }
    }

    async function handleFinalizarAsignacion(asignacionId) {
        if (!window.confirm('¿Deseas finalizar esta asignación? Pasará al historial de asignaciones finalizadas.')) return;
        try {
            await finalizarAsignacion(asignacionId);
            setAsignaciones((prev) =>
                prev.map((a) => (a.id === asignacionId ? { ...a, estado: 'finalizada' } : a))
            );
            setMensajeFeedback('✅ Asignación finalizada correctamente.');
        } catch {
            alert('No se pudo finalizar la asignación.');
        }
    }

    const [asigColapsadas, setAsigColapsadas] = useState({});
    const toggleColapsarAsig = (key) => {
        setAsigColapsadas((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    if (loading) {
        return (
            <div className="admin-root">
                <div className="admin-main pf-main">
                    <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>
                        Cargando perfil corporativo...
                    </p>
                </div>
            </div>
        );
    }

    if (error || !usuario) {
        return (
            <div className="admin-root">
                <div className="admin-main pf-main">
                    <button className="pf-back-pill-btn" onClick={() => navigate('/admin')}>
                        ← Volver
                    </button>
                    <p style={{ color: '#DC2626', marginTop: '1rem', fontWeight: 600 }}>
                        {error || 'Empleado no encontrado.'}
                    </p>
                </div>
            </div>
        );
    }

    const esAdmin = usuario.rol === 'admin' || usuario.rol === 'superadmin';
    const puedeGestionar = puedeGestionarUsuario(user?.rol, usuario.rol);
    const esPropiaTarjeta = user && String(user.id) === id;
    const esSuperAdminPropio = esPropiaTarjeta && usuario.rol === 'superadmin';

    return (
        <div className="admin-root">
            <div className="admin-main pf-main">

                {/* ── TOP NAVIGATION & BRAND BAR ── */}
                <div className="pf-top-nav-bar">
                    <button className="pf-back-pill-btn" onClick={() => navigate('/admin')}>
                        ← Volver
                    </button>

                    <div className="pf-brand-center">
                        <img src={logoGSB} alt="Global Security Bank" className="pf-brand-logo" />
                    </div>

                    <div className="pf-status-right">
                        <span className={`pf-status-badge ${usuario.activo ? 'pf-status-badge--activo' : 'pf-status-badge--inactivo'}`}>
                            <span className="pf-status-dot" />
                            {usuario.activo ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                    </div>
                </div>

                {mensajeFeedback && (
                    <div className="pf-feedback-banner">
                        <span>{mensajeFeedback}</span>
                        <button
                            onClick={() => setMensajeFeedback('')}
                            className="pf-feedback-close"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* ── HERO PROFILE CARD (MATCHING REFERENCE IMAGE) ── */}
                <div className="pf-hero-card">
                    <div className="pf-hero-left">
                        <div className="pf-hero-avatar-wrap">
                            <div className="pf-hero-avatar">
                                {iniciales(usuario.nombre)}
                            </div>
                        </div>

                        <div className="pf-hero-info">
                            <div className="pf-hero-name-row">
                                <h1 className="pf-hero-name">{usuario.nombre}</h1>
                                <span className={`pf-hero-role-pill ${esAdmin ? 'pf-hero-role-pill--admin' : 'pf-hero-role-pill--tecnico'}`}>
                                    {LABEL_CARGO[usuario.rol] || usuario.rol}
                                </span>
                            </div>
                            <div className="pf-hero-meta-row">
                                <span className="pf-meta-item">🪪 Cédula: {usuario.codigo_empleado || '—'}</span>
                                <span className="pf-meta-dot">•</span>
                                <span className="pf-meta-item">✉ {usuario.correo}</span>
                            </div>
                        </div>
                    </div>

                    {/* 3 Metric Columns with Vertical Dividers */}
                    <div className="pf-hero-metrics">
                        <div className="pf-hero-metric-item">
                            <div className="pf-metric-icon pf-metric-icon--blue">
                                <span>📅</span>
                            </div>
                            <div className="pf-metric-content">
                                <span className="pf-metric-val">{asignacionesActivas.length}</span>
                                <span className="pf-metric-lbl">ASIGNACIONES ACTIVAS</span>
                            </div>
                        </div>

                        <div className="pf-hero-metric-sep" />

                        <div className="pf-hero-metric-item">
                            <div className="pf-metric-icon pf-metric-icon--green">
                                <span>💵</span>
                            </div>
                            <div className="pf-metric-content">
                                <span className="pf-metric-val pf-metric-val--green">
                                    {formatCOP(totalGastadoViaticos)}
                                </span>
                                <span className="pf-metric-lbl">TOTAL GASTADO EN VIÁTICOS</span>
                            </div>
                        </div>

                        <div className="pf-hero-metric-sep" />

                        <div className="pf-hero-metric-item">
                            <div className="pf-metric-icon pf-metric-icon--amber">
                                <span>📄</span>
                            </div>
                            <div className="pf-metric-content">
                                <span className="pf-metric-val pf-metric-val--amber">
                                    {cuentasCobroGeneradas}
                                </span>
                                <span className="pf-metric-lbl">CUENTAS DE COBRO GENERADAS</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── SECCIÓN GESTIÓN (CUADRÍCULA DE ACCIONES 2 COLUMNAS) ── */}
                {esSuperAdminPropio ? (
                    <>
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

                        <div className="pf-gestion-section">
                            <div className="pf-gestion-header">
                                <div className="pf-gestion-title-wrap">
                                    <span className="pf-gestion-icon">⚙️</span>
                                    <h2 className="pf-gestion-title">GESTIÓN</h2>
                                </div>
                                <div className="pf-gestion-line-wrap">
                                    <div className="pf-gestion-line" />
                                    <div className="pf-gestion-line-accent" />
                                </div>
                            </div>

                            <span className="pf-subgroup-label">ADMINISTRACIÓN DEL SISTEMA</span>
                            <div className="pf-action-grid">
                                <div className="pf-action-card" onClick={() => navigate('/admin/usuarios')}>
                                    <div className="pf-action-icon-box pf-action-icon--blue"><span>👥</span></div>
                                    <div className="pf-action-info">
                                        <strong className="pf-action-title">Gestión de usuarios y roles</strong>
                                        <span className="pf-action-desc">Administrar personal y permisos</span>
                                    </div>
                                    <span className="pf-action-arrow">›</span>
                                </div>
                                <div className="pf-action-card" onClick={() => setMostrarCrearUsuario(true)}>
                                    <div className="pf-action-icon-box pf-action-icon--green"><span>➕</span></div>
                                    <div className="pf-action-info">
                                        <strong className="pf-action-title">Crear usuario</strong>
                                        <span className="pf-action-desc">Registrar nuevo técnico o administrador</span>
                                    </div>
                                    <span className="pf-action-arrow">›</span>
                                </div>
                                <div className="pf-action-card" onClick={() => navigate('/admin/asignaciones')}>
                                    <div className="pf-action-icon-box pf-action-icon--purple"><span>📋</span></div>
                                    <div className="pf-action-info">
                                        <strong className="pf-action-title">Asignaciones globales</strong>
                                        <span className="pf-action-desc">Supervisión operativa de proyectos</span>
                                    </div>
                                    <span className="pf-action-arrow">›</span>
                                </div>
                                <div className="pf-action-card" onClick={() => navigate('/admin/auditoria')}>
                                    <div className="pf-action-icon-box pf-action-icon--amber"><span>📊</span></div>
                                    <div className="pf-action-info">
                                        <strong className="pf-action-title">Auditoría y trazabilidad</strong>
                                        <span className="pf-action-desc">Historial y registros del sistema</span>
                                    </div>
                                    <span className="pf-action-arrow">›</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {puedeGestionar ? (
                            <div className="pf-gestion-section">
                                <div className="pf-gestion-header">
                                    <div className="pf-gestion-title-wrap">
                                        <span className="pf-gestion-icon">⚙️</span>
                                        <h2 className="pf-gestion-title">GESTIÓN</h2>
                                    </div>
                                    <div className="pf-gestion-line-wrap">
                                        <div className="pf-gestion-line" />
                                        <div className="pf-gestion-line-accent" />
                                    </div>
                                </div>

                                <span className="pf-subgroup-label">INFORMACIÓN Y OPERACIÓN</span>
                                <div className="pf-action-grid">
                                    {/* Card 1: Editar información */}
                                    <div
                                        className="pf-action-card"
                                        onClick={() => setMostrarEditarUsuario(true)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="pf-action-icon-box pf-action-icon--blue">
                                            <span>✏️</span>
                                        </div>
                                        <div className="pf-action-info">
                                            <strong className="pf-action-title">Editar información</strong>
                                            <span className="pf-action-desc">Actualiza tus datos personales</span>
                                        </div>
                                        <span className="pf-action-arrow">›</span>
                                    </div>

                                    {/* Card 2: Asignaciones */}
                                    <div
                                        className="pf-action-card"
                                        onClick={() => setTecnicoParaAsignaciones(usuario)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="pf-action-icon-box pf-action-icon--blue">
                                            <span>📋</span>
                                        </div>
                                        <div className="pf-action-info">
                                            <strong className="pf-action-title">Asignaciones</strong>
                                            <span className="pf-action-desc">Ver y gestionar tus asignaciones</span>
                                        </div>
                                        <span className="pf-action-arrow">›</span>
                                    </div>

                                    {/* Card 3: Cuenta de Cobro */}
                                    <div
                                        className="pf-action-card"
                                        onClick={() => setTecnicoParaCuentasCobro(usuario)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="pf-action-icon-box pf-action-icon--green">
                                            <span>💵</span>
                                        </div>
                                        <div className="pf-action-info">
                                            <strong className="pf-action-title">Cuenta de Cobro</strong>
                                            <span className="pf-action-desc">Gestiona tu cuenta de cobro</span>
                                        </div>
                                        <span className="pf-action-arrow">›</span>
                                    </div>

                                    {/* Card 4: Rol del usuario */}
                                    <div className="pf-action-card pf-action-card--select">
                                        <div className="pf-action-icon-box pf-action-icon--purple">
                                            <span>👤</span>
                                        </div>
                                        <div className="pf-action-info">
                                            <strong className="pf-action-title">Rol del usuario</strong>
                                        </div>
                                        <div className="pf-action-select-wrap">
                                            {(user?.rol === 'admin' || user?.rol === 'superadmin') ? (
                                                <select
                                                    className="pf-styled-select"
                                                    value={usuario.rol}
                                                    disabled={cambiandoRol || esPropiaTarjeta}
                                                    onChange={(e) => cambiarRol(e.target.value)}
                                                    title={esPropiaTarjeta ? 'No puedes modificar tu propio rol' : `Cambiar rol de ${usuario.nombre}`}
                                                >
                                                    <option value="tecnico">Técnico</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="superadmin">Super Admin</option>
                                                </select>
                                            ) : (
                                                <span className="pf-role-readonly-pill">
                                                    {LABEL_CARGO[usuario.rol] || usuario.rol}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {errorRol && <p className="pf-gestion-error">{errorRol}</p>}

                                {/* ACCIONES ADMINISTRATIVAS */}
                                {!esPropiaTarjeta && (
                                    <>
                                        <span className="pf-subgroup-label" style={{ marginTop: '1.75rem' }}>
                                            ACCIONES ADMINISTRATIVAS
                                        </span>
                                        <div className="pf-admin-action-wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                            <div
                                                className={`pf-action-card pf-action-card--danger ${cambiandoEstado ? 'pf-action-card--disabled' : ''}`}
                                                onClick={() => !cambiandoEstado && cambiarEstado(!usuario.activo)}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                <div className="pf-action-icon-box pf-action-icon--red">
                                                    <span>🚫</span>
                                                </div>
                                                <div className="pf-action-info">
                                                    <strong className="pf-action-title">
                                                        {usuario.activo ? 'Desactivar usuario' : 'Activar usuario'}
                                                    </strong>
                                                    <span className="pf-action-desc">
                                                        {usuario.activo
                                                            ? 'El usuario perderá acceso al sistema'
                                                            : 'El usuario recuperará acceso al sistema'}
                                                    </span>
                                                </div>
                                                <span className="pf-action-arrow">›</span>
                                            </div>

                                            <div
                                                className={`pf-action-card pf-action-card--danger ${eliminandoUsuario ? 'pf-action-card--disabled' : ''}`}
                                                onClick={() => !eliminandoUsuario && handleEliminarUsuarioDefinitivo()}
                                                role="button"
                                                tabIndex={0}
                                                style={{ borderColor: '#FECACA', background: '#FEF2F2' }}
                                            >
                                                <div className="pf-action-icon-box" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                                                    <span>🗑️</span>
                                                </div>
                                                <div className="pf-action-info">
                                                    <strong className="pf-action-title" style={{ color: '#991B1B' }}>
                                                        {eliminandoUsuario ? 'Eliminando...' : 'Eliminar usuario'}
                                                    </strong>
                                                    <span className="pf-action-desc" style={{ color: '#B91C1C' }}>
                                                        Borra definitivamente al usuario y todos sus datos
                                                    </span>
                                                </div>
                                                <span className="pf-action-arrow" style={{ color: '#DC2626' }}>›</span>
                                            </div>
                                        </div>
                                        {errorEstado && <p className="pf-gestion-error">{errorEstado}</p>}
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="pf-gestion-card pf-gestion-card--lectura">
                                <span className="pf-status-badge pf-status-badge--inactivo">
                                    <span className="pf-status-dot" />
                                    Solo lectura
                                </span>
                                <p style={{ color: '#64748B', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    No tienes autoridad administrativa sobre este usuario.
                                </p>
                            </div>
                        )}

                        {/* ── ASIGNACIÓN ACTUAL & HISTORIAL DE VIÁTICOS ── */}
                        {!esAdmin && (
                            <>
                                <h2 className="pf-section-title">Asignación actual</h2>
                                {asignacionesActivas.length > 0 ? (
                                    <div className="pf-mision-lista">
                                        {asignacionesActivas.map((asignacion) => {
                                            const viaticosDeAsig = viaticos.filter((v) => v.asignacion_id === asignacion.id);
                                            const estaColapsada = asigColapsadas[`asig_activa_${asignacion.id}`];

                                            return (
                                                <div className="pf-mision-card" key={asignacion.id}>
                                                    <div className="pf-mision-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span className="pf-mision-label">📍 Asignación activa</span>
                                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                style={{
                                                                    background: '#ECFDF5',
                                                                    border: '1px solid #A7F3D0',
                                                                    color: '#059669',
                                                                    padding: '0.25rem 0.65rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                }}
                                                                onClick={() => handleFinalizarAsignacion(asignacion.id)}
                                                                title="Finalizar asignación y pasarla al historial"
                                                            >
                                                                ✅ Finalizar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                style={{
                                                                    background: '#FEF2F2',
                                                                    border: '1px solid #FECACA',
                                                                    color: '#DC2626',
                                                                    padding: '0.25rem 0.65rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                }}
                                                                onClick={() => handleBorrarAsignacion(asignacion.id)}
                                                                title="Borrar asignación"
                                                            >
                                                                🗑️ Borrar
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="pf-mision-grid">
                                                        <div>
                                                            <span className="pf-info-label">Proyecto</span>
                                                            <span className="pf-info-valor">{asignacion.cliente}</span>
                                                        </div>
                                                        <div>
                                                            <span className="pf-info-label">Oficina</span>
                                                            <span className="pf-info-valor" style={{ color: '#0284C7' }}>
                                                                {asignacion.empresa || '—'}
                                                            </span>
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

                                                    {/* Resumen financiero */}
                                                    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.82rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
                                                            <div>
                                                                <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Anticipo</span>
                                                                <strong style={{ color: '#1E293B', fontSize: '0.92rem' }}>{formatCOP(Number(asignacion.monto_anticipo || 0))}</strong>
                                                            </div>
                                                            <div>
                                                                <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Gastado</span>
                                                                <strong style={{ color: '#0284C7', fontSize: '0.92rem' }}>{formatCOP(Number(asignacion.total_gastado || 0))}</strong>
                                                            </div>
                                                            <div>
                                                                <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Saldo restante</span>
                                                                <strong style={{ color: '#16A34A', fontSize: '0.92rem' }}>{formatCOP(Number(asignacion.saldo_restante || 0))}</strong>
                                                            </div>
                                                            {Number(asignacion.total_gastado || 0) > Number(asignacion.monto_anticipo || 0) && (
                                                                <div style={{ background: '#FEF2F2', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
                                                                    <span style={{ color: '#991B1B', display: 'block', fontSize: '0.72rem', fontWeight: 700 }}>🚨 Saldo a favor técnico</span>
                                                                    <strong style={{ color: '#DC2626', fontSize: '0.92rem' }}>
                                                                        {formatCOP(Number(asignacion.total_gastado || 0) - Number(asignacion.monto_anticipo || 0))}
                                                                    </strong>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Ítems</span>
                                                                <strong style={{ fontSize: '0.92rem' }}>{asignacion.cantidad_viaticos || viaticosDeAsig.length}</strong>
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <button
                                                                type="button"
                                                                className="pf-back-pill-btn"
                                                                style={{ margin: 0, padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
                                                                onClick={() => handleExportarAsignacion(asignacion.id)}
                                                                disabled={exportandoAsigId === asignacion.id}
                                                            >
                                                                {exportandoAsigId === asignacion.id ? '⌛ Exportando...' : '📊 Exportar Excel'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                style={{
                                                                    background: '#ECFDF5',
                                                                    border: '1px solid #A7F3D0',
                                                                    color: '#059669',
                                                                    padding: '0.4rem 0.85rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                }}
                                                                onClick={() => handleFinalizarAsignacion(asignacion.id)}
                                                                title="Finalizar asignación"
                                                            >
                                                                ✅ Finalizar asignación
                                                            </button>
                                                            <button
                                                                type="button"
                                                                style={{
                                                                    background: '#FEF2F2',
                                                                    border: '1px solid #FECACA',
                                                                    color: '#DC2626',
                                                                    padding: '0.4rem 0.85rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                }}
                                                                onClick={() => handleBorrarAsignacion(asignacion.id)}
                                                                title="Borrar asignación"
                                                            >
                                                                🗑️ Borrar
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Cuenta de Cobro */}
                                                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                        <span style={{ color: '#64748B', fontWeight: 600 }}>Cuenta de cobro digital:</span>
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
                                                                    padding: '0.3rem 0.75rem',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #BAE6FD',
                                                                    cursor: 'pointer',
                                                                }}
                                                            >
                                                                📄 Ver documento
                                                            </button>
                                                        ) : (
                                                            <span style={{ background: '#FEF9EC', color: '#92400E', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                                                ⏳ No adjuntada aún
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Viáticos subidos directamente en esta tarjeta de asignación */}
                                                    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #E2E8F0' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: estaColapsada ? 0 : '0.85rem' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                📋 Viáticos de esta asignación ({viaticosDeAsig.length})
                                                            </span>
                                                            {viaticosDeAsig.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleColapsarAsig(`asig_activa_${asignacion.id}`)}
                                                                    style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                                                >
                                                                    {estaColapsada ? 'Mostrar viáticos ▼' : 'Ocultar viáticos ▲'}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {!estaColapsada && (
                                                            viaticosDeAsig.length > 0 ? (
                                                                <div className="pf-historial-grid" style={{ marginBottom: '0.25rem' }}>
                                                                    {viaticosDeAsig.map((v) => {
                                                                        const miniatura = v.evidencias?.[0]?.secure_url;
                                                                        return (
                                                                            <div className="pf-viatico-card" key={v.id}>
                                                                                <div className="pf-viatico-top">
                                                                                    <span className="pf-viatico-tipo">
                                                                                        <span className="pf-viatico-icono">{ICONO_TIPO_GASTO[v.tipo_gasto] || '📎'}</span>
                                                                                        {LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}
                                                                                    </span>
                                                                                    <span className={`pf-estado-badge pf-estado-badge--${v.estado}`}>
                                                                                        {LABEL_ESTADO_VIATICO[v.estado] || v.estado}
                                                                                    </span>
                                                                                </div>
                                                                                <p className="pf-viatico-lugar">{v.cliente} · {v.ciudad}</p>
                                                                                <p className="pf-viatico-fecha">{formatFechaLarga(v.fecha)}</p>
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
                                                                                            title="Ver evidencia"
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
                                                            ) : (
                                                                <div style={{ fontSize: '0.82rem', color: '#94A3B8', fontStyle: 'italic', padding: '0.4rem 0' }}>
                                                                    No hay viáticos registrados para esta asignación aún.
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="pf-mision-vacia">No hay asignaciones activas registradas.</div>
                                )}

                                {/* ── HISTORIAL DE ASIGNACIONES (FINALIZADAS) CON CARGA DIFERIDA ── */}
                                <div style={{ marginTop: '2.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                        <h2 className="pf-section-title" style={{ margin: 0 }}>
                                            Historial de asignaciones ({asignacionesFinalizadas.length})
                                        </h2>
                                    </div>

                                    {asignacionesFinalizadas.length > 0 ? (
                                        <div className="pf-historial-asig-lista">
                                            {asignacionesFinalizadas.map((asignacion) => {
                                                const estaExpandida = !!historialAsigExpandidas[asignacion.id];
                                                // Optimización de rendimiento: Solo filtra y calcula viáticos si la asignación está expandida
                                                const viaticosDeAsig = estaExpandida ? viaticos.filter((v) => v.asignacion_id === asignacion.id) : [];
                                                const estaColapsadaViaticos = asigColapsadas[`asig_hist_${asignacion.id}`];

                                                return (
                                                    <div className="pf-historial-asig-card" key={asignacion.id}>
                                                        {/* Fila compacta del Historial (siempre visible por defecto) */}
                                                        <div
                                                            className="pf-historial-asig-header"
                                                            onClick={() => toggleExpandirHistorialAsig(asignacion.id)}
                                                            style={{ cursor: 'pointer' }}
                                                            title={estaExpandida ? 'Clic para colapsar' : 'Clic para ver detalle'}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                                                                <span className="pf-historial-asig-icon">📁</span>
                                                                <div style={{ minWidth: 0 }}>
                                                                    <strong className="pf-historial-asig-title">{asignacion.cliente}</strong>
                                                                    <div className="pf-historial-asig-meta">
                                                                        <span>📍 {asignacion.ciudad}</span>
                                                                        <span>• {formatFechaLarga(asignacion.fecha_inicio)}</span>
                                                                        <span>• {LABEL_TIPO_ASIGNACION[asignacion.tipo] || asignacion.tipo}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                <span className="pf-badge-finalizada">
                                                                    FINALIZADA
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className={`pf-historial-asig-chevron ${estaExpandida ? 'pf-historial-asig-chevron--open' : ''}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleExpandirHistorialAsig(asignacion.id);
                                                                    }}
                                                                    title={estaExpandida ? 'Colapsar detalle' : 'Expandir detalle'}
                                                                >
                                                                    ▼
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Renderizado condicional del detalle completo (solo cuando el usuario expande) */}
                                                        {estaExpandida && (
                                                            <div className="pf-historial-asig-body">
                                                                <div className="pf-mision-grid">
                                                                    <div>
                                                                        <span className="pf-info-label">Proyecto</span>
                                                                        <span className="pf-info-valor">{asignacion.cliente}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="pf-info-label">Oficina</span>
                                                                        <span className="pf-info-valor" style={{ color: '#0284C7' }}>
                                                                            {asignacion.empresa || '—'}
                                                                        </span>
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

                                                                {/* Resumen financiero */}
                                                                <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.82rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
                                                                        <div>
                                                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Anticipo</span>
                                                                            <strong style={{ color: '#1E293B', fontSize: '0.92rem' }}>{formatCOP(Number(asignacion.monto_anticipo || 0))}</strong>
                                                                        </div>
                                                                        <div>
                                                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Gastado</span>
                                                                            <strong style={{ color: '#0284C7', fontSize: '0.92rem' }}>{formatCOP(Number(asignacion.total_gastado || 0))}</strong>
                                                                        </div>
                                                                        <div>
                                                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Saldo restante</span>
                                                                            <strong style={{ color: '#16A34A', fontSize: '0.92rem' }}>{formatCOP(Number(asignacion.saldo_restante || 0))}</strong>
                                                                        </div>
                                                                        {Number(asignacion.total_gastado || 0) > Number(asignacion.monto_anticipo || 0) && (
                                                                            <div style={{ background: '#FEF2F2', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
                                                                                <span style={{ color: '#991B1B', display: 'block', fontSize: '0.72rem', fontWeight: 700 }}>🚨 Saldo a favor técnico</span>
                                                                                <strong style={{ color: '#DC2626', fontSize: '0.92rem' }}>
                                                                                    {formatCOP(Number(asignacion.total_gastado || 0) - Number(asignacion.monto_anticipo || 0))}
                                                                                </strong>
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>Ítems</span>
                                                                            <strong style={{ fontSize: '0.92rem' }}>{asignacion.cantidad_viaticos || viaticosDeAsig.length}</strong>
                                                                        </div>
                                                                    </div>

                                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                        <button
                                                                            type="button"
                                                                            className="pf-back-pill-btn"
                                                                            style={{ margin: 0, padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
                                                                            onClick={() => handleExportarAsignacion(asignacion.id)}
                                                                            disabled={exportandoAsigId === asignacion.id}
                                                                        >
                                                                            {exportandoAsigId === asignacion.id ? '⌛ Exportando...' : '📊 Exportar Excel'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            style={{
                                                                                background: '#FEF2F2',
                                                                                border: '1px solid #FECACA',
                                                                                color: '#DC2626',
                                                                                padding: '0.4rem 0.85rem',
                                                                                borderRadius: '6px',
                                                                                fontSize: '0.78rem',
                                                                                fontWeight: 700,
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '0.25rem',
                                                                            }}
                                                                            onClick={() => handleBorrarAsignacion(asignacion.id)}
                                                                            title="Borrar asignación"
                                                                        >
                                                                            🗑️ Borrar
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {/* Cuenta de Cobro */}
                                                                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                                    <span style={{ color: '#64748B', fontWeight: 600 }}>Cuenta de cobro digital:</span>
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
                                                                                padding: '0.3rem 0.75rem',
                                                                                borderRadius: '8px',
                                                                                border: '1px solid #BAE6FD',
                                                                                cursor: 'pointer',
                                                                            }}
                                                                        >
                                                                            📄 Ver documento
                                                                        </button>
                                                                    ) : (
                                                                        <span style={{ background: '#FEF9EC', color: '#92400E', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                                                            ⏳ No adjuntada aún
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Viáticos subidos directamente en esta tarjeta */}
                                                                <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #E2E8F0' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: estaColapsadaViaticos ? 0 : '0.85rem' }}>
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                            📋 Viáticos de esta asignación ({viaticosDeAsig.length})
                                                                        </span>
                                                                        {viaticosDeAsig.length > 0 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleColapsarAsig(`asig_hist_${asignacion.id}`)}
                                                                                style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                                                            >
                                                                                {estaColapsadaViaticos ? 'Mostrar viáticos ▼' : 'Ocultar viáticos ▲'}
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {!estaColapsadaViaticos && (
                                                                        viaticosDeAsig.length > 0 ? (
                                                                            <div className="pf-historial-grid" style={{ marginBottom: '0.25rem' }}>
                                                                                {viaticosDeAsig.map((v) => {
                                                                                    const miniatura = v.evidencias?.[0]?.secure_url;
                                                                                    return (
                                                                                        <div className="pf-viatico-card" key={v.id}>
                                                                                            <div className="pf-viatico-top">
                                                                                                <span className="pf-viatico-tipo">
                                                                                                    <span className="pf-viatico-icono">{ICONO_TIPO_GASTO[v.tipo_gasto] || '📎'}</span>
                                                                                                    {LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}
                                                                                                </span>
                                                                                                <span className={`pf-estado-badge pf-estado-badge--${v.estado}`}>
                                                                                                    {LABEL_ESTADO_VIATICO[v.estado] || v.estado}
                                                                                                </span>
                                                                                            </div>
                                                                                            <p className="pf-viatico-lugar">{v.cliente} · {v.ciudad}</p>
                                                                                            <p className="pf-viatico-fecha">{formatFechaLarga(v.fecha)}</p>
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
                                                                                                        title="Ver evidencia"
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
                                                                        ) : (
                                                                            <div style={{ fontSize: '0.82rem', color: '#94A3B8', fontStyle: 'italic', padding: '0.4rem 0' }}>
                                                                                No hay viáticos registrados para esta asignación.
                                                                            </div>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="pf-mision-vacia">No hay asignaciones en el historial.</div>
                                    )}
                                </div>

                                {/* Viáticos Independientes (Gastos sin asignación) */}
                                <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <button
                                            type="button"
                                            className="pf-back-pill-btn"
                                            style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
                                            onClick={() => setMostrarViaticosIndependientes(true)}
                                        >
                                            📄 Ver viáticos independientes ({viaticosIndependientes.length})
                                        </button>
                                        <button
                                            type="button"
                                            className="asig-btn-nueva"
                                            style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }}
                                            onClick={handleExportarIndependientes}
                                            disabled={exportandoIndependiente || viaticosIndependientes.length === 0}
                                        >
                                            {exportandoIndependiente ? '⌛ Exportando...' : '📊 Exportar Excel'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Modal Viáticos Independientes */}
            {mostrarViaticosIndependientes && (
                <div className="evidencia-overlay" onClick={() => setMostrarViaticosIndependientes(false)}>
                    <div
                        className="evidencia-modal"
                        style={{ maxWidth: '850px', width: '90%' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="evidencia-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1E293B' }}>
                                    📄 Viáticos Independientes
                                </h3>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                                    Gastos sin asignación vinculada ({viaticosIndependientes.length} registros) · Total: {formatCOP(viaticosIndependientes.reduce((sum, v) => sum + Number(v.valor || 0), 0))}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {viaticosIndependientes.length > 0 && (
                                    <button
                                        type="button"
                                        className="pf-back-pill-btn"
                                        style={{ margin: 0, padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                                        onClick={handleExportarIndependientes}
                                        disabled={exportandoIndependiente}
                                    >
                                        {exportandoIndependiente ? '⌛ Exportando...' : '📊 Exportar Excel'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="evidencia-btn-cerrar"
                                    onClick={() => setMostrarViaticosIndependientes(false)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="evidencia-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1.25rem' }}>
                            {viaticosIndependientes.length > 0 ? (
                                <div className="pf-historial-grid" style={{ margin: 0 }}>
                                    {viaticosIndependientes.map((v) => {
                                        const miniatura = v.evidencias?.[0]?.secure_url;
                                        return (
                                            <div className="pf-viatico-card" key={v.id}>
                                                <div className="pf-viatico-top">
                                                    <span className="pf-viatico-tipo">
                                                        <span className="pf-viatico-icono">{ICONO_TIPO_GASTO[v.tipo_gasto] || '📎'}</span>
                                                        {LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}
                                                    </span>
                                                    <span className={`pf-estado-badge pf-estado-badge--${v.estado}`}>
                                                        {LABEL_ESTADO_VIATICO[v.estado] || v.estado}
                                                    </span>
                                                </div>

                                                <p className="pf-viatico-lugar">{v.cliente || 'Sin cliente'} · {v.ciudad || 'Sin ciudad'}</p>
                                                <p className="pf-viatico-fecha">{formatFechaLarga(v.fecha)}</p>

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
                                                            title="Ver evidencia"
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
                            ) : (
                                <div className="pf-mision-vacia" style={{ padding: '2.5rem' }}>
                                    No hay viáticos independientes registrados para este técnico.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modales */}
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

            {cuentaCobroVer && (
                <ModalCuentaCobro
                    archivoUrl={cuentaCobroVer.archivoUrl}
                    cuenta={cuentaCobroVer.cuenta}
                    onClose={() => setCuentaCobroVer(null)}
                />
            )}

            {tecnicoParaAsignaciones && (
                <ModalAsignacionesTecnico
                    tecnico={tecnicoParaAsignaciones}
                    onClose={() => setTecnicoParaAsignaciones(null)}
                    onAsignacionActualizada={() => {
                        listarAsignaciones().then((res) => setAsignaciones(res.data)).catch(() => {});
                    }}
                />
            )}

            {tecnicoParaCuentasCobro && (
                <ModalCuentasCobroTecnico
                    tecnico={tecnicoParaCuentasCobro}
                    onClose={() => setTecnicoParaCuentasCobro(null)}
                />
            )}
        </div>
    );
}
