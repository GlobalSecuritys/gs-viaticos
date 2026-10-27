import React, { useEffect, useState, useCallback } from 'react';
import { obtenerExcelResumen, obtenerExcelTecnicos } from '../../../services/inventario';
import { formatApiError } from '../../../utils/formatError';
import VistaTabla from './VistaTabla';
import VistaTecnicos from './VistaTecnicos';
import './Mantenimiento.css';

export default function MantenimientoView({ planilla, onVolver }) {
  const planillaId = planilla?.id || 1;

  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tecnicos, setTecnicos] = useState([]);

  // Vista activa: null (menú principal) | 'cantidad_total' | 'salidas' | 'prestamos' | 'prestamos_tecnicos' | 'compras'
  const [vistaActiva, setVistaActiva] = useState(null);

  // Barra inferior plegable "Vista Excel" (cerrada por defecto)
  const [excelAbierto, setExcelAbierto] = useState(false);

  const cargarResumen = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const data = await obtenerExcelResumen(planillaId);
      setResumen(data);
    } catch (err) {
      setError(formatApiError(err, 'No se pudo cargar el resumen de Mantenimiento 2026.'));
    } finally {
      setCargando(false);
    }
  }, [planillaId]);

  // Carga lista de técnicos para el filtro de salidas (silenciosa, sin bloquear UI)
  const cargarTecnicos = useCallback(async () => {
    try {
      const resp = await obtenerExcelTecnicos(planillaId);
      const lista = Array.isArray(resp) ? resp : (resp?.tecnicos ?? []);
      setTecnicos(lista);
    } catch {
      // No crítico — el filtro simplemente no mostrará opciones
    }
  }, [planillaId]);

  useEffect(() => {
    cargarResumen();
    cargarTecnicos();
  }, [cargarResumen, cargarTecnicos]);

  // Manejo de volver a la cuadrícula principal
  const handleVolverMenu = () => {
    setVistaActiva(null);
  };

  return (
    <div className="mnt-container">
      {/* ── Encabezado Principal ── */}
      <header className="sgc-inv-panel-header">
        <button
          type="button"
          className="sgc-inv-btn sgc-inv-btn--ghost sgc-inv-btn--sm"
          onClick={onVolver}
          id="btn-volver-planillas"
        >
          ← Planillas
        </button>
        <div className="sgc-inv-header-text">
          <h1 className="sgc-inv-title">
            🟢 {planilla?.nombre || 'Mantenimiento 2026'}
          </h1>
          <p className="sgc-inv-subtitle">
            Gestión optimizada de inventario · CI-FR- INVENTARIO MANTENIMIENTO 2026
          </p>
        </div>
      </header>

      {/* ── Alertas ── */}
      {error && <div className="mnt-alerta mnt-alerta--err">{error}</div>}

      {/* ── Estado de carga inicial (solo /excel-resumen) ── */}
      {cargando ? (
        <div className="mnt-loading-box">
          <div className="mnt-spinner" />
          <p>Cargando indicadores de Mantenimiento 2026...</p>
        </div>
      ) : resumen ? (
        <>
          {/* ════════════════════════════════════════════════════════════════
              1. CUATRO INDICADORES PEQUEÑOS EN FILA
          ════════════════════════════════════════════════════════════════ */}
          <section className="mnt-header-section" aria-label="Indicadores generales">
            <div className="mnt-indicadores-row">
              {/* Indicador 1: Unidades en bodega */}
              <div className="mnt-indicador-chip mnt-indicador-chip--verde" id="indicador-bodega">
                <div className="mnt-indicador-icon">🏢</div>
                <div className="mnt-indicador-info">
                  <span className="mnt-indicador-label">Unidades en bodega</span>
                  <span className="mnt-indicador-valor">
                    {Number(resumen.indicadores.unidades_bodega).toLocaleString('es-CO')}
                  </span>
                </div>
              </div>

              {/* Indicador 2: Salidas totales */}
              <div className="mnt-indicador-chip mnt-indicador-chip--azul" id="indicador-salidas">
                <div className="mnt-indicador-icon">🚚</div>
                <div className="mnt-indicador-info">
                  <span className="mnt-indicador-label">Salidas totales</span>
                  <span className="mnt-indicador-valor">
                    {Number(resumen.indicadores.salidas_totales).toLocaleString('es-CO')}
                  </span>
                </div>
              </div>

              {/* Indicador 3: Pendientes de instalar */}
              <div className="mnt-indicador-chip mnt-indicador-chip--ambar" id="indicador-pendientes">
                <div className="mnt-indicador-icon">⏳</div>
                <div className="mnt-indicador-info">
                  <span className="mnt-indicador-label">Pendientes de instalar</span>
                  <span className="mnt-indicador-valor">
                    {Number(resumen.indicadores.pendientes_instalar).toLocaleString('es-CO')}
                  </span>
                </div>
              </div>

              {/* Indicador 4: Fecha actualización Excel */}
              <div className="mnt-indicador-chip mnt-indicador-chip--gris" id="indicador-actualizado">
                <div className="mnt-indicador-icon">📅</div>
                <div className="mnt-indicador-info">
                  <span className="mnt-indicador-label">Excel actualizado</span>
                  <span className="mnt-indicador-valor">
                    {resumen.indicadores.fecha_actualizacion_excel}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════════
              2. CUADRÍCULA DE 5 TARJETAS GRANDES O VISTA SELECCIONADA
          ════════════════════════════════════════════════════════════════ */}
          {vistaActiva === null ? (
            <section className="mnt-grid-cards" aria-label="Secciones de Mantenimiento">
              {/* Tarjeta a) Cantidad total */}
              <button
                type="button"
                className="mnt-card-btn mnt-card-btn--total"
                onClick={() => setVistaActiva('cantidad_total')}
                id="btn-vista-cantidad-total"
              >
                <div className="mnt-card-head">
                  <div className="mnt-card-icon-badge">📦</div>
                  <span className="mnt-card-flecha">→</span>
                </div>
                <div className="mnt-card-body">
                  <h3 className="mnt-card-title">Cantidad total</h3>
                  <div className="mnt-card-num-box">
                    <span className="mnt-card-num">
                      {resumen.resumen_botones.cantidad_total.unidades}
                    </span>
                    <span className="mnt-card-unidad">uds en bodega</span>
                  </div>
                  <p className="mnt-card-subtitulo">
                    {resumen.resumen_botones.cantidad_total.con_stock} productos con stock en bodega
                  </p>
                </div>
              </button>

              {/* Tarjeta b) Salidas */}
              <button
                type="button"
                className="mnt-card-btn mnt-card-btn--salidas"
                onClick={() => setVistaActiva('salidas')}
                id="btn-vista-salidas"
              >
                <div className="mnt-card-head">
                  <div className="mnt-card-icon-badge">🚚</div>
                  <span className="mnt-card-flecha">→</span>
                </div>
                <div className="mnt-card-body">
                  <h3 className="mnt-card-title">Salidas</h3>
                  <div className="mnt-card-num-box">
                    <span className="mnt-card-num">
                      {resumen.resumen_botones.salidas.total}
                    </span>
                    <span className="mnt-card-unidad">despachos</span>
                  </div>
                  <p className="mnt-card-subtitulo">
                    {resumen.resumen_botones.salidas.pendientes} pendientes de instalación
                  </p>
                </div>
              </button>

              {/* Tarjeta c) Préstamos */}
              <button
                type="button"
                className="mnt-card-btn mnt-card-btn--prestamos"
                onClick={() => setVistaActiva('prestamos')}
                id="btn-vista-prestamos"
              >
                <div className="mnt-card-head">
                  <div className="mnt-card-icon-badge">📋</div>
                  <span className="mnt-card-flecha">→</span>
                </div>
                <div className="mnt-card-body">
                  <h3 className="mnt-card-title">Préstamos</h3>
                  <div className="mnt-card-num-box">
                    <span className="mnt-card-num">
                      {resumen.resumen_botones.prestamos.total_unidades}
                    </span>
                    <span className="mnt-card-unidad">uds prestadas</span>
                  </div>
                  <p className="mnt-card-subtitulo">
                    {resumen.resumen_botones.prestamos.lineas} líneas de préstamos generales
                  </p>
                </div>
              </button>

              {/* Tarjeta d) Préstamos a técnicos */}
              <button
                type="button"
                className="mnt-card-btn mnt-card-btn--tecnicos"
                onClick={() => setVistaActiva('prestamos_tecnicos')}
                id="btn-vista-prestamos-tecnicos"
              >
                <div className="mnt-card-head">
                  <div className="mnt-card-icon-badge">👷</div>
                  <span className="mnt-card-flecha">→</span>
                </div>
                <div className="mnt-card-body">
                  <h3 className="mnt-card-title">Préstamos a técnicos</h3>
                  <div className="mnt-card-num-box">
                    <span className="mnt-card-num">
                      {resumen.resumen_botones.prestamos_tecnicos.total_tecnicos}
                    </span>
                    <span className="mnt-card-unidad">técnicos activos</span>
                  </div>
                  <p className="mnt-card-subtitulo">
                    {resumen.resumen_botones.prestamos_tecnicos.total_unidades} unidades en manos de técnicos
                  </p>
                </div>
              </button>

              {/* Tarjeta e) Compras recibidas */}
              <button
                type="button"
                className="mnt-card-btn mnt-card-btn--compras"
                onClick={() => setVistaActiva('compras')}
                id="btn-vista-compras"
              >
                <div className="mnt-card-head">
                  <div className="mnt-card-icon-badge">📥</div>
                  <span className="mnt-card-flecha">→</span>
                </div>
                <div className="mnt-card-body">
                  <h3 className="mnt-card-title">Compras recibidas</h3>
                  <div className="mnt-card-num-box">
                    <span className="mnt-card-num">
                      {resumen.resumen_botones.compras.total_unidades}
                    </span>
                    <span className="mnt-card-unidad">unidades</span>
                  </div>
                  <p className="mnt-card-subtitulo">
                    Ingresos por compras registradas
                  </p>
                </div>
              </button>
            </section>
          ) : vistaActiva === 'prestamos_tecnicos' ? (
            <VistaTecnicos
              planillaId={planillaId}
              onVolver={handleVolverMenu}
            />
          ) : (
            <VistaTabla
              planillaId={planillaId}
              vista={vistaActiva}
              onVolver={handleVolverMenu}
              tecnicos={tecnicos}
            />
          )}

          {/* ════════════════════════════════════════════════════════════════
              3. BARRA INFERIOR PLEGABLE "VISTA EXCEL" (CERRADA POR DEFECTO)
          ════════════════════════════════════════════════════════════════ */}
          <section className="mnt-excel-plegable" aria-label="Vista Excel original">
            <button
              type="button"
              className="mnt-excel-toggle-btn"
              onClick={() => setExcelAbierto((prev) => !prev)}
              id="btn-toggle-vista-excel"
            >
              <div className="mnt-excel-toggle-left">
                <span className="mnt-excel-toggle-icon">
                  {excelAbierto ? '▾' : '▸'}
                </span>
                <span>Vista Excel</span>
                <span className="mnt-excel-toggle-badge">
                  {excelAbierto ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <span className="mnt-card-subtitulo">
                {excelAbierto ? 'Ocultar hojas originales' : 'Ver hojas y columnas originales del archivo maestro'}
              </span>
            </button>

            {excelAbierto && (
              <div className="mnt-excel-panel-abierto" id="panel-vista-excel">
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '13.5px' }}>
                  📊 El visor plegable de hojas originales se integrará en el paso 4 usando <code>GET /inventario/excel</code>.
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
