import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  obtenerDetalleProceso,
  obtenerUsuariosDisponibles,
  asignarResponsableProceso,
  removerResponsableProceso,
  subirDocumentoProceso,
  actualizarDocumentoProceso,
  eliminarDocumentoProceso,
} from '../services/calidadProcesos';
import { esAdminCalidad } from '../utils/permisos';
import { getModulosSGCAsociados } from '../config/modulesConfig';
import { irAtras } from '../utils/navigation';
import logoGSB from '../assets/logo-gsb.png';
import './CalidadDetalleProceso.css';

export const CATEGORIAS_BASE = [
  {
    id: 'caracterizacion',
    nombre: 'Caracterización',
    icono: '📑',
    descripcion: 'Ficha de caracterización, alcance, entradas, salidas y líderes del proceso.',
    tags: ['caracterización', 'caracterizacion', 'ficha'],
    color: '#0284c7',
    bgLight: '#f0f9ff',
    borderLight: '#bae6fd',
  },
  {
    id: 'formatos',
    nombre: 'Formatos',
    icono: '📋',
    descripcion: 'Formatos oficiales, plantillas descargables, actas y registros del proceso.',
    tags: ['formatos', 'formato', 'registro', 'registros', 'plantilla'],
    color: '#16a34a',
    bgLight: '#f0fdf4',
    borderLight: '#bbf7d0',
  },
  {
    id: 'indicadores',
    nombre: 'Indicadores',
    icono: '📊',
    descripcion: 'Fichas técnicas de indicadores KPI, metas de gestión y reportes periódicos.',
    tags: ['indicadores', 'indicador', 'kpi', 'metas', 'medicion'],
    color: '#d97706',
    bgLight: '#fffbeb',
    borderLight: '#fde68a',
  },
  {
    id: 'procesos',
    nombre: 'Procesos',
    icono: '⚙️',
    descripcion: 'Procedimientos documentados, flujogramas, manuales operativos e instructivos.',
    tags: ['procesos', 'proceso', 'procedimiento', 'procedimientos', 'instructivo', 'instructivos', 'guía', 'guia', 'matriz', 'evidencia sgc', 'evidencia'],
    color: '#6366f1',
    bgLight: '#eef2ff',
    borderLight: '#c7d2fe',
  },
];

export const CATEGORIAS_GERENCIA_EXTRA = [
  {
    id: 'politicas',
    nombre: 'Políticas',
    icono: '📜',
    descripcion: 'Políticas institucionales, directrices corporativas y lineamientos estratégicos.',
    tags: ['políticas', 'politicas', 'política', 'politica'],
    color: '#8b5cf6',
    bgLight: '#f5f3ff',
    borderLight: '#ddd6fe',
  },
  {
    id: 'planes',
    nombre: 'Planes',
    icono: '🗓️',
    descripcion: 'Planes estratégicos de la dirección, plan de trabajo anual y asignación de recursos.',
    tags: ['planes', 'plan', 'planeación', 'planeacion'],
    color: '#ec4899',
    bgLight: '#fdf2f8',
    borderLight: '#fbcfe8',
  },
  {
    id: 'manuales',
    nombre: 'Manuales',
    icono: '📚',
    descripcion: 'Manual de calidad corporativo y manuales de organización de la empresa.',
    tags: ['manuales', 'manual'],
    color: '#0f766e',
    bgLight: '#f0fdfa',
    borderLight: '#99f6e4',
  },
];

export function getDocumentosDeCategoria(documentos = [], catConfig, todasCategorias = []) {
  if (!documentos || documentos.length === 0) return [];
  const catNombreLower = catConfig.nombre.toLowerCase();
  const tagsLower = (catConfig.tags || []).map((t) => t.toLowerCase());

  return documentos.filter((doc) => {
    const docCat = (doc.categoria_documento || '').trim().toLowerCase();
    if (!docCat) {
      return catConfig.id === 'procesos';
    }
    if (docCat === catNombreLower) return true;
    if (tagsLower.includes(docCat)) return true;

    const perteneceAOtra = todasCategorias.some((otra) => {
      if (otra.id === catConfig.id) return false;
      if (docCat === otra.nombre.toLowerCase() || (otra.tags || []).map((t) => t.toLowerCase()).includes(docCat)) {
        return true;
      }
      return false;
    });

    if (!perteneceAOtra && catConfig.id === 'procesos') {
      return true;
    }
    return false;
  });
}

const CATEGORIAS_DOCUMENTO = [
  'Caracterización',
  'Formatos',
  'Indicadores',
  'Procesos',
  'Políticas',
  'Planes',
  'Manuales',
  'Otro',
];

function formatFecha(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export default function CalidadDetalleProceso() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [proceso, setProceso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState({ msg: '', tipo: 'ok' });

  // Lista de usuarios para modal de asignación
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);

  // Modales
  const [modalAsignar, setModalAsignar] = useState(false);
  const [selectedUsuarioId, setSelectedUsuarioId] = useState('');
  const [rolEnProceso, setRolEnProceso] = useState('Responsable');
  const [asignando, setAsignando] = useState(false);

  const [modalSubirDoc, setModalSubirDoc] = useState(false);
  const [docFile, setDocFile] = useState(null);
  const [docNombre, setDocNombre] = useState('');
  const [docCategoria, setDocCategoria] = useState('Caracterización');
  const [docVersion, setDocVersion] = useState('v1');
  const [docDescripcion, setDocDescripcion] = useState('');
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  // Estados para Categorías Documentales (Caracterización, Formatos, Indicadores, Procesos, etc.)
  const [categoriaModal, setCategoriaModal] = useState(null);
  const [searchModalDoc, setSearchModalDoc] = useState('');
  const [mostrarUploadInline, setMostrarUploadInline] = useState(false);
  const [verTablaConsolidada, setVerTablaConsolidada] = useState(false);

  const [modalEditarDoc, setModalEditarDoc] = useState(false);
  const [docAEditar, setDocAEditar] = useState(null);
  const [editDocNombre, setEditDocNombre] = useState('');
  const [editDocCategoria, setEditDocCategoria] = useState('Caracterización');
  const [editDocVersion, setEditDocVersion] = useState('v1');
  const [editDocDescripcion, setEditDocDescripcion] = useState('');
  const [guardandoDoc, setGuardandoDoc] = useState(false);

  // Módulos Operativos Asociados (puede ser más de uno por proceso)
  const [lockAlert, setLockAlert] = useState(null);
  const modulosOperativos = getModulosSGCAsociados(proceso?.codigo);

  // Categorías documentales según el proceso (GR incluye extras)
  const categoriasDelProceso = (proceso?.codigo === 'GR' || proceso?.codigo === 'GE')
    ? [...CATEGORIAS_BASE, ...CATEGORIAS_GERENCIA_EXTRA]
    : CATEGORIAS_BASE;

  const handleAccesoModulo = (modulo, ruta) => {
    if (!modulo) return;
    const tieneAcceso = modulo.puedeAcceder(user);
    if (!tieneAcceso) {
      setLockAlert({
        modulo: modulo.nombre,
        razon: modulo.lockReason,
      });
    } else {
      navigate(ruta || modulo.ruta);
    }
  };

  const isAdmin = esAdminCalidad(user);

  const cargarProceso = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await obtenerDetalleProceso(id);
      setProceso(data);
    } catch (err) {
      setError('No se pudo cargar la información del proceso.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarProceso();
  }, [id]);

  const showToast = (msg, tipo = 'ok') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: 'ok' }), 4500);
  };

  // Abrir modal de asignación
  const handleAbrirAsignar = async () => {
    try {
      const users = await obtenerUsuariosDisponibles();
      setUsuariosDisponibles(users || []);
      setSelectedUsuarioId(users && users[0] ? String(users[0].id) : '');
      setRolEnProceso('Responsable');
      setModalAsignar(true);
    } catch (err) {
      showToast('No se pudo cargar la lista de usuarios', 'err');
    }
  };

  // Guardar asignación
  const handleGuardarAsignacion = async (e) => {
    e.preventDefault();
    if (!selectedUsuarioId) return;
    setAsignando(true);
    try {
      await asignarResponsableProceso(id, Number(selectedUsuarioId), rolEnProceso);
      showToast('Responsable asignado exitosamente', 'ok');
      setModalAsignar(false);
      await cargarProceso();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al asignar responsable', 'err');
    } finally {
      setAsignando(false);
    }
  };

  // Desasignar
  const handleRemoverAsignacion = async (asignacionId, nombreUsuario) => {
    if (!window.confirm(`¿Deseas desasignar a ${nombreUsuario} de este proceso?`)) return;
    try {
      await removerResponsableProceso(id, asignacionId);
      showToast('Responsable desasignado', 'ok');
      await cargarProceso();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al desasignar', 'err');
    }
  };

  // Abrir vista/modal de categoría documental
  const handleAbrirCategoria = (cat) => {
    setCategoriaModal(cat);
    setSearchModalDoc('');
    setDocCategoria(cat.nombre);
    setDocFile(null);
    setDocNombre('');
    setDocDescripcion('');
    setDocVersion('v1');
    setMostrarUploadInline(false);
  };

  // Abrir modal de categoría con formulario de subida expandido directamente
  const handleAbrirSubirEnCategoria = (cat, e) => {
    if (e) e.stopPropagation();
    setCategoriaModal(cat);
    setSearchModalDoc('');
    setDocCategoria(cat.nombre);
    setDocFile(null);
    setDocNombre('');
    setDocDescripcion('');
    setDocVersion('v1');
    setMostrarUploadInline(true);
  };

  // Subir documento (desde modal genérico o desde la vista de categoría)
  const handleSubirDocumento = async (e) => {
    e.preventDefault();
    if (!docFile || !docNombre.trim()) {
      showToast('Selecciona un archivo y escribe un nombre para el documento.', 'err');
      return;
    }
    setSubiendoDoc(true);
    try {
      const catFinal = categoriaModal ? categoriaModal.nombre : (docCategoria || 'Procesos');
      await subirDocumentoProceso(id, docFile, {
        nombreDocumento: docNombre.trim(),
        categoriaDocumento: catFinal,
        version: docVersion.trim() || 'v1',
        descripcion: docDescripcion.trim(),
      });
      showToast(`Documento subido a "${catFinal}" exitosamente.`, 'ok');
      setModalSubirDoc(false);
      setDocFile(null);
      setDocNombre('');
      setDocDescripcion('');
      setDocVersion('v1');
      setMostrarUploadInline(false);
      await cargarProceso();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al subir el documento.', 'err');
    } finally {
      setSubiendoDoc(false);
    }
  };

  // Abrir modal editar documento
  const handleAbrirEditarDoc = (doc) => {
    setDocAEditar(doc);
    setEditDocNombre(doc.nombre_documento);
    setEditDocCategoria(doc.categoria_documento || 'Procedimiento');
    setEditDocVersion(doc.version || 'v1');
    setEditDocDescripcion(doc.descripcion || '');
    setModalEditarDoc(true);
  };

  // Guardar edición documento
  const handleGuardarEdicionDoc = async (e) => {
    e.preventDefault();
    if (!docAEditar) return;
    setGuardandoDoc(true);
    try {
      await actualizarDocumentoProceso(docAEditar.id, {
        nombre_documento: editDocNombre.trim(),
        categoria_documento: editDocCategoria,
        version: editDocVersion.trim(),
        descripcion: editDocDescripcion.trim(),
      });
      showToast('Documento actualizado correctamente.', 'ok');
      setModalEditarDoc(false);
      await cargarProceso();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al actualizar documento.', 'err');
    } finally {
      setGuardandoDoc(false);
    }
  };

  // Eliminar documento
  const handleEliminarDocumento = async (docId, nombreDoc) => {
    if (!window.confirm(`¿Estás seguro de eliminar el documento "${nombreDoc}"? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarDocumentoProceso(docId);
      showToast('Documento eliminado correctamente.', 'ok');
      await cargarProceso();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al eliminar el documento.', 'err');
    }
  };

  return (
    <div className="sgc-det-root">
      {/* ── Topbar ── */}
      <header className="sgc-topbar">
        <div className="sgc-topbar-left">
          <div className="sgc-logo-halo">
            <img src={logoGSB} alt="GSB Shield" className="sgc-logo-img" />
          </div>
          <div>
            <h1 className="sgc-topbar-title">FICHA DE PROCESO SGC</h1>
            <span className="sgc-topbar-sub">SISTEMA DE GESTIÓN DE CALIDAD</span>
          </div>
        </div>

        <div className="sgc-topbar-right">
          {isAdmin && (
            <div className="sgc-admin-mode-pill">
              <span className="sgc-admin-crown">👑</span>
              <span>Modo Administrador</span>
            </div>
          )}
          <button
            type="button"
            className="sgc-btn-nav"
            onClick={() => irAtras(navigate, '/calidad-de-procesos')}
          >
            ← Mapa SGC
          </button>
        </div>
      </header>

      <main className="sgc-det-main">
        {/* Feedback Alert */}
        {feedback.msg && (
          <div className={`sgc-alert sgc-alert--${feedback.tipo}`}>
            {feedback.msg}
          </div>
        )}

        {error && <div className="sgc-alert sgc-alert--err">{error}</div>}

        {loading ? (
          <div className="sgc-loading-state">
            <div className="sgc-spinner"></div>
            <p>Cargando detalle del proceso…</p>
          </div>
        ) : proceso ? (
          <>
            {/* Breadcrumbs */}
            <div className="sgc-cat-breadcrumbs">
              <span onClick={() => navigate('/calidad-de-procesos')} className="sgc-crumb-link">
                Mapa de Procesos
              </span>
              <span className="sgc-crumb-sep">›</span>
              <span
                onClick={() => navigate(`/calidad-de-procesos/categoria/${proceso.categoria}`)}
                className="sgc-crumb-link"
              >
                Procesos de {proceso.categoria.charAt(0).toUpperCase() + proceso.categoria.slice(1)}
              </span>
              <span className="sgc-crumb-sep">›</span>
              <span className="sgc-crumb-current">
                {proceso.nombre} ({proceso.codigo})
              </span>
            </div>

            {/* Ficha Header del Proceso */}
            <div className="sgc-det-hero-card" style={{ borderLeftColor: proceso.color_hex }}>
              <div className="sgc-det-hero-header">
                <div
                  className="sgc-det-code-box"
                  style={{ borderColor: proceso.color_hex, color: proceso.color_hex }}
                >
                  {proceso.codigo}
                </div>
                <div className="sgc-det-hero-title-wrap">
                  <div className="sgc-det-tag-row">
                    <span className="sgc-det-cat-tag">
                      {proceso.categoria.toUpperCase()}
                    </span>
                    <span className="sgc-det-order-tag">Orden: {proceso.orden}</span>
                  </div>
                  <h2 className="sgc-det-title">{proceso.nombre}</h2>
                </div>
              </div>
              <p className="sgc-det-description">
                {proceso.descripcion || 'Sin descripción registrada para este proceso.'}
              </p>
            </div>

            {/* ── MÓDULOS OPERATIVOS ASOCIADOS (puede ser más de uno por proceso) ── */}
            {modulosOperativos.length > 0 && (
              <section className="sgc-det-modulo-section" aria-label="Módulos Operativos Vinculados">
                <div className="sgc-det-modulo-header">
                  <div className="sgc-det-modulo-title-wrap">
                    <span className="sgc-det-modulo-kicker">⚡ MÓDULOS OPERATIVOS VINCULADOS</span>
                    <h3 className="sgc-det-modulo-heading">
                      {modulosOperativos.length === 1
                        ? '1 módulo asociado a este proceso'
                        : `${modulosOperativos.length} módulos asociados a este proceso`}
                    </h3>
                  </div>
                </div>

                <div className="sgc-det-modulos-grid">
                  {modulosOperativos.map((mod) => {
                    const tieneAcceso = mod.puedeAcceder(user);
                    return (
                      <div
                        key={mod.moduloId}
                        className={`sgc-det-modulo-card sgc-det-modulo-card--${mod.colorTheme} ${!tieneAcceso ? 'sgc-det-modulo-card--locked' : ''}`}
                        onClick={mod.moduloId === 'autoplaner-ods' ? undefined : () => handleAccesoModulo(mod, mod.ruta)}
                        title={!tieneAcceso ? `🔒 Acceso restringido a ${mod.nombre}` : `Haga clic para ingresar al módulo de ${mod.nombre}`}
                      >
                        {/* Glow interior al hover */}
                        <div className="sgc-det-modulo-glow" />

                        {/* Badge de categoría en la esquina superior derecha */}
                        {!tieneAcceso ? (
                          <span className="sgc-det-lock-badge">🔒 SIN ACCESO</span>
                        ) : mod.badge && mod.moduloId !== 'autoplaner-ods' ? (
                          <span className={`sgc-det-modulo-badge sgc-det-modulo-badge--${mod.colorTheme}`}>
                            {mod.badge}
                          </span>
                        ) : null}

                        {/* Encabezado vertical: Ícono grande arriba */}
                        <div className="sgc-det-modulo-card-top">
                          <div className="sgc-det-modulo-icon-box">
                            {!tieneAcceso ? (
                              <span className="sgc-det-lock-icon" aria-hidden="true">🔒</span>
                            ) : mod.colorTheme === 'blue' ? (
                              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                              </svg>
                            ) : mod.colorTheme === 'gold' ? (
                              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                            ) : (
                              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                            )}
                          </div>
                          <div className="sgc-det-modulo-info">
                            <h4 className="sgc-det-modulo-card-title">{mod.nombre}</h4>
                            <p className="sgc-det-modulo-desc">{mod.descripcion}</p>
                          </div>
                        </div>

                        {/* Sub-accesos del módulo */}
                        {mod.chips && mod.chips.length > 0 && (
                          <div className="sgc-det-modulo-chips-wrap">
                            <span className="sgc-det-chips-label">Funciones y accesos directos:</span>
                            <div className="sgc-det-modulo-chips">
                              {mod.chips.map((chip) => (
                                <button
                                  key={chip.label}
                                  type="button"
                                  className={`sgc-det-modulo-chip ${!tieneAcceso ? 'sgc-det-modulo-chip--locked' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAccesoModulo(mod, chip.path);
                                  }}
                                  title={!tieneAcceso ? `🔒 Acceso bloqueado a ${chip.label}` : `Acceso directo a ${chip.label}`}
                                >
                                  <span className="sgc-det-chip-icon">{!tieneAcceso ? '🔒' : chip.icon}</span>
                                  <span className="sgc-det-chip-label">{chip.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Link/Botón de acceso al pie de la tarjeta */}
                        <div className="sgc-det-modulo-footer">
                          {mod.moduloId === 'autoplaner-ods' ? (
                            <a
                              href="http://autoplannerapp.com/GSB/#/passport/login"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sgc-det-modulo-btn-autoplaner"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="sgc-det-cta-label">{mod.botonTexto || 'Ingresar a Autoplaner ODS'}</span>
                              <svg className="sgc-det-cta-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </a>
                          ) : (
                            <div className={`sgc-det-modulo-cta-link ${!tieneAcceso ? 'sgc-det-modulo-cta-link--locked' : ''}`}>
                              {!tieneAcceso ? (
                                <>
                                  <span className="sgc-det-cta-label">Acceso Restringido</span>
                                  <span className="sgc-det-lock-small">🔒</span>
                                </>
                              ) : (
                                <>
                                  <span className="sgc-det-cta-label">{mod.botonTexto || `Ingresar a ${mod.nombre}`}</span>
                                  <svg className="sgc-det-cta-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                  </svg>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── SECCIÓN 1: RESPONSABLES DEL PROCESO ── */}
            <section className="sgc-det-section">
              <div className="sgc-section-header">
                <div>
                  <h3 className="sgc-section-title">👥 Responsables del Proceso</h3>
                  <span className="sgc-section-subtitle">
                    Colaboradores asignados para la ejecución y supervisión del proceso
                  </span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="sgc-btn-action"
                    onClick={handleAbrirAsignar}
                  >
                    + Asignar Persona
                  </button>
                )}
              </div>

              <div className="sgc-responsables-grid">
                {proceso.responsables && proceso.responsables.length > 0 ? (
                  proceso.responsables.map((r) => (
                    <div key={r.id} className="sgc-resp-card">
                      <div className="sgc-resp-avatar">
                        {iniciales(r.usuario?.nombre || 'U')}
                      </div>
                      <div className="sgc-resp-details">
                        <h4 className="sgc-resp-user-name">{r.usuario?.nombre || 'Usuario'}</h4>
                        <span className="sgc-resp-user-email">{r.usuario?.correo}</span>
                        <div className="sgc-resp-role-badge">{r.rol_en_proceso || 'Responsable'}</div>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          className="sgc-btn-remove-resp"
                          onClick={() => handleRemoverAsignacion(r.id, r.usuario?.nombre)}
                          title="Desasignar persona del proceso"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="sgc-empty-block">
                    <p>No hay colaboradores asignados actualmente a este proceso.</p>
                    {isAdmin && (
                      <button
                        type="button"
                        className="sgc-btn-secondary"
                        onClick={handleAbrirAsignar}
                      >
                        Asignar primer responsable
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── SECCIÓN 2: GESTIÓN DE DOCUMENTOS DEL PROCESO ── */}
            <section className="sgc-det-section">
              <div className="sgc-section-header">
                <div>
                  <h3 className="sgc-section-title">📂 Gestión de Documentos y Evidencias</h3>
                  <span className="sgc-section-subtitle">
                    Documentación oficial organizada por categorías para el proceso de {proceso.nombre} ({proceso.codigo})
                  </span>
                </div>
                <div className="sgc-section-header-actions">
                  {proceso.documentos && proceso.documentos.length > 0 && (
                    <button
                      type="button"
                      className="sgc-btn-secondary sgc-btn-toggle-view"
                      onClick={() => setVerTablaConsolidada(!verTablaConsolidada)}
                    >
                      {verTablaConsolidada ? '▲ Ocultar vista consolidada' : `📋 Vista general (${proceso.documentos.length})`}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      className="sgc-btn-primary"
                      onClick={() => {
                        setDocCategoria('Caracterización');
                        setModalSubirDoc(true);
                      }}
                    >
                      + Subir Documento
                    </button>
                  )}
                </div>
              </div>

              {/* ── GRID DE 4 TARJETAS DE CATEGORÍAS DOCUMENTALES (+ GERENCIA EXTRA SI APLICA) ── */}
              <div className="sgc-cat-grid">
                {categoriasDelProceso.map((cat) => {
                  const docsCat = getDocumentosDeCategoria(proceso.documentos, cat, categoriasDelProceso);
                  const totalDocs = docsCat.length;
                  return (
                    <div
                      key={cat.id}
                      className="sgc-cat-card"
                      onClick={() => handleAbrirCategoria(cat)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleAbrirCategoria(cat);
                        }
                      }}
                      style={{
                        '--cat-accent': cat.color,
                        '--cat-bg': cat.bgLight,
                        '--cat-border': cat.borderLight,
                      }}
                    >
                      <div className="sgc-cat-card-top">
                        <div
                          className="sgc-cat-icon-badge"
                          style={{
                            background: cat.bgLight,
                            borderColor: cat.borderLight,
                            color: cat.color,
                          }}
                        >
                          <span className="sgc-cat-icon-emoji">{cat.icono}</span>
                        </div>
                        <span
                          className={`sgc-cat-counter-pill ${
                            totalDocs > 0 ? 'sgc-cat-counter-pill--has-files' : ''
                          }`}
                        >
                          {totalDocs === 0
                            ? '0 archivos'
                            : `${totalDocs} ${totalDocs === 1 ? 'archivo' : 'archivos'}`}
                        </span>
                      </div>

                      <div className="sgc-cat-card-body">
                        <h4 className="sgc-cat-card-title">{cat.nombre}</h4>
                        <p className="sgc-cat-card-desc">{cat.descripcion}</p>
                      </div>

                      <div className="sgc-cat-card-bottom">
                        <span className="sgc-cat-explore-link">
                          Explorar carpeta <span className="sgc-cat-explore-arrow">→</span>
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            className="sgc-cat-btn-quick-add"
                            title={`Subir archivo a ${cat.nombre}`}
                            onClick={(e) => handleAbrirSubirEnCategoria(cat, e)}
                          >
                            + Subir
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── TABLA CONSOLIDADA OPCIONAL ── */}
              {verTablaConsolidada && (
                <div className="sgc-consolidated-wrap">
                  <div className="sgc-consolidated-header">
                    <h4>📋 Vista Consolidada de Todos los Documentos ({proceso.documentos?.length || 0})</h4>
                    <span className="sgc-consolidated-subtitle">
                      Listado general de todos los archivos cargados en cualquier categoría
                    </span>
                  </div>

                  <div className="sgc-table-card">
                    {proceso.documentos && proceso.documentos.length > 0 ? (
                      <div className="sgc-table-responsive">
                        <table className="sgc-table">
                          <thead>
                            <tr>
                              <th>Documento</th>
                              <th>Categoría</th>
                              <th>Versión</th>
                              <th>Descripción</th>
                              <th>Subido Por</th>
                              <th>Fecha</th>
                              <th className="sgc-th-actions">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {proceso.documentos.map((doc) => (
                              <tr key={doc.id}>
                                <td>
                                  <div className="sgc-doc-name-cell">
                                    <span className="sgc-doc-icon">📄</span>
                                    <a
                                      href={doc.cloudinary_secure_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="sgc-doc-link"
                                      title="Clic para abrir en nueva pestaña"
                                    >
                                      {doc.nombre_documento}
                                    </a>
                                  </div>
                                </td>
                                <td>
                                  <span className="sgc-doc-cat-pill">
                                    {doc.categoria_documento || 'Procedimiento'}
                                  </span>
                                </td>
                                <td>
                                  <span className="sgc-doc-version-pill">{doc.version || 'v1'}</span>
                                </td>
                                <td className="sgc-doc-desc-cell">
                                  {doc.descripcion || '—'}
                                </td>
                                <td className="sgc-doc-uploader-cell">
                                  {doc.usuario_subio?.nombre || 'PilarAdmin'}
                                </td>
                                <td className="sgc-doc-date-cell">
                                  {formatFecha(doc.created_at)}
                                </td>
                                <td className="sgc-td-actions">
                                  <a
                                    href={doc.cloudinary_secure_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="sgc-btn-tbl sgc-btn-tbl--view"
                                    title="Abrir / Descargar"
                                  >
                                    Abrir
                                  </a>
                                  {isAdmin && (
                                    <>
                                      <button
                                        type="button"
                                        className="sgc-btn-tbl sgc-btn-tbl--edit"
                                        onClick={() => handleAbrirEditarDoc(doc)}
                                        title="Editar clasificación o versión"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        className="sgc-btn-tbl sgc-btn-tbl--delete"
                                        onClick={() => handleEliminarDocumento(doc.id, doc.nombre_documento)}
                                        title="Eliminar documento"
                                      >
                                        Eliminar
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="sgc-empty-block">
                        <p>No hay documentos cargados en este proceso todavía.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nota de permisos informativa para no-admin */}
              {!isAdmin && (
                <div className="sgc-notice-readonly">
                  <span className="sgc-notice-icon">ℹ️</span>
                  <span>
                    Solo PilarAdmin o administradores asignados como Editores SGC pueden subir, clasificar y eliminar documentos.
                    Cuentas con acceso de consulta y descarga en modo lector dentro de cada categoría.
                  </span>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>

      {/* ── MODAL: ASIGNAR RESPONSABLE ── */}
      {modalAsignar && (
        <div className="sgc-modal-overlay" onClick={() => setModalAsignar(false)}>
          <div className="sgc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sgc-modal-header">
              <h3>Asignar Colaborador al Proceso ({proceso?.codigo})</h3>
              <button
                type="button"
                className="sgc-modal-close"
                onClick={() => setModalAsignar(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleGuardarAsignacion} className="sgc-modal-form">
              <div className="sgc-form-group">
                <label>Seleccionar Usuario</label>
                <select
                  required
                  value={selectedUsuarioId}
                  onChange={(e) => setSelectedUsuarioId(e.target.value)}
                >
                  {usuariosDisponibles.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.correo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sgc-form-group">
                <label>Rol en el Proceso</label>
                <input
                  type="text"
                  required
                  value={rolEnProceso}
                  onChange={(e) => setRolEnProceso(e.target.value)}
                  placeholder="Ej. Líder de Proceso, Responsable, Colaborador"
                />
              </div>

              <div className="sgc-modal-actions">
                <button
                  type="button"
                  className="sgc-btn-secondary"
                  onClick={() => setModalAsignar(false)}
                  disabled={asignando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="sgc-btn-primary"
                  disabled={asignando}
                >
                  {asignando ? 'Asignando…' : 'Confirmar Asignación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: SUBIR DOCUMENTO ── */}
      {modalSubirDoc && (
        <div className="sgc-modal-overlay" onClick={() => setModalSubirDoc(false)}>
          <div className="sgc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sgc-modal-header">
              <h3>Subir Documento para: {proceso?.nombre}</h3>
              <button
                type="button"
                className="sgc-modal-close"
                onClick={() => setModalSubirDoc(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubirDocumento} className="sgc-modal-form">
              <div className="sgc-form-group">
                <label>Archivo (PDF, imagen, formato, etc.)</label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    const f = e.target.files[0];
                    setDocFile(f);
                    if (f && !docNombre) {
                      // Autocompletar nombre sin extensión
                      const base = f.name.replace(/\.[^/.]+$/, '');
                      setDocNombre(base);
                    }
                  }}
                />
              </div>

              <div className="sgc-form-group">
                <label>Nombre del Documento</label>
                <input
                  type="text"
                  required
                  value={docNombre}
                  onChange={(e) => setDocNombre(e.target.value)}
                  placeholder="Ej. Procedimiento de Inspecciones Operativas"
                />
              </div>

              <div className="sgc-form-row">
                <div className="sgc-form-group">
                  <label>Categoría del Documento</label>
                  <select
                    value={docCategoria}
                    onChange={(e) => setDocCategoria(e.target.value)}
                  >
                    {CATEGORIAS_DOCUMENTO.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sgc-form-group">
                  <label>Versión</label>
                  <input
                    type="text"
                    required
                    value={docVersion}
                    onChange={(e) => setDocVersion(e.target.value)}
                    placeholder="Ej. v1, v2, v2.1"
                  />
                </div>
              </div>

              <div className="sgc-form-group">
                <label>Descripción / Observaciones (Opcional)</label>
                <textarea
                  rows={3}
                  value={docDescripcion}
                  onChange={(e) => setDocDescripcion(e.target.value)}
                  placeholder="Breve resumen del contenido o propósito del documento..."
                />
              </div>

              <div className="sgc-modal-actions">
                <button
                  type="button"
                  className="sgc-btn-secondary"
                  onClick={() => setModalSubirDoc(false)}
                  disabled={subiendoDoc}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="sgc-btn-primary"
                  disabled={subiendoDoc}
                >
                  {subiendoDoc ? 'Subiendo a Cloudinary…' : 'Subir Documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR DOCUMENTO ── */}
      {modalEditarDoc && (
        <div className="sgc-modal-overlay" onClick={() => setModalEditarDoc(false)}>
          <div className="sgc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sgc-modal-header">
              <h3>Editar Clasificación de Documento</h3>
              <button
                type="button"
                className="sgc-modal-close"
                onClick={() => setModalEditarDoc(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleGuardarEdicionDoc} className="sgc-modal-form">
              <div className="sgc-form-group">
                <label>Nombre del Documento</label>
                <input
                  type="text"
                  required
                  value={editDocNombre}
                  onChange={(e) => setEditDocNombre(e.target.value)}
                />
              </div>

              <div className="sgc-form-row">
                <div className="sgc-form-group">
                  <label>Categoría</label>
                  <select
                    value={editDocCategoria}
                    onChange={(e) => setEditDocCategoria(e.target.value)}
                  >
                    {CATEGORIAS_DOCUMENTO.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sgc-form-group">
                  <label>Versión</label>
                  <input
                    type="text"
                    required
                    value={editDocVersion}
                    onChange={(e) => setEditDocVersion(e.target.value)}
                  />
                </div>
              </div>

              <div className="sgc-form-group">
                <label>Descripción</label>
                <textarea
                  rows={3}
                  value={editDocDescripcion}
                  onChange={(e) => setEditDocDescripcion(e.target.value)}
                />
              </div>

              <div className="sgc-modal-actions">
                <button
                  type="button"
                  className="sgc-btn-secondary"
                  onClick={() => setModalEditarDoc(false)}
                  disabled={guardandoDoc}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="sgc-btn-primary"
                  disabled={guardandoDoc}
                >
                  {guardandoDoc ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL / DIÁLOGO DE ACCESO RESTRINGIDO (CANDADO) ── */}
      {lockAlert && (
        <div className="sgc-lock-backdrop" onClick={() => setLockAlert(null)}>
          <div className="sgc-lock-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <div className="sgc-lock-dialog-icon">🔒</div>
            <div className="sgc-lock-dialog-content">
              <h3 className="sgc-lock-dialog-title">Acceso Restringido</h3>
              <div className="sgc-lock-dialog-module">{lockAlert.modulo}</div>
              <p className="sgc-lock-dialog-text">{lockAlert.razon}</p>
              <div className="sgc-lock-dialog-tip">
                <span>💡</span>
                <span>
                  Puedes consultar y gestionar libremente los colaboradores, fichas y documentación SGC de este proceso en esta pantalla.
                </span>
              </div>
            </div>
            <div className="sgc-lock-dialog-actions">
              <button
                type="button"
                className="sgc-lock-dialog-btn"
                onClick={() => setLockAlert(null)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL: VISTA DE CATEGORÍA DOCUMENTAL (CARACTERIZACIÓN / FORMATOS / INDICADORES / PROCESOS / ETC) ── */}
      {categoriaModal && (() => {
        const docsCategoria = getDocumentosDeCategoria(proceso?.documentos, categoriaModal, categoriasDelProceso);
        const docsFiltrados = searchModalDoc.trim()
          ? docsCategoria.filter((d) =>
              (d.nombre_documento || '').toLowerCase().includes(searchModalDoc.toLowerCase()) ||
              (d.descripcion || '').toLowerCase().includes(searchModalDoc.toLowerCase()) ||
              (d.usuario_subio?.nombre || '').toLowerCase().includes(searchModalDoc.toLowerCase())
            )
          : docsCategoria;

        return (
          <div className="sgc-modal-overlay" onClick={() => setCategoriaModal(null)}>
            <div className="sgc-modal-card sgc-cat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sgc-modal-header sgc-cat-modal-header">
                <div className="sgc-cat-modal-title-wrap">
                  <div
                    className="sgc-cat-modal-icon-badge"
                    style={{
                      background: categoriaModal.bgLight,
                      borderColor: categoriaModal.borderLight,
                      color: categoriaModal.color,
                    }}
                  >
                    <span>{categoriaModal.icono}</span>
                  </div>
                  <div>
                    <div className="sgc-cat-modal-crumb">
                      <span>{proceso?.nombre}</span>
                      <span className="sgc-cat-modal-dot">•</span>
                      <span className="sgc-cat-modal-proc-badge">{proceso?.codigo}</span>
                    </div>
                    <h3 className="sgc-cat-modal-title">{categoriaModal.nombre}</h3>
                  </div>
                </div>
                <button
                  type="button"
                  className="sgc-modal-close"
                  onClick={() => setCategoriaModal(null)}
                  title="Cerrar ventana"
                >
                  ✕
                </button>
              </div>

              <div className="sgc-cat-modal-desc-box">
                <p className="sgc-cat-modal-desc">{categoriaModal.descripcion}</p>
                <div className="sgc-cat-modal-stats">
                  <span className="sgc-cat-modal-stat-pill">
                    📁 <strong>{docsCategoria.length}</strong> {docsCategoria.length === 1 ? 'archivo disponible' : 'archivos disponibles'}
                  </span>
                </div>
              </div>

              {/* Barra de control y búsqueda */}
              <div className="sgc-cat-modal-toolbar">
                <div className="sgc-cat-search-box">
                  <span className="sgc-cat-search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar documento en esta categoría..."
                    value={searchModalDoc}
                    onChange={(e) => setSearchModalDoc(e.target.value)}
                    className="sgc-cat-search-input"
                  />
                  {searchModalDoc && (
                    <button
                      type="button"
                      className="sgc-cat-search-clear"
                      onClick={() => setSearchModalDoc('')}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    className={`sgc-btn-cat-toggle ${mostrarUploadInline ? 'sgc-btn-cat-toggle--cancel' : 'sgc-btn-cat-toggle--add'}`}
                    onClick={() => setMostrarUploadInline(!mostrarUploadInline)}
                  >
                    {mostrarUploadInline ? '✕ Cancelar subida' : '+ Subir archivo'}
                  </button>
                )}
              </div>

              {/* Panel de Subida Inline (Upload component) */}
              {isAdmin && mostrarUploadInline && (
                <div className="sgc-cat-upload-panel">
                  <div className="sgc-cat-upload-header">
                    <h4>📤 Subir archivo a {categoriaModal.nombre}</h4>
                    <span className="sgc-cat-upload-hint">
                      Formatos admitidos: PDF, Excel (.xlsx, .xls), Word (.docx), imágenes (.png, .jpg), etc.
                    </span>
                  </div>

                  <form onSubmit={handleSubirDocumento} className="sgc-cat-upload-form">
                    <div className="sgc-form-group">
                      <label className="sgc-dropzone-label">
                        <div className="sgc-dropzone-content">
                          <span className="sgc-dropzone-icon">📁</span>
                          <span className="sgc-dropzone-text">
                            {docFile ? (
                              <strong>{docFile.name} ({(docFile.size / 1024).toFixed(1)} KB)</strong>
                            ) : (
                              'Haz clic para seleccionar o examinar archivo'
                            )}
                          </span>
                        </div>
                        <input
                          type="file"
                          required
                          className="sgc-file-input-hidden"
                          onChange={(e) => {
                            const f = e.target.files[0];
                            setDocFile(f);
                            if (f && !docNombre) {
                              const base = f.name.replace(/\.[^/.]+$/, '');
                              setDocNombre(base);
                            }
                          }}
                        />
                      </label>
                    </div>

                    <div className="sgc-form-row">
                      <div className="sgc-form-group" style={{ flex: 2 }}>
                        <label>Nombre del Documento *</label>
                        <input
                          type="text"
                          required
                          value={docNombre}
                          onChange={(e) => setDocNombre(e.target.value)}
                          placeholder={`Ej. ${categoriaModal.nombre === 'Formatos' ? 'Formato de Inspección ODS' : categoriaModal.nombre === 'Indicadores' ? 'Ficha de Indicador de Eficiencia' : 'Documento oficial'}`}
                        />
                      </div>

                      <div className="sgc-form-group" style={{ flex: 1 }}>
                        <label>Versión</label>
                        <input
                          type="text"
                          required
                          value={docVersion}
                          onChange={(e) => setDocVersion(e.target.value)}
                          placeholder="Ej. v1, v2"
                        />
                      </div>
                    </div>

                    <div className="sgc-form-group">
                      <label>Descripción / Observaciones (Opcional)</label>
                      <textarea
                        rows={2}
                        value={docDescripcion}
                        onChange={(e) => setDocDescripcion(e.target.value)}
                        placeholder="Breve explicación del objetivo, alcance o fecha de vigencia de este archivo..."
                      />
                    </div>

                    <div className="sgc-cat-upload-actions">
                      <button
                        type="button"
                        className="sgc-btn-secondary"
                        onClick={() => {
                          setMostrarUploadInline(false);
                          setDocFile(null);
                        }}
                        disabled={subiendoDoc}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="sgc-btn-primary"
                        disabled={subiendoDoc || !docFile}
                      >
                        {subiendoDoc ? 'Subiendo a Cloudinary…' : 'Subir Archivo'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Listado de Documentos de esta Categoría */}
              <div className="sgc-cat-list-container">
                {docsFiltrados.length > 0 ? (
                  <div className="sgc-table-responsive">
                    <table className="sgc-table">
                      <thead>
                        <tr>
                          <th>Archivo / Documento</th>
                          <th>Versión</th>
                          <th>Descripción</th>
                          <th>Subido Por</th>
                          <th>Fecha</th>
                          <th className="sgc-th-actions">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docsFiltrados.map((doc) => (
                          <tr key={doc.id}>
                            <td>
                              <div className="sgc-doc-name-cell">
                                <span className="sgc-doc-icon">
                                  {categoriaModal.icono || '📄'}
                                </span>
                                <a
                                  href={doc.cloudinary_secure_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="sgc-doc-link"
                                  title="Clic para abrir / descargar"
                                >
                                  {doc.nombre_documento}
                                </a>
                              </div>
                            </td>
                            <td>
                              <span className="sgc-doc-version-pill">{doc.version || 'v1'}</span>
                            </td>
                            <td className="sgc-doc-desc-cell">
                              {doc.descripcion || '—'}
                            </td>
                            <td className="sgc-doc-uploader-cell">
                              {doc.usuario_subio?.nombre || 'PilarAdmin'}
                            </td>
                            <td className="sgc-doc-date-cell">
                              {formatFecha(doc.created_at)}
                            </td>
                            <td className="sgc-td-actions">
                              <a
                                href={doc.cloudinary_secure_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="sgc-btn-tbl sgc-btn-tbl--view"
                                title="Descargar / Abrir en pestaña nueva"
                              >
                                Abrir ↗
                              </a>
                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    className="sgc-btn-tbl sgc-btn-tbl--edit"
                                    onClick={() => handleAbrirEditarDoc(doc)}
                                    title="Editar nombre, versión o descripción"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="sgc-btn-tbl sgc-btn-tbl--delete"
                                    onClick={() => handleEliminarDocumento(doc.id, doc.nombre_documento)}
                                    title="Eliminar este documento"
                                  >
                                    Eliminar
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="sgc-cat-empty-state">
                    <div className="sgc-cat-empty-icon">{categoriaModal.icono}</div>
                    <h4>No hay archivos en {categoriaModal.nombre}</h4>
                    <p>
                      {searchModalDoc
                        ? `No se encontraron documentos que coincidan con "${searchModalDoc}".`
                        : `Aún no se han cargado documentos en la categoría "${categoriaModal.nombre}" para este proceso.`}
                    </p>
                    {isAdmin && !mostrarUploadInline && (
                      <button
                        type="button"
                        className="sgc-btn-primary"
                        onClick={() => setMostrarUploadInline(true)}
                      >
                        + Subir primer archivo aquí
                      </button>
                    )}
                  </div>
                )}
              </div>

              {!isAdmin && (
                <div className="sgc-notice-readonly" style={{ marginTop: '1.25rem' }}>
                  <span className="sgc-notice-icon">ℹ️</span>
                  <span>
                    Acceso en modo consulta y descarga. Solo PilarAdmin o editores SGC autorizados pueden cargar o eliminar archivos en esta categoría.
                  </span>
                </div>
              )}

              <div className="sgc-modal-actions" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="sgc-btn-secondary"
                  onClick={() => setCategoriaModal(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
