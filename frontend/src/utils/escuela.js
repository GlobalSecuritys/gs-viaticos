export const PLANTILLA_LABEL = {
    directivos: 'Directivos',
    contable: 'Contable',
    operaciones: 'Operaciones',
    tecnico: 'Técnico de planta',
};

export const GRUPO_LABEL = {
    administrativos: 'Administrativos',
    tecnicos: 'Técnicos',
};

export function fmtFecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtTamano(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/* Material académico: mismas reglas que el backend (solo para avisar antes de subir). */
export const MATERIAL_EXTENSIONES = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
export const MATERIAL_MAX_BYTES = 10 * 1024 * 1024;
