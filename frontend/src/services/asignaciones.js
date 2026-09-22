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
import { formatApiError } from '../utils/formatError';

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

export function eliminarAsignacion(id, { confirmarYaDescargado = false } = {}) {
    return api.delete(`/admin/asignaciones/${id}`, {
        params: { confirmar_ya_descargado: confirmarYaDescargado },
    });
}

export function eliminarAsignacionesMasivo(payload) {
    return api.post('/admin/asignaciones/eliminar-varias', payload);
}

export function obtenerEstadisticasHistoricasTecnico(tecnicoId) {
    return api.get(`/admin/asignaciones/tecnico/${tecnicoId}/estadisticas-historicas`);
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

// PATCH /asignaciones/:id/orden-trabajo -> el propio técnico guarda (o limpia)
// el número/código de OT de su asignación. Campo opcional.
export function guardarOrdenTrabajoAsignacion(id, orden_trabajo) {
    return api.patch(`/asignaciones/${id}/orden-trabajo`, { orden_trabajo });
}

export function extenderFechaAsignacion(id, fecha_fin) {
    return api.patch(`/admin/asignaciones/${id}/extender-fecha`, { fecha_fin });
}

// Flujo completo de borrado usado por las pantallas de admin (modal del técnico,
// listado y detalle). Centraliza las reglas que aplica el backend para que el
// usuario vea SIEMPRE el motivo real del fallo en vez de un mensaje genérico:
//   - Solo se pueden borrar asignaciones finalizadas.
//   - La carpeta debe haberse descargado antes; si no, se pide confirmación
//     explícita y se reintenta con confirmar_ya_descargado=true.
// Devuelve { ok, cancelado, mensaje }.
export async function borrarAsignacionConFlujo(asignacion) {
    const id = typeof asignacion === 'object' ? asignacion.id : asignacion;
    const estado = typeof asignacion === 'object' ? asignacion.estado : null;
    const cerrada = typeof asignacion === 'object' ? asignacion.cerrada_en : null;

    if (estado && estado !== 'finalizada' && !cerrada) {
        return {
            ok: false,
            cancelado: false,
            mensaje:
                'Solo se pueden borrar asignaciones finalizadas. Finaliza primero la asignación y vuelve a intentarlo.',
        };
    }

    if (!window.confirm(
        '¿Deseas borrar esta asignación? Se eliminarán permanentemente sus viáticos y evidencias. ' +
        'Las estadísticas históricas del técnico se conservan.'
    )) {
        return { ok: false, cancelado: true, mensaje: '' };
    }

    try {
        await eliminarAsignacion(id);
        return { ok: true, cancelado: false, mensaje: '✅ Asignación borrada correctamente.' };
    } catch (err) {
        const detalle = formatApiError(err, 'No se pudo borrar la asignación.');

        // Caso recuperable: la carpeta nunca se descargó. Se permite continuar
        // si el admin confirma que ya tiene la información.
        if (err.response?.status === 400 && /descargad/i.test(detalle)) {
            if (!window.confirm(
                `${detalle}\n\n¿Confirmas que ya tienes la información descargada y deseas eliminarla de todos modos?`
            )) {
                return { ok: false, cancelado: true, mensaje: '' };
            }
            try {
                await eliminarAsignacion(id, { confirmarYaDescargado: true });
                return { ok: true, cancelado: false, mensaje: '✅ Asignación borrada correctamente.' };
            } catch (err2) {
                return { ok: false, cancelado: false, mensaje: formatApiError(err2, 'No se pudo borrar la asignación.') };
            }
        }

        return { ok: false, cancelado: false, mensaje: detalle };
    }
}
