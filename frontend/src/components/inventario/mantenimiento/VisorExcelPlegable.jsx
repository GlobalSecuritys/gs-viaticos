import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { obtenerDatosExcel } from '../../../services/inventario';
import { formatApiError } from '../../../utils/formatError';

export default function VisorExcelPlegable({ planillaId = 1 }) {
  const [hojaActiva, setHojaActiva] = useState('');
  const [hojas, setHojas] = useState([]);
  const [columnas, setColumnas] = useState([]);
  const [filas, setFilas] = useState([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [archivo, setArchivo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtroTexto, setFiltroTexto] = useState('');

  const cargarDatos = useCallback(async (nombreHoja = '') => {
    setCargando(true);
    setError('');
    try {
      const data = await obtenerDatosExcel({
        hoja: nombreHoja,
        limit: 1000,
        planilla_id: planillaId,
      });

      if (data) {
        setHojas(data.hojas || []);
        setHojaActiva(data.hoja_activa || nombreHoja || (data.hojas && data.hojas[0]) || '');
        setColumnas(data.columnas || []);
        setFilas(data.filas || []);
        setTotalFilas(data.total_filas || (data.filas ? data.filas.length : 0));
        setArchivo(data.archivo || '');
      }
    } catch (err) {
      setError(formatApiError(err, 'No se pudo leer el archivo Excel en el servidor.'));
    } finally {
      setCargando(false);
    }
  }, [planillaId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const handleCambiarHoja = (h) => {
    if (h === hojaActiva) return;
    setFiltroTexto('');
    cargarDatos(h);
  };

  const filasFiltradas = useMemo(() => {
    if (!filtroTexto.trim()) return filas;
    const q = filtroTexto.toLowerCase();
    return filas.filter((fila) =>
      Object.values(fila).some((val) =>
        String(val ?? '').toLowerCase().includes(q)
      )
    );
  }, [filas, filtroTexto]);

  return (
    <div className="mnt-subvista-contenedor" style={{ gap: 14 }}>
      {/* ── Barra superior: archivo e info ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            📁 {archivo || 'CI-FR- INVENTARIO MANTENIMIENTO 2026.xlsx'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
            {totalFilas} filas registradas en hoja
          </span>
        </div>

        {/* Buscador sobre la hoja */}
        <div className="mnt-filtro-search">
          <span className="mnt-filtro-search-icon">🔍</span>
          <input
            type="text"
            className="mnt-filtro-input"
            placeholder="Buscar en esta hoja..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
        </div>
      </div>

      {/* ── Selector de pestañas / hojas de Excel ── */}
      {hojas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
          {hojas.map((h) => {
            const activa = h === hojaActiva;
            return (
              <button
                key={h}
                type="button"
                onClick={() => handleCambiarHoja(h)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: '12.5px',
                  fontWeight: activa ? 700 : 500,
                  border: activa ? '1px solid var(--color-primary-blue, #1e3a8a)' : '1px solid var(--color-border, #cbd5e1)',
                  background: activa ? 'var(--color-primary-blue, #1e3a8a)' : '#f8fafc',
                  color: activa ? '#ffffff' : 'var(--color-text-primary, #0f172a)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                📄 {h.trim()}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Errores ── */}
      {error && <div className="mnt-alerta mnt-alerta--err">{error}</div>}

      {/* ── Tabla de contenido de la hoja ── */}
      {cargando ? (
        <div className="mnt-loading-box" style={{ padding: '30px 10px' }}>
          <div className="mnt-spinner" />
          <p style={{ fontSize: 13 }}>Leyendo hoja {hojaActiva}...</p>
        </div>
      ) : filasFiltradas.length === 0 ? (
        <div style={{ padding: '28px 10px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13.5 }}>
          {filtroTexto ? `Sin coincidencias para "${filtroTexto}" en esta hoja.` : 'La hoja seleccionada está vacía.'}
        </div>
      ) : (
        <div className="mnt-tabla-wrapper" style={{ maxHeight: 460 }}>
          <table className="mnt-tabla">
            <thead>
              <tr>
                <th className="mnt-th" style={{ width: 44, textAlign: 'center' }}>#</th>
                {columnas.map((col) => (
                  <th key={col} className="mnt-th">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.slice(0, 300).map((fila, idx) => (
                <tr key={idx} className="mnt-tr">
                  <td className="mnt-td" style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
                    {idx + 1}
                  </td>
                  {columnas.map((col) => (
                    <td key={col} className="mnt-td" style={{ fontSize: 12.5 }}>
                      {String(fila[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filasFiltradas.length > 300 && (
            <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--color-text-muted)', background: '#f8fafc', borderTop: '1px solid var(--color-border)' }}>
              Mostrando las primeras 300 de {filasFiltradas.length} filas en visor.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
