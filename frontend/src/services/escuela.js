import api from './api';

/** Panel de la encargada: todas las falencias detectadas (solo consulta). */
export function obtenerFalencias() {
    return api.get('/escuela/falencias');
}

/** Falencias del usuario autenticado y los módulos disponibles para ellas. */
export function obtenerMiFormacion() {
    return api.get('/escuela/mi-formacion');
}

/** Contenido de un módulo didáctico por su clave (ej. "general:1.1"). */
export function obtenerModulo(clave) {
    return api.get(`/escuela/modulos/${encodeURIComponent(clave)}`);
}
