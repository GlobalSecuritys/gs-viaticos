// Utilidades y catálogos para el módulo de Asignaciones (Fase 2).
// Las asignaciones son una entidad real e independiente de los viáticos;
// este archivo NO infiere nada a partir de viáticos (eso quedó descartado
// en Fase 1). Todo dato viene del backend a través de services/asignaciones.js.

export const TIPOS_ASIGNACION = [
    'rtc',
    'oficina',
    'instalacion',
    'auditoria',
    'capacitacion',
    'mantenimiento',
    'soporte',
];

export const LABEL_TIPO_ASIGNACION = {
    rtc: 'RTC',
    oficina: 'Oficina',
    instalacion: 'Instalación',
    auditoria: 'Auditoría',
    capacitacion: 'Capacitación',
    mantenimiento: 'Mantenimiento',
    soporte: 'Soporte',
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
// Personal/PerfilEmpleado. "Activa" = en_curso; si hay varias en_curso (no
// debería, pero por robustez) se toma la de fecha_inicio más reciente. Si no
// hay ninguna en_curso, se muestra null (tarjeta dirá "Sin asignación activa").
export function obtenerAsignacionActivaDeTecnico(asignaciones, tecnicoId) {
    const delTecnico = asignaciones.filter(
        (a) => String(a.tecnico_id) === String(tecnicoId) && a.estado === 'en_curso'
    );
    if (delTecnico.length === 0) return null;
    return [...delTecnico].sort((a, b) => (b.fecha_inicio || '').localeCompare(a.fecha_inicio || ''))[0];
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
