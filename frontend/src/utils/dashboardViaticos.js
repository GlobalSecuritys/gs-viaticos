// Lógica pura del Dashboard de Viáticos: agrega el payload ya cargado, sin peticiones.

/* ─────────────────────────── Etiquetas y colores ─────────────────────────── */

export const LABEL_CONCEPTO = {
    hospedaje: 'Hospedaje',
    transporte: 'Transporte',
    alimentacion: 'Alimentación',
    materiales: 'Materiales',
    alquiler_escalera: 'Alquiler de escalera',
    otros: 'Otros',
};

export const ESTADOS = [
    { id: 'aprobado', label: 'Aprobado (vivo)', color: '#059669' },
    { id: 'pendiente', label: 'Pendiente (vivo)', color: '#D97706' },
    { id: 'archivado_no_rechazado', label: 'Archivado no rechazado', color: '#1D63C8' },
    { id: 'archivado_estado_desconocido', label: 'Archivado sin estado registrado', color: '#94A3B8' },
    { id: 'rechazado', label: 'Rechazado', color: '#DC2626' },
];

/* ─────────────────────────── Formato ─────────────────────────── */
// Mismos formatos que Auditoría (allí son funciones locales de Auditoria.jsx).

export function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value || 0);
}

export function formatCOPCompact(value) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${Math.round(value / 1000)}k`;
    return `$${value}`;
}

export function etiquetaMes(mes, corto = false) {
    const [y, m] = mes.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: corto ? 'short' : 'long', year: 'numeric' });
}

export function formatFecha(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

export function mesAnterior(mes) {
    const [y, m] = mes.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function topN(mapa, n = 10) {
    return Object.values(mapa).sort((a, b) => b.monto - a.monto).slice(0, n);
}

/** Agrega el payload para el periodo elegido; sin peticiones. */
export function construirVista(data, periodo) {
    if (!data) return null;
    const porMes = Object.fromEntries(data.meses.map((m) => [m.mes, m]));
    const seleccion = periodo === 'historico' ? data.meses : data.meses.filter((m) => m.mes === periodo);

    const conceptosDe = (lista) => {
        const acc = Object.fromEntries(Object.keys(LABEL_CONCEPTO).map((c) => [c, 0]));
        lista.forEach((m) => Object.entries(m.conceptos).forEach(([c, v]) => { acc[c] += v; }));
        return acc;
    };
    const concHist = conceptosDe(data.meses);
    const concPer = conceptosDe(seleccion);
    const conceptos = Object.keys(LABEL_CONCEPTO)
        .map((c) => ({ concepto: LABEL_CONCEPTO[c], historico: concHist[c], periodo: concPer[c] }))
        .sort((a, b) => b.historico - a.historico);

    const tecnicos = {};
    const ciudades = {};
    const estados = {};
    seleccion.forEach((m) => {
        m.tecnicos.forEach((t) => {
            tecnicos[t.id] = tecnicos[t.id] || { nombre: t.nombre, monto: 0 };
            tecnicos[t.id].monto += t.monto;
        });
        m.ciudades.forEach((c) => {
            ciudades[c.ciudad] = ciudades[c.ciudad] || { nombre: c.ciudad, monto: 0 };
            ciudades[c.ciudad].monto += c.monto;
        });
        Object.entries(m.estados).forEach(([e, v]) => {
            estados[e] = estados[e] || { monto: 0, cantidad: 0 };
            estados[e].monto += v.monto;
            estados[e].cantidad += v.cantidad;
        });
    });

    const montoEstado = (e) => estados[e]?.monto || 0;
    const rechazado = montoEstado('rechazado');
    // Tasa por monto, solo sobre lo que tiene estado conocido
    const baseConocida = montoEstado('aprobado') + montoEstado('pendiente') + montoEstado('archivado_no_rechazado') + rechazado;
    const tasaRechazo = baseConocida > 0 ? (rechazado / baseConocida) * 100 : null;

    // Evolución mensual + proyección continuando la línea
    const p = data.proyeccion;
    const evolucion = data.meses.map((m) => ({
        mes: m.mes,
        etiqueta: etiquetaMes(m.mes, true),
        real: m.gasto,
        proyeccion: null,
        banda: null,
    }));
    if (p) {
        const anterior = evolucion.find((e) => e.mes === mesAnterior(p.cierre_mes.mes));
        if (anterior) {
            anterior.proyeccion = anterior.real;
            anterior.banda = [anterior.real, anterior.real];
        }
        const actual = evolucion.find((e) => e.mes === p.cierre_mes.mes);
        if (actual) {
            actual.proyeccion = p.cierre_mes.central;
            actual.banda = [p.cierre_mes.minimo, p.cierre_mes.maximo];
        }
        evolucion.push({
            mes: p.mes_siguiente.mes,
            etiqueta: etiquetaMes(p.mes_siguiente.mes, true),
            real: null,
            proyeccion: p.mes_siguiente.central,
            banda: [p.mes_siguiente.minimo, p.mes_siguiente.maximo],
        });
    }

    const actual = porMes[data.mes_actual]?.gasto || 0;
    const previo = porMes[mesAnterior(data.mes_actual)]?.gasto || 0;
    const variacion = previo > 0 ? ((actual - previo) / previo) * 100 : null;

    return {
        seleccion,
        conceptos,
        tecnicos: topN(tecnicos),
        ciudades: topN(ciudades),
        estados: ESTADOS.map((e) => ({ ...e, monto: montoEstado(e.id), cantidad: estados[e.id]?.cantidad || 0 }))
            .filter((e) => e.monto > 0),
        rechazado,
        cantRechazados: estados.rechazado?.cantidad || 0,
        tasaRechazo,
        evolucion,
        actual,
        previo,
        variacion,
    };
}
