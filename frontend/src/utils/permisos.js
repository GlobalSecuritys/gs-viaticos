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
 * Verifica si el usuario autenticado es la Administradora Principal del Mapa (PilarAdmin@gsbank.com).
 * Es la única con el poder exclusivo de autorizar el ingreso al mapa y definir los roles de los admins.
 */
export function esPilarAdmin(user) {
    if (!user) return false;
    const correo = (user.correo || '').trim().toLowerCase();
    return correo === 'pilaradmin@gsbank.com';
}

/**
 * Verifica si el usuario tiene autorización para ingresar y visualizar el Mapa de Procesos SGC.
 * PilarAdmin siempre puede; los demás administradores dependen de la autorización de Pilar (acceso_mapa = true).
 */
export function puedeVerMapa(user) {
    if (!user) return false;
    if (esPilarAdmin(user)) return true;
    return user.acceso_mapa === true;
}

/**
 * Verifica si el usuario tiene permisos de edición sobre el mapa (actualizar fichas, responsables y documentos).
 * PilarAdmin siempre puede; los demás usuarios requieren haber sido asignados con el rol 'editor' por Pilar.
 */
export function puedeEditarMapa(user) {
    if (!user) return false;
    if (esPilarAdmin(user)) return true;
    return user.acceso_mapa === true && (user.rol_mapa === 'editor' || user.es_admin_calidad === true);
}

/**
 * Compatibilidad con vistas existentes de Calidad de Procesos (equivalente a puedeEditarMapa).
 */
export function esAdminCalidad(user) {
    return puedeEditarMapa(user);
}