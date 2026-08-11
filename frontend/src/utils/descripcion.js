/**
 * Intenta parsear la descripción del viático. Si es un JSON válido generado por el
 * formulario de viáticos, retorna un objeto estructurado. De lo contrario retorna null.
 */
export function parseDescripcion(descripcionStr) {
    if (!descripcionStr) return null;
    if (typeof descripcionStr !== 'string') return null;

    const strTrim = descripcionStr.trim();
    if (!strTrim.startsWith('{') || !strTrim.endsWith('}')) {
        return null;
    }

    try {
        const parsed = JSON.parse(strTrim);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return {
                nit: parsed.nit && parsed.nit !== '—' ? parsed.nit : null,
                razon_social: parsed.razon_social && parsed.razon_social !== '—' ? parsed.razon_social : null,
                lugar: parsed.lugar && parsed.lugar !== '—' ? parsed.lugar : null,
                origen: parsed.origen && parsed.origen !== '—' ? parsed.origen : null,
                destino: parsed.destino && parsed.destino !== '—' ? parsed.destino : null,
                tiene_soporte: parsed.tiene_soporte === true || parsed.tiene_soporte === 'si' || parsed.tiene_soporte === 'true',
                asignacion_id: parsed.asignacion_id ? Number(parsed.asignacion_id) : null,
            };
        }
    } catch {
        // No es JSON válido
    }

    return null;
}
