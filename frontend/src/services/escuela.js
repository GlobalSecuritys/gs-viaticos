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

/* ── Estudiantes y material académico (solo encargada) ── */

export function obtenerEstudiantes() {
    return api.get('/escuela/estudiantes');
}

export function obtenerFichaEstudiante(id) {
    return api.get(`/escuela/estudiantes/${id}`);
}

export function subirMaterialEstudiante(id, archivo, descripcion) {
    const form = new FormData();
    form.append('archivo', archivo);
    if (descripcion) form.append('descripcion', descripcion);
    return api.post(`/escuela/estudiantes/${id}/archivos`, form, { timeout: 120000 });
}

/** Enlace firmado de Cloudinary que caduca a los 5 minutos. */
export function obtenerEnlaceMaterial(id, archivoId) {
    return api.get(`/escuela/estudiantes/${id}/archivos/${archivoId}/descarga`);
}

export function eliminarMaterialEstudiante(id, archivoId) {
    return api.delete(`/escuela/estudiantes/${id}/archivos/${archivoId}`);
}
