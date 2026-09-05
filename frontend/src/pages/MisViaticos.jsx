import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { subirEvidencias, eliminarEvidenciaViatico } from '../services/api';
import { obtenerMisAsignacionesActivas } from '../services/asignaciones';
import TecnicoLayout from '../components/TecnicoLayout';
import ModalSeleccionarTipoViatico from '../components/ModalSeleccionarTipoViatico';
import { LABEL_TIPO_GASTO, formatCOP, formatFechaLarga, formatMiles, limpiarNumero } from '../utils/personal';
import { LABEL_TIPO_ASIGNACION, calcularEstadoGraciaAsignacion } from '../utils/asignaciones';
import './Forms.css';
import './MisViaticos.css';

const LABEL_ESTADO = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

const ICONO_GASTO = {
  alimentacion: '🍽',
  transporte: '🚗',
  hotel: '🏨',
  peajes: '🛣',
  parqueadero: '🅿',
  materiales: '📦',
  alquiler_escalera: '🪜',
  otros: '📎',
};

const CONCEPTOS = [
  { id: 'alimentacion', label: 'Alimentación' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'peajes', label: 'Peajes' },
  { id: 'parqueadero', label: 'Parqueadero' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'alquiler_escalera', label: 'Alquiler de escalera' },
];

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_ARCHIVOS_TOTAL = 5;
const MAX_TAMANO_BYTES = 10 * 1024 * 1024; // 10 MB

function esArchivoPdf(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.pdf');
}

export default function MisViaticos() {
  const navigate = useNavigate();
  const [viaticos, setViaticos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mostrarModalTipoViatico, setMostrarModalTipoViatico] = useState(false);
  const [colapsadas, setColapsadas] = useState({});

  // Estado de edición de viático
  const [viaticoEditando, setViaticoEditando] = useState(null);
  const [editForm, setEditForm] = useState({
    cliente: '',
    ciudad: '',
    ot: '',
    tipo_gasto: 'alimentacion',
    valor: '',
    descripcion: '',
    fecha: '',
  });
  const [mostrarFechaEdit, setMostrarFechaEdit] = useState(false);
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [errorEdit, setErrorEdit] = useState('');

  // Gestión de fotos en la edición
  const [evidenciasExistentes, setEvidenciasExistentes] = useState([]);
  const [evidenciasAEliminar, setEvidenciasAEliminar] = useState(new Set());
  const [nuevasFotos, setNuevasFotos] = useState([]);
  const [errorFotos, setErrorFotos] = useState('');
  const [dragActivo, setDragActivo] = useState(false);

  // Estado de eliminación de viático completo
  const [viaticoEliminando, setViaticoEliminando] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  // Lightbox de evidencias
  const [galeriaViatico, setGaleriaViatico] = useState(null);
  const [fotoActiva, setFotoActiva] = useState(0);

  useEffect(() => {
    let activo = true;
    Promise.all([
      api.get('/viaticos').catch(() => ({ data: [] })),
      obtenerMisAsignacionesActivas().catch(() => ({ data: [] })),
    ])
      .then(([resViaticos, resAsig]) => {
        if (activo) {
          setViaticos(resViaticos.data || []);
          setAsignaciones(resAsig.data || []);
        }
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar tus viáticos.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => { activo = false; };
  }, []);

  const asignacionesMap = useMemo(() => {
    const map = new Map();
    asignaciones.forEach((a) => map.set(a.id, a));
    return map;
  }, [asignaciones]);

  const { grupos, independientes } = useMemo(() => {
    const porAsignacion = {};
    const libres = [];
    viaticos.forEach((v) => {
      if (v.asignacion_id) {
        if (!porAsignacion[v.asignacion_id]) {
          const asig = asignacionesMap.get(v.asignacion_id);
          const resumen = v.asignacion_resumen || (asig ? {
            id: asig.id,
            cliente: asig.cliente,
            empresa: asig.empresa,
            tipo: asig.tipo,
            ciudad: asig.ciudad,
            monto_anticipo: asig.monto_anticipo,
            total_gastado: asig.total_gastado,
            saldo_restante: asig.saldo_restante,
            estado: asig.estado,
          } : null);

          porAsignacion[v.asignacion_id] = {
            asignacion_id: v.asignacion_id,
            resumen,
            asigObj: asig || null,
            viaticos: [],
          };
        }
        porAsignacion[v.asignacion_id].viaticos.push(v);
      } else {
        libres.push(v);
      }
    });
    const gruposOrdenados = Object.values(porAsignacion).sort(
      (a, b) => b.viaticos.length - a.viaticos.length
    );
    return { grupos: gruposOrdenados, independientes: libres };
  }, [viaticos, asignacionesMap]);

  function toggleColapsada(key) {
    setColapsadas((prev) => {
      const actualmenteColapsada = prev[key] !== undefined ? prev[key] : true;
      return { ...prev, [key]: !actualmenteColapsada };
    });
  }

  function esDescripcionEstructurada(str) {
    if (!str || typeof str !== 'string') return false;
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null;
    } catch { return false; }
  }

  /**
   * Determina si la asignación vinculada al viático está disponible para edición.
   * Si no tiene asignación (independiente), siempre está disponible.
   * Si tiene asignación, verifica si está en período válido o dentro de las 24h de gracia.
   */
  function esAsignacionDisponible(resumen, asigObj, v) {
    if (!v?.asignacion_id) return true;
    const asignacion = asigObj || resumen || v?.asignacion_resumen;
    if (!asignacion) return true;
    const { puedeSubir } = calcularEstadoGraciaAsignacion(asignacion);
    return puedeSubir;
  }

  function abrirEditar(v, grupoResumen, grupoAsigObj) {
    if (!esAsignacionDisponible(grupoResumen, grupoAsigObj, v)) {
      alert('Esta asignación fue cerrada y el período de gracia de 24 horas para modificar viáticos ha finalizado.');
      return;
    }

    // Limpiar previews previos de memoria si los hubiere
    nuevasFotos.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });

    setViaticoEditando(v);
    setErrorEdit('');
    setErrorFotos('');
    setMostrarFechaEdit(false);
    setEvidenciasExistentes(v.evidencias ? [...v.evidencias] : []);
    setEvidenciasAEliminar(new Set());
    setNuevasFotos([]);
    setDragActivo(false);

    setEditForm({
      cliente: v.cliente || '',
      ciudad: v.ciudad || '',
      ot: v.ot || '',
      tipo_gasto: v.tipo_gasto || 'alimentacion',
      valor: v.valor || '',
      descripcion: esDescripcionEstructurada(v.descripcion) ? '' : (v.descripcion || ''),
      fecha: v.fecha || '',
    });
  }

  function cerrarModalEditar() {
    nuevasFotos.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setNuevasFotos([]);
    setEvidenciasAEliminar(new Set());
    setViaticoEditando(null);
    setErrorEdit('');
    setErrorFotos('');
  }

  function abrirEliminar(v, grupoResumen, grupoAsigObj) {
    if (!esAsignacionDisponible(grupoResumen, grupoAsigObj, v)) {
      alert('Esta asignación se encuentra finalizada o cancelada y sus viáticos no pueden ser eliminados.');
      return;
    }
    setViaticoEliminando(v);
    setErrorEliminar('');
  }

  // Marcar / Desmarcar foto existente para eliminación
  function toggleEliminarEvidencia(id) {
    setEvidenciasAEliminar((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setErrorFotos('');
  }

  // Validar y agregar nuevas fotos o PDFs
  function validarYAgregarNuevasFotos(archivosSeleccionados) {
    setErrorFotos('');
    const lista = Array.from(archivosSeleccionados || []);
    if (lista.length === 0) return;

    const activasExistentes = evidenciasExistentes.filter((e) => !evidenciasAEliminar.has(e.id)).length;
    const totalActual = activasExistentes + nuevasFotos.length;

    if (totalActual + lista.length > MAX_ARCHIVOS_TOTAL) {
      setErrorFotos(`El viático puede tener máximo ${MAX_ARCHIVOS_TOTAL} soportes en total. Disponibles: ${MAX_ARCHIVOS_TOTAL - totalActual}.`);
      return;
    }

    for (const file of lista) {
      const esValido = TIPOS_PERMITIDOS.includes(file.type) || file.name?.toLowerCase().endsWith('.pdf');
      if (!esValido) {
        setErrorFotos(`Formato no permitido: "${file.name}". Usa JPG, PNG, WEBP o PDF.`);
        return;
      }
      if (file.size > MAX_TAMANO_BYTES) {
        setErrorFotos(`"${file.name}" supera los 10 MB permitidos.`);
        return;
      }
    }

    const conPreview = lista.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      isPdf: file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf'),
      id: crypto.randomUUID(),
    }));

    setNuevasFotos((prev) => [...prev, ...conPreview]);
  }

  function quitarNuevaFoto(id) {
    setNuevasFotos((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((f) => f.id !== id);
    });
    setErrorFotos('');
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    setGuardandoEdit(true);
    setErrorEdit('');

    try {
      // 1. Guardar cambios en los datos del viático
      const payload = {
        cliente: editForm.cliente,
        ciudad: editForm.ciudad,
        ot: editForm.ot,
        tipo_gasto: editForm.tipo_gasto,
        valor: parseFloat(editForm.valor),
        descripcion: editForm.descripcion || null,
      };
      if (mostrarFechaEdit && editForm.fecha) payload.fecha = editForm.fecha;

      await api.put(`/viaticos/${viaticoEditando.id}`, payload);

      // 2. Eliminar fotos marcadas
      if (evidenciasAEliminar.size > 0) {
        for (const evId of evidenciasAEliminar) {
          try {
            await eliminarEvidenciaViatico(viaticoEditando.id, evId);
          } catch (errEv) {
            console.error(`Error al eliminar evidencia #${evId}:`, errEv);
          }
        }
      }

      // 3. Subir fotos nuevas si existen
      if (nuevasFotos.length > 0) {
        try {
          await subirEvidencias(
            viaticoEditando.id,
            nuevasFotos.map((f) => f.file)
          );
        } catch (errUpload) {
          console.error('Error al subir nuevas evidencias:', errUpload);
          throw new Error('El viático se guardó pero falló la subida de archivos. Verifica tu conexión.');
        }
      }

      // 4. Obtener el viático actualizado con sus nuevas evidencias
      const { data: viaticoRefrescado } = await api.get(`/viaticos/${viaticoEditando.id}`);
      setViaticos((prev) =>
        prev.map((item) => (item.id === viaticoEditando.id ? { ...item, ...viaticoRefrescado } : item))
      );

      cerrarModalEditar();
    } catch (err) {
      setErrorEdit(err.response?.data?.detail || err.message || 'No se pudo guardar el viático.');
    } finally {
      setGuardandoEdit(false);
    }
  }

  async function handleConfirmarEliminar() {
    setEliminando(true);
    try {
      await api.delete(`/viaticos/${viaticoEliminando.id}`);
      setViaticos((prev) => prev.filter((item) => item.id !== viaticoEliminando.id));
      setViaticoEliminando(null);
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || 'No se pudo eliminar el viático.');
    } finally {
      setEliminando(false);
    }
  }

  function FilaViatico({ v, resumen, asigObj }) {
    const tieneEvidencias = v.evidencias?.length > 0;
    const asignacionDisponible = esAsignacionDisponible(resumen, asigObj, v);
    const cantEvs = v.evidencias?.length || 0;
    const soloPdfs = tieneEvidencias && v.evidencias.every((e) => esArchivoPdf(e.secure_url));

    let textoEvidencia = '';
    if (tieneEvidencias) {
      if (soloPdfs) {
        textoEvidencia = cantEvs > 1 ? `📄 ${cantEvs} PDFs — ver` : '📄 PDF — ver';
      } else {
        textoEvidencia = `📷 ${cantEvs} foto${cantEvs > 1 ? 's' : ''} — ver`;
      }
    }

    return (
      <div className="mv-viatico-item">
        <div className="mv-vi-izq">
          <span className="mv-vi-icono">{ICONO_GASTO[v.tipo_gasto] || '📎'}</span>
          <div className="mv-vi-info">
            <span className="mv-vi-tipo">{LABEL_TIPO_GASTO[v.tipo_gasto] || v.tipo_gasto}</span>
            <span className="mv-vi-fecha">{formatFechaLarga(v.fecha)}</span>
            {v.ciudad && <span className="mv-vi-ciudad">📍 {v.ciudad}</span>}
            {tieneEvidencias ? (
              <button
                type="button"
                className="mv-vi-ev mv-vi-ev--btn"
                onClick={() => { setGaleriaViatico(v); setFotoActiva(0); }}
                title={soloPdfs ? 'Ver documento PDF de soporte' : 'Ver fotografías de soporte'}
              >
                {textoEvidencia}
              </button>
            ) : (
              <span className="mv-vi-ev mv-vi-ev--vacio">Sin evidencia</span>
            )}
          </div>
        </div>
        <div className="mv-vi-der">
          <span className="mv-vi-valor">{formatCOP(v.valor)}</span>
          <span className={`mv-vi-estado mv-vi-estado--${v.estado}`}>
            {LABEL_ESTADO[v.estado] || v.estado}
          </span>
          {v.comentario_admin && (
            <span className="mv-vi-comentario" title={v.comentario_admin}>
              💬 {v.comentario_admin}
            </span>
          )}

          {!asignacionDisponible ? (
            <div className="mv-vi-acciones">
              <span className="mv-bloqueado-badge" title="Esta asignación está finalizada o cancelada">
                🔒 Asig. Cerrada
              </span>
            </div>
          ) : (
            <>
              {v.estado === 'pendiente' && (
                <div className="mv-vi-acciones">
                  <button
                    type="button"
                    className="mv-btn-accion mv-btn-accion--edit"
                    onClick={() => abrirEditar(v, resumen, asigObj)}
                  >
                    ✏ Editar
                  </button>
                  <button
                    type="button"
                    className="mv-btn-accion mv-btn-accion--del"
                    onClick={() => abrirEliminar(v, resumen, asigObj)}
                  >
                    🗑 Borrar
                  </button>
                </div>
              )}
              {v.estado === 'rechazado' && (
                <div className="mv-vi-acciones">
                  <button
                    type="button"
                    className="mv-btn-accion mv-btn-accion--reenviar"
                    onClick={() => abrirEditar(v, resumen, asigObj)}
                  >
                    🔄 Corregir y reenviar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function PaletaAsignacion({ grupo, numero }) {
    const { asignacion_id, resumen, asigObj, viaticos: items } = grupo;
    const isColapsada = colapsadas[asignacion_id] !== undefined ? colapsadas[asignacion_id] : true;
    const totalGrupo = items.reduce((acc, v) => acc + parseFloat(v.valor || 0), 0);
    const pendientes = items.filter((v) => v.estado === 'pendiente').length;
    const aprobados = items.filter((v) => v.estado === 'aprobado').length;
    const rechazados = items.filter((v) => v.estado === 'rechazado').length;

    const primerViatico = items[0] || {};
    const nombreCliente = resumen?.cliente || asigObj?.cliente || primerViatico.cliente || `Asignación #${asignacion_id}`;
    const nombreOficina = resumen?.empresa || asigObj?.empresa || '';
    const nombreLugar = resumen?.ciudad || asigObj?.ciudad || primerViatico.ciudad || '';
    const tipoAsig = resumen?.tipo || asigObj?.tipo || '';
    const estadoAsig = resumen?.estado || asigObj?.estado || '';
    const asignacionActiva = esAsignacionDisponible(resumen, asigObj, primerViatico);

    const partesTitulo = [nombreCliente, nombreOficina, nombreLugar].filter(Boolean);
    const tituloPaleta = partesTitulo.length > 0 ? partesTitulo.join(' / ') : `Asignación #${asignacion_id}`;

    const anticipoAsig = resumen?.monto_anticipo || asigObj?.monto_anticipo || 0;
    const gastadoAsig = resumen?.total_gastado || asigObj?.total_gastado || totalGrupo;
    const saldoAsig = resumen?.saldo_restante !== undefined ? resumen.saldo_restante : (asigObj?.saldo_restante !== undefined ? asigObj.saldo_restante : Math.max(0, anticipoAsig - gastadoAsig));
    const saldoFavorTecnico = Number(gastadoAsig) > Number(anticipoAsig) ? Number(gastadoAsig) - Number(anticipoAsig) : 0;

    return (
      <div className="mv-paleta">
        <button
          type="button"
          className="mv-paleta-header"
          onClick={() => toggleColapsada(asignacion_id)}
          aria-expanded={!isColapsada}
        >
          <div className="mv-paleta-header-izq">
            <span className="mv-paleta-numero">{numero}</span>
            <div className="mv-paleta-titulo">
              <span className="mv-paleta-cliente">{tituloPaleta}</span>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {tipoAsig && (
                  <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569', background: '#F1F5F9', padding: '0.12rem 0.45rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                    {LABEL_TIPO_ASIGNACION[tipoAsig] || tipoAsig}
                  </span>
                )}
                {!asignacionActiva && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '0.12rem 0.45rem', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
                    🔒 Cerrada ({estadoAsig})
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mv-paleta-header-der">
            <div className="mv-paleta-badges">
              {pendientes > 0 && <span className="mv-paleta-badge mv-paleta-badge--pendiente">{pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>}
              {aprobados > 0 && <span className="mv-paleta-badge mv-paleta-badge--aprobado">{aprobados} aprobado{aprobados > 1 ? 's' : ''}</span>}
              {rechazados > 0 && <span className="mv-paleta-badge mv-paleta-badge--rechazado">{rechazados} rechazado{rechazados > 1 ? 's' : ''}</span>}
              <span className="mv-paleta-badge mv-paleta-badge--total">{formatCOP(totalGrupo)}</span>
            </div>
            <span className="mv-paleta-toggle">{isColapsada ? '▼' : '▲'}</span>
          </div>
        </button>

        {!isColapsada && (
          <div className="mv-paleta-body">
            <div className="mv-paleta-resumen">
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Anticipo</span>
                <span className="mv-pr-val">{formatCOP(anticipoAsig)}</span>
              </div>
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Gastado</span>
                <span className="mv-pr-val mv-pr-val--gastado">{formatCOP(gastadoAsig)}</span>
              </div>
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Saldo</span>
                <span className={`mv-pr-val ${parseFloat(saldoAsig) < 0 ? 'mv-pr-val--negativo' : 'mv-pr-val--saldo'}`}>
                  {formatCOP(saldoAsig)}
                </span>
              </div>
              {saldoFavorTecnico > 0 && (
                <div className="mv-paleta-resumen-item mv-paleta-resumen-item--favor-tecnico" style={{ background: '#FEF2F2', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                  <span className="mv-pr-label" style={{ color: '#991B1B', fontWeight: 700 }}>Saldo a favor técnico</span>
                  <span className="mv-pr-val" style={{ color: '#DC2626', fontWeight: 800 }}>{formatCOP(saldoFavorTecnico)}</span>
                </div>
              )}
              <div className="mv-paleta-resumen-item">
                <span className="mv-pr-label">Items</span>
                <span className="mv-pr-val">{items.length}</span>
              </div>
            </div>
            <div className="mv-paleta-viaticos">
              {items.map((v) => <FilaViatico key={v.id} v={v} resumen={resumen} asigObj={asigObj} />)}
            </div>
            {asignacionActiva && (
              <div className="mv-paleta-footer">
                <button
                  type="button"
                  className="mv-paleta-btn-agregar"
                  onClick={() => navigate(`/nuevo-viatico?asignacion_id=${asignacion_id}`)}
                >
                  + Agregar gasto a esta asignación
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const fotosActivasTotal = evidenciasExistentes.filter((e) => !evidenciasAEliminar.has(e.id)).length + nuevasFotos.length;

  return (
    <TecnicoLayout>
      <div className="mv-root" style={{ padding: '2rem 1.5rem', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <header className="form-header">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>← Volver</button>
          <div className="form-header-title">
            <h1>Mis Viáticos</h1>
            <p>Historial y estado de tus viáticos registrados</p>
          </div>
          <button className="btn-nuevo" onClick={() => setMostrarModalTipoViatico(true)}>
            + Nuevo Viático
          </button>
        </header>

        <div className="mv-body">
          {error && <div className="form-error" role="alert"><span>⚠</span> {error}</div>}

          {loading ? (
            <div className="mv-loading"><div className="mv-spinner" /><span>Cargando tus viáticos…</span></div>
          ) : viaticos.length === 0 ? (
            <div className="mv-empty">
              <span className="mv-empty-icon">📋</span>
              <p>Todavía no has registrado ningún viático.</p>
              <button className="btn-primary" onClick={() => setMostrarModalTipoViatico(true)}>Registrar el primero</button>
            </div>
          ) : (
            <div className="mv-grupos-wrap">
              {grupos.length > 0 && (
                <section className="mv-section">
                  <div className="mv-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <h2 className="mv-section-title"><span>📍</span> Por Asignación</h2>
                      <span className="mv-section-count">{grupos.length} asignacion{grupos.length > 1 ? 'es' : ''}</span>
                    </div>
                    {grupos.length > 1 && (
                      <button
                        type="button"
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: '#2563EB',
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          padding: '0.25rem 0.65rem',
                          transition: 'all 0.15s ease',
                        }}
                        onClick={() => {
                          const hayAlgunaAbierta = grupos.some(
                            (g) => !(colapsadas[g.asignacion_id] !== undefined ? colapsadas[g.asignacion_id] : true)
                          );
                          const nuevoEstado = {};
                          grupos.forEach((g) => {
                            nuevoEstado[g.asignacion_id] = hayAlgunaAbierta;
                          });
                          setColapsadas(nuevoEstado);
                        }}
                      >
                        {grupos.some((g) => !(colapsadas[g.asignacion_id] !== undefined ? colapsadas[g.asignacion_id] : true))
                          ? 'Contraer todas ▲'
                          : 'Expandir todas ▼'}
                      </button>
                    )}
                  </div>
                  <div className="mv-paletas-lista">
                    {grupos.map((g, idx) => (
                      <PaletaAsignacion key={g.asignacion_id} grupo={g} numero={idx + 1} />
                    ))}
                  </div>
                </section>
              )}

              {independientes.length > 0 && (
                <section className="mv-section">
                  <div className="mv-section-header">
                    <h2 className="mv-section-title"><span>📄</span> Viáticos Independientes</h2>
                    <span className="mv-section-count">{independientes.length} registro{independientes.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="mv-paleta mv-paleta--independiente">
                    <div className="mv-paleta-viaticos">
                      {independientes.map((v) => <FilaViatico key={v.id} v={v} resumen={null} asigObj={null} />)}
                    </div>
                    <div className="mv-paleta-footer">
                      <button type="button" className="mv-paleta-btn-agregar" onClick={() => navigate('/nuevo-viatico')}>
                        + Agregar viático independiente
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* ── MODAL: EDITAR VIÁTICO (INCLUYE FOTOGRAFÍAS) ── */}
        {viaticoEditando && (
          <div className="mv-modal-overlay" onClick={cerrarModalEditar}>
            <div className="mv-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mv-modal-header">
                <div>
                  <h2>Editar Viático #{viaticoEditando.id}</h2>
                  {viaticoEditando.estado === 'rechazado' && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#D97706', fontWeight: 600 }}>
                      ⚠ Este viático fue rechazado. Al guardar se reenviará al administrador para revisión.
                    </p>
                  )}
                </div>
                <button type="button" className="mv-modal-close" onClick={cerrarModalEditar}>✕</button>
              </div>

              {errorEdit && <div className="form-error" style={{ margin: '1rem 1.25rem 0' }}><span>⚠</span> {errorEdit}</div>}

              <form onSubmit={handleGuardarEdicion} className="mv-modal-body">
                <div className="mv-form-grid">
                  <div className="mv-form-field">
                    <label>Cliente</label>
                    <input type="text" required value={editForm.cliente} onChange={(e) => setEditForm({ ...editForm, cliente: e.target.value })} />
                  </div>
                  <div className="mv-form-field">
                    <label>Ciudad / Ubicación</label>
                    <input type="text" required value={editForm.ciudad} onChange={(e) => setEditForm({ ...editForm, ciudad: e.target.value })} />
                  </div>
                  <div className="mv-form-field">
                    <label>Tipo de Gasto</label>
                    <select value={editForm.tipo_gasto} onChange={(e) => setEditForm({ ...editForm, tipo_gasto: e.target.value })}>
                      {editForm.tipo_gasto === 'otros' && <option value="otros">Otros (Histórico)</option>}
                      {CONCEPTOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="mv-form-field">
                    <label>Valor (COP)</label>
                    <input type="text" inputMode="numeric" required placeholder="$ 0" value={formatMiles(editForm.valor)} onChange={(e) => setEditForm({ ...editForm, valor: limpiarNumero(e.target.value) })} />
                  </div>
                </div>

                <div className="mv-form-field" style={{ marginTop: '0.85rem' }}>
                  <label>Descripción / Observación (opcional)</label>
                  <textarea rows={2} value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} />
                </div>

                <div className="mv-fecha-colapsable">
                  <button type="button" className="mv-btn-colapsable" onClick={() => setMostrarFechaEdit((v) => !v)}>
                    <span>Editar fecha (opcional)</span>
                    <span>{mostrarFechaEdit ? '▴' : '▾'}</span>
                  </button>
                  {mostrarFechaEdit && (
                    <div className="mv-fecha-input-wrap">
                      <label>Nueva fecha</label>
                      <input type="date" value={editForm.fecha} onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value })} />
                    </div>
                  )}
                </div>

                {/* ── GESTIÓN DE FOTOGRAFÍAS / EVIDENCIAS ── */}
                <div className="mv-evidencias-seccion">
                  <div className="mv-evidencias-header">
                    <label className="mv-evidencias-label">
                      📷 Fotografías / Documentos PDF de soporte
                    </label>
                    <span className="mv-evidencias-conteo">
                      {fotosActivasTotal} / {MAX_ARCHIVOS_TOTAL}
                    </span>
                  </div>

                  {/* Fotos/PDFs actuales existentes */}
                  {evidenciasExistentes.length > 0 && (
                    <div className="mv-fotos-bloque">
                      <span className="mv-fotos-subtitulo">Soportes actuales en el sistema:</span>
                      <div className="mv-fotos-grid">
                        {evidenciasExistentes.map((ev, idx) => {
                          const eliminada = evidenciasAEliminar.has(ev.id);
                          const esPdf = esArchivoPdf(ev.secure_url);
                          return (
                            <div
                              key={ev.id}
                              className={`mv-foto-card ${eliminada ? 'mv-foto-card--eliminada' : ''}`}
                            >
                              {esPdf ? (
                                <div style={{ width: '100%', height: '75px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FEF2F2', color: '#DC2626' }}>
                                  <span style={{ fontSize: '1.5rem' }}>📄</span>
                                  <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>PDF</span>
                                </div>
                              ) : (
                                <img src={ev.secure_url} alt={`Evidencia ${idx + 1}`} className="mv-foto-img" />
                              )}
                              {eliminada && (
                                <div className="mv-foto-overlay-eliminada">
                                  <span>❌ Se eliminará</span>
                                </div>
                              )}
                              <div className="mv-foto-acciones">
                                <button
                                  type="button"
                                  className="mv-foto-btn mv-foto-btn--ver"
                                  onClick={() => {
                                    setGaleriaViatico({ ...viaticoEditando, evidencias: [ev] });
                                    setFotoActiva(0);
                                  }}
                                  title="Ver soporte completo"
                                >
                                  🔍 Ver
                                </button>
                                <button
                                  type="button"
                                  className={`mv-foto-btn ${eliminada ? 'mv-foto-btn--deshacer' : 'mv-foto-btn--borrar'}`}
                                  onClick={() => toggleEliminarEvidencia(ev.id)}
                                >
                                  {eliminada ? '↩ Deshacer' : '🗑 Quitar'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Fotos/PDFs nuevas preparadas para subir */}
                  {nuevasFotos.length > 0 && (
                    <div className="mv-fotos-bloque">
                      <span className="mv-fotos-subtitulo">Nuevos soportes para subir:</span>
                      <div className="mv-fotos-grid">
                        {nuevasFotos.map((nf) => (
                          <div key={nf.id} className="mv-foto-card mv-foto-card--nueva">
                            {nf.isPdf ? (
                              <div style={{ width: '100%', height: '75px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FEF2F2', color: '#DC2626' }}>
                                <span style={{ fontSize: '1.5rem' }}>📄</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>PDF</span>
                              </div>
                            ) : (
                              <img src={nf.preview} alt="Nueva evidencia" className="mv-foto-img" />
                            )}
                            <span className="mv-foto-badge-nueva">🆕 Nueva</span>
                            <button
                              type="button"
                              className="mv-foto-btn-quitar-nueva"
                              onClick={() => quitarNuevaFoto(nf.id)}
                              title="Quitar este soporte"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dropzone para agregar más fotografías o PDFs */}
                  {fotosActivasTotal < MAX_ARCHIVOS_TOTAL && (
                    <div
                      className={`mv-dropzone-compact ${dragActivo ? 'mv-dropzone-compact--activo' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragActivo(true); }}
                      onDragLeave={() => setDragActivo(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragActivo(false);
                        validarYAgregarNuevasFotos(e.dataTransfer.files);
                      }}
                      onClick={() => document.getElementById('input-edit-fotos').click()}
                    >
                      <input
                        id="input-edit-fotos"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        multiple
                        hidden
                        onChange={(e) => validarYAgregarNuevasFotos(e.target.files)}
                      />
                      <span className="mv-dropzone-icon">📎</span>
                      <div className="mv-dropzone-text-wrap">
                        <span className="mv-dropzone-text-principal">
                          {evidenciasExistentes.length === 0 && nuevasFotos.length === 0
                            ? 'Subir fotografía, comprobante o PDF'
                            : '+ Agregar otra fotografía o PDF'}
                        </span>
                        <span className="mv-dropzone-text-secundario">
                          Haz clic o arrastra archivos (JPG, PNG, WEBP, PDF, máx 10MB)
                        </span>
                      </div>
                    </div>
                  )}

                  {errorFotos && <p className="mv-fotos-error">⚠ {errorFotos}</p>}
                </div>

                <div className="mv-modal-footer">
                  <button type="button" className="btn-back" onClick={cerrarModalEditar} disabled={guardandoEdit}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={guardandoEdit}>
                    {guardandoEdit
                      ? 'Guardando…'
                      : viaticoEditando?.estado === 'rechazado'
                        ? '🔄 Corregir y Reenviar'
                        : 'Guardar Cambios'
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: ELIMINAR VIÁTICO ── */}
        {viaticoEliminando && (
          <div className="mv-modal-overlay">
            <div className="mv-modal mv-modal--small">
              <div className="mv-modal-header">
                <h2>Eliminar Viático #{viaticoEliminando.id}</h2>
                <button type="button" className="mv-modal-close" onClick={() => setViaticoEliminando(null)}>✕</button>
              </div>
              {errorEliminar && <div className="form-error" style={{ margin: '1rem 1.25rem 0' }}><span>⚠</span> {errorEliminar}</div>}
              <div className="mv-modal-body">
                <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--color-text)' }}>
                  ¿Estás seguro de que deseas eliminar el viático de <strong>{viaticoEliminando.cliente}</strong> por <strong>{formatCOP(viaticoEliminando.valor)}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                  Esta acción no se puede deshacer y notificará al administrador.
                </p>
              </div>
              <div className="mv-modal-footer">
                <button type="button" className="btn-back" onClick={() => setViaticoEliminando(null)} disabled={eliminando}>Cancelar</button>
                <button type="button" className="btn-primary" style={{ backgroundColor: '#DC2626' }} onClick={handleConfirmarEliminar} disabled={eliminando}>
                  {eliminando ? 'Eliminando…' : 'Sí, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {mostrarModalTipoViatico && (
          <ModalSeleccionarTipoViatico onClose={() => setMostrarModalTipoViatico(false)} />
        )}

        {/* ── LIGHTBOX DE EVIDENCIAS ── */}
        {galeriaViatico && (() => {
          const evActiva = galeriaViatico.evidencias?.[fotoActiva];
          const esPdfActiva = evActiva ? esArchivoPdf(evActiva.secure_url) : false;
          const soloPdfs = galeriaViatico.evidencias?.every((e) => esArchivoPdf(e.secure_url));

          return (
            <div
              className="mv-lightbox-overlay"
              onClick={() => setGaleriaViatico(null)}
              role="dialog"
              aria-modal="true"
              aria-label="Galería de evidencias"
            >
              <div className="mv-lightbox" onClick={(e) => e.stopPropagation()}>
                <div className="mv-lightbox-header">
                  <div>
                    <span className="mv-lightbox-title">
                      {soloPdfs ? '📄 Documento PDF' : esPdfActiva ? '📄 Documento PDF' : '📷 Evidencias fotográficas'}
                    </span>
                    <span className="mv-lightbox-sub">
                      {LABEL_TIPO_GASTO[galeriaViatico.tipo_gasto] || galeriaViatico.tipo_gasto}
                      {' · '}{formatFechaLarga(galeriaViatico.fecha)}
                      {' · '}{formatCOP(galeriaViatico.valor)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mv-lightbox-close"
                    onClick={() => setGaleriaViatico(null)}
                    aria-label="Cerrar galería"
                  >
                    ✕
                  </button>
                </div>

                <div className="mv-lightbox-main">
                  {galeriaViatico.evidencias.length > 1 && (
                    <button
                      type="button"
                      className="mv-lightbox-nav mv-lightbox-nav--prev"
                      disabled={fotoActiva === 0}
                      onClick={() => setFotoActiva((i) => Math.max(0, i - 1))}
                      aria-label="Foto anterior"
                    >
                      ‹
                    </button>
                  )}

                  {esPdfActiva ? (
                    <div style={{ width: '100%', height: '52vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ padding: '0.5rem 0.8rem', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>📄 Documento PDF adjunto</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <a
                            href={evActiva?.secure_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '0.78rem',
                              background: '#2563EB',
                              color: '#FFFFFF',
                              padding: '0.3rem 0.75rem',
                              borderRadius: '6px',
                              textDecoration: 'none',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            ↗️ Abrir PDF
                          </a>
                        </div>
                      </div>
                      <iframe
                        src={evActiva?.secure_url}
                        title={`Documento PDF ${fotoActiva + 1}`}
                        style={{ width: '100%', flex: 1, border: 'none' }}
                      />
                    </div>
                  ) : (
                    <img
                      key={evActiva?.secure_url}
                      src={evActiva?.secure_url}
                      alt={`Evidencia ${fotoActiva + 1} de ${galeriaViatico.evidencias.length}`}
                      className="mv-lightbox-img"
                    />
                  )}

                  {galeriaViatico.evidencias.length > 1 && (
                    <button
                      type="button"
                      className="mv-lightbox-nav mv-lightbox-nav--next"
                      disabled={fotoActiva === galeriaViatico.evidencias.length - 1}
                      onClick={() => setFotoActiva((i) => Math.min(galeriaViatico.evidencias.length - 1, i + 1))}
                      aria-label="Foto siguiente"
                    >
                      ›
                    </button>
                  )}
                </div>

                <div className="mv-lightbox-counter">
                  {esPdfActiva ? '📄 PDF' : '📷 Foto'} {fotoActiva + 1} de {galeriaViatico.evidencias.length}
                </div>

                {galeriaViatico.evidencias.length > 1 && (
                  <div className="mv-lightbox-thumbs">
                    {galeriaViatico.evidencias.map((ev, idx) => {
                      const esThumbPdf = esArchivoPdf(ev.secure_url);
                      return (
                        <button
                          key={ev.secure_url || idx}
                          type="button"
                          className={`mv-lightbox-thumb ${idx === fotoActiva ? 'mv-lightbox-thumb--active' : ''}`}
                          onClick={() => setFotoActiva(idx)}
                          aria-label={`Ver soporte ${idx + 1}`}
                        >
                          {esThumbPdf ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FEF2F2', color: '#DC2626', borderRadius: '4px' }}>
                              <span style={{ fontSize: '1.1rem' }}>📄</span>
                              <span style={{ fontSize: '0.55rem', fontWeight: 700 }}>PDF</span>
                            </div>
                          ) : (
                            <img src={ev.secure_url} alt={`Miniatura ${idx + 1}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </TecnicoLayout>
  );
}
