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

    async function handleSubirDocumento(e) {
        e.preventDefault();
        if (!archivoSubir || !docSeleccionadoParaCarga) return;
        setSubiendoDoc(true);
        setError('');
        try {
            await subirDocumentoTalentoHumano(
                empleadoSeleccionado.id,
                archivoSubir,
                docSeleccionadoParaCarga.tipo_documento,
                docSeleccionadoParaCarga.nombre_documento
            );
            setMostrarCargarDocModal(false);
            setMensajeFeedback(`✅ Documento "${docSeleccionadoParaCarga.nombre_documento}" cargado con éxito.`);
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
            setMensajeFeedback(`Documento "${doc.nombre_documento}" restaurado a pendiente.`);
            cargarFichaEmpleado(empleadoSeleccionado.id);
        } catch (err) {
            setError(formatApiError(err, 'Error al eliminar el documento.'));
        }
    }

    const NAV_ITEMS_ADMIN = [
        { id: 'inicio', label: 'Inicio', icon: '🏠', action: () => navigate('/admin') },
        { id: 'usuarios', label: 'Usuarios', icon: '👤', action: () => navigate(user?.rol === 'superadmin' ? '/admin/usuarios' : `/admin/personal/${user?.id}`) },
        { id: 'talento-humano', label: 'Talento Humano', icon: '👥', active: true },
        { id: 'viaticos', label: 'Viáticos', icon: '💼', action: () => navigate('/admin') },
        { id: 'asignaciones', label: 'Asignaciones', icon: '📋', action: () => navigate('/admin/asignaciones') },
        { id: 'auditoria', label: 'Auditoría', icon: '📊', action: () => navigate('/admin/auditoria') },
        { id: 'cuentas-cobro', label: 'Cuenta de cobro', icon: '💵', action: () => navigate('/admin/cuentas-cobro') },
    ];

    const p = empleadoSeleccionado?.perfil || {};
    const initHero = iniciales(empleadoSeleccionado?.nombre || 'E');

    return (
        <div className="tha-root">
            {/* ── SIDEBAR CORPORATIVO ── */}
            <aside className="tha-sidebar">
                <div className="tha-sidebar-brand" onClick={() => navigate('/admin')}>
                    <img src={logoGSB} alt="Global Security Bank" className="tha-sidebar-logo" />
                    <div className="tha-brand-text">
                        <span className="tha-brand-title">Global Security Bank</span>
                        <span className="tha-brand-sub">Plataforma de Viáticos</span>
                    </div>
                </div>

                <div className="tha-sidebar-user">
                    <div className="tha-user-avatar">
                        {iniciales(user?.nombre || user?.correo || 'AD')}
                    </div>
                    <div>
                        <div className="tha-user-name">{user?.nombre || 'Administrador'}</div>
                        <div className="tha-user-role">
                            {user?.rol === 'superadmin' ? 'Super Admin' : 'Administrador'}
                        </div>
                    </div>
                </div>

                <nav className="tha-sidebar-nav">
                    {NAV_ITEMS_ADMIN.map((item) => (
                        <button
                            key={item.id}
                            className={`tha-nav-item ${item.active ? 'tha-nav-item--active' : ''}`}
                            onClick={item.action}
                        >
                            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                            <span className="tha-nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="tha-sidebar-footer">
                    <button
                        className="tha-logout-btn"
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                    >
                        <span>🚪</span>
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            </aside>

            {/* ── CONTENIDO PRINCIPAL ── */}
            <main className="tha-content-wrapper">
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
                                        Información adicional
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
                                                <div className="tha-block-title">
                                                    <span>📁</span>
                                                    <span>Documentación</span>
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
                                                onClick={() => {
                                                    setDocSeleccionadoParaCarga({ tipo_documento: 'otro', nombre_documento: 'Otro Documento' });
                                                    setArchivoSubir(null);
                                                    setMostrarCargarDocModal(true);
                                                }}
                                            >
                                                ➕ Subir nuevo documento
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

                                {/* TAB 3: INFORMACIÓN ADICIONAL */}
                                {tabActiva === 'adicional' && (
                                    <div className="tha-info-block tha-info-block--full">
                                        <div className="tha-block-title">
                                            <span>📝</span>
                                            <span>Notas y Observaciones de Gestión Humana</span>
                                        </div>

                                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <p style={{ background: 'var(--color-bg-subtle)', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                                {p.observaciones || 'Sin observaciones registradas para este colaborador.'}
                                            </p>

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
                                Cargar {docSeleccionadoParaCarga.nombre_documento}
                            </h3>
                            <button className="tha-modal-close" onClick={() => setMostrarCargarDocModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleSubirDocumento}>
                            <div className="tha-modal-body">
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    Seleccione el archivo en formato <strong>PDF</strong> o <strong>Imagen (JPG, PNG)</strong> para asociar al expediente de <strong>{empleadoSeleccionado.nombre}</strong>.
                                </p>

                                <div className="tha-form-group">
                                    <label>Nombre del Documento</label>
                                    <input
                                        type="text"
                                        className="tha-form-input"
                                        value={docSeleccionadoParaCarga.nombre_documento}
                                        onChange={(e) => setDocSeleccionadoParaCarga({ ...docSeleccionadoParaCarga, nombre_documento: e.target.value })}
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
                                    disabled={!archivoSubir || subiendoDoc}
                                >
                                    {subiendoDoc ? 'Subiendo...' : 'Subir Documento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
