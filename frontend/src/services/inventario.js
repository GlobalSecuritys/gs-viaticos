import api from './api';
import { comprimirImagen } from '../utils/compressImage';

// -----------------------------------------------------------------------------
// PLANILLAS
// -----------------------------------------------------------------------------
export async function listarPlanillas(incluirInactivas = false) {
  const res = await api.get('/inventario/planillas', {
    params: incluirInactivas ? { incluir_inactivas: true } : undefined,
  });
  return res.data;
}

export async function crearPlanilla({ nombre, descripcion }) {
  const res = await api.post('/inventario/planillas', { nombre, descripcion });
  return res.data;
}

export async function actualizarPlanilla(planillaId, cambios) {
  const res = await api.put(`/inventario/planillas/${planillaId}`, cambios);
  return res.data;
}

// -----------------------------------------------------------------------------
// ÍTEMS
// -----------------------------------------------------------------------------
export async function listarItems({ q, planillaId, soloConStock, limit, offset } = {}) {
  const params = {};
  if (q) params.q = q;
  if (planillaId) params.planilla_id = planillaId;
  if (soloConStock) params.solo_con_stock = true;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;

  const res = await api.get('/inventario/items', { params });
  return res.data;
}

export async function crearItem({ descripcion, planillaId, codigo, marca, cantidadInicial, observacion }) {
  const res = await api.post('/inventario/items', {
    descripcion,
    planilla_id: planillaId,
    codigo: codigo || null,
    marca: marca || 'GENERICA',
    cantidad_inicial: cantidadInicial ?? 0,
    observacion: observacion || null,
  });
  return res.data;
}

export async function actualizarItem(itemId, cambios) {
  const res = await api.put(`/inventario/items/${itemId}`, cambios);
  return res.data;
}

export async function eliminarItem(itemId) {
  await api.delete(`/inventario/items/${itemId}`);
}

export async function subirFotoItem(itemId, file) {
  const formData = new FormData();
  // Misma compresión que las evidencias de viáticos: las fotos de celular llegan
  // en 10-20 MB y el backend corta en 15 MB.
  let archivo;
  try {
    archivo = await comprimirImagen(file);
  } catch {
    archivo = file;
  }
  formData.append('file', archivo);
  const res = await api.post(`/inventario/items/${itemId}/foto`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return res.data;
}

/**
 * Próximo código interno sugerido (INV-AAAA-NNNN). Es una sugerencia, no una
 * reserva: si otro usuario guarda primero, la creación responde 409 y hay que
 * pedir uno nuevo.
 */
export async function obtenerSiguienteCodigo() {
  const res = await api.get('/inventario/siguiente-codigo');
  return res.data;
}

/**
 * Consulta previa a la creación: avisa si el ítem ya existe con otra redacción.
 * La comparación es determinista en backend (normalización + Jaccard).
 */
export async function revisarDuplicados({ descripcion, codigo, marca, planillaId }) {
  const params = { descripcion };
  if (codigo) params.codigo = codigo;
  if (marca) params.marca = marca;
  if (planillaId) params.planilla_id = planillaId;

  const res = await api.get('/inventario/duplicados', { params });
  return res.data;
}

// -----------------------------------------------------------------------------
// MOVIMIENTOS
// -----------------------------------------------------------------------------
export async function registrarMovimiento(itemId, { tipo, cantidad, observacion }) {
  const res = await api.post(`/inventario/items/${itemId}/movimientos`, {
    tipo,
    cantidad,
    observacion: observacion || null,
  });
  return res.data;
}

export async function obtenerKardex(itemId) {
  const res = await api.get(`/inventario/items/${itemId}/kardex`);
  return res.data;
}

// -----------------------------------------------------------------------------
// REPORTES
// -----------------------------------------------------------------------------
export async function obtenerReporteGlobal() {
  const res = await api.get('/inventario/reportes/global');
  return res.data;
}

// Etiquetas de los tipos de movimiento, para no repetirlas en cada vista.
export const TIPOS_MOVIMIENTO = [
  { valor: 'compra', label: 'Compra / Ingreso', signo: '+', icon: '📥' },
  { valor: 'devolucion', label: 'Devolución a bodega', signo: '+', icon: '↩️' },
  { valor: 'salida', label: 'Salida a servicio', signo: '−', icon: '📤' },
  { valor: 'ajuste_inicial', label: 'Ajuste inicial', signo: '+', icon: '⚖️' },
];

export function etiquetaTipoMovimiento(tipo) {
  return TIPOS_MOVIMIENTO.find((t) => t.valor === tipo) || { valor: tipo, label: tipo, signo: '', icon: '•' };
}
