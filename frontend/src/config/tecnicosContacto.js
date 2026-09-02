/**
 * tecnicosContacto.js
 *
 * Fuente de datos de contacto WhatsApp para los técnicos de campo.
 *
 * NOTA: Idealmente estos datos deberían provenir de la tabla `usuarios`
 * en la base de datos (Neon), filtrando por rol = 'tecnico' y leyendo
 * el campo `telefono`. Por ahora se usa este array como fallback temporal
 * mientras no exista ese campo en la base de datos.
 *
 * Números normalizados a formato wa.me con código de país 57 (Colombia).
 */

export const TECNICOS_CONTACTO = [
  { nombre: 'Fredy',      telefono: '573213893002' },
  { nombre: 'Angel Ceith', telefono: '573107574409' },
  { nombre: 'Jorge Ochoa', telefono: '573013640904' },
  { nombre: 'Jose Daniel', telefono: '573017540484' },
  { nombre: 'Lucas Rico',  telefono: '573026437234' },
  { nombre: 'Nelson Diaz', telefono: '573146245785' },
  { nombre: 'Jose Bedoya', telefono: '573108903383' },
];
