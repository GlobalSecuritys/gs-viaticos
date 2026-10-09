import api from './api';

/**
 * Consulta la evaluación de desempeño del usuario autenticado o evaluado.
 * Una sola petición al cargar el módulo.
 * @param {string} [plantilla]
 * @param {number} [usuarioEvaluadoId]
 */
export function obtenerMiEvaluacion(plantilla, usuarioEvaluadoId) {
    const params = {};
    if (plantilla) params.plantilla = plantilla;
    if (usuarioEvaluadoId) params.usuario_evaluado_id = usuarioEvaluadoId;
    return api.get('/evaluaciones-desempeno/mi-evaluacion', { params });
}

/**
 * Envía el paso de Autoevaluación.
 * Registra cuenta de envío y fecha/hora.
 * @param {{ autoevaluacion: object, cargo?: string, fecha?: string }} payload
 */
export function enviarAutoevaluacion(payload) {
    return api.post('/evaluaciones-desempeno/autoevaluacion', payload);
}

/**
 * Envía el paso de Evaluación por parte del jefe/evaluador.
 * Registra cuenta de envío y fecha/hora.
 * @param {{ nombre_evaluador: string, evaluacion: object, compromisos?: string[] }} payload
 */
export function enviarEvaluacion(payload) {
    return api.post('/evaluaciones-desempeno/evaluacion', payload);
}
