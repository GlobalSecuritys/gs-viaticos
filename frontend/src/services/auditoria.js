// Servicio de Auditoría. Sigue el mismo patrón que services/asignaciones.js:
// usa el cliente Axios central (con interceptor de token) de services/api.js.
//
// GET /admin/auditoria — exclusivo SuperAdmin (get_current_superadmin en el
// backend). Acepta filtros opcionales y paginación limit/offset.

import api from './api';

export function listarAuditoria(filtros = {}) {
    const params = {};
    if (filtros.fechaDesde) params.fecha_desde = filtros.fechaDesde;
    if (filtros.fechaHasta) params.fecha_hasta = filtros.fechaHasta;
    if (filtros.actorId) params.actor_id = filtros.actorId;
    if (filtros.usuarioObjetivoId) params.usuario_objetivo_id = filtros.usuarioObjetivoId;
    if (filtros.accion) params.accion = filtros.accion;
    params.limit = filtros.limit ?? 50;
    params.offset = filtros.offset ?? 0;

    return api.get('/admin/auditoria', { params });
}
