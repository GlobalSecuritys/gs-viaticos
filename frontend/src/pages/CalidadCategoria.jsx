import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  obtenerProcesosPorCategoria,
  actualizarProceso,
} from '../services/calidadProcesos';
import { esAdminCalidad } from '../utils/permisos';
import logoGSB from '../assets/logo-gsb.png';
import './CalidadCategoria.css';

const TITULOS_CATEGORIA = {
  direccion: 'Procesos de Dirección',
  misional: 'Procesos Misionales',
  apoyo: 'Procesos de Apoyo',
};

const DESCRIPCIONES_CATEGORIA = {
  direccion:
    'Procesos orientados a la formulación de políticas, lineamientos estratégicos, evaluación del desempeño organizacional y mejora continua del SGC.',
  misional:
    'Procesos que impactan directamente la prestación del servicio y la satisfacción del cliente en operaciones, seguridad y suministros.',
  apoyo:
    'Procesos que proveen los recursos, infraestructura, soporte administrativo, seguridad y salud laboral y gestión ambiental necesarios.',
};

export default function CalidadCategoria() {
  const { categoria } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [procesos, setProcesos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de edición de proceso (solo admin)
  const [modalEditar, setModalEditar] = useState(false);
  const [procesoAEditar, setProcesoAEditar] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editColor, setEditColor] = useState('#D4AF37');
  const [guardando, setGuardando] = useState(false);

  const isAdmin = esAdminCalidad(user);
  const catKey = (categoria || 'direccion').toLowerCase();
  const tituloCat = TITULOS_CATEGORIA[catKey] || `Procesos (${categoria})`;
  const descCat = DESCRIPCIONES_CATEGORIA[catKey] || '';

  const cargarProcesos = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await obtenerProcesosPorCategoria(catKey);
      setProcesos(data || []);
    } catch (err) {
      setError('No se pudieron cargar los procesos de esta categoría.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarProcesos();
  }, [categoria]);

  const abrirModalEditar = (proc, e) => {
    e.stopPropagation();
    setProcesoAEditar(proc);
    setEditNombre(proc.nombre);
    setEditCodigo(proc.codigo);
    setEditDescripcion(proc.descripcion || '');
    setEditColor(proc.color_hex || '#D4AF37');
    setModalEditar(true);
  };

  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    if (!procesoAEditar) return;
    setGuardando(true);
    try {
      await actualizarProceso(procesoAEditar.id, {
        nombre: editNombre,
        codigo: editCodigo,
        descripcion: editDescripcion,
        color_hex: editColor,
      });
      setModalEditar(false);
      await cargarProcesos();
    } catch (err) {
      alert('Error al actualizar el proceso: ' + (err.response?.data?.detail || err.message));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="sgc-cat-root">
      {/* ── Topbar ── */}
      <header className="sgc-topbar">
        <div className="sgc-topbar-left">
          <div className="sgc-logo-halo">
            <img src={logoGSB} alt="GSB Shield" className="sgc-logo-img" />
          </div>
          <div>
            <h1 className="sgc-topbar-title">CALIDAD DE PROCESOS</h1>
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
            ← Volver al Mapa
          </button>
        </div>
      </header>

      <main className="sgc-cat-main">
        {/* Breadcrumb */}
        <div className="sgc-cat-breadcrumbs">
          <span onClick={() => navigate('/calidad-de-procesos')} className="sgc-crumb-link">
            Mapa de Procesos
          </span>
          <span className="sgc-crumb-sep">›</span>
          <span className="sgc-crumb-current">{tituloCat}</span>
        </div>

        {/* Hero de Categoría */}
        <div className={`sgc-cat-hero sgc-cat-hero--${catKey}`}>
          <div className="sgc-cat-hero-info">
            <span className="sgc-cat-badge">{catKey.toUpperCase()}</span>
            <h2 className="sgc-cat-title">{tituloCat}</h2>
            <p className="sgc-cat-desc">{descCat}</p>
          </div>
        </div>

        {error && <div className="sgc-alert-error">{error}</div>}

        {loading ? (
          <div className="sgc-loading-state">
            <div className="sgc-spinner"></div>
            <p>Cargando procesos…</p>
          </div>
        ) : (
          <div className="sgc-cat-grid">
            {procesos.map((proc) => {
              const responsiblesList =
                proc.responsables && proc.responsables.length > 0
                  ? proc.responsables
                  : [];

              return (
                <div
                  key={proc.id}
                  className="sgc-cat-card"
                  onClick={() => navigate(`/calidad-de-procesos/proceso/${proc.id}`)}
                >
                  <div className="sgc-cat-card-header">
                    <div className="sgc-cat-card-code-badge" style={{ borderColor: proc.color_hex }}>
                      <span style={{ color: proc.color_hex }}>{proc.codigo}</span>
                    </div>
                    <div className="sgc-cat-card-title-wrap">
                      <h3 className="sgc-cat-card-title">{proc.nombre}</h3>
                      <span className="sgc-cat-card-subcode">Código: {proc.codigo}</span>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        className="sgc-btn-edit-proc"
                        onClick={(e) => abrirModalEditar(proc, e)}
                        title="Editar información del proceso"
                      >
                        ✏️ Editar
                      </button>
                    )}
                  </div>

                  <p className="sgc-cat-card-desc">
                    {proc.descripcion || 'Sin descripción detallada registrada para este proceso.'}
                  </p>

                  <div className="sgc-cat-card-meta">
                    <div className="sgc-cat-resp-section">
                      <span className="sgc-meta-label">Responsable(s):</span>
                      <div className="sgc-resp-avatars-wrap">
                        {responsiblesList.length > 0 ? (
                          responsiblesList.map((r) => (
                            <span key={r.id} className="sgc-resp-chip" title={r.usuario?.correo}>
                              👤 {r.usuario?.nombre || 'Usuario'}
                            </span>
                          ))
                        ) : (
                          <span className="sgc-resp-empty">Sin asignar</span>
                        )}
                      </div>
                    </div>

                    <div className="sgc-cat-doc-count">
                      <span>📄 {proc.total_documentos} {proc.total_documentos === 1 ? 'documento' : 'documentos'}</span>
                    </div>
                  </div>

                  <div className="sgc-cat-card-footer">
                    <span className="sgc-cta-view">Entrar a Ficha y Documentación →</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── MODAL EDICIÓN PROCESO (SOLO ADMIN) ── */}
      {modalEditar && (
        <div className="sgc-modal-overlay" onClick={() => setModalEditar(false)}>
          <div className="sgc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sgc-modal-header">
              <h3>Editar Proceso: {procesoAEditar?.nombre}</h3>
              <button
                type="button"
                className="sgc-modal-close"
                onClick={() => setModalEditar(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="sgc-modal-form">
              <div className="sgc-form-group">
                <label>Nombre del Proceso</label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                />
              </div>

              <div className="sgc-form-row">
                <div className="sgc-form-group">
                  <label>Código (ej. GR, CO, OP)</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={editCodigo}
                    onChange={(e) => setEditCodigo(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="sgc-form-group">
                  <label>Color Identificador</label>
                  <div className="sgc-color-picker-wrap">
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                    />
                    <span className="sgc-color-hex">{editColor}</span>
                  </div>
                </div>
              </div>

              <div className="sgc-form-group">
                <label>Descripción del Proceso</label>
                <textarea
                  rows={4}
                  value={editDescripcion}
                  onChange={(e) => setEditDescripcion(e.target.value)}
                  placeholder="Describe el alcance y objetivo de este proceso..."
                />
              </div>

              <div className="sgc-modal-actions">
                <button
                  type="button"
                  className="sgc-btn-secondary"
                  onClick={() => setModalEditar(false)}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="sgc-btn-primary"
                  disabled={guardando}
                >
                  {guardando ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
