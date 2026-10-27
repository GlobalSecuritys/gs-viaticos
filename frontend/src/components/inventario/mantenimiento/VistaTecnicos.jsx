import React, { useEffect, useState, useCallback, useRef } from 'react';
import { obtenerExcelTecnicos, obtenerExcelDetalleTecnico } from '../../../services/inventario';
import { formatApiError } from '../../../utils/formatError';

/* ── Tarjeta de técnico (slider) ── */
function TarjetaTecnico({ tecnico, activo, onClick }) {
  const nombre = tecnico.nombre || tecnico.hoja || '?';
  const iniciales = tecnico.iniciales || nombre.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  return (
    <button
      type="button"
      className={`mnt-tec-card ${activo ? 'mnt-tec-card--activo' : ''}`}
      onClick={onClick}
      id={`btn-tecnico-${tecnico.hoja?.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <div className="mnt-tec-avatar">{iniciales}</div>
      <div className="mnt-tec-info">
        <span className="mnt-tec-nombre">{nombre}</span>
        <span className="mnt-tec-detalle">
          <strong>{(tecnico.total_unidades ?? 0).toLocaleString('es-CO')}</strong> uds
        </span>
      </div>
      {activo && <span className="mnt-tec-activo-dot" aria-hidden="true" />}
    </button>
  );
}

/* ── Panel de detalle de un técnico ── */
function DetalleTecnico({ planillaId, tecnico, onCerrar }) {
  const nombre = tecnico.nombre || tecnico.hoja || '?';
  const iniciales = tecnico.iniciales || nombre.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const nombreHoja = tecnico.hoja;  // campo real del backend

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const debounceRef = useRef(null);

  const cargar = useCallback(async (params = {}) => {
    setCargando(true);
    setError('');
    try {
      const resp = await obtenerExcelDetalleTecnico(
        planillaId,
        nombreHoja,
        {
          q: params.q ?? q,
          page: params.page ?? page,
          page_size: 50,
        }
      );
      setDatos(resp);
    } catch (err) {
      setError(formatApiError(err, 'Error al cargar el detalle del técnico.'));
    } finally {
      setCargando(false);
    }
  }, [planillaId, nombreHoja, q, page]);

  useEffect(() => {
    setQ('');
    setPage(1);
    setDatos(null);
    cargar({ q: '', page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreHoja]);

  const handleQ = (v) => {
    setQ(v);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargar({ q: v, page: 1 });
    }, 350);
  };

  const handlePage = (p) => {
    setPage(p);
    cargar({ page: p });
  };

  const filas = datos?.filas ?? datos?.items ?? [];
  const total = datos?.total ?? filas.length;
  const pageSize = datos?.page_size ?? 50;
  const totalPaginas = Math.ceil(total / pageSize);

  // Columnas del detalle de técnico (campos reales del backend)
  const columnas = [
    { key: 'descripcion', label: 'Producto / Equipo', wide: true },
    { key: 'serial', label: 'Serial / GSB', width: 150 },
    { key: 'fecha_despacho', label: 'Despacho', width: 110 },
    { key: 'oficina', label: 'Oficina origen', width: 160 },
    { key: 'oficina_instalada', label: 'Instalado en', width: 160 },
    { key: 'observacion', label: 'Observación' },
  ];

  return (
    <div className="mnt-tec-detalle-panel" id="panel-detalle-tecnico">
      {/* Encabezado */}
      <div className="mnt-tec-detalle-header">
        <div className="mnt-tec-detalle-ident">
          <div className="mnt-tec-avatar mnt-tec-avatar--lg">{iniciales}</div>
          <div>
            <h3 className="mnt-tec-detalle-nombre">{nombre}</h3>
            <p className="mnt-subvista-sub">
              {(tecnico.total_unidades ?? 0).toLocaleString('es-CO')} unidades en campo
            </p>
          </div>
        </div>
        <div className="mnt-tec-detalle-controles">
          <div className="mnt-filtro-search">
            <span className="mnt-filtro-search-icon">🔍</span>
            <input
              type="search"
              className="mnt-filtro-input"
              placeholder="Buscar en detalle..."
              value={q}
              onChange={(e) => handleQ(e.target.value)}
              id="filtro-busqueda-tecnico"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className="mnt-btn-volver"
            onClick={onCerrar}
            id="btn-cerrar-detalle-tecnico"
          >
            ✕ Cerrar
          </button>
        </div>
      </div>

      {error && <div className="mnt-alerta mnt-alerta--err">⚠️ {error}</div>}

      <div className="mnt-tabla-wrapper">
        {cargando && filas.length === 0 ? (
          <div className="mnt-loading-box">
            <div className="mnt-spinner" />
            <p>Cargando préstamos...</p>
          </div>
        ) : filas.length === 0 ? (
          <div className="mnt-tabla-vacia">
            <span style={{ fontSize: 32 }}>📭</span>
            <p>Sin equipos registrados para este técnico.</p>
          </div>
        ) : (
          <table className="mnt-tabla">
            <thead>
              <tr>
                {columnas.map((col) => (
                  <th
                    key={col.key}
                    className={`mnt-th ${col.wide ? 'mnt-th--wide' : ''}`}
                    style={{
                      textAlign: col.align || 'left',
                      width: col.width ? `${col.width}px` : undefined,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, idx) => (
                <tr key={idx} className={`mnt-tr ${idx % 2 === 0 ? 'mnt-tr--par' : ''}`}>
                  {columnas.map((col) => {
                    const val = fila[col.key];
                    return (
                      <td
                        key={col.key}
                        className="mnt-td"
                        style={{ textAlign: col.align || 'left' }}
                      >
                        {val != null && val !== ''
                          ? <span>{String(val)}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {cargando && filas.length > 0 && (
          <div className="mnt-tabla-overlay-loading">
            <div className="mnt-spinner mnt-spinner--sm" />
          </div>
        )}
      </div>

      {/* Paginador */}
      {totalPaginas > 1 && (
        <div className="mnt-paginador">
          <button
            className="mnt-pag-btn"
            onClick={() => handlePage(page - 1)}
            disabled={page <= 1 || cargando}
          >‹</button>
          <span className="mnt-pag-info">
            Página <strong>{page}</strong> de <strong>{totalPaginas}</strong>
          </span>
          <button
            className="mnt-pag-btn"
            onClick={() => handlePage(page + 1)}
            disabled={page >= totalPaginas || cargando}
          >›</button>
        </div>
      )}
    </div>
  );
}

/* ── Componente principal VistaTecnicos ── */
export default function VistaTecnicos({ planillaId, onVolver }) {
  const [tecnicos, setTecnicos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tecnicoActivo, setTecnicoActivo] = useState(null);
  const sliderRef = useRef(null);

  const cargarTecnicos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const resp = await obtenerExcelTecnicos(planillaId);
      // El endpoint devuelve lista directa (no wrapper {tecnicos: [...]})
      const lista = Array.isArray(resp) ? resp : (resp?.tecnicos ?? []);
      setTecnicos(lista);
      if (lista.length > 0) setTecnicoActivo(lista[0]);
    } catch (err) {
      setError(formatApiError(err, 'Error al cargar la lista de técnicos.'));
    } finally {
      setCargando(false);
    }
  }, [planillaId]);

  useEffect(() => {
    cargarTecnicos();
  }, [cargarTecnicos]);

  const totalUnidades = tecnicos.reduce((s, t) => s + (t.total_unidades ?? 0), 0);

  return (
    <div className="mnt-subvista-contenedor">
      {/* Encabezado */}
      <div className="mnt-subvista-header">
        <div className="mnt-subvista-left">
          <button
            type="button"
            className="mnt-btn-volver"
            onClick={onVolver}
            id="btn-volver-grid-tecnicos"
          >
            ← Volver
          </button>
          <div>
            <h2 className="mnt-subvista-titulo">👷 Préstamos a técnicos</h2>
            {!cargando && tecnicos.length > 0 && (
              <p className="mnt-subvista-sub">
                {tecnicos.length} técnicos activos ·{' '}
                {totalUnidades.toLocaleString('es-CO')} unidades en campo
              </p>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mnt-alerta mnt-alerta--err">⚠️ {error}</div>}

      {cargando ? (
        <div className="mnt-loading-box">
          <div className="mnt-spinner" />
          <p>Cargando técnicos...</p>
        </div>
      ) : tecnicos.length === 0 ? (
        <div className="mnt-tabla-vacia">
          <span style={{ fontSize: 32 }}>👷</span>
          <p>No hay técnicos con préstamos activos.</p>
        </div>
      ) : (
        <>
          {/* Slider / carrusel de técnicos */}
          <div className="mnt-tec-slider-wrapper" aria-label="Lista de técnicos">
            <div className="mnt-tec-slider" ref={sliderRef}>
              {tecnicos.map((tec) => (
                <TarjetaTecnico
                  key={tec.hoja}
                  tecnico={tec}
                  activo={tecnicoActivo?.hoja === tec.hoja}
                  onClick={() => setTecnicoActivo(tec)}
                />
              ))}
            </div>
          </div>

          {/* Detalle del técnico seleccionado */}
          {tecnicoActivo && (
            <DetalleTecnico
              key={tecnicoActivo.hoja}
              planillaId={planillaId}
              tecnico={tecnicoActivo}
              onCerrar={() => setTecnicoActivo(null)}
            />
          )}

          {!tecnicoActivo && (
            <div className="mnt-tec-seleccionar-aviso">
              <span style={{ fontSize: 28 }}>☝️</span>
              <p>Selecciona un técnico del carrusel para ver sus equipos en campo.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
