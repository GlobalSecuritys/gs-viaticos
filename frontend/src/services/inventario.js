import api from './api';

// -----------------------------------------------------------------------------
// Catálogos del módulo
// -----------------------------------------------------------------------------
export const UNIONES_TEMPORALES = [
  { valor: 'RTC', etiqueta: 'Unión Temporal RTC' },
  { valor: 'MANTENIMIENTO', etiqueta: 'Unión Temporal Mantenimiento GSB_SDSS' },
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
  return valor === 'MANTENIMIENTO' ? 'Mantenimiento' : valor;
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
export async function listarItems({ unionTemporal, q, soloConStock, limit = 500, offset = 0 } = {}) {
  const res = await api.get('/inventario/items', {
    params: limpiar({ union_temporal: unionTemporal, q, solo_con_stock: soloConStock, limit, offset }),
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
