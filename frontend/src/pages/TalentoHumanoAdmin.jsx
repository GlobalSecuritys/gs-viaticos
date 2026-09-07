import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, {
    exportarTalentoHumanoExcel,
    subirDocumentoTalentoHumano,
    eliminarDocumentoTalentoHumano,
    descargarBlob,
} from '../services/api';
import logoGSB from '../assets/logo-gsb.png';
import NotificationBell from '../components/NotificationBell';
import InstallPwaPrompt from '../components/InstallPwaPrompt';
import { formatCOP, formatFechaLarga, iniciales } from '../utils/personal';
import { formatApiError } from '../utils/formatError';
import './TalentoHumanoAdmin.css';

export default function TalentoHumanoAdmin() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [empleados, setEmpleados] = useState([]);
    const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
    const [loadingLista, setLoadingLista] = useState(true);
    const [loadingFicha, setLoadingFicha] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [paginaActual, setPaginaActual] = useState(1);
    const ITEMS_POR_PAGINA = 8;

    const [tabActiva, setTabActiva] = useState('general'); // 'general', 'documentos', 'adicional', 'historial'
    const [mensajeFeedback, setMensajeFeedback] = useState('');
    const [error, setError] = useState('');

    // ── Sidebar colapsable persistido en localStorage ──
    const [sidebarColapsado, setSidebarColapsado] = useState(() => {
        try {
            return localStorage.getItem('tha_sidebar_colapsado') === 'true';
        } catch {
            return false;
        }
    });

    const toggleSidebar = () => {
        setSidebarColapsado((prev) => {
            const next = !prev;
            try {
                localStorage.setItem('tha_sidebar_colapsado', String(next));
            } catch {}
            return next;
        });
    };

    // ── Estados para Dotaciones ──
    const [mostrarModalDotacion, setMostrarModalDotacion] = useState(false);
    const [guardandoDotacion, setGuardandoDotacion] = useState(false);
    const [formDotacion, setFormDotacion] = useState({
        item: '',
        tipo: 'Uniforme',
        talla: 'M',
        cantidad: 1,
        fecha_entrega: new Date().toISOString().slice(0, 10),
        fecha_reposicion: '',
        estado: 'entregado',
        observaciones: '',
    });

    // ── Estados para Evaluaciones de Desempeño ──
    const [mostrarModalEvaluacion, setMostrarModalEvaluacion] = useState(false);
    const [guardandoEvaluacion, setGuardandoEvaluacion] = useState(false);
    const [formEvaluacion, setFormEvaluacion] = useState({
        periodo: '2026 - Trimestre 1',
        fecha_evaluacion: new Date().toISOString().slice(0, 10),
        puntualidad: 5,
        desempeno: 5,
        actitud: 5,
        cumplimiento_protocolo: 5,
        comunicacion_reporte: 5,
        comentarios: '',
    });

    // Modales
    const [mostrarNuevoModal, setMostrarNuevoModal] = useState(false);
    const [mostrarEditarModal, setMostrarEditarModal] = useState(false);
    const [mostrarCargarDocModal, setMostrarCargarDocModal] = useState(false);
    const [docSeleccionadoParaCarga, setDocSeleccionadoParaCarga] = useState(null);
    const [mostrarMenuOpciones, setMostrarMenuOpciones] = useState(false);

    // Form states
    const [formNuevo, setFormNuevo] = useState({
        nombre: '',
        correo: '',
        password: '',
        codigo_empleado: '',
        cedula: '',
        cargo: 'Técnico Instalador',
        area: 'Instalaciones',
        tipo_contrato: 'Término indefinido',
        fecha_ingreso: '',
        estado_laboral: 'activo',
        jefe_inmediato: 'Carlos Ramírez',
        salario: '2350000',
        telefono: '',
        ciudad: '',
        direccion: '',
        contacto_emergencia_nombre: '',
        contacto_emergencia_parentesco: '',
        contacto_emergencia_telefono: '',
        observaciones: '',
    });

    const [formEditar, setFormEditar] = useState({});
    const [archivoSubir, setArchivoSubir] = useState(null);
    const [subiendoDoc, setSubiendoDoc] = useState(false);
    const fileInputRef = useRef(null);

    // Cargar listado inicial
    async function cargarEmpleados(mantenerSeleccionId = null) {
        setLoadingLista(true);
        setError('');
        try {
            const { data } = await api.get('/talento-humano/empleados');
            setEmpleados(data);

            const idParaCargar = mantenerSeleccionId || (data.length > 0 ? data[0].id : null);
            if (idParaCargar) {
                cargarFichaEmpleado(idParaCargar);
            } else {
                setEmpleadoSeleccionado(null);
            }
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar la lista de empleados.'));
        } finally {
            setLoadingLista(false);
        }
    }

    async function cargarFichaEmpleado(usuarioId) {
        setLoadingFicha(true);
        try {
            const { data } = await api.get(`/talento-humano/empleados/${usuarioId}`);
            setEmpleadoSeleccionado(data);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar la ficha del empleado.'));
        } finally {
            setLoadingFicha(false);
        }
    }

    useEffect(() => {
        cargarEmpleados();
    }, []);

    // Filtrar lista de empleados
    const empleadosFiltrados = useMemo(() => {
        return empleados.filter((emp) => {
            const q = busqueda.trim().toLowerCase();
            const coincideBusqueda =
                !q ||
                (emp.nombre || '').toLowerCase().includes(q) ||
                (emp.correo || '').toLowerCase().includes(q) ||
                (emp.codigo_empleado || '').toLowerCase().includes(q) ||
                (emp.cedula || '').toLowerCase().includes(q) ||
                (emp.cargo || '').toLowerCase().includes(q);

            const coincideEstado =
                filtroEstado === 'todos' ||
                (emp.estado_laboral || 'activo').toLowerCase() === filtroEstado.toLowerCase();

            return coincideBusqueda && coincideEstado;
        });
    }, [empleados, busqueda, filtroEstado]);

    const totalPaginas = Math.ceil(empleadosFiltrados.length / ITEMS_POR_PAGINA) || 1;
    const empleadosPaginados = useMemo(() => {
        const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
        return empleadosFiltrados.slice(inicio, inicio + ITEMS_POR_PAGINA);
    }, [empleadosFiltrados, paginaActual]);

    // Handlers
    async function handleExportarExcel() {
        try {
            const res = await exportarTalentoHumanoExcel();
            descargarBlob(res.data, `GSB_Talento_Humano_${new Date().toISOString().slice(0, 10)}.xlsx`);
            setMensajeFeedback('✅ Archivo Excel descargado exitosamente.');
        } catch (err) {
            setError(formatApiError(err, 'Error al exportar a Excel.'));
        }
    }

    async function handleCrearEmpleado(e) {
        e.preventDefault();
        setError('');
        try {
            const payload = {
                ...formNuevo,
                salario: formNuevo.salario ? Number(formNuevo.salario) : 2350000,
                fecha_ingreso: formNuevo.fecha_ingreso || null,
            };
            const { data } = await api.post('/talento-humano/empleados', payload);
            setMostrarNuevoModal(false);
            setMensajeFeedback(`✅ Empleado "${data.nombre}" creado exitosamente.`);
            setFormNuevo({
                nombre: '',
                correo: '',
                password: '',
                codigo_empleado: '',
                cedula: '',
                cargo: 'Técnico Instalador',
                area: 'Instalaciones',
                tipo_contrato: 'Término indefinido',
                fecha_ingreso: '',
                estado_laboral: 'activo',
                jefe_inmediato: 'Carlos Ramírez',
                salario: '2350000',
                telefono: '',
                ciudad: '',
                direccion: '',
                contacto_emergencia_nombre: '',
                contacto_emergencia_parentesco: '',
                contacto_emergencia_telefono: '',
                observaciones: '',
            });
            cargarEmpleados(data.id);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo crear el empleado.'));
        }
    }

    function abrirModalEditar() {
        if (!empleadoSeleccionado) return;
        const p = empleadoSeleccionado.perfil || {};
        setFormEditar({
            nombre: empleadoSeleccionado.nombre || '',
            correo: empleadoSeleccionado.correo || '',
            codigo_empleado: empleadoSeleccionado.codigo_empleado || '',
            cedula: p.cedula || '',
            telefono: p.telefono || '',
            telefono_alternativo: p.telefono_alternativo || '',
            fecha_nacimiento: p.fecha_nacimiento || '',
            ciudad: p.ciudad || '',
            direccion: p.direccion || '',
            estado_civil: p.estado_civil || 'Soltero',
            cargo: p.cargo || 'Técnico Instalador',
            area: p.area || 'Instalaciones',
            tipo_contrato: p.tipo_contrato || 'Término indefinido',
            fecha_ingreso: p.fecha_ingreso || '',
            estado_laboral: p.estado_laboral || 'activo',
            jefe_inmediato: p.jefe_inmediato || 'Carlos Ramírez',
            salario: p.salario || '',
            contacto_emergencia_nombre: p.contacto_emergencia_nombre || '',
            contacto_emergencia_parentesco: p.contacto_emergencia_parentesco || '',
            contacto_emergencia_telefono: p.contacto_emergencia_telefono || '',
            contacto_emergencia_telefono_alt: p.contacto_emergencia_telefono_alt || '',
            observaciones: p.observaciones || '',
        });
        setMostrarEditarModal(true);
    }

    async function handleGuardarEdicion(e) {
        e.preventDefault();
        setError('');
        try {
            const payload = {
                ...formEditar,
                salario: formEditar.salario ? Number(formEditar.salario) : null,
                fecha_nacimiento: formEditar.fecha_nacimiento || null,
                fecha_ingreso: formEditar.fecha_ingreso || null,
            };
            const { data } = await api.put(`/talento-humano/empleados/${empleadoSeleccionado.id}`, payload);
            setEmpleadoSeleccionado(data);
            setMostrarEditarModal(false);
            setMensajeFeedback('✅ Información actualizada correctamente.');
            // Actualizar lista
            cargarEmpleados(data.id);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo guardar la información.'));
        }
    }

    async function handleCambiarEstado(nuevoEstado) {
        if (!empleadoSeleccionado) return;
        setMostrarMenuOpciones(false);
        try {
            const { data } = await api.put(`/talento-humano/empleados/${empleadoSeleccionado.id}/estado`, {
                estado_laboral: nuevoEstado,
            });
            setEmpleadoSeleccionado(data);
            setMensajeFeedback(`✅ Estado cambiado a "${nuevoEstado.replace('_', ' ').toUpperCase()}".`);
            cargarEmpleados(data.id);
        } catch (err) {
            setError(formatApiError(err, 'Error al cambiar estado.'));
        }
    }

    function abrirModalSubirDoc(doc) {
        setDocSeleccionadoParaCarga(doc);
        setArchivoSubir(null);
        setMostrarCargarDocModal(true);
    }

    function abrirModalNuevoDocPersonalizado() {
        setDocSeleccionadoParaCarga({
            tipo_documento: `custom_${Date.now()}`,
            nombre_documento: '',
            esPersonalizado: true,
        });
        setArchivoSubir(null);
        setMostrarCargarDocModal(true);
    }

    async function handleSubirDocumento(e) {
        e.preventDefault();
        if (!docSeleccionadoParaCarga) return;
        const nombreDoc = (docSeleccionadoParaCarga.nombre_documento || '').trim();
        if (!nombreDoc) {
            setError('Debes ingresar un título o nombre para el documento.');
            return;
        }
        if (!archivoSubir) {
            setError('Por favor selecciona un archivo para subir.');
            return;
        }
        setSubiendoDoc(true);
        setError('');
        try {
            await subirDocumentoTalentoHumano(
                empleadoSeleccionado.id,
                archivoSubir,
                docSeleccionadoParaCarga.tipo_documento,
                nombreDoc
            );
            setMostrarCargarDocModal(false);
            setMensajeFeedback(`✅ Documento "${nombreDoc}" cargado con éxito.`);
            cargarFichaEmpleado(empleadoSeleccionado.id);
            cargarEmpleados(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'Error al subir el documento.'));
        } finally {
            setSubiendoDoc(false);
        }
    }

    async function handleEliminarDocumento(doc) {
        if (!window.confirm(`¿Estás seguro de eliminar el archivo de "${doc.nombre_documento}"?`)) return;
        try {
            await eliminarDocumentoTalentoHumano(empleadoSeleccionado.id, doc.id);
            setMensajeFeedback(`Documento "${doc.nombre_documento}" eliminado / restaurado.`);
            cargarFichaEmpleado(empleadoSeleccionado.id);
            cargarEmpleados(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'Error al eliminar el documento.'));
        }
    }

    // ── Handlers: Dotaciones ──
    async function handleCrearDotacion(e) {
        e.preventDefault();
        if (!empleadoSeleccionado) return;
        setGuardandoDotacion(true);
        setError('');
        try {
            await api.post(`/talento-humano/empleados/${empleadoSeleccionado.id}/dotaciones`, formDotacion);
            setMostrarModalDotacion(false);
            setMensajeFeedback(`✅ Dotación "${formDotacion.item}" asignada exitosamente.`);
            setFormDotacion({
                item: '',
                tipo: 'Uniforme',
                talla: 'M',
                cantidad: 1,
                fecha_entrega: new Date().toISOString().slice(0, 10),
                fecha_reposicion: '',
                estado: 'entregado',
                observaciones: '',
            });
            cargarFichaEmpleado(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo registrar la dotación.'));
        } finally {
            setGuardandoDotacion(false);
        }
    }

    async function handleCambiarEstadoDotacion(dotacionId, nuevoEstado) {
        if (!empleadoSeleccionado) return;
        try {
            await api.put(`/talento-humano/empleados/${empleadoSeleccionado.id}/dotaciones/${dotacionId}`, { estado: nuevoEstado });
            setMensajeFeedback(`✅ Estado de dotación actualizado a "${nuevoEstado}".`);
            cargarFichaEmpleado(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo actualizar el estado de la dotación.'));
        }
    }

    async function handleEliminarDotacion(dotacionId, itemName) {
        if (!empleadoSeleccionado) return;
        if (!window.confirm(`¿Seguro que deseas eliminar el registro de dotación "${itemName}"?`)) return;
        try {
            await api.delete(`/talento-humano/empleados/${empleadoSeleccionado.id}/dotaciones/${dotacionId}`);
            setMensajeFeedback(`✅ Registro de dotación "${itemName}" eliminado.`);
            cargarFichaEmpleado(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo eliminar el registro de dotación.'));
        }
    }

    // ── Handlers: Evaluaciones de Desempeño ──
    async function handleCrearEvaluacion(e) {
        e.preventDefault();
        if (!empleadoSeleccionado) return;
        setGuardandoEvaluacion(true);
        setError('');
        try {
            const { data } = await api.post(`/talento-humano/empleados/${empleadoSeleccionado.id}/evaluaciones`, formEvaluacion);
            setMostrarModalEvaluacion(false);
            setMensajeFeedback(`✅ Evaluación de desempeño guardada (Promedio: ${data.promedio}/5.0 estrellas).`);
            setFormEvaluacion({
                periodo: '2026 - Trimestre 1',
                fecha_evaluacion: new Date().toISOString().slice(0, 10),
                puntualidad: 5,
                desempeno: 5,
                actitud: 5,
                cumplimiento_protocolo: 5,
                comunicacion_reporte: 5,
                comentarios: '',
            });
            cargarFichaEmpleado(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo guardar la evaluación.'));
        } finally {
            setGuardandoEvaluacion(false);
        }
    }

    async function handleEliminarEvaluacion(evaluacionId) {
        if (!empleadoSeleccionado) return;
        if (!window.confirm('¿Seguro que deseas eliminar esta evaluación de desempeño?')) return;
        try {
            await api.delete(`/talento-humano/empleados/${empleadoSeleccionado.id}/evaluaciones/${evaluacionId}`);
            setMensajeFeedback('✅ Evaluación eliminada.');
            cargarFichaEmpleado(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo eliminar la evaluación.'));
        }
    }

    const NAV_ITEMS_ADMIN = [
        { id: 'general', label: 'Directorio & Ficha', icon: '👤', action: () => setTabActiva('general'), active: tabActiva === 'general' },
        { id: 'documentos', label: 'Contratos & Documentos', icon: '📄', action: () => setTabActiva('documentos'), active: tabActiva === 'documentos' },
        { id: 'adicional', label: 'Dotaciones', icon: '🦺', action: () => setTabActiva('adicional'), active: tabActiva === 'adicional' },
        { id: 'historial', label: 'Historial & Solicitudes', icon: '📝', action: () => setTabActiva('historial'), active: tabActiva === 'historial' },
    ];

    const p = empleadoSeleccionado?.perfil || {};
    const initHero = iniciales(empleadoSeleccionado?.nombre || 'E');

    return (
        <div className="tha-root">
            {/* ── SIDEBAR CORPORATIVO (MÓDULO TALENTO HUMANO) ── */}
            <aside className={`tha-sidebar ${sidebarColapsado ? 'tha-sidebar--collapsed' : ''}`}>
                {/* Botón para colapsar/expandir el sidebar */}
                <button
                    type="button"
                    className="tha-sidebar-toggle-btn"
                    onClick={toggleSidebar}
                    title={sidebarColapsado ? 'Expandir menú lateral' : 'Plegar menú lateral'}
                    aria-label={sidebarColapsado ? 'Expandir menú lateral' : 'Plegar menú lateral'}
                >
                    {sidebarColapsado ? '›' : '‹'}
                </button>

                <div className="tha-sidebar-brand" onClick={() => navigate('/seleccion-modulo')} style={{ cursor: 'pointer' }} title="Regresar al Hub de Módulos">
                    <img src={logoGSB} alt="Global Security Bank" className="tha-sidebar-logo" />
                    {!sidebarColapsado && (
                        <div className="tha-brand-text">
                            <span className="tha-brand-title">TALENTO HUMANO</span>
                            <span className="tha-brand-sub" style={{ color: '#94a3b8' }}>‹ Hub de Módulos</span>
                        </div>
                    )}
                </div>

                <div className="tha-sidebar-user" title={`${user?.nombre || 'Administrador'} (Administrador)`}>
                    <div className="tha-user-avatar">
                        {iniciales(user?.nombre || user?.correo || 'AD')}
                    </div>
                    {!sidebarColapsado && (
                        <div>
                            <div className="tha-user-name">{user?.nombre || 'Administrador'}</div>
                            <div className="tha-user-role">
                                Administrador
                            </div>
                        </div>
                    )}
                </div>

                <nav className="tha-sidebar-nav">
                    {NAV_ITEMS_ADMIN.map((item) => (
                        <button
                            key={item.id}
                            className={`tha-nav-item ${item.active ? 'tha-nav-item--active' : ''}`}
                            onClick={item.action}
                            title={sidebarColapsado ? item.label : undefined}
                        >
                            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                            {!sidebarColapsado && <span className="tha-nav-label">{item.label}</span>}
                        </button>
                    ))}
                </nav>

                <div className="tha-sidebar-footer">
                    <button
                        type="button"
                        onClick={() => navigate('/seleccion-modulo')}
                        title={sidebarColapsado ? 'Regresar al Hub de Módulos' : undefined}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                            padding: '0.65rem 0.85rem',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '8px',
                            color: '#F4F1EC',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            fontFamily: 'inherit',
                            marginBottom: '0.5rem',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <span>🔲</span>
                        {!sidebarColapsado && <span>Hub de Módulos</span>}
                    </button>

                    <button
                        className="tha-logout-btn"
                        title={sidebarColapsado ? 'Cerrar sesión' : undefined}
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                    >
                        <span>🚪</span>
                        {!sidebarColapsado && <span>Cerrar sesión</span>}
                    </button>
                </div>
            </aside>

            {/* ── CONTENIDO PRINCIPAL ── */}
            <main className={`tha-content-wrapper ${sidebarColapsado ? 'tha-content-wrapper--collapsed' : ''}`}>
                {/* ── TOP ACTIONS / HEADER ── */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0.5rem', gap: '0.85rem' }}>
                    <InstallPwaPrompt />
                    <NotificationBell />
                </div>

                <div className="tha-header-bar">
                    <div>
                        <h1 className="tha-header-title">Talento Humano</h1>
                        <p className="tha-header-sub">
                            Gestión de información laboral y administrativa de los empleados.
                        </p>
                    </div>

                    <div className="tha-header-actions">
                        <button className="tha-btn-excel" onClick={handleExportarExcel}>
                            <span>📊</span>
                            <span>Exportar Excel</span>
                        </button>
                        {user?.rol === 'superadmin' && (
                            <button className="tha-btn-nuevo" onClick={() => setMostrarNuevoModal(true)}>
                                <span>➕</span>
                                <span>Nuevo empleado</span>
                            </button>
                        )}
                    </div>
                </div>

                {mensajeFeedback && (
                    <div style={{ background: '#D1FAE5', border: '1px solid #059669', color: '#065F46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{mensajeFeedback}</span>
                        <button onClick={() => setMensajeFeedback('')} style={{ fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
                    </div>
                )}

                {error && (
                    <div style={{ background: '#FEE2E2', border: '1px solid #DC2626', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{error}</span>
                        <button onClick={() => setError('')} style={{ fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
                    </div>
                )}

                {/* ── SPLIT VIEW: LISTA + FICHA ── */}
                <div className="tha-split-layout">
                    {/* PANEL IZQUIERDO: LISTA */}
                    <div className="tha-list-panel">
                        <div className="tha-list-header">
                            <div className="tha-search-box">
                                <span className="tha-search-icon">🔍</span>
                                <input
                                    type="text"
                                    className="tha-search-input"
                                    placeholder="Buscar empleado..."
                                    value={busqueda}
                                    onChange={(e) => {
                                        setBusqueda(e.target.value);
                                        setPaginaActual(1);
                                    }}
                                />
                            </div>

                            <select
                                className="tha-select-filter"
                                value={filtroEstado}
                                onChange={(e) => {
                                    setFiltroEstado(e.target.value);
                                    setPaginaActual(1);
                                }}
                            >
                                <option value="todos">Todos los estados</option>
                                <option value="activo">Activo</option>
                                <option value="en_capacitacion">En capacitación</option>
                                <option value="inactivo">Inactivo</option>
                            </select>
                        </div>

                        <div className="tha-employee-items-wrap">
                            {loadingLista ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                                    Cargando empleados...
                                </div>
                            ) : empleadosPaginados.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                                    No se encontraron empleados.
                                </div>
                            ) : (
                                empleadosPaginados.map((emp) => {
                                    const isSelected = empleadoSeleccionado?.id === emp.id;
                                    const init = iniciales(emp.nombre || 'E');
                                    const estadoRaw = (emp.estado_laboral || 'activo').toLowerCase();
                                    const badgeClass =
                                        estadoRaw === 'activo'
                                            ? 'tha-status-badge--activo'
                                            : estadoRaw === 'en_capacitacion'
                                            ? 'tha-status-badge--capacitacion'
                                            : 'tha-status-badge--inactivo';

                                    const estadoLabel =
                                        estadoRaw === 'activo'
                                            ? 'Activo'
                                            : estadoRaw === 'en_capacitacion'
                                            ? 'En capacitación'
                                            : 'Inactivo';

                                    return (
                                        <div
                                            key={emp.id}
                                            className={`tha-employee-card ${isSelected ? 'tha-employee-card--selected' : ''}`}
                                            onClick={() => cargarFichaEmpleado(emp.id)}
                                        >
                                            <div className="tha-card-avatar">{init}</div>
                                            <div className="tha-card-meta">
                                                <div className="tha-card-name">{emp.nombre}</div>
                                                <div className="tha-card-cargo">{emp.cargo || 'Técnico Instalador'}</div>
                                            </div>
                                            <div className="tha-card-badge-wrap">
                                                <span className={`tha-status-badge ${badgeClass}`}>
                                                    {estadoLabel}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {totalPaginas > 1 && (
                            <div className="tha-list-pagination">
                                <button
                                    className="tha-page-btn"
                                    disabled={paginaActual <= 1}
                                    onClick={() => setPaginaActual((prev) => Math.max(1, prev - 1))}
                                >
                                    ‹
                                </button>
                                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
                                    <button
                                        key={num}
                                        className={`tha-page-btn ${paginaActual === num ? 'tha-page-btn--active' : ''}`}
                                        onClick={() => setPaginaActual(num)}
                                    >
                                        {num}
                                    </button>
                                ))}
                                <button
                                    className="tha-page-btn"
                                    disabled={paginaActual >= totalPaginas}
                                    onClick={() => setPaginaActual((prev) => Math.min(totalPaginas, prev + 1))}
                                >
                                    ›
                                </button>
                            </div>
                        )}
                    </div>

                    {/* PANEL DERECHO: FICHA DEL EMPLEADO */}
                    <div className="tha-detail-panel">
                        {loadingFicha ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B' }}>
                                Cargando información del empleado...
                            </div>
                        ) : !empleadoSeleccionado ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B' }}>
                                Seleccione un empleado para visualizar su ficha.
                            </div>
                        ) : (
                            <>
                                {/* Top bar de acciones */}
                                <div className="tha-detail-top-actions">
                                    <span className="tha-btn-back">
                                        ← Volver al listado
                                    </span>

                                    <div className="tha-top-action-group">
                                        <button className="tha-btn-edit" onClick={abrirModalEditar}>
                                            <span>✏️</span>
                                            <span>Editar información</span>
                                        </button>

                                        <div style={{ position: 'relative' }}>
                                            <button
                                                className="tha-btn-more"
                                                onClick={() => setMostrarMenuOpciones(!mostrarMenuOpciones)}
                                            >
                                                ⋮
                                            </button>
                                            {mostrarMenuOpciones && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        right: 0,
                                                        top: '100%',
                                                        marginTop: '4px',
                                                        background: '#FFFFFF',
                                                        border: '1px solid var(--color-border)',
                                                        borderRadius: '8px',
                                                        boxShadow: 'var(--color-shadow-md)',
                                                        zIndex: 50,
                                                        width: '190px',
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    <button
                                                        style={{ width: '100%', padding: '0.65rem 1rem', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#059669' }}
                                                        onClick={() => handleCambiarEstado('activo')}
                                                    >
                                                        ✓ Marcar como Activo
                                                    </button>
                                                    <button
                                                        style={{ width: '100%', padding: '0.65rem 1rem', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#D97706' }}
                                                        onClick={() => handleCambiarEstado('en_capacitacion')}
                                                    >
                                                        ⏳ En capacitación
                                                    </button>
                                                    <button
                                                        style={{ width: '100%', padding: '0.65rem 1rem', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#DC2626' }}
                                                        onClick={() => handleCambiarEstado('inactivo')}
                                                    >
                                                        ✕ Marcar como Inactivo
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Cabecera del Empleado */}
                                <div className="tha-profile-hero">
                                    <div className="tha-hero-avatar">{initHero}</div>

                                    <div className="tha-hero-info">
                                        <div className="tha-hero-title-row">
                                            <h2 className="tha-hero-name">{empleadoSeleccionado.nombre}</h2>
                                            <span
                                                className={`tha-status-badge ${
                                                    (p.estado_laboral || 'activo') === 'activo'
                                                        ? 'tha-status-badge--activo'
                                                        : (p.estado_laboral || 'activo') === 'en_capacitacion'
                                                        ? 'tha-status-badge--capacitacion'
                                                        : 'tha-status-badge--inactivo'
                                                }`}
                                            >
                                                {(p.estado_laboral || 'activo').replace('_', ' ').toUpperCase()}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="tha-hero-cargo-pill">
                                                {p.cargo || 'Técnico Instalador'}
                                            </span>
                                        </div>

                                        <div className="tha-hero-meta-grid">
                                            <div className="tha-hero-meta-item">
                                                <span className="tha-hero-meta-icon">🪪</span>
                                                <span>CC {p.cedula || empleadoSeleccionado.codigo_empleado || '—'}</span>
                                            </div>
                                            <div className="tha-hero-meta-item">
                                                <span className="tha-hero-meta-icon">🆔</span>
                                                <span>Código: <strong>{empleadoSeleccionado.codigo_empleado || '—'}</strong></span>
                                            </div>
                                            <div className="tha-hero-meta-item">
                                                <span className="tha-hero-meta-icon">✉</span>
                                                <span>{empleadoSeleccionado.correo}</span>
                                            </div>
                                            <div className="tha-hero-meta-item">
                                                <span className="tha-hero-meta-icon">📞</span>
                                                <span>{p.telefono || '312 345 6789'}</span>
                                            </div>
                                            <div className="tha-hero-meta-item">
                                                <span className="tha-hero-meta-icon">📅</span>
                                                <span>Fecha de ingreso: {formatFechaLarga(p.fecha_ingreso || '2024-02-19')}</span>
                                            </div>
                                            <div className="tha-hero-meta-item">
                                                <span className="tha-hero-meta-icon">👤</span>
                                                <span>Jefe inmediato: {p.jefe_inmediato || 'Carlos Ramírez'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tabs de navegación */}
                                <div className="tha-tabs-nav">
                                    <button
                                        className={`tha-tab-btn ${tabActiva === 'general' ? 'tha-tab-btn--active' : ''}`}
                                        onClick={() => setTabActiva('general')}
                                    >
                                        Información general
                                    </button>
                                    <button
                                        className={`tha-tab-btn ${tabActiva === 'documentos' ? 'tha-tab-btn--active' : ''}`}
                                        onClick={() => setTabActiva('documentos')}
                                    >
                                        Documentos ({empleadoSeleccionado.documentos?.filter(d => d.estado === 'cargado').length || 0})
                                    </button>
                                    <button
                                        className={`tha-tab-btn ${tabActiva === 'adicional' ? 'tha-tab-btn--active' : ''}`}
                                        onClick={() => setTabActiva('adicional')}
                                    >
                                        Dotaciones ({empleadoSeleccionado.dotaciones?.length || 0})
                                    </button>
                                    <button
                                        className={`tha-tab-btn ${tabActiva === 'historial' ? 'tha-tab-btn--active' : ''}`}
                                        onClick={() => setTabActiva('historial')}
                                    >
                                        Historial
                                    </button>
                                </div>

                                {/* TAB 1: INFORMACIÓN GENERAL (Grid de 3 cards arriba + 2 cards abajo) */}
                                {tabActiva === 'general' && (
                                    <>
                                        <div className="tha-blocks-grid">
                                            {/* Card A: Información personal */}
                                            <div className="tha-info-block">
                                                <div className="tha-block-title">
                                                    <span>👤</span>
                                                    <span>Información personal</span>
                                                </div>
                                                <div className="tha-field-list">
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">📅 Fecha de nacimiento</span>
                                                        <span className="tha-field-val">{p.fecha_nacimiento ? formatFechaLarga(p.fecha_nacimiento) : '14 Jun 1990'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">📍 Ciudad</span>
                                                        <span className="tha-field-val">{p.ciudad || 'Yopal, Casanare'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">🧭 Dirección</span>
                                                        <span className="tha-field-val">{p.direccion || 'Cra 15 #24-45'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">💍 Estado civil</span>
                                                        <span className="tha-field-val">{p.estado_civil || 'Soltero'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card B: Información laboral */}
                                            <div className="tha-info-block">
                                                <div className="tha-block-title">
                                                    <span>🏢</span>
                                                    <span>Información laboral</span>
                                                </div>
                                                <div className="tha-field-list">
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">📁 Área</span>
                                                        <span className="tha-field-val">{p.area || 'Instalaciones'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">📄 Tipo de contrato</span>
                                                        <span className="tha-field-val">{p.tipo_contrato || 'Término indefinido'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">👷 Cargo</span>
                                                        <span className="tha-field-val">{p.cargo || 'Técnico Instalador'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">💵 Salario</span>
                                                        <span className="tha-field-val tha-field-val--salario">
                                                            {formatCOP(p.salario || 2350000)}
                                                        </span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">🔘 Estado laboral</span>
                                                        <span className="tha-field-val">
                                                            <span className={`tha-status-badge ${
                                                                (p.estado_laboral || 'activo') === 'activo'
                                                                    ? 'tha-status-badge--activo'
                                                                    : 'tha-status-badge--capacitacion'
                                                            }`}>
                                                                {(p.estado_laboral || 'activo').replace('_', ' ').toUpperCase()}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card C: Contacto de emergencia */}
                                            <div className="tha-info-block">
                                                <div className="tha-block-title">
                                                    <span>🚨</span>
                                                    <span>Contacto de emergencia</span>
                                                </div>
                                                <div className="tha-field-list">
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">👤 Nombre</span>
                                                        <span className="tha-field-val">{p.contacto_emergencia_nombre || 'María Herrera'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">👥 Parentesco</span>
                                                        <span className="tha-field-val">{p.contacto_emergencia_parentesco || 'Esposa'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">📞 Teléfono</span>
                                                        <span className="tha-field-val">{p.contacto_emergencia_telefono || '321 456 7890'}</span>
                                                    </div>
                                                    <div className="tha-field-row">
                                                        <span className="tha-field-label">📱 Teléfono alterno</span>
                                                        <span className="tha-field-val">{p.contacto_emergencia_telefono_alt || '313 987 6543'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Fila Inferior: Documentación + Info Adicional */}
                                        <div className="tha-blocks-grid" style={{ marginTop: '0.25rem' }}>
                                            {/* Card D: Documentación (Tabla) */}
                                            <div className="tha-info-block tha-info-block--span2">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                                    <div className="tha-block-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                                                        <span>📁</span>
                                                        <span>Documentación</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={abrirModalNuevoDocPersonalizado}
                                                        title="Crear título y subir un nuevo documento"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.4rem',
                                                            padding: '0.38rem 0.85rem',
                                                            backgroundColor: 'var(--color-navy-dark)',
                                                            color: '#FFFFFF',
                                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                                            borderRadius: '8px',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            boxShadow: '0 2px 6px rgba(7, 13, 30, 0.15)',
                                                        }}
                                                    >
                                                        <span>➕</span>
                                                        <span>Crear Título & Subir Documento</span>
                                                    </button>
                                                </div>

                                                <div className="tha-docs-table-wrap">
                                                    <table className="tha-docs-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Documento</th>
                                                                <th>Estado</th>
                                                                <th>Fecha de carga</th>
                                                                <th style={{ textAlign: 'center' }}>Acciones</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {empleadoSeleccionado.documentos?.map((doc) => {
                                                                const cargado = doc.estado === 'cargado';
                                                                return (
                                                                    <tr key={doc.id}>
                                                                        <td style={{ fontWeight: 600 }}>{doc.nombre_documento}</td>
                                                                        <td>
                                                                            <span
                                                                                className={`tha-status-badge ${
                                                                                    cargado
                                                                                        ? 'tha-status-badge--activo'
                                                                                        : 'tha-status-badge--capacitacion'
                                                                                }`}
                                                                            >
                                                                                {cargado ? 'Cargado' : 'Pendiente'}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ color: cargado ? 'inherit' : '#94A3B8' }}>
                                                                            {cargado && doc.fecha_carga
                                                                                ? formatFechaLarga(doc.fecha_carga.slice(0, 10))
                                                                                : '—'}
                                                                        </td>
                                                                        <td style={{ textAlign: 'center' }}>
                                                                            {cargado ? (
                                                                                <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                                                                    <a
                                                                                        href={doc.url_archivo}
                                                                                        target="_blank"
                                                                                        rel="noreferrer"
                                                                                        className="tha-doc-action-btn"
                                                                                        title="Descargar / Visualizar"
                                                                                    >
                                                                                        ⬇
                                                                                    </a>
                                                                                    <button
                                                                                        className="tha-doc-action-btn tha-doc-action-btn--delete"
                                                                                        title="Eliminar / Reemplazar"
                                                                                        onClick={() => handleEliminarDocumento(doc)}
                                                                                    >
                                                                                        🗑
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    className="tha-doc-action-btn"
                                                                                    title="Subir archivo"
                                                                                    onClick={() => abrirModalSubirDoc(doc)}
                                                                                >
                                                                                    ⬆
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            {/* Card E: Información adicional */}
                                            <div className="tha-info-block">
                                                <div className="tha-block-title">
                                                    <span>ℹ️</span>
                                                    <span>Información adicional</span>
                                                </div>

                                                <div className="tha-field-list">
                                                    <div>
                                                        <span className="tha-field-label">ℹ️ Observaciones</span>
                                                        <p style={{ fontSize: '0.82rem', color: 'var(--color-navy-dark)', marginTop: '0.3rem', lineHeight: 1.4 }}>
                                                            {p.observaciones || 'Técnico responsable, con buen desempeño en instalaciones y mantenimiento.'}
                                                        </p>
                                                    </div>

                                                    <hr style={{ border: 'none', borderTop: '1px solid var(--color-border-subtle)', margin: '0.35rem 0' }} />

                                                    <div>
                                                        <span className="tha-field-label">🗓️ Última actualización</span>
                                                        <div style={{ fontWeight: 600, fontSize: '0.82rem', marginTop: '0.2rem' }}>
                                                            {p.updated_at ? new Date(p.updated_at).toLocaleString('es-CO') : '24 Ago 2026 - 08:45 a.m.'}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <span className="tha-field-label">👤 Actualizado por</span>
                                                        <div style={{ fontWeight: 600, fontSize: '0.82rem', marginTop: '0.2rem' }}>
                                                            {p.updated_by_nombre || 'Administrador'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card F: Evaluación de Desempeño (1-5 estrellas) */}
                                        <div className="tha-info-block tha-info-block--full" style={{ marginTop: '1rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                                                <div className="tha-block-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                                                    <span>⭐</span>
                                                    <span>Evaluación de Desempeño del Técnico</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="tha-btn-nuevo"
                                                    style={{ padding: '0.42rem 0.95rem', fontSize: '0.8rem', background: '#D97706', borderColor: '#B45309' }}
                                                    onClick={() => setMostrarModalEvaluacion(true)}
                                                >
                                                    ⭐ Calificar Desempeño
                                                </button>
                                            </div>

                                            {/* Resumen & Métricas */}
                                            {(!empleadoSeleccionado.evaluaciones || empleadoSeleccionado.evaluaciones.length === 0) ? (
                                                <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px dashed var(--color-border)' }}>
                                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🌟</div>
                                                    <p style={{ fontWeight: 600, color: 'var(--color-navy-dark)', margin: 0 }}>Sin evaluaciones de desempeño registradas</p>
                                                    <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '0.35rem' }}>
                                                        Evalúa la puntualidad, desempeño técnico, actitud, protocolo SST y comunicación de este técnico (1 a 5 estrellas).
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className="tha-btn-nuevo"
                                                        style={{ marginTop: '0.75rem', padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                                                        onClick={() => setMostrarModalEvaluacion(true)}
                                                    >
                                                        Registrar primera evaluación
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    {(() => {
                                                        const evals = empleadoSeleccionado.evaluaciones;
                                                        const avgPuntualidad = (evals.reduce((a, b) => a + b.puntualidad, 0) / evals.length).toFixed(1);
                                                        const avgDesempeno = (evals.reduce((a, b) => a + b.desempeno, 0) / evals.length).toFixed(1);
                                                        const avgActitud = (evals.reduce((a, b) => a + b.actitud, 0) / evals.length).toFixed(1);
                                                        const avgProtocolo = (evals.reduce((a, b) => a + b.cumplimiento_protocolo, 0) / evals.length).toFixed(1);
                                                        const avgComunicacion = (evals.reduce((a, b) => a + b.comunicacion_reporte, 0) / evals.length).toFixed(1);
                                                        const avgGlobal = (evals.reduce((a, b) => a + b.promedio, 0) / evals.length).toFixed(1);

                                                        return (
                                                            <div className="tha-eval-summary-card">
                                                                <div className="tha-eval-global-score">
                                                                    <div className="tha-eval-score-num">{avgGlobal}</div>
                                                                    <div className="tha-eval-stars">
                                                                        {[1, 2, 3, 4, 5].map((star) => (
                                                                            <span key={star} style={{ color: star <= Math.round(Number(avgGlobal)) ? '#F59E0B' : '#CBD5E1' }}>★</span>
                                                                        ))}
                                                                    </div>
                                                                    <div className="tha-eval-count-badge">
                                                                        {evals.length} {evals.length === 1 ? 'evaluación registrada' : 'evaluaciones registradas'}
                                                                    </div>
                                                                </div>

                                                                <div className="tha-eval-factors-grid">
                                                                    <div className="tha-eval-factor-item">
                                                                        <div className="tha-factor-label">⏰ Puntualidad</div>
                                                                        <div className="tha-factor-val">{avgPuntualidad} / 5.0</div>
                                                                        <div className="tha-factor-bar"><div className="tha-factor-fill" style={{ width: `${(Number(avgPuntualidad) / 5) * 100}%` }} /></div>
                                                                    </div>
                                                                    <div className="tha-eval-factor-item">
                                                                        <div className="tha-factor-label">⚡ Desempeño Técnico</div>
                                                                        <div className="tha-factor-val">{avgDesempeno} / 5.0</div>
                                                                        <div className="tha-factor-bar"><div className="tha-factor-fill" style={{ width: `${(Number(avgDesempeno) / 5) * 100}%` }} /></div>
                                                                    </div>
                                                                    <div className="tha-eval-factor-item">
                                                                        <div className="tha-factor-label">🤝 Actitud y Servicio</div>
                                                                        <div className="tha-factor-val">{avgActitud} / 5.0</div>
                                                                        <div className="tha-factor-bar"><div className="tha-factor-fill" style={{ width: `${(Number(avgActitud) / 5) * 100}%` }} /></div>
                                                                    </div>
                                                                    <div className="tha-eval-factor-item">
                                                                        <div className="tha-factor-label">🦺 SST / Protocolo</div>
                                                                        <div className="tha-factor-val">{avgProtocolo} / 5.0</div>
                                                                        <div className="tha-factor-bar"><div className="tha-factor-fill" style={{ width: `${(Number(avgProtocolo) / 5) * 100}%` }} /></div>
                                                                    </div>
                                                                    <div className="tha-eval-factor-item">
                                                                        <div className="tha-factor-label">📱 Comunicación</div>
                                                                        <div className="tha-factor-val">{avgComunicacion} / 5.0</div>
                                                                        <div className="tha-factor-bar"><div className="tha-factor-fill" style={{ width: `${(Number(avgComunicacion) / 5) * 100}%` }} /></div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Historial de Evaluaciones */}
                                                    <div style={{ marginTop: '1.25rem' }}>
                                                        <h4 style={{ fontSize: '0.88rem', color: 'var(--color-navy-dark)', fontWeight: 700, marginBottom: '0.75rem' }}>
                                                            Histórico de Evaluaciones
                                                        </h4>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                            {empleadoSeleccionado.evaluaciones.map((ev) => (
                                                                <div key={ev.id} className="tha-eval-history-item">
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                                        <div>
                                                                            <span style={{ fontWeight: 700, color: 'var(--color-navy-dark)', fontSize: '0.9rem' }}>
                                                                                {ev.periodo || 'Evaluación Periódica'}
                                                                            </span>
                                                                            <span style={{ color: '#64748B', fontSize: '0.78rem', marginLeft: '0.5rem' }}>
                                                                                · {ev.fecha_evaluacion ? new Date(ev.fecha_evaluacion).toLocaleDateString('es-CO') : ''}
                                                                            </span>
                                                                            <span style={{ color: '#94A3B8', fontSize: '0.75rem', display: 'block', marginTop: '0.15rem' }}>
                                                                                Evaluado por: {ev.evaluador_nombre || 'Administrador'}
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#FEF3C7', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                                                                                <span style={{ color: '#D97706', fontWeight: 800, fontSize: '0.9rem' }}>{ev.promedio}</span>
                                                                                <span style={{ color: '#F59E0B' }}>★</span>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                className="tha-doc-action-btn tha-doc-action-btn--delete"
                                                                                title="Eliminar evaluación"
                                                                                onClick={() => handleEliminarEvaluacion(ev.id)}
                                                                            >
                                                                                🗑
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* Factores individuales */}
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.78rem', color: '#475569' }}>
                                                                        <span>Puntualidad: <strong style={{ color: '#F59E0B' }}>{'★'.repeat(ev.puntualidad)}</strong> ({ev.puntualidad}/5)</span>
                                                                        <span>· Desempeño: <strong style={{ color: '#F59E0B' }}>{'★'.repeat(ev.desempeno)}</strong> ({ev.desempeno}/5)</span>
                                                                        <span>· Actitud: <strong style={{ color: '#F59E0B' }}>{'★'.repeat(ev.actitud)}</strong> ({ev.actitud}/5)</span>
                                                                        <span>· Protocolo SST: <strong style={{ color: '#F59E0B' }}>{'★'.repeat(ev.cumplimiento_protocolo)}</strong> ({ev.cumplimiento_protocolo}/5)</span>
                                                                        <span>· Comunicación: <strong style={{ color: '#F59E0B' }}>{'★'.repeat(ev.comunicacion_reporte)}</strong> ({ev.comunicacion_reporte}/5)</span>
                                                                    </div>

                                                                    {ev.comentarios && (
                                                                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem', color: '#334155', fontStyle: 'italic', background: 'rgba(0,0,0,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                                                                            "{ev.comentarios}"
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* TAB 2: DOCUMENTOS (Gestor completo) */}
                                {tabActiva === 'documentos' && (
                                    <div className="tha-info-block tha-info-block--full">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div className="tha-block-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                                                <span>📂</span>
                                                <span>Expediente Digital de Documentos</span>
                                            </div>
                                            <button
                                                className="tha-btn-nuevo"
                                                style={{ padding: '0.45rem 0.95rem', fontSize: '0.8rem' }}
                                                onClick={abrirModalNuevoDocPersonalizado}
                                            >
                                                ➕ Crear Título & Subir Documento
                                            </button>
                                        </div>

                                        <div className="tha-docs-table-wrap" style={{ marginTop: '1rem' }}>
                                            <table className="tha-docs-table">
                                                <thead>
                                                    <tr>
                                                        <th>Documento</th>
                                                        <th>Estado</th>
                                                        <th>Fecha de carga</th>
                                                        <th>Cargado por</th>
                                                        <th style={{ textAlign: 'center' }}>Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {empleadoSeleccionado.documentos?.map((doc) => {
                                                        const cargado = doc.estado === 'cargado';
                                                        return (
                                                            <tr key={doc.id}>
                                                                <td style={{ fontWeight: 600 }}>{doc.nombre_documento}</td>
                                                                <td>
                                                                    <span
                                                                        className={`tha-status-badge ${
                                                                            cargado ? 'tha-status-badge--activo' : 'tha-status-badge--capacitacion'
                                                                        }`}
                                                                    >
                                                                        {cargado ? 'Cargado' : 'Pendiente'}
                                                                    </span>
                                                                </td>
                                                                <td>{cargado && doc.fecha_carga ? new Date(doc.fecha_carga).toLocaleDateString('es-CO') : '—'}</td>
                                                                <td>{doc.cargado_por_nombre || '—'}</td>
                                                                <td style={{ textAlign: 'center' }}>
                                                                    {cargado ? (
                                                                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                                                            <a
                                                                                href={doc.url_archivo}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="tha-doc-action-btn"
                                                                                title="Descargar"
                                                                            >
                                                                                ⬇
                                                                            </a>
                                                                            <button
                                                                                className="tha-doc-action-btn tha-doc-action-btn--delete"
                                                                                title="Eliminar"
                                                                                onClick={() => handleEliminarDocumento(doc)}
                                                                            >
                                                                                🗑
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            className="tha-doc-action-btn"
                                                                            title="Subir archivo"
                                                                            onClick={() => abrirModalSubirDoc(doc)}
                                                                        >
                                                                            ⬆
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: DOTACIONES Y EQUIPOS ASIGNADOS */}
                                {tabActiva === 'adicional' && (
                                    <div className="tha-info-block tha-info-block--full">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                            <div>
                                                <div className="tha-block-title" style={{ borderBottom: 'none', paddingBottom: 0, margin: 0 }}>
                                                    <span>🦺</span>
                                                    <span>Dotaciones y Equipos de Seguridad Asignados</span>
                                                </div>
                                                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
                                                    Registro de dotación, indumentaria, EPP y equipos entregados al colaborador.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                className="tha-btn-nuevo"
                                                style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }}
                                                onClick={() => setMostrarModalDotacion(true)}
                                            >
                                                ➕ Registrar Entrega de Dotación
                                            </button>
                                        </div>

                                        {/* Summary Stats of Dotaciones */}
                                        {empleadoSeleccionado.dotaciones && empleadoSeleccionado.dotaciones.length > 0 && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                                                <div style={{ background: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Total Ítems Asignados</span>
                                                    <strong style={{ fontSize: '1.2rem', color: '#1D63C8' }}>{empleadoSeleccionado.dotaciones.length}</strong>
                                                </div>
                                                <div style={{ background: '#F0FDF4', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#166534', display: 'block' }}>En Uso / Entregados</span>
                                                    <strong style={{ fontSize: '1.2rem', color: '#059669' }}>
                                                        {empleadoSeleccionado.dotaciones.filter(d => ['entregado', 'en_uso'].includes(d.estado)).length}
                                                    </strong>
                                                </div>
                                                <div style={{ background: '#FFFBEB', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#92400E', display: 'block' }}>Pendiente Reposición</span>
                                                    <strong style={{ fontSize: '1.2rem', color: '#D97706' }}>
                                                        {empleadoSeleccionado.dotaciones.filter(d => ['reposicion', 'deterioro'].includes(d.estado)).length}
                                                    </strong>
                                                </div>
                                                <div style={{ background: '#FEF2F2', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #FECACA' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#991B1B', display: 'block' }}>Devueltos / Baja</span>
                                                    <strong style={{ fontSize: '1.2rem', color: '#DC2626' }}>
                                                        {empleadoSeleccionado.dotaciones.filter(d => ['devolucion', 'baja'].includes(d.estado)).length}
                                                    </strong>
                                                </div>
                                            </div>
                                        )}

                                        {/* Table of Dotaciones */}
                                        {(!empleadoSeleccionado.dotaciones || empleadoSeleccionado.dotaciones.length === 0) ? (
                                            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px dashed var(--color-border)' }}>
                                                <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>🦺</div>
                                                <p style={{ fontWeight: 600, color: 'var(--color-navy-dark)', margin: 0 }}>No hay dotación registrada para este técnico</p>
                                                <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '0.35rem' }}>
                                                    Registra uniformes, calzado de seguridad, radios de comunicación, cascos o herramientas entregadas.
                                                </p>
                                                <button
                                                    type="button"
                                                    className="tha-btn-nuevo"
                                                    style={{ marginTop: '0.85rem', padding: '0.45rem 1.1rem', fontSize: '0.82rem' }}
                                                    onClick={() => setMostrarModalDotacion(true)}
                                                >
                                                    ➕ Asignar Dotación Inicial
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="tha-docs-table-wrap" style={{ marginTop: '0.5rem' }}>
                                                <table className="tha-docs-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Ítem / Elemento</th>
                                                            <th>Tipo</th>
                                                            <th>Talla / Ref</th>
                                                            <th>Cant.</th>
                                                            <th>Fecha Entrega</th>
                                                            <th>Fecha Reposición</th>
                                                            <th>Estado</th>
                                                            <th>Entregado Por</th>
                                                            <th style={{ textAlign: 'center' }}>Acciones</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {empleadoSeleccionado.dotaciones.map((dot) => {
                                                            const badgeClass =
                                                                dot.estado === 'entregado' || dot.estado === 'en_uso'
                                                                    ? 'tha-status-badge--activo'
                                                                    : dot.estado === 'reposicion' || dot.estado === 'deterioro'
                                                                    ? 'tha-status-badge--capacitacion'
                                                                    : 'tha-status-badge--inactivo';

                                                            const iconItem =
                                                                dot.tipo_item === 'calzado' ? '🥾' :
                                                                dot.tipo_item === 'uniforme' ? '👕' :
                                                                dot.tipo_item === 'seguridad_epp' ? '🦺' :
                                                                dot.tipo_item === 'comunicacion' ? '📻' :
                                                                dot.tipo_item === 'herramientas' ? '🧰' : '📦';

                                                            return (
                                                                <tr key={dot.id}>
                                                                    <td>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                            <span style={{ fontSize: '1.2rem' }}>{iconItem}</span>
                                                                            <div>
                                                                                <div style={{ fontWeight: 600, color: 'var(--color-navy-dark)' }}>{dot.item_nombre}</div>
                                                                                {dot.observaciones && (
                                                                                    <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{dot.observaciones}</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <span style={{ textTransform: 'capitalize', fontSize: '0.8rem', color: '#475569' }}>
                                                                            {dot.tipo_item?.replace('_', ' ') || 'General'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ fontWeight: 500 }}>{dot.talla || 'Única / N/A'}</td>
                                                                    <td><strong>{dot.cantidad || 1}</strong></td>
                                                                    <td>{dot.fecha_entrega ? new Date(dot.fecha_entrega).toLocaleDateString('es-CO') : '—'}</td>
                                                                    <td>
                                                                        {dot.fecha_reposicion ? (
                                                                            <span style={{ color: new Date(dot.fecha_reposicion) < new Date() ? '#DC2626' : '#2563EB', fontWeight: 500 }}>
                                                                                {new Date(dot.fecha_reposicion).toLocaleDateString('es-CO')}
                                                                            </span>
                                                                        ) : '—'}
                                                                    </td>
                                                                    <td>
                                                                        <select
                                                                            className={`tha-status-badge ${badgeClass}`}
                                                                            value={dot.estado}
                                                                            onChange={(e) => handleCambiarEstadoDotacion(dot.id, e.target.value)}
                                                                            style={{ border: 'none', cursor: 'pointer', fontWeight: 600, outline: 'none' }}
                                                                            title="Cambiar estado de dotación"
                                                                        >
                                                                            <option value="entregado">Entregado</option>
                                                                            <option value="en_uso">En Uso</option>
                                                                            <option value="deterioro">Deterioro</option>
                                                                            <option value="reposicion">Reposición</option>
                                                                            <option value="devolucion">Devolución</option>
                                                                            <option value="baja">Baja</option>
                                                                        </select>
                                                                    </td>
                                                                    <td style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                                                        {dot.entregado_por_nombre || 'Administrador'}
                                                                    </td>
                                                                    <td style={{ textAlign: 'center' }}>
                                                                        <button
                                                                            type="button"
                                                                            className="tha-doc-action-btn tha-doc-action-btn--delete"
                                                                            title="Eliminar registro"
                                                                            onClick={() => handleEliminarDotacion(dot.id, dot.item_nombre)}
                                                                        >
                                                                            🗑
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* Vacaciones & Notas complementarias */}
                                        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem' }}>
                                            <div className="tha-block-title">
                                                <span>🏖️</span>
                                                <span>Control de Vacaciones y Observaciones Generales</span>
                                            </div>
                                            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                                    <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Días de vacaciones disponibles</span>
                                                        <strong style={{ fontSize: '1.2rem', color: '#1D63C8' }}>{p.dias_vacaciones_disponibles ?? 12} días</strong>
                                                    </div>
                                                    <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Días de vacaciones tomados</span>
                                                        <strong style={{ fontSize: '1.2rem', color: '#059669' }}>{p.dias_vacaciones_tomados ?? 3} días</strong>
                                                    </div>
                                                    <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Días de vacaciones programados</span>
                                                        <strong style={{ fontSize: '1.2rem', color: '#D97706' }}>{p.dias_vacaciones_programados ?? 0} días</strong>
                                                    </div>
                                                </div>
                                                <p style={{ background: 'var(--color-bg-subtle)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                                                    <strong>Notas generales:</strong> {p.observaciones || 'Sin observaciones adicionales registradas.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 4: HISTORIAL (Timeline de auditoría) */}
                                {tabActiva === 'historial' && (
                                    <div className="tha-info-block tha-info-block--full">
                                        <div className="tha-block-title">
                                            <span>📜</span>
                                            <span>Historial de Modificaciones</span>
                                        </div>

                                        <div className="tha-timeline" style={{ marginTop: '1.5rem' }}>
                                            {(!empleadoSeleccionado.historial || empleadoSeleccionado.historial.length === 0) ? (
                                                <div style={{ color: '#64748B', fontSize: '0.85rem' }}>
                                                    No se registran cambios recientes para este empleado.
                                                </div>
                                            ) : (
                                                empleadoSeleccionado.historial.map((h) => (
                                                    <div key={h.id} className="tha-timeline-item">
                                                        <div className="tha-timeline-dot" />
                                                        <div className="tha-timeline-header">
                                                            <span className="tha-timeline-field">{h.campo_modificado}</span>
                                                            <span className="tha-timeline-date">
                                                                {new Date(h.created_at).toLocaleString('es-CO')}
                                                            </span>
                                                        </div>
                                                        <div className="tha-timeline-body">
                                                            <span>Por <strong>{h.actor_nombre}</strong> ({h.actor_rol}): </span>
                                                            <span style={{ color: '#DC2626', textDecoration: 'line-through' }}>{h.valor_anterior || '—'}</span>
                                                            <span> → </span>
                                                            <span style={{ color: '#059669', fontWeight: 600 }}>{h.valor_nuevo || '—'}</span>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>

            {/* ── MODAL NUEVO EMPLEADO ── */}
            {mostrarNuevoModal && (
                <div className="tha-modal-overlay">
                    <div className="tha-modal-card">
                        <div className="tha-modal-header">
                            <h3 className="tha-modal-title">Registrar Nuevo Empleado</h3>
                            <button className="tha-modal-close" onClick={() => setMostrarNuevoModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleCrearEmpleado}>
                            <div className="tha-modal-body">
                                <div className="tha-form-grid-2">
                                    <div className="tha-form-group">
                                        <label>Nombre Completo *</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            required
                                            value={formNuevo.nombre}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
                                            placeholder="Ej: Jorge Enrique Ochoa"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Correo Electrónico *</label>
                                        <input
                                            type="email"
                                            className="tha-form-input"
                                            required
                                            value={formNuevo.correo}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, correo: e.target.value })}
                                            placeholder="empleado@gsbank.com"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Cédula de Ciudadanía *</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            required
                                            value={formNuevo.cedula}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, cedula: e.target.value })}
                                            placeholder="Ej: 79510912"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Código de Empleado</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formNuevo.codigo_empleado}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, codigo_empleado: e.target.value })}
                                            placeholder="Ej: 100045"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Cargo *</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            required
                                            value={formNuevo.cargo}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, cargo: e.target.value })}
                                            placeholder="Técnico Instalador"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Área *</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            required
                                            value={formNuevo.area}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, area: e.target.value })}
                                            placeholder="Instalaciones"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Tipo de Contrato</label>
                                        <select
                                            className="tha-form-select"
                                            value={formNuevo.tipo_contrato}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, tipo_contrato: e.target.value })}
                                        >
                                            <option value="Término indefinido">Término indefinido</option>
                                            <option value="Término fijo">Término fijo</option>
                                            <option value="Prestación de servicios">Prestación de servicios</option>
                                            <option value="Obra o labor">Obra o labor</option>
                                        </select>
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Salario (COP)</label>
                                        <input
                                            type="number"
                                            className="tha-form-input"
                                            value={formNuevo.salario}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, salario: e.target.value })}
                                            placeholder="2350000"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Teléfono</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formNuevo.telefono}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, telefono: e.target.value })}
                                            placeholder="312 345 6789"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Ciudad</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formNuevo.ciudad}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, ciudad: e.target.value })}
                                            placeholder="Bogotá / Yopal"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Jefe Inmediato</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formNuevo.jefe_inmediato}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, jefe_inmediato: e.target.value })}
                                            placeholder="Carlos Ramírez"
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Estado Laboral</label>
                                        <select
                                            className="tha-form-select"
                                            value={formNuevo.estado_laboral}
                                            onChange={(e) => setFormNuevo({ ...formNuevo, estado_laboral: e.target.value })}
                                        >
                                            <option value="activo">Activo</option>
                                            <option value="en_capacitacion">En capacitación</option>
                                            <option value="inactivo">Inactivo</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="tha-form-group">
                                    <label>Observaciones de Ingreso</label>
                                    <textarea
                                        className="tha-form-textarea"
                                        rows={3}
                                        value={formNuevo.observaciones}
                                        onChange={(e) => setFormNuevo({ ...formNuevo, observaciones: e.target.value })}
                                        placeholder="Detalles sobre el perfil y experiencia del empleado..."
                                    />
                                </div>
                            </div>

                            <div className="tha-modal-footer">
                                <button type="button" className="tha-btn-cancel" onClick={() => setMostrarNuevoModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="tha-btn-submit">
                                    Crear Empleado
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL EDITAR INFORMACIÓN ── */}
            {mostrarEditarModal && (
                <div className="tha-modal-overlay">
                    <div className="tha-modal-card">
                        <div className="tha-modal-header">
                            <h3 className="tha-modal-title">Editar Ficha del Empleado</h3>
                            <button className="tha-modal-close" onClick={() => setMostrarEditarModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleGuardarEdicion}>
                            <div className="tha-modal-body">
                                <div className="tha-form-grid-2">
                                    <div className="tha-form-group">
                                        <label>Nombre Completo</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.nombre}
                                            onChange={(e) => setFormEditar({ ...formEditar, nombre: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Correo Electrónico</label>
                                        <input
                                            type="email"
                                            className="tha-form-input"
                                            value={formEditar.correo}
                                            onChange={(e) => setFormEditar({ ...formEditar, correo: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Cédula</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.cedula}
                                            onChange={(e) => setFormEditar({ ...formEditar, cedula: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Código de Empleado</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.codigo_empleado}
                                            onChange={(e) => setFormEditar({ ...formEditar, codigo_empleado: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Cargo</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.cargo}
                                            onChange={(e) => setFormEditar({ ...formEditar, cargo: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Área</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.area}
                                            onChange={(e) => setFormEditar({ ...formEditar, area: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Tipo de Contrato</label>
                                        <select
                                            className="tha-form-select"
                                            value={formEditar.tipo_contrato}
                                            onChange={(e) => setFormEditar({ ...formEditar, tipo_contrato: e.target.value })}
                                        >
                                            <option value="Término indefinido">Término indefinido</option>
                                            <option value="Término fijo">Término fijo</option>
                                            <option value="Prestación de servicios">Prestación de servicios</option>
                                            <option value="Obra o labor">Obra o labor</option>
                                        </select>
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Salario (COP) [Confidencial]</label>
                                        <input
                                            type="number"
                                            className="tha-form-input"
                                            value={formEditar.salario}
                                            onChange={(e) => setFormEditar({ ...formEditar, salario: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Fecha de Nacimiento</label>
                                        <input
                                            type="date"
                                            className="tha-form-input"
                                            value={formEditar.fecha_nacimiento || ''}
                                            onChange={(e) => setFormEditar({ ...formEditar, fecha_nacimiento: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Ciudad</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.ciudad}
                                            onChange={(e) => setFormEditar({ ...formEditar, ciudad: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Dirección</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.direccion}
                                            onChange={(e) => setFormEditar({ ...formEditar, direccion: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Estado Civil</label>
                                        <select
                                            className="tha-form-select"
                                            value={formEditar.estado_civil}
                                            onChange={(e) => setFormEditar({ ...formEditar, estado_civil: e.target.value })}
                                        >
                                            <option value="Soltero">Soltero</option>
                                            <option value="Casado">Casado</option>
                                            <option value="Unión libre">Unión libre</option>
                                            <option value="Divorciado">Divorciado</option>
                                        </select>
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Teléfono Personal</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.telefono}
                                            onChange={(e) => setFormEditar({ ...formEditar, telefono: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Jefe Inmediato</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            value={formEditar.jefe_inmediato}
                                            onChange={(e) => setFormEditar({ ...formEditar, jefe_inmediato: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-navy-dark)', marginBottom: '0.75rem' }}>
                                        🚨 Contacto de Emergencia
                                    </h4>
                                    <div className="tha-form-grid-2">
                                        <div className="tha-form-group">
                                            <label>Nombre de Contacto</label>
                                            <input
                                                type="text"
                                                className="tha-form-input"
                                                value={formEditar.contacto_emergencia_nombre}
                                                onChange={(e) => setFormEditar({ ...formEditar, contacto_emergencia_nombre: e.target.value })}
                                            />
                                        </div>
                                        <div className="tha-form-group">
                                            <label>Parentesco</label>
                                            <input
                                                type="text"
                                                className="tha-form-input"
                                                value={formEditar.contacto_emergencia_parentesco}
                                                onChange={(e) => setFormEditar({ ...formEditar, contacto_emergencia_parentesco: e.target.value })}
                                            />
                                        </div>
                                        <div className="tha-form-group">
                                            <label>Teléfono de Emergencia</label>
                                            <input
                                                type="text"
                                                className="tha-form-input"
                                                value={formEditar.contacto_emergencia_telefono}
                                                onChange={(e) => setFormEditar({ ...formEditar, contacto_emergencia_telefono: e.target.value })}
                                            />
                                        </div>
                                        <div className="tha-form-group">
                                            <label>Teléfono Alterno</label>
                                            <input
                                                type="text"
                                                className="tha-form-input"
                                                value={formEditar.contacto_emergencia_telefono_alt}
                                                onChange={(e) => setFormEditar({ ...formEditar, contacto_emergencia_telefono_alt: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="tha-form-group" style={{ marginTop: '0.5rem' }}>
                                    <label>Observaciones</label>
                                    <textarea
                                        className="tha-form-textarea"
                                        rows={3}
                                        value={formEditar.observaciones}
                                        onChange={(e) => setFormEditar({ ...formEditar, observaciones: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="tha-modal-footer">
                                <button type="button" className="tha-btn-cancel" onClick={() => setMostrarEditarModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="tha-btn-submit">
                                    Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL CARGAR DOCUMENTO ── */}
            {mostrarCargarDocModal && docSeleccionadoParaCarga && (
                <div className="tha-modal-overlay">
                    <div className="tha-modal-card" style={{ maxWidth: '480px' }}>
                        <div className="tha-modal-header">
                            <h3 className="tha-modal-title">
                                {docSeleccionadoParaCarga.esPersonalizado || !docSeleccionadoParaCarga.nombre_documento
                                    ? '➕ Subir Nuevo Documento'
                                    : `Cargar ${docSeleccionadoParaCarga.nombre_documento}`}
                            </h3>
                            <button className="tha-modal-close" onClick={() => setMostrarCargarDocModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleSubirDocumento}>
                            <div className="tha-modal-body">
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                    {docSeleccionadoParaCarga.esPersonalizado
                                        ? 'Ingresa el título o nombre del documento y adjunta el archivo en formato PDF o Imagen para asociarlo al expediente de '
                                        : 'Seleccione el archivo en formato PDF o Imagen (JPG, PNG) para asociar al expediente de '}
                                    <strong>{empleadoSeleccionado.nombre}</strong>.
                                </p>

                                <div className="tha-form-group">
                                    <label>
                                        Título / Nombre del Documento <span style={{ color: '#DC2626' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="tha-form-input"
                                        placeholder="Ej. Certificado Alturas, Acuerdo Confidencialidad, Certificado Bancario..."
                                        value={docSeleccionadoParaCarga.nombre_documento}
                                        onChange={(e) => setDocSeleccionadoParaCarga({ ...docSeleccionadoParaCarga, nombre_documento: e.target.value })}
                                        required
                                        autoFocus={docSeleccionadoParaCarga.esPersonalizado}
                                    />
                                </div>

                                <div
                                    style={{
                                        border: '2px dashed var(--color-border)',
                                        borderRadius: '8px',
                                        padding: '1.5rem',
                                        textAlign: 'center',
                                        backgroundColor: 'var(--color-bg-subtle)',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                                        onChange={(e) => setArchivoSubir(e.target.files[0])}
                                    />
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-navy-dark)' }}>
                                        {archivoSubir ? archivoSubir.name : 'Haz clic para seleccionar archivo'}
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                        PDF, PNG, JPG (máx. 15MB)
                                    </span>
                                </div>
                            </div>

                            <div className="tha-modal-footer">
                                <button type="button" className="tha-btn-cancel" onClick={() => setMostrarCargarDocModal(false)}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="tha-btn-submit"
                                    disabled={!archivoSubir || !docSeleccionadoParaCarga.nombre_documento?.trim() || subiendoDoc}
                                >
                                    {subiendoDoc ? 'Subiendo...' : 'Subir Documento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL REGISTRAR ENTREGA DE DOTACIÓN ── */}
            {mostrarModalDotacion && (
                <div className="tha-modal-overlay">
                    <div className="tha-modal-card">
                        <div className="tha-modal-header">
                            <h3 className="tha-modal-title">🦺 Registrar Entrega de Dotación</h3>
                            <button className="tha-modal-close" onClick={() => setMostrarModalDotacion(false)}>×</button>
                        </div>
                        <form onSubmit={handleCrearDotacion}>
                            <div className="tha-modal-body">
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                    Asigna un nuevo ítem de dotación o equipo a <strong>{empleadoSeleccionado?.nombre}</strong>.
                                </p>

                                <div className="tha-form-group">
                                    <label>Nombre del Ítem / Elemento <span style={{ color: '#DC2626' }}>*</span></label>
                                    <input
                                        type="text"
                                        className="tha-form-input"
                                        placeholder="Ej. Botas Dieléctricas, Chaleco Reflectivo, Radio Motorola, Arnés..."
                                        value={formDotacion.item_nombre}
                                        onChange={(e) => setFormDotacion({ ...formDotacion, item_nombre: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="tha-form-group">
                                        <label>Tipo de Elemento</label>
                                        <select
                                            className="tha-form-select"
                                            value={formDotacion.tipo_item}
                                            onChange={(e) => setFormDotacion({ ...formDotacion, tipo_item: e.target.value })}
                                        >
                                            <option value="uniforme">👕 Uniforme</option>
                                            <option value="calzado">🥾 Calzado / Botas</option>
                                            <option value="seguridad_epp">🦺 EPP / Seguridad</option>
                                            <option value="comunicacion">📻 Comunicación</option>
                                            <option value="herramientas">🧰 Herramientas</option>
                                            <option value="otro">📦 Otro</option>
                                        </select>
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Talla o Referencia</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            placeholder="Ej. Talla 40, L, XL, SN: 84920..."
                                            value={formDotacion.talla}
                                            onChange={(e) => setFormDotacion({ ...formDotacion, talla: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="tha-form-group">
                                        <label>Cantidad <span style={{ color: '#DC2626' }}>*</span></label>
                                        <input
                                            type="number"
                                            min="1"
                                            className="tha-form-input"
                                            value={formDotacion.cantidad}
                                            onChange={(e) => setFormDotacion({ ...formDotacion, cantidad: parseInt(e.target.value) || 1 })}
                                            required
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Estado Inicial</label>
                                        <select
                                            className="tha-form-select"
                                            value={formDotacion.estado}
                                            onChange={(e) => setFormDotacion({ ...formDotacion, estado: e.target.value })}
                                        >
                                            <option value="entregado">Entregado</option>
                                            <option value="en_uso">En Uso</option>
                                            <option value="reposicion">Reposición</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="tha-form-group">
                                        <label>Fecha de Entrega <span style={{ color: '#DC2626' }}>*</span></label>
                                        <input
                                            type="date"
                                            className="tha-form-input"
                                            value={formDotacion.fecha_entrega}
                                            onChange={(e) => setFormDotacion({ ...formDotacion, fecha_entrega: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Fecha Estimada Reposición</label>
                                        <input
                                            type="date"
                                            className="tha-form-input"
                                            value={formDotacion.fecha_reposicion}
                                            onChange={(e) => setFormDotacion({ ...formDotacion, fecha_reposicion: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="tha-form-group">
                                    <label>Observaciones / Detalles</label>
                                    <textarea
                                        className="tha-form-input"
                                        rows="2"
                                        placeholder="Detalles sobre marca, estado de recepción, observaciones..."
                                        value={formDotacion.observaciones}
                                        onChange={(e) => setFormDotacion({ ...formDotacion, observaciones: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="tha-modal-footer">
                                <button type="button" className="tha-btn-cancel" onClick={() => setMostrarModalDotacion(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="tha-btn-submit" disabled={guardandoDotacion || !formDotacion.item_nombre.trim()}>
                                    {guardandoDotacion ? 'Guardando...' : 'Registrar Dotación'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL EVALUACIÓN DE DESEMPEÑO (1-5 ESTRELLAS) ── */}
            {mostrarModalEvaluacion && (
                <div className="tha-modal-overlay">
                    <div className="tha-modal-card tha-modal-card--eval">
                        <div className="tha-modal-header">
                            <h3 className="tha-modal-title">⭐ Evaluar Desempeño del Técnico</h3>
                            <button className="tha-modal-close" onClick={() => setMostrarModalEvaluacion(false)}>×</button>
                        </div>
                        <form onSubmit={handleCrearEvaluacion}>
                            <div className="tha-modal-body">
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                    Califica a <strong>{empleadoSeleccionado?.nombre}</strong> en cada uno de los factores evaluables (de 1 a 5 estrellas).
                                </p>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div className="tha-form-group">
                                        <label>Periodo de Evaluación</label>
                                        <input
                                            type="text"
                                            className="tha-form-input"
                                            placeholder="Ej. 2026 - Trimestre 1, Evaluación Mensual..."
                                            value={formEvaluacion.periodo}
                                            onChange={(e) => setFormEvaluacion({ ...formEvaluacion, periodo: e.target.value })}
                                        />
                                    </div>
                                    <div className="tha-form-group">
                                        <label>Fecha de Evaluación</label>
                                        <input
                                            type="date"
                                            className="tha-form-input"
                                            value={formEvaluacion.fecha_evaluacion}
                                            onChange={(e) => setFormEvaluacion({ ...formEvaluacion, fecha_evaluacion: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Calificación interactiva de 5 factores */}
                                <div className="tha-star-factors-list">
                                    {[
                                        { key: 'puntualidad', label: '⏰ Puntualidad y Asistencia', desc: 'Llegada a tiempo a servicios, cumplimiento de horarios.' },
                                        { key: 'desempeno', label: '⚡ Desempeño y Calidad Técnica', desc: 'Calidad en instalaciones, resolución efectiva de fallas.' },
                                        { key: 'actitud', label: '🤝 Actitud y Servicio al Cliente', desc: 'Trato respetuoso, proactividad y disposición con el cliente.' },
                                        { key: 'cumplimiento_protocolo', label: '🦺 Protocolo de Seguridad & SST', desc: 'Uso de EPPs, seguimiento de normas de seguridad.' },
                                        { key: 'comunicacion_reporte', label: '📱 Comunicación y Reporte', desc: 'Envío oportuno de informes, soporte fotográfico y bitácora.' },
                                    ].map((factor) => (
                                        <div key={factor.key} className="tha-star-factor-row">
                                            <div>
                                                <strong style={{ fontSize: '0.88rem', color: 'var(--color-navy-dark)', display: 'block' }}>{factor.label}</strong>
                                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{factor.desc}</span>
                                            </div>
                                            <div className="tha-star-picker">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <button
                                                        key={star}
                                                        type="button"
                                                        className={`tha-star-btn ${star <= formEvaluacion[factor.key] ? 'tha-star-btn--active' : ''}`}
                                                        onClick={() => setFormEvaluacion({ ...formEvaluacion, [factor.key]: star })}
                                                        title={`${star} estrellas`}
                                                    >
                                                        ★
                                                    </button>
                                                ))}
                                                <span className="tha-star-score-val">{formEvaluacion[factor.key]} / 5</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Promedio en tiempo real */}
                                {(() => {
                                    const sum = formEvaluacion.puntualidad + formEvaluacion.desempeno + formEvaluacion.actitud + formEvaluacion.cumplimiento_protocolo + formEvaluacion.comunicacion_reporte;
                                    const prom = (sum / 5).toFixed(1);
                                    return (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FEF3C7', padding: '0.75rem 1rem', borderRadius: '8px', marginTop: '1rem' }}>
                                            <span style={{ fontWeight: 600, color: '#92400E', fontSize: '0.88rem' }}>Calificación Promedio Calculada:</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#B45309' }}>{prom}</span>
                                                <span style={{ color: '#F59E0B', fontSize: '1.2rem' }}>★</span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div className="tha-form-group" style={{ marginTop: '1rem' }}>
                                    <label>Observaciones y Retroalimentación</label>
                                    <textarea
                                        className="tha-form-input"
                                        rows="3"
                                        placeholder="Aspectos positivos, recomendaciones de mejora para el técnico..."
                                        value={formEvaluacion.comentarios}
                                        onChange={(e) => setFormEvaluacion({ ...formEvaluacion, comentarios: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="tha-modal-footer">
                                <button type="button" className="tha-btn-cancel" onClick={() => setMostrarModalEvaluacion(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="tha-btn-submit" disabled={guardandoEvaluacion}>
                                    {guardandoEvaluacion ? 'Guardando...' : 'Guardar Evaluación'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
