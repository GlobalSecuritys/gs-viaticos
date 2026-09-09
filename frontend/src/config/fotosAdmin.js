/**
 * fotosAdmin.js — Fotos corporativas de las administradoras del ecosistema.
 *
 * El mapeo es EXPLÍCITO y va por correo, no por nombre: derivar el archivo del
 * nombre en tiempo real rompería el día que dos personas compartan el primer
 * nombre (dos "María" apuntando a la misma foto).
 *
 * Los archivos viven en `frontend/public/img/admins/` y se sirven desde la raíz
 * del sitio, por eso las rutas empiezan en `/img/`.
 */
export const FOTOS_ADMIN = {
  'pilaradmin@gsbank.com': '/img/admins/pilar.jpeg',
  // TODO (Miguel): reemplazar por los correos reales de Claudia, Luisa y María.
  // Mientras la llave no coincida con el correo real, la tarjeta muestra el
  // avatar de iniciales; no se rompe nada.
  'claudia@correo-pendiente.com': '/img/admins/claudia.jpeg',
  'luisa@correo-pendiente.com': '/img/admins/luisa.jpeg',
  'maria@correo-pendiente.com': '/img/admins/maria.jpeg',
};

/**
 * Ruta de la foto del usuario, o null si todavía no tiene una asignada.
 * La comparación va en minúsculas: el correo Master aparece escrito como
 * PilarAdmin@gsbank.com en varias pantallas y debe encontrar su foto igual.
 */
export function obtenerFotoAdmin(correo) {
  if (!correo) return null;
  return FOTOS_ADMIN[correo.trim().toLowerCase()] || null;
}

/**
 * Iniciales para el avatar de reserva: "María Pérez" -> "MP".
 * Es el fallback obligatorio cuando no hay foto, para no dejar nunca un hueco
 * ni una imagen rota en la tarjeta.
 */
export function obtenerIniciales(nombre) {
  const palabras = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}
