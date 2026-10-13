// Generador PDF para la sección independiente de Compromisos (AD-FR-06).
// Replica con máxima fidelidad los tres formatos institucionales de referencia:
// - compromiso adminstrativo.pdf (Cargo: ADMINISTRATIVO)
// - compromiso auxiliar contable.pdf (Cargo: AUXILIAR CONTABLE)
// - compromiso operaciones.pdf (Cargo: OPERACIONES)

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoDataUrl from '../assets/logo-gsb.png?inline';

const MARGEN_X = 54;
const ANCHO_UTIL = 504; // 612 - 54*2
const HEADER_Y = 50;
const HEADER_H = 46;
const NEGRO = [0, 0, 0];

const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function limpiar(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .normalize('NFC')
        .split('')
        .filter((c) => {
            const code = c.charCodeAt(0);
            return c === '\n' || c === '\t' || (code >= 0x20 && code <= 0xff) || WINANSI_EXTRA.includes(c);
        })
        .join('')
        .replace(/\r\n?/g, '\n')
        .trim();
}

function formatearFecha(valor) {
    if (!valor) return '—';
    const s = String(valor);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [y, m, d] = s.slice(0, 10).split('-');
        return `${d}/${m}/${y}`;
    }
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('es-CO', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    }
    return s;
}

function resolverCargoFormato(plantillaId, cargo) {
    const c = String(cargo || '').toUpperCase();
    const p = String(plantillaId || '').toLowerCase();
    if (p === 'directivos' || c.includes('DIRECT') || c.includes('ADMIN')) {
        return 'ADMINISTRATIVO';
    }
    if (p === 'contable' || c.includes('CONTABLE')) {
        return 'AUXILIAR CONTABLE';
    }
    return 'OPERACIONES';
}

function nombreArchivo(nombre, cargoFormato, fechaStr) {
    const base = limpiar(nombre)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Evaluado';
    const cargoClean = cargoFormato.replace(/[^A-Za-z0-9]+/g, '_');
    const f = /^\d{4}-\d{2}-\d{2}/.test(String(fechaStr || ''))
        ? String(fechaStr).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    return `Compromiso_${base}_${cargoClean}_${f}.pdf`;
}

/**
 * Genera el PDF oficial de Compromisos Generados (AD-FR-06 Versión 2).
 */
export function generarPdfCompromisos({
    nombreEvaluado,
    plantillaId,
    cargo,
    fechaEvaluacion,
    nombreEvaluador,
    compromisos = [],
    estado = 'abierto',
    cerradoEn = null,
}) {
    // Formato Carta vertical: 612 x 792 pt
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });

    const cargoTexto = resolverCargoFormato(plantillaId, cargo);
    // Fecha a imprimir: fecha de cierre si está cerrada, o fecha de la evaluación si sigue abierta
    const fechaImprimir = formatearFecha(estado === 'cerrado' && cerradoEn ? cerradoEn : fechaEvaluacion);

    // ── 1. ENCABEZADO INSTITUCIONAL ──────────────────────────────────────────
    const anchoLogo = 50;
    const anchoMeta = 100;
    const xLogo = MARGEN_X;
    const xCentro = xLogo + anchoLogo;
    const anchoCentro = ANCHO_UTIL - anchoLogo - anchoMeta;
    const xMeta = xCentro + anchoCentro;

    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.6);

    // Caja Logo
    doc.rect(xLogo, HEADER_Y, anchoLogo, HEADER_H);
    try {
        const props = doc.getImageProperties(logoDataUrl);
        const escala = Math.min((anchoLogo - 8) / props.width, (HEADER_H - 8) / props.height);
        const w = props.width * escala;
        const h = props.height * escala;
        doc.addImage(logoDataUrl, 'PNG', xLogo + (anchoLogo - w) / 2, HEADER_Y + (HEADER_H - h) / 2, w, h, 'logo-gsb');
    } catch {
        // Fallback si no carga imagen
    }

    // Caja Centro
    doc.rect(xCentro, HEADER_Y, anchoCentro, HEADER_H / 2);
    doc.rect(xCentro, HEADER_Y + HEADER_H / 2, anchoCentro, HEADER_H / 2);
    doc.setTextColor(...NEGRO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('GLOBAL SECURITY BANK SAS', xCentro + anchoCentro / 2, HEADER_Y + HEADER_H / 4 + 3.5, { align: 'center' });
    doc.text('EVALUACIÓN DE DESEMPEÑO', xCentro + anchoCentro / 2, HEADER_Y + (HEADER_H * 3) / 4 + 3.5, { align: 'center' });

    // Cuadro Metadatos Documentales (Código / Versión / Fecha Act / Página)
    const filaH = HEADER_H / 4;
    const colW = anchoMeta / 2;
    doc.rect(xMeta, HEADER_Y, anchoMeta, HEADER_H);
    doc.line(xMeta + colW, HEADER_Y, xMeta + colW, HEADER_Y + HEADER_H);
    doc.line(xMeta, HEADER_Y + filaH * 1, xMeta + anchoMeta, HEADER_Y + filaH * 1);
    doc.line(xMeta, HEADER_Y + filaH * 2, xMeta + anchoMeta, HEADER_Y + filaH * 2);
    doc.line(xMeta, HEADER_Y + filaH * 3, xMeta + anchoMeta, HEADER_Y + filaH * 3);

    const celdasMeta = [
        ['Código', 'Versión'],
        ['AD-FR-06', '2'],
        ['Fecha Act', 'Página'],
        ['Septiembre 2024', '1 de 1'],
    ];
    doc.setFontSize(6.5);
    celdasMeta.forEach((fila, i) => {
        doc.setFont('helvetica', i % 2 === 0 ? 'normal' : 'bold');
        fila.forEach((txt, j) => {
            doc.text(limpiar(txt), xMeta + colW * j + colW / 2, HEADER_Y + filaH * i + filaH / 2 + 2.2, { align: 'center' });
        });
    });

    // ── 2. BLOQUE DE IDENTIFICACIÓN ──────────────────────────────────────────
    const idY = HEADER_Y + HEADER_H + 14;
    const idH = 36;
    doc.setLineWidth(0.6);
    doc.rect(MARGEN_X, idY, ANCHO_UTIL, idH);
    doc.line(MARGEN_X, idY + idH / 2, MARGEN_X + ANCHO_UTIL, idY + idH / 2);
    doc.line(MARGEN_X + ANCHO_UTIL / 2, idY, MARGEN_X + ANCHO_UTIL / 2, idY + idH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);

    // Fila 1: NOMBRE | FECHA
    doc.text('NOMBRE:', MARGEN_X + 8, idY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(limpiar(nombreEvaluado) || '—', MARGEN_X + 60, idY + 12);

    doc.setFont('helvetica', 'bold');
    doc.text('FECHA:', MARGEN_X + ANCHO_UTIL / 2 + 8, idY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(limpiar(fechaImprimir), MARGEN_X + ANCHO_UTIL / 2 + 50, idY + 12);

    // Fila 2: CARGO | NOMBRE EVALUADOR
    doc.setFont('helvetica', 'bold');
    doc.text('CARGO:', MARGEN_X + 8, idY + idH / 2 + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(cargoTexto, MARGEN_X + 60, idY + idH / 2 + 12);

    doc.setFont('helvetica', 'bold');
    doc.text('NOMBRE EVALUADOR:', MARGEN_X + ANCHO_UTIL / 2 + 8, idY + idH / 2 + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(limpiar(nombreEvaluador) || '—', MARGEN_X + ANCHO_UTIL / 2 + 115, idY + idH / 2 + 12);

    // ── 3. TABLA DE COMPROMISOS GENERADOS (8 FILAS EXACTAS) ─────────────────
    const listaOcho = Array.from({ length: 8 }, (_, i) => [
        String(i + 1),
        limpiar(compromisos[i] || ''),
    ]);

    autoTable(doc, {
        startY: idY + idH + 18,
        margin: { left: MARGEN_X, right: MARGEN_X },
        theme: 'grid',
        head: [[{ content: 'COMPROMISOS GENERADOS', colSpan: 2 }]],
        body: listaOcho,
        styles: {
            font: 'helvetica',
            fontSize: 8,
            textColor: NEGRO,
            lineColor: NEGRO,
            lineWidth: 0.6,
            valign: 'middle',
            overflow: 'linebreak',
            cellPadding: 4,
            minCellHeight: 25,
        },
        headStyles: {
            fontStyle: 'bold',
            halign: 'center',
            fillColor: [255, 255, 255],
            textColor: NEGRO,
            fontSize: 8.5,
            cellPadding: 3,
            minCellHeight: 18,
        },
        columnStyles: {
            0: { cellWidth: 34, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 'auto' },
        },
    });

    // ── 4. SECCIÓN DE FIRMAS ────────────────────────────────────────────────
    // Ubicación fija de firmas tal como en el formato de referencia
    const firmasY = Math.max(doc.lastAutoTable.finalY + 50, 480);
    const anchoLineaFirma = 130;
    const xFirma1 = MARGEN_X + 50;
    const xFirma2 = MARGEN_X + ANCHO_UTIL - 50 - anchoLineaFirma;

    doc.setLineWidth(0.6);
    // Línea Evaluador
    doc.line(xFirma1, firmasY, xFirma1 + anchoLineaFirma, firmasY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FIRMA DE EVALUADOR', xFirma1 + anchoLineaFirma / 2, firmasY + 12, { align: 'center' });

    // Línea Evaluado
    doc.line(xFirma2, firmasY, xFirma2 + anchoLineaFirma, firmasY);
    doc.text('FIRMA DEL EVALUADO', xFirma2 + anchoLineaFirma / 2, firmasY + 12, { align: 'center' });

    // ── 5. METADATOS DE AUDITORÍA AL PIE ────────────────────────────────────
    const pieY = 760;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    const estadoTxt = estado === 'cerrado'
        ? `Estado: CERRADO (${formatearFecha(cerradoEn)})`
        : 'Estado: ABIERTO (En seguimiento)';
    doc.text(`Documento generado: ${new Date().toLocaleDateString('es-CO')} | ${estadoTxt}`, MARGEN_X, pieY);
    doc.text('Página 1 de 1', MARGEN_X + ANCHO_UTIL, pieY, { align: 'right' });

    doc.save(nombreArchivo(nombreEvaluado, cargoTexto, fechaEvaluacion));
}
