import React, { useEffect, useState, useCallback, useRef } from 'react';
import { obtenerExcelVista } from '../../../services/inventario';
import { formatApiError } from '../../../utils/formatError';

/* ── Configuración por vista ── */
const CONFIG_VISTA = {
  cantidad_total: {
    titulo: 'Stock en bodega por producto',
    icono: '📦',
    columnas: [
      { key: 'descripcion', label: 'Producto', wide: true },
      { key: 'unidades_bodega', label: 'En bodega', align: 'right', badge: 'verde' },
      { key: 'salidas_pendientes', label: 'Pendientes', align: 'right', width: 110 },
      { key: 'instaladas', label: 'Instaladas', align: 'right', width: 100 },
    ],
    filtros: ['q'],
    textoVacio: 'No hay productos con stock en bodega.',
  },
  salidas: {
    titulo: 'Salidas despachadas',
    icono: '🚚',
    columnas: [
      { key: 'fecha_despacho', label: 'Despacho', width: 105 },
      { key: 'descripcion', label: 'Producto', wide: true },
      { key: 'serial', label: 'Serial', width: 140 },
      { key: 'tecnico', label: 'Técnico', width: 170 },
      { key: 'oficina', label: 'Oficina', width: 150 },
      { key: 'estado', label: 'Estado', align: 'center', badge: 'estado' },
    ],
    filtros: ['q', 'filtro_estado', 'filtro_tecnico'],
    textoVacio: 'No hay salidas que coincidan con los filtros.',
    opcionesEstado: [
      { value: '', label: 'Todos los estados' },
      { value: 'instalada', label: '✅ Instalada' },
      { value: 'pendiente', label: '⏳ Pendiente' },
      { value: 'devuelta', label: '↩️ Devuelta' },
      { value: 'danada', label: '⚠️ Dañada' },
    ],
  },
  prestamos: {
    titulo: 'Préstamos generales',
    icono: '📋',
    columnas: [
      { key: 'descripcion', label: 'Producto / Equipo', wide: true },
      { key: 'cantidad', label: 'Cantidad', align: 'right', badge: 'verde', width: 100 },
    ],
    filtros: ['q'],
    textoVacio: 'No hay préstamos que coincidan.',
  },
  compras: {
    titulo: 'Compras recibidas',
    icono: '📥',
    columnas: [
      { key: 'fecha_compra', label: 'Fecha', width: 105 },
      { key: 'descripcion', label: 'Producto', wide: true },
      { key: 'cantidad', label: 'Cant.', align: 'right', badge: 'verde', width: 80 },
      { key: 'factura', label: 'Factura / OC', width: 140 },
      { key: 'serial', label: 'Serial / Código', width: 150 },
    ],
    filtros: ['q'],
    textoVacio: 'No hay compras que coincidan.',
  },
};

/* ── Colores badge estado ── */
function BadgeEstado({ valor }) {
  if (!valor) return null;
  const v = valor.toLowerCase();
  const map = {
    instalada:  { color: '#059669', bg: '#ecfdf5', label: 'Instalada' },
    pendiente:  { color: '#d97706', bg: '#fffbeb', label: 'Pendiente' },
    devuelta:   { color: '#2563eb', bg: '#eff6ff', label: 'Devuelta' },
    danada:     { color: '#dc2626', bg: '#fef2f2', label: 'Dañada' },
    'dañada':   { color: '#dc2626', bg: '#fef2f2', label: 'Dañada' },
  };
  const cfg = map[v] || { color: '#475569', bg: '#f1f5f9', label: valor };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 600,
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.color}30`,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

/* ── Badge cantidad verde ── */
function BadgeCantidad({ valor }) {
  if (!valor && valor !== 0) return <span style={{ color: '#64748b' }}>—</span>;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: 700,
      background: '#ecfdf5',
      color: '#059669',
    }}>
      {Number(valor).toLocaleString('es-CO')}
    </span>
  );
}

/* ── Paginador ── */
function Paginador({ page, totalPaginas, onPageChange, cargando }) {
  if (totalPaginas <= 1) return null;
  return (
    <div className="mnt-paginador" aria-label="Paginación">
      <button
        className="mnt-pag-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1 || cargando}
        aria-label="Página anterior"
      >
        ‹
      </button>
      <span className="mnt-pag-info">
        Página <strong>{page}</strong> de <strong>{totalPaginas}</strong>
      </span>
      <button
        className="mnt-pag-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPaginas || cargando}
        aria-label="Página siguiente"
      >
        ›
      </button>
    </div>
  );
}

/* ── Componente principal ── */
export default function VistaTabla({ planillaId, vista, onVolver, tecnicos = [] }) {
  const cfg = CONFIG_VISTA[vista] || CONFIG_VISTA.cantidad_total;

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [q, setQ] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [page, setPage] = useState(1);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const cargar = useCallback(async (params = {}) => {
    setCargando(true);
    setError('');
    try {
      const resp = await obtenerExcelVista({
        planillaId,
        vista,
        q: params.q ?? q,
        filtro_estado: params.filtro_estado ?? filtroEstado,
        filtro_tecnico: params.filtro_tecnico ?? filtroTecnico,
        page: params.page ?? page,
        page_size: 50,
      });
      setDatos(resp);
    } catch (err) {
      setError(formatApiError(err, 'Error al cargar los datos.'));
    } finally {
      setCargando(false);
    }
  }, [planillaId, vista, q, filtroEstado, filtroTecnico, page]);

  // Carga inicial
  useEffect(() => {
    cargar({ page: 1, q: '', filtro_estado: '', filtro_tecnico: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planillaId, vista]);

  // Buscar con debounce cuando cambia q
  const handleQ = (v) => {
    setQ(v);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargar({ q: v, filtro_estado: filtroEstado, filtro_tecnico: filtroTecnico, page: 1 });
    }, 350);
  };

  const handleEstado = (v) => {
    setFiltroEstado(v);
    setPage(1);
    cargar({ q, filtro_estado: v, filtro_tecnico: filtroTecnico, page: 1 });
  };

  const handleTecnico = (v) => {
    setFiltroTecnico(v);
    setPage(1);
    cargar({ q, filtro_estado: filtroEstado, filtro_tecnico: v, page: 1 });
  };

  const handlePage = (p) => {
    setPage(p);
    cargar({ page: p });
  };

  const filas = datos?.filas ?? datos?.items ?? [];
  const total = datos?.total ?? filas.length;
  const pageSize = datos?.page_size ?? 50;
  const totalPaginas = Math.ceil(total / pageSize);

  /* ── Render de celda ── */
  const renderCelda = (col, fila) => {
    const val = fila[col.key];
    if (col.badge === 'estado') return <BadgeEstado valor={val} />;
    if (col.badge === 'verde') return <BadgeCantidad valor={val} />;
    if (!val && val !== 0) return <span style={{ color: '#94a3b8' }}>—</span>;
    return <span>{String(val)}</span>;
  };

  return (
    <div className="mnt-subvista-contenedor">
      {/* Encabezado */}
      <div className="mnt-subvista-header">
        <div className="mnt-subvista-left">
          <button
            type="button"
            className="mnt-btn-volver"
            onClick={onVolver}
            id="btn-volver-grid-tabla"
          >
            ← Volver
          </button>
          <div>
            <h2 className="mnt-subvista-titulo">
              {cfg.icono} {cfg.titulo}
            </h2>
            {datos && (
              <p className="mnt-subvista-sub">
                {total.toLocaleString('es-CO')} registros encontrados
              </p>
            )}
          </div>
        </div>

        {/* Controles de filtro */}
        <div className="mnt-filtros-row">
          {cfg.filtros.includes('q') && (
            <div className="mnt-filtro-search">
              <span className="mnt-filtro-search-icon">🔍</span>
              <input
                ref={inputRef}
                type="search"
                className="mnt-filtro-input"
                placeholder="Buscar..."
                value={q}
                onChange={(e) => handleQ(e.target.value)}
                id="filtro-busqueda-tabla"
                autoComplete="off"
              />
            </div>
          )}
          {cfg.filtros.includes('filtro_estado') && (
            <select
              className="mnt-filtro-select"
              value={filtroEstado}
              onChange={(e) => handleEstado(e.target.value)}
              id="filtro-estado-tabla"
            >
              {(cfg.opcionesEstado || []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {cfg.filtros.includes('filtro_tecnico') && tecnicos.length > 0 && (
            <select
              className="mnt-filtro-select"
              value={filtroTecnico}
              onChange={(e) => handleTecnico(e.target.value)}
              id="filtro-tecnico-tabla"
            >
              <option value="">Todos los técnicos</option>
              {tecnicos.map((t) => (
                <option key={t.hoja} value={t.hoja}>
                  {t.nombre || t.hoja}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div className="mnt-alerta mnt-alerta--err">⚠️ {error}</div>}

      {/* Tabla */}
      <div className="mnt-tabla-wrapper">
        {cargando && filas.length === 0 ? (
          <div className="mnt-loading-box">
            <div className="mnt-spinner" />
            <p>Cargando datos...</p>
          </div>
        ) : filas.length === 0 ? (
          <div className="mnt-tabla-vacia">
            <span style={{ fontSize: 32 }}>📭</span>
            <p>{cfg.textoVacio}</p>
          </div>
        ) : (
          <table className="mnt-tabla">
            <thead>
              <tr>
                {cfg.columnas.map((col) => (
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
                <tr
                  key={idx}
                  className={`mnt-tr ${idx % 2 === 0 ? 'mnt-tr--par' : ''}`}
                >
                  {cfg.columnas.map((col) => (
                    <td
                      key={col.key}
                      className="mnt-td"
                      style={{ textAlign: col.align || 'left' }}
                    >
                      {renderCelda(col, fila)}
                    </td>
                  ))}
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
      <Paginador
        page={page}
        totalPaginas={totalPaginas}
        onPageChange={handlePage}
        cargando={cargando}
      />
    </div>
  );
}
