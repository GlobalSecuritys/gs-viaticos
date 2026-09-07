/**
 * navigation.js — Utilidad de navegación inteligente para la app.
 * Permite usar navegación real hacia atrás en el historial del navegador,
 * con fallback seguro en caso de acceso directo por URL o historial vacío.
 */
export function irAtras(navigate, fallback = '/') {
  // Si hay historial en la sesión actual de la SPA
  if (window.history && window.history.length > 1) {
    navigate(-1);
  } else {
    navigate(fallback);
  }
}
