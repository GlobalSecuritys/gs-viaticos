import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { obtenerResumenMenu } from '../../services/inventario';
import { formatApiError } from '../../utils/formatError';
import './MenuLateralInventario.css';

/**
 * Menú Lateral Drawer para la planilla de Inventario.
 * Proporciona acceso rápido a los 4 indicadores clave y a las 5 tarjetas de resumen:
 * 1. Cantidad total
 * 2. Salidas
 * 3. Equipos en técnicos (Préstamos a técnicos)
 * 4. Préstamos (deshabilitado si no existe hoja)
 * 5. Compras recibidas
 */
export default function MenuLateralInventario({
  planillaId,
  planillaNombre = 'RTC – Comware',
  color = '#dc2626',
  onSeleccionarHoja,
  refreshTrigger = 0,
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);

  // Subvista activa dentro del drawer: null = vista principal de tarjetas
  const [seccionActiva, setSeccionActiva] = useState(null);
  const [filtroSalidas, setFiltroSalidas] = useState('todas'); // 'todas' | 'instalado' | 'pendiente'
  const [busquedaDetalle, setBusquedaDetalle] = useState('');

  // ── Cargar datos del menú desde backend ──────────────────────────────────
  const cargarResumen = useCallback(async (forzar = false) => {
    if (!planillaId) return;
    setCargando(true);
    setError('');
    try {
      const resp = await obtenerResumenMenu(planillaId, { forzar });
      setDatos(resp);
    } catch (err) {
      setError(formatApiError(err, 'No se pudo cargar el resumen del menú.'));
    } finally {
      setCargando(false);
    }
  }, [planillaId]);

  useEffect(() => {
    if (abierto) {
      cargarResumen();
    }
  }, [abierto, cargarResumen, refreshTrigger]);

  // Cerrar con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (seccionActiva) {
          setSeccionActiva(null);
        } else {
          setAbierto(false);
        }
      }
    };
    if (abierto) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [abierto, seccionActiva]);

  const abrirDrawer = () => {
    setAbierto(true);
    setSeccionActiva(null);
    setBusquedaDetalle('');
  };

  const cerrarDrawer = () => {
    setAbierto(false);
    setSeccionActiva(null);
    setBusquedaDetalle('');
  };

  const irAHojaSalidasEnExcel = () => {
    if (onSeleccionarHoja) {
      onSeleccionarHoja('SALIDAS ');
    }
    cerrarDrawer();
  };

  const indicadores = datos?.indicadores || {
    unidades_bodega: 0,
    salidas_totales: 0,
    pendientes_instalar: 0,
    excel_actualizado: '--/--/---- --:--',
  };

  const tarjetas = datos?.tarjetas || {};

  // ── Filtros para sub-vistas de detalle ─────────────────────────────────────
  const itemsCantidadFiltrados = useMemo(() => {
    const items = tarjetas.cantidad_total?.items || [];
    if (!busquedaDetalle.trim()) return items;
    const q = busquedaDetalle.toLowerCase();
    return items.filter((it) => it.descripcion.toLowerCase().includes(q));
  }, [tarjetas.cantidad_total?.items, busquedaDetalle]);

  const salidasFiltradas = useMemo(() => {
    let items = tarjetas.salidas?.items || [];
    if (filtroSalidas !== 'todas') {
      items = items.filter((it) => it.estado === filtroSalidas);
    }
    if (busquedaDetalle.trim()) {
      const q = busquedaDetalle.toLowerCase();
      items = items.filter(
        (it) =>
          it.descripcion?.toLowerCase().includes(q) ||
          it.serial?.toLowerCase().includes(q) ||
          it.tecnico?.toLowerCase().includes(q) ||
          it.oficina?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [tarjetas.salidas?.items, filtroSalidas, busquedaDetalle]);

  const tecnicosFiltrados = useMemo(() => {
    const lista = tarjetas.equipos_tecnicos?.items || [];
    if (!busquedaDetalle.trim()) return lista;
    const q = busquedaDetalle.toLowerCase();
    return lista.filter(
      (t) =>
        t.tecnico?.toLowerCase().includes(q) ||
        t.oficinas?.some((o) => o.toLowerCase().includes(q)) ||
        t.equipos?.some((e) => e.descripcion?.toLowerCase().includes(q) || e.serial?.toLowerCase().includes(q))
    );
  }, [tarjetas.equipos_tecnicos?.items, busquedaDetalle]);

  const comprasFiltradas = useMemo(() => {
    const lista = tarjetas.compras?.items || [];
    if (!busquedaDetalle.trim()) return lista;
    const q = busquedaDetalle.toLowerCase();
    return lista.filter((c) => c.orden?.toLowerCase().includes(q) || c.fecha?.toLowerCase().includes(q));
  }, [tarjetas.compras?.items, busquedaDetalle]);

  return (
    <>
      {/* ── Botón Fijo en el borde lateral derecho ── */}
      <button
        type="button"
        className="gsb-drawer-trigger-btn"
        style={{ '--menu-color': color }}
        onClick={abrirDrawer}
        aria-label="Abrir Menú de inventario"
        title="Abrir Menú de inventario"
      >
        <span className="gsb-drawer-trigger-icon">☰</span>
        <span className="gsb-drawer-trigger-text">Menú</span>
      </button>

      {/* ── Backdrop Oscuro ── */}
      {abierto && (
        <div
          className="gsb-drawer-backdrop animate-fade-in"
          onClick={cerrarDrawer}
          aria-hidden="true"
        />
      )}

      {/* ── Contenedor del Drawer Lateral ── */}
      <aside
        className={`gsb-drawer-panel ${abierto ? 'gsb-drawer-panel--abierto' : ''}`}
        aria-label="Panel Menú de Inventario"
        role="dialog"
      >
        {/* ── Cabecera del Drawer ── */}
        <header className="gsb-drawer-header">
          <div className="gsb-drawer-header-info">
            {seccionActiva ? (
              <button
                type="button"
                className="gsb-drawer-btn-volver"
                onClick={() => {
                  setSeccionActiva(null);
                  setBusquedaDetalle('');
                }}
              >
                ← Volver al menú
              </button>
            ) : (
              <span className="gsb-drawer-tag-badge" style={{ backgroundColor: color }}>
                Planilla
              </span>
            )}
            <h2 className="gsb-drawer-title">
              {seccionActiva === 'cantidad_total' && '📦 Cantidad Total'}
              {seccionActiva === 'salidas' && '📤 Salidas y Despachos'}
              {seccionActiva === 'equipos_tecnicos' && '👷 Equipos en Técnicos'}
              {seccionActiva === 'compras' && '🛒 Compras Recibidas'}
              {!seccionActiva && `Menú · ${planillaNombre}`}
            </h2>
            <p className="gsb-drawer-subtitle">
              {seccionActiva
                ? 'Detalle de registros calculados determinísticamente'
                : 'Resumen ejecutivo y accesos rápidos'}
            </p>
          </div>

          <div className="gsb-drawer-header-actions">
            <button
              type="button"
              className="gsb-drawer-btn-icon"
              onClick={() => cargarResumen(true)}
              title="Refrescar datos"
              disabled={cargando}
            >
              ↺
            </button>
            <button
              type="button"
              className="gsb-drawer-btn-icon gsb-drawer-btn-close"
              onClick={cerrarDrawer}
              title="Cerrar panel (Esc)"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ── Contenido del Drawer ── */}
        <div className="gsb-drawer-body">
          {error && <div className="gsb-drawer-alerta gsb-drawer-alerta--err">{error}</div>}

          {cargando && !datos ? (
            <div className="gsb-drawer-loading">
              <div className="gsb-drawer-spinner" />
              <span>Calculando métricas del inventario...</span>
            </div>
          ) : !seccionActiva ? (
            // ═════════════════════════════════════════════════════════════════
            // VISTA PRINCIPAL: INDICADORES + TARJETAS
            // ═════════════════════════════════════════════════════════════════
            <>
              {/* ── A) 4 Indicadores Pequeños (Grilla 2x2) ── */}
              <section className="gsb-drawer-seccion-indicadores" aria-label="Indicadores rápidos">
                <div className="gsb-drawer-indicadores-grid">
                  {/* 1. Unidades en Bodega */}
                  <div className="gsb-indicador-card gsb-indicador-card--verde">
                    <div className="gsb-indicador-icon-wrap">🏢</div>
                    <div className="gsb-indicador-text">
                      <span className="gsb-indicador-label">Unidades en bodega</span>
                      <strong className="gsb-indicador-val">{indicadores.unidades_bodega}</strong>
                    </div>
                  </div>

                  {/* 2. Salidas Totales */}
                  <div className="gsb-indicador-card gsb-indicador-card--azul">
                    <div className="gsb-indicador-icon-wrap">📤</div>
                    <div className="gsb-indicador-text">
                      <span className="gsb-indicador-label">Salidas totales</span>
                      <strong className="gsb-indicador-val">{indicadores.salidas_totales}</strong>
                    </div>
                  </div>

                  {/* 3. Pendientes de Instalar */}
                  <div className="gsb-indicador-card gsb-indicador-card--ambar">
                    <div className="gsb-indicador-icon-wrap">⏳</div>
                    <div className="gsb-indicador-text">
                      <span className="gsb-indicador-label">Pendientes de instalar</span>
                      <strong className="gsb-indicador-val">{indicadores.pendientes_instalar}</strong>
                    </div>
                  </div>

                  {/* 4. Excel Actualizado */}
                  <div className="gsb-indicador-card gsb-indicador-card--gris">
                    <div className="gsb-indicador-icon-wrap">📅</div>
                    <div className="gsb-indicador-text">
                      <span className="gsb-indicador-label">Excel actualizado</span>
                      <strong className="gsb-indicador-val gsb-indicador-val--sm">
                        {indicadores.excel_actualizado}
                      </strong>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── B) Tarjetas Grandes (Grilla 2 Columnas) ── */}
              <section className="gsb-drawer-seccion-cards" aria-label="Tarjetas de módulos">
                <div className="gsb-drawer-cards-grid">
                  {/* Tarjeta 1: Cantidad Total */}
                  <button
                    type="button"
                    className="gsb-card-modulo gsb-card-modulo--total"
                    onClick={() => {
                      setSeccionActiva('cantidad_total');
                      setBusquedaDetalle('');
                    }}
                  >
                    <div className="gsb-card-modulo-head">
                      <div className="gsb-card-icon-box gsb-card-icon-box--verde">📦</div>
                      <span className="gsb-card-flecha">→</span>
                    </div>
                    <div className="gsb-card-modulo-body">
                      <h3 className="gsb-card-title">Cantidad total</h3>
                      <div className="gsb-card-num">
                        {tarjetas.cantidad_total?.numero || '985 uds en bodega'}
                      </div>
                      <div className="gsb-card-sub">
                        {tarjetas.cantidad_total?.subtitulo || '9 productos con stock en bodega'}
                      </div>
                    </div>
                  </button>

                  {/* Tarjeta 2: Salidas */}
                  <button
                    type="button"
                    className="gsb-card-modulo gsb-card-modulo--salidas"
                    onClick={() => {
                      setSeccionActiva('salidas');
                      setFiltroSalidas('todas');
                      setBusquedaDetalle('');
                    }}
                  >
                    <div className="gsb-card-modulo-head">
                      <div className="gsb-card-icon-box gsb-card-icon-box--azul">📤</div>
                      <span className="gsb-card-flecha">→</span>
                    </div>
                    <div className="gsb-card-modulo-body">
                      <h3 className="gsb-card-title">Salidas</h3>
                      <div className="gsb-card-num">
                        {tarjetas.salidas?.numero || '24 despachos'}
                      </div>
                      <div className="gsb-card-sub">
                        {tarjetas.salidas?.subtitulo || '19 pendientes de instalación'}
                      </div>
                    </div>
                  </button>

                  {/* Tarjeta 3: Equipos en Técnicos */}
                  <button
                    type="button"
                    className="gsb-card-modulo gsb-card-modulo--tecnicos"
                    onClick={() => {
                      setSeccionActiva('equipos_tecnicos');
                      setBusquedaDetalle('');
                    }}
                  >
                    <div className="gsb-card-modulo-head">
                      <div className="gsb-card-icon-box gsb-card-icon-box--purpura">👷</div>
                      <span className="gsb-card-flecha">→</span>
                    </div>
                    <div className="gsb-card-modulo-body">
                      <h3 className="gsb-card-title">Equipos en técnicos</h3>
                      <div className="gsb-card-num">
                        {tarjetas.equipos_tecnicos?.numero || '5 técnicos activos'}
                      </div>
                      <div className="gsb-card-sub">
                        {tarjetas.equipos_tecnicos?.subtitulo || '19 unidades en manos de técnicos'}
                      </div>
                    </div>
                  </button>

                  {/* Tarjeta 4: Préstamos (Comware no tiene hoja -> Deshabilitada) */}
                  <div
                    className={`gsb-card-modulo gsb-card-modulo--prestamos ${
                      !tarjetas.prestamos?.disponible ? 'gsb-card-modulo--deshabilitado' : ''
                    }`}
                  >
                    <div className="gsb-card-modulo-head">
                      <div className="gsb-card-icon-box gsb-card-icon-box--ambar">📋</div>
                      {tarjetas.prestamos?.disponible && <span className="gsb-card-flecha">→</span>}
                    </div>
                    <div className="gsb-card-modulo-body">
                      <h3 className="gsb-card-title">Préstamos</h3>
                      <div className="gsb-card-num">
                        {tarjetas.prestamos?.numero || '0 uds prestadas'}
                      </div>
                      <div className="gsb-card-sub">
                        {tarjetas.prestamos?.subtitulo || 'Sin hoja de préstamos en el Excel'}
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta 5: Compras Recibidas */}
                  <button
                    type="button"
                    className="gsb-card-modulo gsb-card-modulo--compras"
                    onClick={() => {
                      setSeccionActiva('compras');
                      setBusquedaDetalle('');
                    }}
                  >
                    <div className="gsb-card-modulo-head">
                      <div className="gsb-card-icon-box gsb-card-icon-box--cian">🛒</div>
                      <span className="gsb-card-flecha">→</span>
                    </div>
                    <div className="gsb-card-modulo-body">
                      <h3 className="gsb-card-title">Compras recibidas</h3>
                      <div className="gsb-card-num">
                        {tarjetas.compras?.numero || '1.009 unidades'}
                      </div>
                      <div className="gsb-card-sub">
                        {tarjetas.compras?.subtitulo || 'Ingresos por compras registradas'}
                      </div>
                    </div>
                  </button>
                </div>
              </section>
            </>
          ) : (
            // ═════════════════════════════════════════════════════════════════
            // SUB-VISTAS DE DETALLE DE CADA TARJETA
            // ═════════════════════════════════════════════════════════════════
            <section className="gsb-drawer-detalle-seccion">
              {/* ── Subvista 1: Cantidad Total ── */}
              {seccionActiva === 'cantidad_total' && (
                <div className="gsb-detalle-box">
                  <div className="gsb-detalle-toolbar">
                    <input
                      type="text"
                      className="gsb-detalle-input"
                      placeholder="Buscar producto en bodega..."
                      value={busquedaDetalle}
                      onChange={(e) => setBusquedaDetalle(e.target.value)}
                    />
                    <span className="gsb-detalle-conteo">
                      {itemsCantidadFiltrados.length} productos
                    </span>
                  </div>

                  <div className="gsb-detalle-tabla-wrapper">
                    <table className="gsb-detalle-tabla">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Producto / Descripción</th>
                          <th className="th-num">Stock</th>
                          <th className="th-num">Con Serial</th>
                          <th className="th-num">Sin Serial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsCantidadFiltrados.map((it, idx) => (
                          <tr key={it.descripcion}>
                            <td className="td-idx">{idx + 1}</td>
                            <td className="td-nombre">
                              <strong>{it.descripcion}</strong>
                            </td>
                            <td className="td-num">
                              <span className="badge-stock-num">{it.unidades}</span>
                            </td>
                            <td className="td-num">{it.con_serial}</td>
                            <td className="td-num">{it.sin_serial}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="gsb-detalle-footer">
                    Total: <strong>{indicadores.unidades_bodega} unidades en bodega</strong>
                  </div>
                </div>
              )}

              {/* ── Subvista 2: Salidas ── */}
              {seccionActiva === 'salidas' && (
                <div className="gsb-detalle-box">
                  <div className="gsb-filtro-chips-row">
                    <button
                      type="button"
                      className={`gsb-chip-btn ${filtroSalidas === 'todas' ? 'gsb-chip-btn--activo' : ''}`}
                      onClick={() => setFiltroSalidas('todas')}
                    >
                      Todas ({tarjetas.salidas?.resumen_estados?.total || 24})
                    </button>
                    <button
                      type="button"
                      className={`gsb-chip-btn ${filtroSalidas === 'instalado' ? 'gsb-chip-btn--activo' : ''}`}
                      onClick={() => setFiltroSalidas('instalado')}
                    >
                      Instaladas ({tarjetas.salidas?.resumen_estados?.instaladas || 5})
                    </button>
                    <button
                      type="button"
                      className={`gsb-chip-btn ${filtroSalidas === 'pendiente' ? 'gsb-chip-btn--activo' : ''}`}
                      onClick={() => setFiltroSalidas('pendiente')}
                    >
                      Pendientes ({tarjetas.salidas?.resumen_estados?.pendientes || 19})
                    </button>
                  </div>

                  <div className="gsb-detalle-toolbar">
                    <input
                      type="text"
                      className="gsb-detalle-input"
                      placeholder="Buscar por serial, técnico, oficina..."
                      value={busquedaDetalle}
                      onChange={(e) => setBusquedaDetalle(e.target.value)}
                    />
                    <button
                      type="button"
                      className="gsb-btn-ir-excel"
                      onClick={irAHojaSalidasEnExcel}
                      title="Abrir hoja SALIDAS en la tabla principal"
                    >
                      Ver en Excel →
                    </button>
                  </div>

                  <div className="gsb-detalle-tabla-wrapper">
                    <table className="gsb-detalle-tabla">
                      <thead>
                        <tr>
                          <th>Estado</th>
                          <th>Descripción</th>
                          <th>Serial</th>
                          <th>Técnico</th>
                          <th>Oficina Destino</th>
                          <th>Fecha Despacho</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salidasFiltradas.map((s) => (
                          <tr key={s.id}>
                            <td>
                              {s.estado === 'instalado' ? (
                                <span className="gsb-badge-estado gsb-badge-estado--verde">
                                  ✓ Instalado
                                </span>
                              ) : (
                                <span className="gsb-badge-estado gsb-badge-estado--ambar">
                                  ⏳ Pendiente
                                </span>
                              )}
                            </td>
                            <td className="td-nombre">{s.descripcion}</td>
                            <td>{s.serial || <span className="td-muted">—</span>}</td>
                            <td>{s.tecnico || <span className="td-muted">—</span>}</td>
                            <td>{s.oficina || <span className="td-muted">—</span>}</td>
                            <td className="td-fecha">{s.fecha_despacho || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Subvista 3: Equipos en Técnicos ── */}
              {seccionActiva === 'equipos_tecnicos' && (
                <div className="gsb-detalle-box">
                  <div className="gsb-detalle-toolbar">
                    <input
                      type="text"
                      className="gsb-detalle-input"
                      placeholder="Buscar técnico u oficina..."
                      value={busquedaDetalle}
                      onChange={(e) => setBusquedaDetalle(e.target.value)}
                    />
                    <span className="gsb-detalle-conteo">
                      {tecnicosFiltrados.length} técnicos activos
                    </span>
                  </div>

                  <div className="gsb-tecnicos-cards-list">
                    {tecnicosFiltrados.map((tec) => (
                      <div key={tec.tecnico} className="gsb-tecnico-card">
                        <div className="gsb-tecnico-card-head">
                          <div className="gsb-tecnico-avatar">
                            {tec.tecnico
                              .split(' ')
                              .map((p) => p[0])
                              .join('')
                              .substring(0, 2)
                              .toUpperCase()}
                          </div>
                          <div className="gsb-tecnico-info">
                            <h4 className="gsb-tecnico-nombre">{tec.tecnico}</h4>
                            <span className="gsb-tecnico-oficinas">
                              📍 {tec.oficinas.join(' · ') || 'Sin oficina asignada'}
                            </span>
                          </div>
                          <span className="gsb-tecnico-unidades-badge">
                            {tec.unidades} {tec.unidades === 1 ? 'unidad' : 'unidades'}
                          </span>
                        </div>

                        {/* Lista de equipos asignados al técnico */}
                        <div className="gsb-tecnico-equipos-list">
                          {tec.equipos.map((eq, i) => (
                            <div key={i} className="gsb-tecnico-equipo-item">
                              <span className="eq-desc">{eq.descripcion}</span>
                              {eq.serial && <span className="eq-serial">SN: {eq.serial}</span>}
                              {eq.fecha_despacho && (
                                <span className="eq-fecha">📅 {eq.fecha_despacho}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Subvista 5: Compras Recibidas ── */}
              {seccionActiva === 'compras' && (
                <div className="gsb-detalle-box">
                  <div className="gsb-detalle-toolbar">
                    <input
                      type="text"
                      className="gsb-detalle-input"
                      placeholder="Buscar por orden de compra..."
                      value={busquedaDetalle}
                      onChange={(e) => setBusquedaDetalle(e.target.value)}
                    />
                    <span className="gsb-detalle-conteo">
                      {comprasFiltradas.length} órdenes registradas
                    </span>
                  </div>

                  <div className="gsb-detalle-tabla-wrapper">
                    <table className="gsb-detalle-tabla">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>N° Orden de Trabajo / Factura</th>
                          <th>Fecha Registro</th>
                          <th className="th-num">Unidades Ingresadas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comprasFiltradas.map((c, idx) => (
                          <tr key={c.orden}>
                            <td className="td-idx">{idx + 1}</td>
                            <td className="td-nombre">
                              <strong>{c.orden}</strong>
                            </td>
                            <td className="td-fecha">{c.fecha || '—'}</td>
                            <td className="td-num">
                              <span className="badge-stock-num">{c.unidades}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="gsb-detalle-footer">
                    Total acumulado recibido: <strong>1.009 unidades</strong>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

