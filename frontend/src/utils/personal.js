// Utilidades del módulo Personal.
// Todo se calcula en el frontend usando datos existentes de
// /admin/usuarios y /admin/viaticos. No modifica backend ni base de datos.

export const LABEL_TIPO_GASTO = {
    alimentacion: 'Alimentación',
    transporte: 'Transporte',
    hotel: 'Hotel',
    peajes: 'Peajes',
    parqueadero: 'Parqueadero',
    otros: 'Otros',
};

// El backend maneja rol (tecnico/admin/superadmin), no un cargo independiente.
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

const DIAS_SEMANA = [
    'Lunes', 'Martes', 'Miércoles', 'Jueves',
    'Viernes', 'Sábado', 'Domingo',
];

export function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(value || 0);
}

// Recibe YYYY-MM-DD y evita problemas de zona horaria.
function parsearFechaISO(fechaStr) {
    const [year, month, day] = String(fechaStr).split('-').map(Number);
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

export function inicioDeSemana(fechaBase = new Date()) {
    const fecha = new Date(fechaBase);
    const diaSemana = fecha.getDay();
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

export function numeroDeSemana(fechaBase = new Date()) {
    const fecha = new Date(
        Date.UTC(
            fechaBase.getFullYear(),
            fechaBase.getMonth(),
            fechaBase.getDate()
        )
    );

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

    if (partes.length === 1) {
        return partes[0].slice(0, 2).toUpperCase();
    }

    return (partes[0][0] + partes[1][0]).toUpperCase();
}

// --- Actividad reciente basada únicamente en viáticos reales ---

function diasDesde(fechaStr) {
    const fecha = parsearFechaISO(fechaStr);
    const hoy = new Date();

    hoy.setHours(0, 0, 0, 0);
    fecha.setHours(0, 0, 0, 0);

    return Math.round((hoy - fecha) / 86400000);
}

// Devuelve un viático existente con la fecha más reciente.
// No agrupa registros ni deduce una asignación.
export function obtenerActividadReciente(viaticos = []) {
    if (!Array.isArray(viaticos) || viaticos.length === 0) {
        return null;
    }

    const ordenados = [...viaticos]
        .filter((viatico) => viatico?.fecha)
        .sort((a, b) => {
            const porFecha = String(b.fecha).localeCompare(String(a.fecha));

            if (porFecha !== 0) {
                return porFecha;
            }

            return String(b.created_at ?? '').localeCompare(
                String(a.created_at ?? '')
            );
        });

    const ultimo = ordenados[0];

    if (!ultimo) {
        return null;
    }

    return {
        cliente: ultimo.cliente,
        ciudad: ultimo.ciudad,
        ot: ultimo.ot,
        fecha: ultimo.fecha,
        diasDesde: diasDesde(ultimo.fecha),
    };
}

export function contarViaticos(viaticos = []) {
    return Array.isArray(viaticos) ? viaticos.length : 0;
}

export function contarViaticosHoy(viaticos = []) {
    const hoy = hoyISO();

    return Array.isArray(viaticos)
        ? viaticos.filter((viatico) => viatico.fecha === hoy).length
        : 0;
}

export function etiquetaDiasDesde(dias) {
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    if (dias < 0) return 'Fecha futura';

    return `Hace ${dias} días`;
}

// --- Filtros de tiempo ---

export function filtrarPorRango(viaticos = [], inicioISO, finISO) {
    if (!Array.isArray(viaticos)) return [];

    return viaticos.filter(
        (viatico) =>
            viatico.fecha >= inicioISO &&
            viatico.fecha <= finISO
    );
}

export function resumen(viaticos = []) {
    if (!Array.isArray(viaticos)) {
        return {
            total: 0,
            cantidad: 0,
            aprobados: 0,
            pendientes: 0,
            rechazados: 0,
        };
    }

    return {
        total: viaticos.reduce(
            (acumulado, viatico) => acumulado + Number(viatico.valor || 0),
            0
        ),
        cantidad: viaticos.length,
        aprobados: viaticos.filter(
            (viatico) => viatico.estado === 'aprobado'
        ).length,
        pendientes: viaticos.filter(
            (viatico) => viatico.estado === 'pendiente'
        ).length,
        rechazados: viaticos.filter(
            (viatico) => viatico.estado === 'rechazado'
        ).length,
    };
}