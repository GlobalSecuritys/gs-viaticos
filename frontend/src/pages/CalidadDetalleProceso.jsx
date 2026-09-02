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
import logoGSB from '../assets/logo-gsb.png';
import './CalidadDetalleProceso.css';

const CATEGORIAS_DOCUMENTO = [
  'Política',
  'Procedimiento',
  'Formato',
  'Registro',
  'Instructivo',
  'Manual',
  'Guía',
  'Matriz',
  'Evidencia SGC',
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
  const [docCategoria, setDocCategoria] = useState('Procedimiento');
  const [docVersion, setDocVersion] = useState('v1');
  const [docDescripcion, setDocDescripcion] = useState('');
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  const [modalEditarDoc, setModalEditarDoc] = useState(false);
  const [docAEditar, setDocAEditar] = useState(null);
  const [editDocNombre, setEditDocNombre] = useState('');
  const [editDocCategoria, setEditDocCategoria] = useState('Procedimiento');
  const [editDocVersion, setEditDocVersion] = useState('v1');
  const [editDocDescripcion, setEditDocDescripcion] = useState('');
  const [guardandoDoc, setGuardandoDoc] = useState(false);

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

  // Subir documento
  const handleSubirDocumento = async (e) => {
    e.preventDefault();
    if (!docFile || !docNombre.trim()) {
      showToast('Selecciona un archivo y escribe un nombre para el documento.', 'err');
      return;
    }
    setSubiendoDoc(true);
    try {
      await subirDocumentoProceso(id, docFile, {
        nombreDocumento: docNombre.trim(),
        categoriaDocumento: docCategoria,
        version: docVersion.trim() || 'v1',
        descripcion: docDescripcion.trim(),
      });
      showToast('Documento subido y registrado con éxito.', 'ok');
      setModalSubirDoc(false);
      setDocFile(null);
      setDocNombre('');
      setDocDescripcion('');
      setDocVersion('v1');
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
            onClick={() => navigate('/calidad-de-procesos')}
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
                    Procedimientos, políticas, formatos y registros asociados al proceso ({proceso.codigo})
                  </span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="sgc-btn-primary"
                    onClick={() => setModalSubirDoc(true)}
                  >
                    + Subir Documento
                  </button>
                )}
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
                    {isAdmin && (
                      <button
                        type="button"
                        className="sgc-btn-primary"
                        onClick={() => setModalSubirDoc(true)}
                      >
                        Subir primer documento
                      </button>
                    )}
                  </div>
                )}

                {/* Nota de permisos informativa para no-admin */}
                {!isAdmin && (
                  <div className="sgc-notice-readonly">
                    <span className="sgc-notice-icon">ℹ️</span>
                    <span>
                      Solo el administrador del SGC (PilarAdmin) puede subir, clasificar y eliminar documentos.
                      Los demás usuarios tienen acceso de consulta y descarga.
                    </span>
                  </div>
                )}
              </div>
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
    </div>
  );
}
