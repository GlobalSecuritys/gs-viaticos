import api from './api';

// -----------------------------------------------------------------------------
// Catálogos del módulo
// -----------------------------------------------------------------------------
export const UNIONES_TEMPORALES = [
  { valor: 'RTC', etiqueta: 'Unión Temporal RTC American Global' },
  { valor: 'MANTENIMIENTO', etiqueta: 'Unión Temporal Mantenimiento GSB_SDSS' },
  { valor: 'PROYECTO_ZEUS', etiqueta: 'Proyecto Zeus' },
];

export const ESTADOS_DESPACHO = [
  { valor: 'pendiente_instalacion', etiqueta: 'Pendiente instalación' },
  { valor: 'instalado', etiqueta: 'Instalado' },
  { valor: 'alerta_seguimiento', etiqueta: 'Alerta / seguimiento' },
  { valor: 'dañado', etiqueta: 'Dañado' },
  { valor: 'suministro_oficina', etiqueta: 'Suministro oficina' },
];

export function etiquetaEstado(valor) {
  return ESTADOS_DESPACHO.find((e) => e.valor === valor)?.etiqueta || valor;
}

export function etiquetaUnion(valor) {
  if (valor === 'RTC') return 'Unión Temporal RTC American Global';
  if (valor === 'MANTENIMIENTO') return 'Unión Temporal Mantenimiento GSB_SDSS';
  if (valor === 'PROYECTO_ZEUS') return 'Proyecto Zeus';
  return valor;
}

/** Quita claves vacías para no mandar filtros "" al backend. */
function limpiar(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
  );
}

// -----------------------------------------------------------------------------
// RESUMEN (tarjetas de entrada)
// -----------------------------------------------------------------------------
export async function obtenerResumen() {
  const res = await api.get('/inventario/resumen');
  return res.data;
}

// -----------------------------------------------------------------------------
// ÍTEMS (stock)
// -----------------------------------------------------------------------------
export async function listarItems({ unionTemporal, q, soloConStock, fechaInicio, fechaFin, limit = 500, offset = 0 } = {}) {
  const res = await api.get('/inventario/items', {
    params: limpiar({
      union_temporal: unionTemporal,
      q,
      solo_con_stock: soloConStock,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      limit,
      offset,
    }),
  });
  return res.data;
}

export async function crearItem(datos) {
  const res = await api.post('/inventario/items', datos);
  return res.data;
}

export async function actualizarItem(id, datos) {
  const res = await api.put(`/inventario/items/${id}`, datos);
  return res.data;
}

export async function eliminarItem(id) {
  await api.delete(`/inventario/items/${id}`);
}

// -----------------------------------------------------------------------------
// DESPACHOS
// -----------------------------------------------------------------------------
export async function listarDespachos({
  unionTemporal,
  tecnicoId,
  sinTecnico,
  estado,
  oficina,
  fechaInicio,
  fechaFin,
  tipoFecha = 'despacho',
  q,
  limit = 500,
  offset = 0,
} = {}) {
  const res = await api.get('/inventario/despachos', {
    params: limpiar({
      union_temporal: unionTemporal,
      tecnico_id: tecnicoId,
      sin_tecnico: sinTecnico,
      estado,
      oficina,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      tipo_fecha: tipoFecha,
      q,
      limit,
      offset,
    }),
  });
  return res.data;
}

export async function crearDespacho(datos) {
  const res = await api.post('/inventario/despachos', datos);
  return res.data;
}

export async function actualizarDespacho(id, datos) {
  const res = await api.put(`/inventario/despachos/${id}`, datos);
  return res.data;
}

export async function cambiarEstadoDespacho(id, estado, fechaInstalacion = null) {
  const res = await api.patch(`/inventario/despachos/${id}/estado`, {
    estado,
    ...(fechaInstalacion ? { fecha_instalacion: fechaInstalacion } : {}),
  });
  return res.data;
}

export async function eliminarDespacho(id) {
  await api.delete(`/inventario/despachos/${id}`);
}

// -----------------------------------------------------------------------------
// PRÉSTAMOS
// -----------------------------------------------------------------------------
export async function listarPrestamos({ unionTemporal, q } = {}) {
  const res = await api.get('/inventario/prestamos', {
    params: limpiar({ union_temporal: unionTemporal, q }),
  });
  return res.data;
}

export async function crearPrestamo(datos) {
  const res = await api.post('/inventario/prestamos', datos);
  return res.data;
}

export async function actualizarPrestamo(id, datos) {
  const res = await api.put(`/inventario/prestamos/${id}`, datos);
  return res.data;
}

export async function eliminarPrestamo(id) {
  await api.delete(`/inventario/prestamos/${id}`);
}

// -----------------------------------------------------------------------------
// Técnicos y asignaciones (lectura, para el formulario de despacho)
// -----------------------------------------------------------------------------
export async function listarTecnicos() {
  const res = await api.get('/inventario/tecnicos');
  return res.data;
}

export async function listarAsignacionesTecnico(tecnicoId, incluirId = null) {
  const res = await api.get(`/inventario/tecnicos/${tecnicoId}/asignaciones`, {
    params: limpiar({ incluir_id: incluirId }),
  });
  return res.data;
}

// -----------------------------------------------------------------------------
// Inventario en poder de técnicos (hojas individuales de técnicos)
// -----------------------------------------------------------------------------
export async function listarResumenTecnicosInventario(unionTemporal = null) {
  const res = await api.get('/inventario/tecnicos-resumen', {
    params: limpiar({ union_temporal: unionTemporal }),
  });
  return res.data;
}

export async function listarItemsTecnico(
  tecnicoId,
  { unionTemporal = null, q = '', fechaInicio = null, fechaFin = null, tipoFecha = 'despacho' } = {}
) {
  const res = await api.get(`/inventario/tecnicos/${tecnicoId}/items`, {
    params: limpiar({
      union_temporal: unionTemporal,
      q: q?.trim() || undefined,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      tipo_fecha: tipoFecha,
    }),
  });
  return res.data;
}

export async function crearItemTecnico(tecnicoId, datos) {
  const res = await api.post(`/inventario/tecnicos/${tecnicoId}/items`, datos);
  return res.data;
}

export async function actualizarItemTecnico(itemId, datos) {
  const res = await api.put(`/inventario/tecnicos/items/${itemId}`, datos);
  return res.data;
}

export async function eliminarItemTecnico(itemId) {
  await api.delete(`/inventario/tecnicos/items/${itemId}`);
}
