import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gs_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

export async function subirEvidencias(viaticoId, archivos) {
  const formData = new FormData();
  archivos.forEach((a) => {
    const fileToAppend = a.file || a;
    if (fileToAppend) {
      formData.append('files', fileToAppend);
    }
  });

  return api.post(`/viaticos/${viaticoId}/evidencias`, formData);
}

export function exportarViaticosIndependientes(usuarioId, fechaInicio, fechaFin) {
  const params = new URLSearchParams({ usuario_id: usuarioId });
  if (fechaInicio) params.append('fecha_inicio', fechaInicio);
  if (fechaFin) params.append('fecha_fin', fechaFin);
  return api.get(`/admin/viaticos/exportar?${params.toString()}`, {
    responseType: 'blob',
  });
}

export function exportarViaticosAsignacion(asignacionId) {
  return api.get(`/admin/asignaciones/${asignacionId}/exportar`, {
    responseType: 'blob',
  });
}

export function descargarBlob(blobData, filename) {
  const url = window.URL.createObjectURL(new Blob([blobData]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
