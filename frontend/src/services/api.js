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
  archivos.forEach((a) => formData.append('files', a.file));

  // No fijamos Content-Type manualmente: si se fija 'multipart/form-data'
  // a mano, se pierde el parámetro "boundary" que el navegador genera
  // automáticamente, y el backend no puede parsear los archivos.
  // Dejamos que axios/el navegador lo calculen solos.
  return api.post(`/viaticos/${viaticoId}/evidencias`, formData);
}
