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

/**
 * Obtiene la lectura inteligente determinística del estado del inventario.
 * Piloto: activo exclusivamente para CI FR - INVENTARIO MANTENIMIENTO 2026 (planilla_id = 1).
 */
export async function obtenerLecturaInteligente(planillaId = 1) {
  const res = await api.get(`/inventario/planillas/${planillaId}/lectura-inteligente`);
  return res.data;
}

/**
 * Obtiene los 4 indicadores del encabezado y números de las tarjetas de Mantenimiento 2026.
 */
export async function obtenerExcelResumen(planillaId = 1) {
  const res = await api.get(`/inventario/planillas/${planillaId}/excel-resumen`);
  return res.data;
}

/**
 * Obtiene los datos paginados y filtrados de una vista (cantidad_total, salidas, prestamos, compras).
 */
export async function obtenerExcelVista({
  planillaId = 1,
  vista,
  q,
  filtro_estado,
  filtro_tecnico,
  page = 1,
  page_size = 50,
} = {}) {
  const params = { vista, page, page_size };
  if (q && q.trim()) params.q = q.trim();
  if (filtro_estado && filtro_estado.trim()) params.filtro_estado = filtro_estado.trim();
  if (filtro_tecnico && filtro_tecnico.trim()) params.filtro_tecnico = filtro_tecnico.trim();

  const res = await api.get(`/inventario/planillas/${planillaId}/excel-vista`, { params });
  return res.data;
}

/**
 * Obtiene la lista de técnicos activos con préstamos para el slider.
 */
export async function obtenerExcelTecnicos(planillaId = 1) {
  const res = await api.get(`/inventario/planillas/${planillaId}/excel-tecnicos`);
  return res.data;
}

/**
 * Obtiene el detalle de préstamos de un técnico específico.
 */
export async function obtenerExcelDetalleTecnico(planillaId = 1, nombreHoja, { q, page = 1, page_size = 50 } = {}) {
  const params = { page, page_size };
  if (q && q.trim()) params.q = q.trim();
  const hojaEncoded = encodeURIComponent(nombreHoja);
  const res = await api.get(`/inventario/planillas/${planillaId}/excel-tecnicos/${hojaEncoded}`, { params });
  return res.data;
}

