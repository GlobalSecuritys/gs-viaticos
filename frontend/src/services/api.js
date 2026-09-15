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

// Descarga la carpeta completa (Excel + Fotos + Descripcion.txt) de UNA
// asignación finalizada. El backend la genera por streaming, pero puede tardar
// si hay muchas fotos: por eso se amplía el timeout.
export function descargarCarpetaAsignacion(asignacionId) {
  return api.get(`/admin/asignaciones/${asignacionId}/descargar-carpeta`, {
    responseType: 'blob',
    timeout: 300000, // 5 min
  });
}

// Descarga todo el historial: un ZIP con una subcarpeta por asignación finalizada.
export function descargarTodasLasAsignaciones() {
  return api.get('/admin/asignaciones/descargar-todas', {
    responseType: 'blob',
    timeout: 900000, // 15 min
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

// ── Bitácora de Descargas (módulo de Backup) ────────────────────────────────
// Las anotaciones se persisten en base de datos: ninguna de estas operaciones
// borra filas, ocultar una anotación es solo un cambio de estado.

// Devuelve únicamente las anotaciones activas (estado "pendiente").
export function listarBitacoraBackup() {
  return api.get('/admin/bitacora-backup');
}

export function crearAnotacionBitacora(texto) {
  return api.post('/admin/bitacora-backup', { texto });
}

// Oculta la anotación de la vista activa (estado "eliminado"); no la borra.
export function ocultarAnotacionBitacora(id) {
  return api.delete(`/admin/bitacora-backup/${id}`);
}

// Archiva las anotaciones pendientes al completarse un backup (carga de CSV).
export function completarPendientesBitacora() {
  return api.post('/admin/bitacora-backup/completar-pendientes');
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
