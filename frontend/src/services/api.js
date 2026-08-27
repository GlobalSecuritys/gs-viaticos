import axios from 'axios';
import { comprimirImagen } from '../utils/compressImage';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000, // 30s timeout por defecto para peticiones normales
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
  
  for (const a of archivos) {
    const originalFile = a.file || a;
    if (originalFile) {
      try {
        const compressedFile = await comprimirImagen(originalFile);
        formData.append('files', compressedFile);
      } catch {
        formData.append('files', originalFile);
      }
    }
  }

  return api.post(`/viaticos/${viaticoId}/evidencias`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000, // 60s timeout para subida de archivos en Render
  });
}

export function eliminarEvidenciaViatico(viaticoId, evidenciaId) {
  return api.delete(`/viaticos/${viaticoId}/evidencias/${evidenciaId}`);
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

export function exportarTalentoHumanoExcel() {
  return api.get('/talento-humano/exportar-excel', {
    responseType: 'blob',
  });
}

export async function subirDocumentoTalentoHumano(usuarioId, file, tipoDocumento, nombreDocumento) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tipo_documento', tipoDocumento);
  if (nombreDocumento) {
    formData.append('nombre_documento', nombreDocumento);
  }

  return api.post(`/talento-humano/empleados/${usuarioId}/documentos`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000,
  });
}

export function eliminarDocumentoTalentoHumano(usuarioId, documentoId) {
  return api.delete(`/talento-humano/empleados/${usuarioId}/documentos/${documentoId}`);
}

export function eliminarUsuario(usuarioId) {
  return api.delete(`/admin/usuarios/${usuarioId}`);
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
