// Utilidades para el módulo "Personal": formateo y derivación de
// "asignación actual" a partir de los viáticos ya existentes.
// No se crea ni modifica ningún dato en el backend: todo se calcula
// en el cliente a partir de lo que ya devuelven /admin/usuarios y /admin/viaticos.

export const LABEL_TIPO_GASTO = {
    alimentacion: 'Alimentación',
    transporte: 'Transporte',
    hotel: 'Hotel',
    peajes: 'Peajes',
    parqueadero: 'Parqueadero',
    otros: 'Otros',
};

// El backend solo maneja "rol" (tecnico/admin/superadmin). No existe un campo
// de "cargo" independiente, así que lo derivamos del rol para mostrarlo en el
// perfil, tal como pide el diseño.
export const LABEL_CARGO = {
    tecnico: 'Técnico',
    admin: 'Administrador',
    superadmin: 'Super Administrador',
};

const MESES_LARGO = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MESES_CORTO = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value || 0);
}

// Recibe 'YYYY-MM-DD' (como lo entrega la API) y evita problemas de huso
// horario que da `new Date('YYYY-MM-DD')`.
function parsearFechaISO(fechaStr) {
    const [year, month, day] = fechaStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function formatFechaLarga(fechaStr) {
    if (!fechaStr) return '—';
    const fecha = parsearFechaISO(fechaStr);
    return `${fecha.getDate()} ${MESES_LARGO[fecha.getMonth()]}`;
}

export function formatFechaCorta(fechaStr) {
    if (!fechaStr) return '—';
    const fecha = parsearFechaISO(fechaStr);
    return `${fecha.getDate()} ${MESES_CORTO[fecha.getMonth()]}`;
}

export function hoyISO() {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${hoy.getFullYear()}-${mes}-${dia}`;
}

// Lunes de la semana que contiene `fechaBase` (Date). Semana Lunes→Domingo.
export function inicioDeSemana(fechaBase = new Date()) {
    const fecha = new Date(fechaBase);
    const diaSemana = fecha.getDay(); // 0=domingo .. 6=sábado
    const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
    fecha.setDate(fecha.getDate() + offset);
    fecha.setHours(0, 0, 0, 0);
    return fecha;
}

export function finDeSemana(fechaBase = new Date()) {
    const inicio = inicioDeSemana(fechaBase);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    return fin;
}

// Número de semana ISO-8601 aproximado, suficiente para el label "Semana N".
export function numeroDeSemana(fechaBase = new Date()) {
    const fecha = new Date(Date.UTC(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate()));
    const diaSemana = fecha.getUTCDay() || 7;
    fecha.setUTCDate(fecha.getUTCDate() + 4 - diaSemana);
    const inicioAno = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 1));
    return Math.ceil(((fecha - inicioAno) / 86400000 + 1) / 7);
}

export function nombreDia(fechaStr) {
    const fecha = parsearFechaISO(fechaStr);
    const diaSemana = fecha.getDay();
    return DIAS_SEMANA[diaSemana === 0 ? 6 : diaSemana - 1];
}

export function iniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
}

// --- Derivación de "Asignación actual" a partir de los viáticos existentes ---
//
// No existe en el backend un concepto de "asignación" con fecha de inicio/fin;
// solo viáticos individuales con fecha, cliente, ciudad y ot (orden de trabajo).
// Para mostrar la Sección 2 del perfil, agrupamos los viáticos del empleado por
// (ot + cliente + ciudad) y tratamos cada grupo como una "asignación", tomando
// la fecha mínima y máxima del grupo como Inicio/Final.

export function agruparAsignaciones(viaticos) {
    const grupos = new Map();

    for (const v of viaticos) {
        const key = `${v.ot}|${v.cliente}|${v.ciudad}`;
        if (!grupos.has(key)) {
            grupos.set(key, { ot: v.ot, cliente: v.cliente, ciudad: v.ciudad, fechas: [] });
        }
        grupos.get(key).fechas.push(v.fecha);
    }

    return Array.from(grupos.values()).map((g) => {
        const fechasOrdenadas = [...g.fechas].sort();
        return {
            ot: g.ot,
            cliente: g.cliente,
            ciudad: g.ciudad,
            inicio: fechasOrdenadas[0],
            final: fechasOrdenadas[fechasOrdenadas.length - 1],
        };
    });
}

// Devuelve la asignación "vigente": preferimos una que incluya la fecha de
// hoy; si no hay ninguna en curso, mostramos la más reciente ya finalizada;
// si tampoco hay, mostramos la próxima asignación futura más cercana.
export function obtenerAsignacionActual(viaticos) {
    const grupos = agruparAsignaciones(viaticos);
    if (grupos.length === 0) return null;

    const hoy = hoyISO();

    const enCurso = grupos
        .filter((g) => g.inicio <= hoy && g.final >= hoy)
        .sort((a, b) => b.final.localeCompare(a.final));
    if (enCurso.length > 0) return { ...enCurso[0], estado: 'en_curso' };

    const pasadas = grupos
        .filter((g) => g.final < hoy)
        .sort((a, b) => b.final.localeCompare(a.final));
    if (pasadas.length > 0) return { ...pasadas[0], estado: 'finalizada' };

    const futuras = grupos
        .filter((g) => g.inicio > hoy)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (futuras.length > 0) return { ...futuras[0], estado: 'proxima' };

    return null;
}

export const LABEL_ESTADO_ASIGNACION = {
    en_curso: 'En curso',
    finalizada: 'Finalizada',
    proxima: 'Próxima',
};

// --- Filtros de tiempo (Sección 3) ---

export function filtrarPorRango(viaticos, inicioISO, finISO) {
    return viaticos.filter((v) => {
        const fecha = (v.fecha || '').slice(0, 10);
        return fecha >= inicioISO && fecha <= finISO;
    });
}

export function resumen(viaticos) {
    return {
        total: viaticos.reduce((acc, v) => acc + Number(v.valor), 0),
        cantidad: viaticos.length,
        aprobados: viaticos.filter((v) => v.estado === 'aprobado').length,
        pendientes: viaticos.filter((v) => v.estado === 'pendiente').length,
        rechazados: viaticos.filter((v) => v.estado === 'rechazado').length,
    };
}

// --- Extensión: selección de semana específica dentro del mes (Sección 3, Filtro 1) ---
// El backend no tiene concepto de "semana N"; se deriva partiendo el mes en
// bloques de 7 días (Semana 1 = días 1-7, ..., Semana 4 = día 22 al fin de mes).

export function rangoSemanaDelMes(numero, fechaBase = new Date()) {
    const year = fechaBase.getFullYear();
    const month = fechaBase.getMonth();
    const ultimoDiaMes = new Date(year, month + 1, 0).getDate();

    let inicioDia = (numero - 1) * 7 + 1;
    let finDia = numero === 4 ? ultimoDiaMes : numero * 7;
    if (inicioDia > ultimoDiaMes) inicioDia = ultimoDiaMes;
    if (finDia > ultimoDiaMes) finDia = ultimoDiaMes;

    const pad = (n) => String(n).padStart(2, '0');
    return {
        inicio: `${year}-${pad(month + 1)}-${pad(inicioDia)}`,
        fin: `${year}-${pad(month + 1)}-${pad(finDia)}`,
    };
}

export function semanaDelMesActual(fechaBase = new Date()) {
    return Math.min(4, Math.ceil(fechaBase.getDate() / 7));
}

// Iconos por tipo de gasto — solo presentación, no altera la lógica existente.
export const ICONO_TIPO_GASTO = {
    alimentacion: '🍽️',
    transporte: '🚗',
    hotel: '🏨',
    peajes: '🎫',
    parqueadero: '🅿️',
    otros: '📦',
};