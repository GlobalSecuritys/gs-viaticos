import api from './api';
import { comprimirImagen } from '../utils/compressImage';

// -----------------------------------------------------------------------------
// JERARQUÍA EMPRESARIAL
// -----------------------------------------------------------------------------
// Todo el módulo trabaja acotado a un "scope": { empresaId, clienteId }.
// clienteId en null NO significa "sin filtro" sino "inventario directo de la
// caja" (las uniones temporales, y las planillas generales de Global).
export async function listarEmpresas() {
  const res = await api.get('/inventario/empresas');
  return res.data;
}

export async function listarClientes(empresaId) {
  const res = await api.get(`/inventario/empresas/${empresaId}/clientes`);
  return res.data;
}

/** Traduce un scope a los query params que espera el backend. */
function paramsScope(scope) {
  if (!scope?.empresaId) return {};
  const params = { empresa_id: scope.empresaId };
  if (scope.clienteId) params.cliente_id = scope.clienteId;
  return params;
}

// -----------------------------------------------------------------------------
// PLANILLAS
// -----------------------------------------------------------------------------
export async function listarPlanillas(incluirInactivas = false, scope = null) {
  const res = await api.get('/inventario/planillas', {
    params: { ...paramsScope(scope), ...(incluirInactivas ? { incluir_inactivas: true } : {}) },
  });
  return res.data;
}

export async function crearPlanilla({ nombre, descripcion, empresaId, clienteId }) {
  const res = await api.post('/inventario/planillas', {
    nombre,
    descripcion,
    empresa_id: empresaId,
    cliente_id: clienteId || null,
  });
  return res.data;
}

export async function actualizarPlanilla(planillaId, cambios) {
  const res = await api.put(`/inventario/planillas/${planillaId}`, cambios);
  return res.data;
}

// -----------------------------------------------------------------------------
// ÍTEMS
// -----------------------------------------------------------------------------
export async function listarItems({ q, planillaId, soloConStock, limit, offset, scope } = {}) {
  const params = { ...paramsScope(scope) };
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
export async function revisarDuplicados({ descripcion, codigo, marca, planillaId, scope }) {
  const params = { descripcion, ...paramsScope(scope) };
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
export async function obtenerReporteGlobal(scope = null) {
  const res = await api.get('/inventario/reportes/global', { params: paramsScope(scope) });
  return res.data;
}

// -----------------------------------------------------------------------------
// TRASPASOS ENTRE ENTIDADES
// -----------------------------------------------------------------------------
export async function listarTraspasos(scope, { estado } = {}) {
  const res = await api.get('/inventario/traspasos', {
    params: { ...paramsScope(scope), ...(estado ? { estado } : {}) },
  });
  return res.data;
}

export async function crearTraspaso({ itemOrigenId, cantidad, empresaDestinoId, clienteDestinoId, notas }) {
  const res = await api.post('/inventario/traspasos', {
    item_origen_id: itemOrigenId,
    cantidad,
    empresa_destino_id: empresaDestinoId,
    cliente_destino_id: clienteDestinoId || null,
    notas: notas || null,
  });
  return res.data;
}

export async function aprobarTraspaso(traspasoId, notas) {
  const res = await api.put(`/inventario/traspasos/${traspasoId}/aprobar`, { notas: notas || null });
  return res.data;
}

export async function rechazarTraspaso(traspasoId, notas) {
  const res = await api.put(`/inventario/traspasos/${traspasoId}/rechazar`, { notas: notas || null });
  return res.data;
}

// -----------------------------------------------------------------------------
// ACCESOS POR ENTIDAD (gestión Master)
// -----------------------------------------------------------------------------
export async function listarAccesosInventario(usuarioId) {
  const res = await api.get('/inventario/accesos', {
    params: usuarioId ? { usuario_id: usuarioId } : undefined,
  });
  return res.data;
}

/** nivel: 'ninguno' | 'lector' | 'admin'. 'ninguno' retira el acceso. */
export async function establecerAccesoInventario({ usuarioId, empresaId, clienteId, nivel }) {
  const res = await api.put('/inventario/accesos', {
    usuario_id: usuarioId,
    empresa_id: empresaId,
    cliente_id: clienteId || null,
    nivel,
  });
  return res.data;
}

export const NIVELES_ENTIDAD = [
  { valor: 'ninguno', label: 'Sin acceso' },
  { valor: 'lector', label: 'Lector' },
  { valor: 'admin', label: 'Administrador' },
];

/** Etiqueta legible de una entidad, con la misma forma que usa el backend. */
export function etiquetaEntidad(empresaNombre, clienteNombre) {
  if (!empresaNombre) return '—';
  return clienteNombre ? `${empresaNombre} · ${clienteNombre}` : empresaNombre;
}

// Etiquetas de los tipos de movimiento, para no repetirlas en cada vista.
export const TIPOS_MOVIMIENTO = [
  { valor: 'compra', label: 'Compra / Ingreso', signo: '+', icon: '📥' },
  { valor: 'devolucion', label: 'Devolución a bodega', signo: '+', icon: '↩️' },
  { valor: 'salida', label: 'Salida a servicio', signo: '−', icon: '📤' },
  { valor: 'ajuste_inicial', label: 'Ajuste inicial', signo: '+', icon: '⚖️' },
  // Los emite solo el motor de traspasos; aquí están para poder etiquetarlos.
  { valor: 'traspaso_salida', label: 'Traspaso enviado', signo: '−', icon: '🚚' },
  { valor: 'traspaso_entrada', label: 'Traspaso recibido', signo: '+', icon: '📦' },
];

export function etiquetaTipoMovimiento(tipo) {
  return TIPOS_MOVIMIENTO.find((t) => t.valor === tipo) || { valor: tipo, label: tipo, signo: '', icon: '•' };
}
