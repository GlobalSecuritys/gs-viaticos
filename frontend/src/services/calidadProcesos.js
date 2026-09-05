import api from './api';

export async function listarProcesosCalidad() {
  const res = await api.get('/calidad-procesos');
  return res.data;
}

export async function obtenerProcesosPorCategoria(categoria) {
  const res = await api.get(`/calidad-procesos/categoria/${categoria}`);
  return res.data;
}

export async function obtenerDetalleProceso(id) {
  const res = await api.get(`/calidad-procesos/${id}`);
  return res.data;
}

export async function actualizarProceso(id, data) {
  const res = await api.put(`/calidad-procesos/${id}`, data);
  return res.data;
}

export async function asignarResponsableProceso(procesoId, usuarioId, rolEnProceso = 'Responsable') {
  const res = await api.post(`/calidad-procesos/${procesoId}/asignaciones`, {
    usuario_id: usuarioId,
    rol_en_proceso: rolEnProceso,
  });
  return res.data;
}

export async function removerResponsableProceso(procesoId, asignacionId) {
  const res = await api.delete(`/calidad-procesos/${procesoId}/asignaciones/${asignacionId}`);
  return res.data;
}

export async function subirDocumentoProceso(procesoId, file, { nombreDocumento, categoriaDocumento, version, descripcion }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('nombre_documento', nombreDocumento);
  formData.append('categoria_documento', categoriaDocumento);
  if (version) formData.append('version', version);
  if (descripcion) formData.append('descripcion', descripcion);

  const res = await api.post(`/calidad-procesos/${procesoId}/documentos`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000,
  });
  return res.data;
}

export async function actualizarDocumentoProceso(documentoId, data) {
  const res = await api.put(`/calidad-procesos/documentos/${documentoId}`, data);
  return res.data;
}

export async function eliminarDocumentoProceso(documentoId) {
  const res = await api.delete(`/calidad-procesos/documentos/${documentoId}`);
  return res.data;
}

export async function obtenerUsuariosDisponibles() {
  const res = await api.get('/calidad-procesos/usuarios-disponibles');
  return res.data;
}

export async function listarPermisosAdminsMapa() {
  const res = await api.get('/calidad-procesos/permisos-admins');
  return res.data;
}

export async function actualizarPermisoAdminMapa(usuarioId, data) {
  const res = await api.put(`/calidad-procesos/permisos-admins/${usuarioId}`, data);
  return res.data;
}

