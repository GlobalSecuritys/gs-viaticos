/**
 * Utilidades para la Unión Temporal RTC American Global.
 */

// Entidades corporativas listadas en la hoja FILTROS que NO son técnicos
export const ENTIDADES_NO_TECNICOS = new Set([
    'GLOBAL SECURITY BANK',
    'BANCO AGRARIO',
    'SDS SMART DEVELOPMENT SYSTEMS CORP',
]);

/**
 * Normaliza el campo observacion de los despachos de RTC.
 * Limpia espacios, pasa a mayúsculas y corrige el typo histórico 'MANTANIMIENTO' -> 'MANTENIMIENTO'.
 * Retorna 'RTC' | 'MANTENIMIENTO' | 'VENTA' | u otra observación limpia.
 */
export function normalizarObservacionRTC(obs) {
    if (!obs) return '';
    let norm = obs.trim().toUpperCase().replace(/\s+/g, ' ');
    if (norm === 'MANTANIMIENTO' || norm.includes('MANTANIMIENTO')) {
        norm = norm.replace(/MANTANIMIENTO/g, 'MANTENIMIENTO');
    }
    if (norm === 'VENTA' || norm.startsWith('VENTA')) {
        return 'VENTA';
    }
    if (norm === 'MANTENIMIENTO' || norm.startsWith('MANTENIMIENTO')) {
        return 'MANTENIMIENTO';
    }
    if (norm === 'RTC' || norm.startsWith('RTC')) {
        return 'RTC';
    }
    return norm;
}

/**
 * Determina si un nombre corresponde a una entidad corporativa en vez de una persona.
 */
export function esEntidadCorporativa(nombre) {
    if (!nombre) return false;
    const n = nombre.trim().toUpperCase();
    return ENTIDADES_NO_TECNICOS.has(n);
}
