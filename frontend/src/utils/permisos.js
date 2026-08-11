/**
 * Matriz de permisos para la tarjeta de usuario (PerfilEmpleado).
 *
 * Esto es SOLO para la UI (mostrar/ocultar acciones). El blindaje real vive
 * en backend, en verificar_autoridad_sobre_usuario (app/core/security.py) —
 * aunque esta función devolviera mal, el backend seguiría rechazando la
 * acción con 403.
 *
 * Regla: un ADMIN normal no puede gestionar a un SUPER ADMIN. Todo lo demás
 * (superadmin sobre cualquiera, admin sobre técnico o sobre sí mismo) sí
 * puede gestionar.
 */

export function puedeGestionarUsuario(viewerRol, targetRol) {
    if (!viewerRol || !targetRol) return false;
    if (viewerRol === 'admin' && targetRol === 'superadmin') {
        return false;
    }
    return viewerRol === 'admin' || viewerRol === 'superadmin';
}

export function esSoloLectura(viewerRol, targetRol) {
    return !puedeGestionarUsuario(viewerRol, targetRol);
}