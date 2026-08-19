// Utilidades y catálogos para el módulo de Asignaciones (Fase 2).
// Las asignaciones son una entidad real e independiente de los viáticos;
// este archivo NO infiere nada a partir de viáticos (eso quedó descartado
// en Fase 1). Todo dato viene del backend a través de services/asignaciones.js.

export const TIPOS_ASIGNACION = [
    'mantenimiento',
    'correctivo',
    'preventivo',
    'preventivo_rtc',
    'rtc',
    'oficina',
];

export const LABEL_TIPO_ASIGNACION = {
    mantenimiento: 'Mantenimiento',
    correctivo: 'Correctivo',
    preventivo: 'Preventivo',
    preventivo_rtc: 'Preventivo RTC',
    rtc: 'RTC',
    oficina: 'Oficina',
};

export const ESTADOS_ASIGNACION = ['pendiente', 'en_curso', 'finalizada', 'cancelada'];

export const LABEL_ESTADO_ASIGNACION = {
    pendiente: 'Pendiente',
    en_curso: 'En curso',
    finalizada: 'Finalizada',
    cancelada: 'Cancelada',
};

// Clase de badge por estado; reutiliza la paleta ya usada en el resto del panel
// (aprobado = verde, pendiente = ámbar/gold, rechazado/cancelada = rojo).
export const CLASE_ESTADO_ASIGNACION = {
    pendiente: 'estado-asignacion--pendiente',
    en_curso: 'estado-asignacion--en-curso',
    finalizada: 'estado-asignacion--finalizada',
    cancelada: 'estado-asignacion--cancelada',
};

// Dada la lista completa de asignaciones (todas, de todos los técnicos) y un
// tecnico_id, devuelve la asignación ACTIVA de ese técnico para mostrarla en
// Personal/PerfilEmpleado. No existe una transición manual de "pendiente" a
// "en_curso" en este módulo, así que "activa" = está en pendiente o en_curso
// Y la fecha de hoy cae dentro de [fecha_inicio, fecha_fin]. Así, en cuanto
// llega la fecha de inicio, la asignación aparece sola sin acción manual.
// Si hay varias activas para el mismo técnico (no debería, pero por
// robustez) se toma la de fecha_inicio más reciente.
export function obtenerAsignacionActivaDeTecnico(asignaciones, tecnicoId) {
    const activas = obtenerAsignacionesActivasDeTecnico(asignaciones, tecnicoId);
    return activas.length === 0 ? null : activas[0];
}

// Igual que obtenerAsignacionActivaDeTecnico pero devuelve TODAS las
// asignaciones activas del técnico (no solo una), ordenadas por fecha de
// inicio ascendente. "Activa" = no está finalizada ni cancelada (incluye
// tanto la que ya empezó como las próximas), ya que no existe una
// transición manual de "pendiente" a "en_curso" en este módulo.
export function obtenerAsignacionesActivasDeTecnico(asignaciones, tecnicoId) {
    const delTecnico = asignaciones.filter(
        (a) =>
            String(a.tecnico_id) === String(tecnicoId) &&
            (a.estado === 'pendiente' || a.estado === 'en_curso')
    );
    return [...delTecnico].sort((a, b) => (a.fecha_inicio || '').localeCompare(b.fecha_inicio || ''));
}

/**
 * Construye la etiqueta visual de una asignación:
 *   "Banco Agrario - Oficina Correctivo"
 * Si algún dato falta, degrada graciosamente.
 * @param {string|null} cliente  - Nombre del proyecto / cliente
 * @param {string|null} tipo     - Tipo de asignación (raw key, ej. "oficina_correctivo")
 * @param {number|null} id       - ID numérico (fallback último recurso)
 */
export function labelAsignacion(cliente, tipo, id) {
    const proyecto = (cliente || '').trim();
    const tipoLabel = tipo ? (LABEL_TIPO_ASIGNACION[tipo] || tipo) : null;

    if (proyecto && tipoLabel) return `${proyecto} - ${tipoLabel}`;
    if (proyecto) return proyecto;
    if (tipoLabel) return tipoLabel;
    return id != null ? `Asignación #${id}` : 'Asignación';
}

export function filtrarAsignaciones(asignaciones, { busqueda = '', tipo = '', estado = '' } = {}) {
    const q = busqueda.trim().toLowerCase();
    return asignaciones.filter((a) => {
        if (tipo && a.tipo !== tipo) return false;
        if (estado && a.estado !== estado) return false;
        if (!q) return true;
        return (
            a.cliente?.toLowerCase().includes(q) ||
            a.empresa?.toLowerCase().includes(q) ||
            a.ciudad?.toLowerCase().includes(q) ||
            a.tecnico_nombre?.toLowerCase().includes(q)
        );
    });
}

/**
 * Deriva automáticamente lugar_tipo ('rtc' | 'oficina'),
 * lugar_subtipo ('correctivo' | 'preventivo' | null) y lugarFinal ('RTC' | 'Oficina (Correctivo)' | 'Oficina (Preventivo)')
 * a partir del tipo de asignación.
 * Si no hay asignación (viático independiente), retorna default oficina / correctivo.
 */
export function derivarLugarDesdeTipoAsignacion(tipoAsignacion) {
    if (!tipoAsignacion) {
        return {
            lugar_tipo: 'oficina',
            lugar_subtipo: 'correctivo',
            lugarFinal: 'Oficina (Correctivo)',
        };
    }
    const t = String(tipoAsignacion).toLowerCase();
    if (t === 'rtc' || t === 'preventivo_rtc') {
        return {
            lugar_tipo: 'rtc',
            lugar_subtipo: null,
            lugarFinal: 'RTC',
        };
    }
    if (t === 'preventivo') {
        return {
            lugar_tipo: 'oficina',
            lugar_subtipo: 'preventivo',
            lugarFinal: 'Oficina (Preventivo)',
        };
    }
    return {
        lugar_tipo: 'oficina',
        lugar_subtipo: 'correctivo',
        lugarFinal: 'Oficina (Correctivo)',
    };
}
