// Servicio de Asignaciones (Fase 2).
// Sigue el mismo patrón que el resto de services/*.js: usa el cliente Axios
// central (con interceptor de token) definido en services/api.js.
//
// NOTA PARA EL BACKEND (a implementar al final, sin tocar lo existente):
//   GET    /admin/asignaciones            -> lista completa (todas, todos los técnicos)
//   GET    /admin/asignaciones/:id         -> detalle de una asignación
//   POST   /admin/asignaciones             -> crear
//   PUT    /admin/asignaciones/:id         -> editar (tipo, cliente, empresa, ciudad,
//                                              fechas, observaciones, reasignar tecnico_id)
//   PUT    /admin/asignaciones/:id/finalizar -> marcar estado = finalizada
//   DELETE /admin/asignaciones/:id         -> eliminar (solo SuperAdmin; el backend debe
//                                              rechazar eliminar asignaciones históricas
//                                              para Admin, según la regla de permisos)
//
// El frontend pide siempre la lista completa (igual que ya hace Personal.jsx
// con /admin/viaticos) y calcula localmente la "asignación activa" por técnico
// con obtenerAsignacionActivaDeTecnico (utils/asignaciones.js), en vez de pedir
// un endpoint por-técnico. Esto evita N+1 llamadas y sigue el patrón ya usado.

import api from './api';

export function listarAsignaciones() {
    return api.get('/admin/asignaciones');
}

export function obtenerAsignacion(id) {
    return api.get(`/admin/asignaciones/${id}`);
}

export function crearAsignacion(payload) {
    return api.post('/admin/asignaciones', payload);
}

export function actualizarAsignacion(id, payload) {
    return api.put(`/admin/asignaciones/${id}`, payload);
}

export function finalizarAsignacion(id) {
    return api.put(`/admin/asignaciones/${id}/finalizar`);
}

export function eliminarAsignacion(id) {
    return api.delete(`/admin/asignaciones/${id}`);
}

// --- Vista del técnico (no admin) -------------------------------------------
// GET /asignaciones/activas -> TODAS las asignaciones activas del técnico
// autenticado (puede ser ninguna, una o varias). Requiere solo estar
// logueado (no rol admin).
export function obtenerMisAsignacionesActivas() {
    return api.get('/asignaciones/activas');
}

export function subirCuentaCobroAsignacion(asignacionId, file) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/asignaciones/${asignacionId}/cuenta-cobro`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        timeout: 60000,
    });
}

export function extenderFechaAsignacion(id, fecha_fin) {
    return api.patch(`/admin/asignaciones/${id}/extender-fecha`, { fecha_fin });
}