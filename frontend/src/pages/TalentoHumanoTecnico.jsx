import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import TecnicoLayout from '../components/TecnicoLayout';
import { formatFechaLarga, iniciales } from '../utils/personal';
import { formatApiError } from '../utils/formatError';
import './TalentoHumanoTecnico.css';

export default function TalentoHumanoTecnico() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [perfilCompleto, setPerfilCompleto] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mensajeFeedback, setMensajeFeedback] = useState('');

    // Modales de autoservicio
    const [modalAbierto, setModalAbierto] = useState(null); // 'info_laboral', 'documentos', 'solicitudes', 'vacaciones', 'formacion', 'evaluaciones', 'comunicaciones', 'solicitar_actualizacion'
    const [tipoSolicitud, setTipoSolicitud] = useState('actualizacion_datos');
    const [asuntoSolicitud, setAsuntoSolicitud] = useState('');
    const [mensajeSolicitud, setMensajeSolicitud] = useState('');
    const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);

    async function cargarFicha() {
        setLoading(true);
        setError('');
        try {
            const { data } = await api.get('/talento-humano/me');
            setPerfilCompleto(data);
        } catch (err) {
            setError(formatApiError(err, 'No se pudo cargar la información de Talento Humano.'));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        cargarFicha();
    }, []);

    async function handleEnviarSolicitud(e) {
        e.preventDefault();
        if (!asuntoSolicitud || !mensajeSolicitud) return;
        setEnviandoSolicitud(true);
        setError('');
        try {
            await api.post('/talento-humano/solicitudes', {
                tipo: tipoSolicitud,
                asunto: asuntoSolicitud,
                mensaje: mensajeSolicitud,
            });
            setModalAbierto(null);
            setAsuntoSolicitud('');
            setMensajeSolicitud('');
            setMensajeFeedback('✅ Tu solicitud ha sido enviada exitosamente a Talento Humano.');
            cargarFicha();
        } catch (err) {
            setError(formatApiError(err, 'Error al enviar la solicitud.'));
        } finally {
            setEnviandoSolicitud(false);
        }
    }

    function abrirSolicitudConTipo(tipo, asuntoDefecto = '') {
        setTipoSolicitud(tipo);
        setAsuntoSolicitud(asuntoDefecto);
        setMensajeSolicitud('');
        setModalAbierto('solicitar_actualizacion');
    }

    const p = perfilCompleto?.perfil || {};
    const nombre = perfilCompleto?.nombre || user?.nombre || 'Técnico';
    const init = iniciales(nombre);

    // Fecha en español
    const fechaHoy = new Date().toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const fechaFormateada = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1);

    return (
        <TecnicoLayout>
            <div className="tht-container">
                {/* ── HEADER SUPERIOR ── */}
                <div className="tht-top-header">
                    <div className="tht-header-title-wrap">
                        <button className="tht-back-btn" onClick={() => navigate('/dashboard')} title="Volver al inicio">
                            ←
                        </button>
                        <div>
                            <h1 className="tht-title">Talento Humano</h1>
                            <p className="tht-subtitle">
                                Consulta tu información laboral, documentos y gestiona solicitudes.
                            </p>
                        </div>
                    </div>

                    <div className="tht-date-pill">
                        <span>📅</span>
                        <span>{fechaFormateada}</span>
                    </div>
                </div>

                {mensajeFeedback && (
                    <div style={{ background: '#D1FAE5', border: '1px solid #059669', color: '#065F46', padding: '0.85rem 1.25rem', borderRadius: '10px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{mensajeFeedback}</span>
                        <button onClick={() => setMensajeFeedback('')} style={{ fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
                    </div>
                )}

                {error && (
                    <div style={{ background: '#FEE2E2', border: '1px solid #DC2626', color: '#991B1B', padding: '0.85rem 1.25rem', borderRadius: '10px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{error}</span>
                        <button onClick={() => setError('')} style={{ fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B' }}>
                        Cargando tu información de Talento Humano...
                    </div>
                ) : (
                    <>
                        {/* ── TARJETA EJECUTIVA DE PERFIL (HERO) ── */}
                        <div className="tht-hero-card">
                            <div className="tht-hero-avatar">{init}</div>

                            <div className="tht-hero-info">
                                <div className="tht-hero-header-row">
                                    <h2 className="tht-hero-name">{nombre}</h2>
                                    <span className="tht-hero-cargo-badge">
                                        {p.cargo || 'TÉCNICO INSTALADOR'}
                                    </span>
                                </div>

                                <div className="tht-hero-grid">
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">🪪 Cédula</span>
                                        <span className="tht-hero-val">{p.cedula || perfilCompleto?.codigo_empleado || '1000160542'}</span>
                                    </div>
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">✉ Correo</span>
                                        <span className="tht-hero-val">{perfilCompleto?.correo || user?.correo}</span>
                                    </div>
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">👷 Cargo</span>
                                        <span className="tht-hero-val">{p.cargo || 'Técnico Instalador'}</span>
                                    </div>
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">📅 Fecha de ingreso</span>
                                        <span className="tht-hero-val">{formatFechaLarga(p.fecha_ingreso || '2024-02-15')}</span>
                                    </div>
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">🏢 Área</span>
                                        <span className="tht-hero-val">{p.area || 'Instalaciones'}</span>
                                    </div>
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">📄 Tipo de contrato</span>
                                        <span className="tht-hero-val">{p.tipo_contrato || 'Término indefinido'}</span>
                                    </div>
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">🆔 Código empleado</span>
                                        <span className="tht-hero-val">{perfilCompleto?.codigo_empleado || 'GSB-TEC-012'}</span>
                                    </div>
                                    <div className="tht-hero-field">
                                        <span className="tht-hero-label">👤 Jefe inmediato</span>
                                        <span className="tht-hero-val">{p.jefe_inmediato || 'Carlos Ramírez'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="tht-hero-status-box">
                                <span className="tht-status-box-title">ESTADO LABORAL</span>
                                <div className="tht-status-box-val">
                                    <span>✓</span>
                                    <span>ACTIVO</span>
                                </div>
                            </div>
                        </div>

                        {/* ── GRID CENTRAL: HUB CARDS + WIDGETS ── */}
                        <div className="tht-main-grid">
                            {/* HUB DE TARJETAS (7 CARDS) */}
                            <div className="tht-hub-cards-grid">
                                {/* Card 1: Mi información laboral */}
                                <div className="tht-hub-card" onClick={() => setModalAbierto('info_laboral')}>
                                    <div className="tht-hub-icon-wrap tht-hub-icon--blue">
                                        <span>👤</span>
                                    </div>
                                    <div>
                                        <h3 className="tht-hub-card-title">Mi información laboral</h3>
                                        <p className="tht-hub-card-desc">
                                            Consulta tu información laboral y contractual.
                                        </p>
                                    </div>
                                    <span className="tht-hub-card-link">Ver información ›</span>
                                </div>

                                {/* Card 2: Mis documentos */}
                                <div className="tht-hub-card" onClick={() => setModalAbierto('documentos')}>
                                    <div className="tht-hub-icon-wrap tht-hub-icon--green">
                                        <span>📄</span>
                                    </div>
                                    <div>
                                        <h3 className="tht-hub-card-title">Mis documentos</h3>
                                        <p className="tht-hub-card-desc">
                                            Accede y descarga tus documentos laborales.
                                        </p>
                                    </div>
                                    <span className="tht-hub-card-link">Ver documentos ›</span>
                                </div>

                                {/* Card 3: Solicitudes a TH */}
                                <div className="tht-hub-card" onClick={() => setModalAbierto('solicitudes')}>
                                    <div className="tht-hub-icon-wrap tht-hub-icon--orange">
                                        <span>✈️</span>
                                    </div>
                                    <div>
                                        <h3 className="tht-hub-card-title">Solicitudes a TH</h3>
                                        <p className="tht-hub-card-desc">
                                            Crea y consulta solicitudes a Talento Humano.
                                        </p>
                                    </div>
                                    <span className="tht-hub-card-link">Nueva solicitud ›</span>
                                </div>

                                {/* Card 4: Vacaciones y permisos */}
                                <div className="tht-hub-card" onClick={() => setModalAbierto('vacaciones')}>
                                    <div className="tht-hub-icon-wrap tht-hub-icon--purple">
                                        <span>📅</span>
                                    </div>
                                    <div>
                                        <h3 className="tht-hub-card-title">Vacaciones y permisos</h3>
                                        <p className="tht-hub-card-desc">
                                            Consulta días disponibles y tu historial de ausencias.
                                        </p>
                                    </div>
                                    <span className="tht-hub-card-link">Ver calendario ›</span>
                                </div>

                                {/* Card 5: Formación y certificaciones */}
                                <div className="tht-hub-card" onClick={() => setModalAbierto('formacion')}>
                                    <div className="tht-hub-icon-wrap tht-hub-icon--teal">
                                        <span>🎓</span>
                                    </div>
                                    <div>
                                        <h3 className="tht-hub-card-title">Formación y certificaciones</h3>
                                        <p className="tht-hub-card-desc">
                                            Consulta tus cursos, certificaciones y vencimientos.
                                        </p>
                                    </div>
                                    <span className="tht-hub-card-link">Ver formación ›</span>
                                </div>

                                {/* Card 6: Evaluaciones */}
                                <div className="tht-hub-card" onClick={() => setModalAbierto('evaluaciones')}>
                                    <div className="tht-hub-icon-wrap tht-hub-icon--gold">
                                        <span>⭐</span>
                                    </div>
                                    <div>
                                        <h3 className="tht-hub-card-title">Evaluaciones</h3>
                                        <p className="tht-hub-card-desc">
                                            Revisa tus evaluaciones de desempeño.
                                        </p>
                                    </div>
                                    <span className="tht-hub-card-link">Ver evaluaciones ›</span>
                                </div>

                                {/* Card 7: Comunicaciones */}
                                <div className="tht-hub-card" onClick={() => setModalAbierto('comunicaciones')}>
                                    <div className="tht-hub-icon-wrap tht-hub-icon--navy">
                                        <span>📢</span>
                                    </div>
                                    <div>
                                        <h3 className="tht-hub-card-title">Comunicaciones</h3>
                                        <p className="tht-hub-card-desc">
                                            Entérate de comunicados y novedades importantes.
                                        </p>
                                    </div>
                                    <span className="tht-hub-card-link">Ver comunicaciones ›</span>
                                </div>
                            </div>

                            {/* WIDGETS LATERALES */}
                            <div className="tht-sidebar-widgets">
                                {/* Widget 1: Resumen de vacaciones */}
                                <div className="tht-widget-card">
                                    <div className="tht-widget-title">
                                        <span>🌴</span>
                                        <span>Resumen de vacaciones</span>
                                    </div>

                                    <div>
                                        <div className="tht-vacation-row">
                                            <span className="tht-vacation-label">Días disponibles</span>
                                            <span className="tht-vacation-val tht-vacation-val--green">{p.dias_vacaciones_disponibles ?? 12} días</span>
                                        </div>
                                        <div className="tht-vacation-row">
                                            <span className="tht-vacation-label">Días utilizados</span>
                                            <span className="tht-vacation-val tht-vacation-val--amber">{p.dias_vacaciones_tomados ?? 3} días</span>
                                        </div>
                                        <div className="tht-vacation-row">
                                            <span className="tht-vacation-label">Días programados</span>
                                            <span className="tht-vacation-val tht-vacation-val--blue">{p.dias_vacaciones_programados ?? 0} días</span>
                                        </div>
                                        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border-subtle)', margin: '0.4rem 0' }} />
                                        <div className="tht-vacation-row" style={{ fontWeight: 700 }}>
                                            <span>Total anual</span>
                                            <span>15 días</span>
                                        </div>
                                    </div>

                                    <button
                                        className="tht-widget-btn"
                                        onClick={() => abrirSolicitudConTipo('vacaciones', 'Solicitud de Días de Vacaciones')}
                                    >
                                        <span>📅</span>
                                        <span>Solicitar vacaciones ›</span>
                                    </button>
                                </div>

                                {/* Widget 2: Próximas capacitaciones */}
                                <div className="tht-widget-card">
                                    <div className="tht-widget-title">
                                        <span>📖</span>
                                        <span>Próximas capacitaciones</span>
                                    </div>

                                    <div className="tht-course-item">
                                        <div className="tht-course-info">
                                            <div className="tht-course-name">
                                                Seguridad en instalación de sistemas CCTV
                                            </div>
                                            <div className="tht-course-meta">
                                                Modalidad: Presencial • Duración: 4 horas
                                            </div>
                                        </div>

                                        <div className="tht-course-date-box">
                                            <div className="tht-date-num">28</div>
                                            <div className="tht-date-month">AGO</div>
                                        </div>
                                    </div>

                                    <button className="tht-widget-btn" onClick={() => setModalAbierto('formacion')}>
                                        <span>Ver todas las capacitaciones ›</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── BANNER ACCIONES RÁPIDAS (BOTTOM) ── */}
                        <div className="tht-quick-actions-bar">
                            <div className="tht-quick-header">
                                <span>⚡</span>
                                <span>Acciones rápidas</span>
                            </div>

                            <div className="tht-quick-buttons-row">
                                <button
                                    className="tht-quick-btn"
                                    onClick={() => abrirSolicitudConTipo('certificado_laboral', 'Solicitud de Certificado Laboral')}
                                >
                                    <span>📄</span>
                                    <span>Solicitar certificado laboral</span>
                                </button>

                                <button
                                    className="tht-quick-btn"
                                    onClick={() => abrirSolicitudConTipo('actualizacion_datos', 'Solicitud de Actualización de Datos Personales')}
                                >
                                    <span>👤</span>
                                    <span>Actualizar datos personales</span>
                                </button>

                                <button
                                    className="tht-quick-btn"
                                    onClick={() => abrirSolicitudConTipo('novedad', 'Reporte de Novedad Laboral')}
                                >
                                    <span>⚠️</span>
                                    <span>Reportar novedad</span>
                                </button>

                                <button
                                    className="tht-quick-btn"
                                    onClick={() => abrirSolicitudConTipo('permiso', 'Solicitud de Permiso Laboral')}
                                >
                                    <span>📅</span>
                                    <span>Solicitar permiso</span>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── MODAL 1: MI INFORMACIÓN LABORAL Y PERSONAL ── */}
            {modalAbierto === 'info_laboral' && (
                <div className="tht-modal-overlay">
                    <div className="tht-modal-card">
                        <div className="tht-modal-header">
                            <h3 className="tht-modal-title">Mi Información Laboral y Personal</h3>
                            <button className="tht-modal-close" onClick={() => setModalAbierto(null)}>×</button>
                        </div>
                        <div className="tht-modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ background: 'var(--color-bg-subtle)', padding: '1rem', borderRadius: '8px' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-navy-dark)', marginBottom: '0.6rem' }}>
                                        👤 Datos Personales
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', fontSize: '0.82rem' }}>
                                        <div><span style={{ color: '#64748B' }}>Nombre:</span> <strong>{nombre}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Cédula:</span> <strong>{p.cedula || '1000160542'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Ciudad:</span> <strong>{p.ciudad || 'Yopal, Casanare'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Dirección:</span> <strong>{p.direccion || 'Cra 15 #24-45'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Teléfono:</span> <strong>{p.telefono || '312 345 6789'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Correo:</span> <strong>{perfilCompleto?.correo}</strong></div>
                                    </div>
                                </div>

                                <div style={{ background: 'var(--color-bg-subtle)', padding: '1rem', borderRadius: '8px' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-navy-dark)', marginBottom: '0.6rem' }}>
                                        🏢 Información Contractual
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', fontSize: '0.82rem' }}>
                                        <div><span style={{ color: '#64748B' }}>Cargo:</span> <strong>{p.cargo || 'Técnico Instalador'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Área:</span> <strong>{p.area || 'Instalaciones'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Tipo de contrato:</span> <strong>{p.tipo_contrato || 'Término indefinido'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Fecha de ingreso:</span> <strong>{formatFechaLarga(p.fecha_ingreso || '2024-02-15')}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Jefe inmediato:</span> <strong>{p.jefe_inmediato || 'Carlos Ramírez'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Estado:</span> <strong style={{ color: '#059669' }}>ACTIVO</strong></div>
                                    </div>
                                </div>

                                <div style={{ background: 'var(--color-bg-subtle)', padding: '1rem', borderRadius: '8px' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-navy-dark)', marginBottom: '0.6rem' }}>
                                        🚨 Contacto de Emergencia
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', fontSize: '0.82rem' }}>
                                        <div><span style={{ color: '#64748B' }}>Nombre:</span> <strong>{p.contacto_emergencia_nombre || 'María Herrera'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Parentesco:</span> <strong>{p.contacto_emergencia_parentesco || 'Esposa'}</strong></div>
                                        <div><span style={{ color: '#64748B' }}>Teléfono:</span> <strong>{p.contacto_emergencia_telefono || '321 456 7890'}</strong></div>
                                    </div>
                                </div>

                                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '0.85rem', borderRadius: '8px', fontSize: '0.82rem', color: '#1E40AF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>¿Necesitas actualizar alguno de tus datos?</span>
                                    <button
                                        style={{ background: '#1D63C8', color: '#FFFFFF', border: 'none', padding: '0.45rem 0.85rem', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}
                                        onClick={() => abrirSolicitudConTipo('actualizacion_datos', 'Solicitud de Actualización de Datos')}
                                    >
                                        Solicitar actualización
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL 2: MIS DOCUMENTOS DISPONIBLES ── */}
            {modalAbierto === 'documentos' && (
                <div className="tht-modal-overlay">
                    <div className="tht-modal-card">
                        <div className="tht-modal-header">
                            <h3 className="tht-modal-title">Mis Documentos Laborales</h3>
                            <button className="tht-modal-close" onClick={() => setModalAbierto(null)}>×</button>
                        </div>
                        <div className="tht-modal-body">
                            <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
                                Documentación laboral y certificados registrados en tu expediente digital.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {perfilCompleto?.documentos?.map((doc) => {
                                    const cargado = doc.estado === 'cargado';
                                    return (
                                        <div
                                            key={doc.id}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '0.85rem 1rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--color-border)',
                                                background: cargado ? '#FFFFFF' : 'var(--color-bg-subtle)',
                                            }}
                                        >
                                            <div>
                                                <strong style={{ fontSize: '0.86rem', color: 'var(--color-navy-dark)' }}>
                                                    {doc.nombre_documento}
                                                </strong>
                                                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '0.15rem' }}>
                                                    {cargado && doc.fecha_carga
                                                        ? `Cargado el ${new Date(doc.fecha_carga).toLocaleDateString('es-CO')}`
                                                        : 'Pendiente por subir por Administración'}
                                                </div>
                                            </div>

                                            {cargado && doc.url_archivo ? (
                                                <a
                                                    href={doc.url_archivo}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.35rem',
                                                        padding: '0.45rem 0.85rem',
                                                        background: '#EFF6FF',
                                                        border: '1px solid #93C5FD',
                                                        borderRadius: '6px',
                                                        color: '#1D63C8',
                                                        fontWeight: 700,
                                                        fontSize: '0.78rem',
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    ⬇ Descargar
                                                </a>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, background: '#FEF3C7', padding: '0.25rem 0.65rem', borderRadius: '999px' }}>
                                                    Pendiente
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL 3: SOLICITUDES A TALENTO HUMANO ── */}
            {modalAbierto === 'solicitudes' && (
                <div className="tht-modal-overlay">
                    <div className="tht-modal-card">
                        <div className="tht-modal-header">
                            <h3 className="tht-modal-title">Solicitudes a Talento Humano</h3>
                            <button className="tht-modal-close" onClick={() => setModalAbierto(null)}>×</button>
                        </div>
                        <div className="tht-modal-body">
                            <button
                                style={{
                                    background: 'linear-gradient(135deg, #1D63C8 0%, #0A3A60 100%)',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: '8px',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                }}
                                onClick={() => abrirSolicitudConTipo('actualizacion_datos', '')}
                            >
                                <span>➕</span>
                                <span>Crear nueva solicitud</span>
                            </button>

                            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-navy-dark)', marginTop: '0.5rem' }}>
                                Historial de Solicitudes Enviadas
                            </h4>

                            {(!perfilCompleto?.solicitudes || perfilCompleto.solicitudes.length === 0) ? (
                                <div style={{ color: '#64748B', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem' }}>
                                    No has realizado solicitudes aún.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {perfilCompleto.solicitudes.map((sol) => (
                                        <div
                                            key={sol.id}
                                            style={{
                                                padding: '0.85rem 1rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--color-border)',
                                                background: '#FFFFFF',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <strong style={{ fontSize: '0.88rem', color: 'var(--color-navy-dark)' }}>
                                                    {sol.asunto}
                                                </strong>
                                                <span
                                                    style={{
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        padding: '0.2rem 0.6rem',
                                                        borderRadius: '999px',
                                                        background: sol.estado === 'completado' || sol.estado === 'aprobado' ? '#D1FAE5' : '#FEF3C7',
                                                        color: sol.estado === 'completado' || sol.estado === 'aprobado' ? '#059669' : '#D97706',
                                                    }}
                                                >
                                                    {sol.estado.toUpperCase()}
                                                </span>
                                            </div>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.35rem' }}>
                                                {sol.mensaje}
                                            </p>
                                            {sol.respuesta_admin && (
                                                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--color-bg-subtle)', borderRadius: '6px', fontSize: '0.78rem' }}>
                                                    <strong>Respuesta de TH:</strong> {sol.respuesta_admin}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL 4: CREAR SOLICITUD / ACTUALIZAR INFORMACIÓN ── */}
            {modalAbierto === 'solicitar_actualizacion' && (
                <div className="tht-modal-overlay">
                    <div className="tht-modal-card" style={{ maxWidth: '520px' }}>
                        <div className="tht-modal-header">
                            <h3 className="tht-modal-title">Enviar Solicitud a Talento Humano</h3>
                            <button className="tht-modal-close" onClick={() => setModalAbierto(null)}>×</button>
                        </div>

                        <form onSubmit={handleEnviarSolicitud}>
                            <div className="tht-modal-body">
                                <div className="tha-form-group">
                                    <label>Tipo de Solicitud</label>
                                    <select
                                        className="tha-form-select"
                                        value={tipoSolicitud}
                                        onChange={(e) => setTipoSolicitud(e.target.value)}
                                    >
                                        <option value="actualizacion_datos">Actualización de datos personales</option>
                                        <option value="certificado_laboral">Solicitud de certificado laboral</option>
                                        <option value="permiso">Solicitud de permiso</option>
                                        <option value="vacaciones">Solicitud de vacaciones</option>
                                        <option value="novedad">Reporte de novedad</option>
                                    </select>
                                </div>

                                <div className="tha-form-group">
                                    <label>Asunto *</label>
                                    <input
                                        type="text"
                                        className="tha-form-input"
                                        required
                                        value={asuntoSolicitud}
                                        onChange={(e) => setAsuntoSolicitud(e.target.value)}
                                        placeholder="Ej: Cambio de dirección de residencia"
                                    />
                                </div>

                                <div className="tha-form-group">
                                    <label>Descripción / Detalle de la Solicitud *</label>
                                    <textarea
                                        className="tha-form-textarea"
                                        rows={4}
                                        required
                                        value={mensajeSolicitud}
                                        onChange={(e) => setMensajeSolicitud(e.target.value)}
                                        placeholder="Escribe detalladamente los datos a modificar o el motivo de tu solicitud..."
                                    />
                                </div>
                            </div>

                            <div className="tha-modal-footer">
                                <button type="button" className="tha-btn-cancel" onClick={() => setModalAbierto(null)}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="tha-btn-submit"
                                    disabled={enviandoSolicitud}
                                >
                                    {enviandoSolicitud ? 'Enviando...' : 'Enviar Solicitud'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODALES ADICIONALES (FORMACIÓN, COMUNICACIONES, EVALUACIONES) ── */}
            {modalAbierto === 'formacion' && (
                <div className="tht-modal-overlay">
                    <div className="tht-modal-card">
                        <div className="tht-modal-header">
                            <h3 className="tht-modal-title">Formación y Certificaciones</h3>
                            <button className="tht-modal-close" onClick={() => setModalAbierto(null)}>×</button>
                        </div>
                        <div className="tht-modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div className="tht-course-item">
                                    <div className="tht-course-info">
                                        <div className="tht-course-name">Seguridad en instalación de sistemas CCTV</div>
                                        <div className="tht-course-meta">Presencial • Duración: 4 horas • Fecha: 28 AGO 2026</div>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', background: '#D1FAE5', padding: '0.25rem 0.65rem', borderRadius: '999px' }}>
                                        Inscrito
                                    </span>
                                </div>
                                <div className="tht-course-item">
                                    <div className="tht-course-info">
                                        <div className="tht-course-name">Trabajo seguro en alturas (Nivel Avanzado)</div>
                                        <div className="tht-course-meta">Certificado Vigente • Vence: Noviembre 2026</div>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1D63C8', background: '#EFF6FF', padding: '0.25rem 0.65rem', borderRadius: '999px' }}>
                                        Vigente
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {modalAbierto === 'evaluaciones' && (
                <div className="tht-modal-overlay">
                    <div className="tht-modal-card">
                        <div className="tht-modal-header">
                            <h3 className="tht-modal-title">Evaluaciones de Desempeño</h3>
                            <button className="tht-modal-close" onClick={() => setModalAbierto(null)}>×</button>
                        </div>
                        <div className="tht-modal-body">
                            <div style={{ background: '#F8FAFC', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong style={{ fontSize: '0.9rem', color: 'var(--color-navy-dark)' }}>Evaluación Semestral 2026-1</strong>
                                    <span style={{ color: '#D4AF37', fontWeight: 800 }}>★ 4.8 / 5.0</span>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.35rem' }}>
                                    Excelente cumplimiento de asignaciones técnicas, legalizaciones a tiempo y trato profesional con clientes corporativos.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {modalAbierto === 'comunicaciones' && (
                <div className="tht-modal-overlay">
                    <div className="tht-modal-card">
                        <div className="tht-modal-header">
                            <h3 className="tht-modal-title">Comunicaciones Corporativas</h3>
                            <button className="tht-modal-close" onClick={() => setModalAbierto(null)}>×</button>
                        </div>
                        <div className="tht-modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ border: '1px solid var(--color-border)', padding: '0.85rem', borderRadius: '8px' }}>
                                    <strong style={{ color: 'var(--color-navy-dark)', fontSize: '0.88rem' }}>
                                        Actualización de protocolos de legalización de viáticos
                                    </strong>
                                    <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>
                                        Recuerda adjuntar facturas electrónicas y recibos con NIT legible para la aprobación expedita de tus gastos operativos.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </TecnicoLayout>
    );
}
