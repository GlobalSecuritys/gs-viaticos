import api from './api';

/**
 * Payload completo del dashboard de viáticos (vivo + archivado + proyección).
 * Una sola petición por apertura o por clic en "Actualizar". Solo superadmin.
 */
export function obtenerDashboardViaticos() {
    return api.get('/admin/dashboard-viaticos');
}
