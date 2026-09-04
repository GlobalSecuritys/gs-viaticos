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

export function puedeGestionarUsuario(viewerRol, _targetRol) {
    if (!viewerRol) return false;
    return viewerRol === 'admin' || viewerRol === 'superadmin';
}

export function esSoloLectura(viewerRol, targetRol) {
    return !puedeGestionarUsuario(viewerRol, targetRol);
}

/**
 * Verifica si el usuario autenticado tiene permisos de administración
 * en el módulo de Calidad de Procesos (PilarAdmin@gsbank.com, flag es_admin_calidad o superadmin).
 */
export function esAdminCalidad(user) {
    if (!user) return false;
    const correo = (user.correo || '').trim().toLowerCase();
    return (
        user.es_admin_calidad === true ||
        correo === 'pilaradmin@gsbank.com' ||
        user.rol === 'superadmin'
    );
}