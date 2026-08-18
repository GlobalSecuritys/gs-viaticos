/* =====================================================
   GS Viáticos — Service Worker
   Estrategia: Network-First con caché de respaldo.
   Solo lo mínimo para cumplir criterios de instalabilidad
   de Chrome/Safari (fetch handler requerido).
   ===================================================== */

const CACHE_NAME = 'gs-viaticos-v3';

// Recursos del shell de la app que se cachean al instalar
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/favicon.svg',
  '/favicon.png',
];

// Rutas de API conocidas en el backend
const API_ROUTES = [
  '/auth',
  '/viaticos',
  '/admin',
  '/asignaciones',
  '/proveedores',
  '/cuentas-cobro',
  '/api',
  '/docs',
  '/openapi.json',
];

/* ── INSTALL: precachea el shell ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  // Activar inmediatamente sin esperar a que cierren pestañas previas
  self.skipWaiting();
});

/* ── ACTIVATE: limpia cachés viejas ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Tomar control de todas las pestañas abiertas inmediatamente
  self.clients.claim();
});

/* ── FETCH: Network-First solo para assets estáticos y SPA navigation ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1. Solo procesar peticiones GET
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Si es hacia un host o puerto diferente (ej. backend en :8000 o Cloudinary o API externa), dejar pasar directo
  if (url.origin !== location.origin) {
    return;
  }

  // 3. Si la ruta pertenece a la API del backend, dejar pasar directo sin tocar
  const esRutaApi = API_ROUTES.some((prefix) => url.pathname.startsWith(prefix));
  if (esRutaApi) {
    return;
  }

  // 4. Si es una petición de navegación (SPA) o archivo estático del frontend, gestionar con network-first y fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Solo cachear respuestas 200 válidas de tipo 'basic' (mismo origen)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          // No cachear datos de API ni endpoints no estáticos
          const contentType = networkResponse.headers.get('content-type') || '';
          const esJson = contentType.includes('application/json');
          if (!esJson) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
        }
        return networkResponse;
      })
      .catch(() => {
        // Sin red: servir desde caché si existe
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Para navegación de páginas SPA, servir index.html de respaldo
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
