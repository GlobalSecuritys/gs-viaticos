import api from './api';

/**
 * Obtiene las planillas de inventario con sus conteos reales desde el kardex.
 */
export async function listarPlanillas({ incluirInactivas = false } = {}) {
  const res = await api.get('/inventario/planillas', {
    params: incluirInactivas ? { incluir_inactivas: true } : {},
  });
  return res.data; // Array de PlanillaResponse
}

/**
 * Crea una nueva planilla de inventario (solo admin).
 */
export async function crearPlanilla(datos) {
  const res = await api.post('/inventario/planillas', datos);
  return res.data;
}

/**
 * Obtiene el contenido del archivo Excel en el servidor (con hojas y filas de la hoja solicitada).
 */
export async function obtenerDatosExcel({ hoja, limit = 500, offset = 0, planilla_id, planilla_nombre, archivo } = {}) {
  const params = {};
  if (hoja) params.hoja = hoja;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;
  if (planilla_id) params.planilla_id = planilla_id;
  if (planilla_nombre) params.planilla_nombre = planilla_nombre;
  if (archivo) params.archivo = archivo;

  const res = await api.get('/inventario/excel', { params });
  return res.data;
}

/**
 * Realiza una búsqueda progresiva sobre las filas del Excel según los criterios provistos.
 */
export async function buscarEnExcel({ hoja, serial, oficina, tecnico, fecha, planilla_id, planilla_nombre, archivo } = {}) {
  const params = {};
  if (hoja) params.hoja = hoja;
  if (serial && serial.trim()) params.serial = serial.trim();
  if (oficina && oficina.trim()) params.oficina = oficina.trim();
  if (tecnico && tecnico.trim()) params.tecnico = tecnico.trim();
  if (fecha && fecha.trim()) params.fecha = fecha.trim();
  if (planilla_id) params.planilla_id = planilla_id;
  if (planilla_nombre) params.planilla_nombre = planilla_nombre;
  if (archivo) params.archivo = archivo;

  const res = await api.get('/inventario/buscar', { params });
  return res.data;
}

/**
 * Guarda un registro de salida en inventario_salidas_registro.
 */
export async function guardarSalidaRegistro(datos) {
  const res = await api.post('/inventario/salidas', datos);
  return res.data;
}

/**
 * Consulta el histórico de salidas registradas.
 */
export async function listarSalidasRegistradas(limit = 100) {
  const res = await api.get('/inventario/salidas', { params: { limit } });
  return res.data;
}
