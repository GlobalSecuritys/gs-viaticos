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

  return api.post(`/viaticos/${viaticoId}/evidencias`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}