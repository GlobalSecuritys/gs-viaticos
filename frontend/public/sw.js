/* =====================================================
   GS Viáticos — Service Worker
   Estrategia: Network-First con caché de respaldo.
   Solo lo mínimo para cumplir criterios de instalabilidad
   de Chrome/Safari (fetch handler requerido).
   ===================================================== */

const CACHE_NAME = 'gs-viaticos-v1';

// Recursos del shell de la app que se cachean al instalar
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/favicon.svg',
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

/* ── FETCH: Network-First con caché de respaldo ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones al API backend (solo cachear assets del frontend)
  if (url.pathname.startsWith('/api') || url.hostname !== location.hostname) {
    return; // dejar pasar sin modificar
  }

  // Solo cachear GET
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Si la respuesta de red es válida, actualizar caché y devolver
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return networkResponse;
      })
      .catch(() => {
        // Sin red: servir desde caché si existe
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Para navegación, servir index.html (SPA fallback)
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503 });
        });
      })
  );
});
