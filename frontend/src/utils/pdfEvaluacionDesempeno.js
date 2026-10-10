// Generador PDF de la evaluación de desempeño completada.
// Se carga con import() solo al pulsar "Descargar PDF": no forma parte del bundle inicial.
// Todo sale de la plantilla estática y de la fila ya cargada en pantalla (cero peticiones al backend).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoDataUrl from '../assets/logo-gsb.png?inline';

const MARGEN = 30;
const HEADER_Y = 22;
const HEADER_H = 50;
const CONTENIDO_TOP = HEADER_Y + HEADER_H + 14;
const PIE_H = 8;
const NEGRO = [0, 0, 0];
const GRIS_SECCION = [230, 230, 230];

// Helvetica estándar de jsPDF usa WinAnsi: tildes y ñ funcionan; emojis u otros símbolos no.
// Se eliminan solo los caracteres que no tiene la codificación para no imprimir basura.
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function limpiar(texto) {
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

// El backend guarda utcnow() sin zona horaria: se interpreta como UTC y se muestra en hora de Colombia.
function formatearFechaHora(valor) {
    if (!valor) return '—';
    const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(valor) ? valor : `${valor}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

function nombreArchivo(nombre, plantillaId, fecha) {
    const base = limpiar(nombre)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Evaluado';
    const fechaArchivo = /^\d{4}-\d{2}-\d{2}/.test(String(fecha || ''))
        ? String(fecha).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    return `Evaluacion_${base}_${plantillaId}_${fechaArchivo}.pdf`;
}

function dibujarEncabezado(doc, plantilla, pagina, totalPaginas) {
    const anchoPag = doc.internal.pageSize.getWidth();
    const anchoUtil = anchoPag - MARGEN * 2;
    const anchoLogo = 50;
    const anchoMeta = 120;
    const xCentro = MARGEN + anchoLogo;
    const anchoCentro = anchoUtil - anchoLogo - anchoMeta - 8;
    const xMeta = anchoPag - MARGEN - anchoMeta;
    const enc = plantilla.encabezado;

    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.8);
    doc.rect(MARGEN, HEADER_Y, anchoLogo, HEADER_H);
    doc.rect(xCentro, HEADER_Y, anchoCentro, HEADER_H / 2);
    doc.rect(xCentro, HEADER_Y + HEADER_H / 2, anchoCentro, HEADER_H / 2);

    try {
        const props = doc.getImageProperties(logoDataUrl);
        const escala = Math.min((anchoLogo - 8) / props.width, (HEADER_H - 8) / props.height);
        const w = props.width * escala;
        const h = props.height * escala;
        doc.addImage(logoDataUrl, 'PNG', MARGEN + (anchoLogo - w) / 2, HEADER_Y + (HEADER_H - h) / 2, w, h, 'logo-gsb');
    } catch {
        // Sin logo el PDF sigue siendo válido
    }

    doc.setTextColor(...NEGRO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(limpiar(enc.empresa), xCentro + anchoCentro / 2, HEADER_Y + HEADER_H / 4 + 4, { align: 'center' });
    doc.text(limpiar(enc.titulo), xCentro + anchoCentro / 2, HEADER_Y + (HEADER_H * 3) / 4 + 4, { align: 'center' });

    // Cuadro Código / Versión / Fecha Act / Página
    const filaH = HEADER_H / 4;
    const colW = anchoMeta / 2;
    doc.setLineWidth(0.5);
    doc.rect(xMeta, HEADER_Y, anchoMeta, HEADER_H);
    doc.line(xMeta + colW, HEADER_Y, xMeta + colW, HEADER_Y + HEADER_H);
    doc.line(xMeta, HEADER_Y + HEADER_H / 2, xMeta + anchoMeta, HEADER_Y + HEADER_H / 2);
    const celdas = [
        ['Código', 'Versión'],
        [enc.codigo, enc.version],
        ['Fecha Act', 'Página'],
        [enc.fecha_act, `${pagina} de ${totalPaginas}`],
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    celdas.forEach((fila, i) => {
        fila.forEach((txt, j) => {
            doc.text(limpiar(txt), xMeta + colW * j + colW / 2, HEADER_Y + filaH * i + filaH / 2 + 2.2, { align: 'center' });
        });
    });
}

function dibujarPie(doc, pagina, totalPaginas, generadoEn) {
    const anchoPag = doc.internal.pageSize.getWidth();
    const altoPag = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 110);
    doc.text(`Generado: ${generadoEn}`, MARGEN, altoPag - 12);
    doc.text(`Página ${pagina} de ${totalPaginas}`, anchoPag - MARGEN, altoPag - 12, { align: 'right' });
    doc.setTextColor(...NEGRO);
}

/**
 * Genera y descarga el PDF de una evaluación completada (autoevaluación + evaluación del jefe).
 * Los promedios llegan ya calculados desde la pantalla (promediosResumen) para que cuadren exactamente.
 */
export function generarPdfEvaluacion({
    plantilla,
    plantillaId,
    nombreEvaluado,
    cedula,
    cargo,
    fecha,
    nombreEvaluador,
    autoevaluacion,
    evaluacionJefe,
    compromisos,
    promediosResumen,
    evaluacionGuardada,
    cuentaAutoevaluacion,
    cuentaEvaluacion,
}) {
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
    const anchoPag = doc.internal.pageSize.getWidth();
    const anchoUtil = anchoPag - MARGEN * 2;
    const ident = plantilla.identificacion;
    const col = plantilla.columnas;
    const margenTabla = { top: CONTENIDO_TOP, left: MARGEN, right: MARGEN, bottom: MARGEN + PIE_H };
    const estiloBase = {
        font: 'helvetica',
        fontSize: 7,
        textColor: NEGRO,
        lineColor: NEGRO,
        lineWidth: 0.5,
        cellPadding: 3,
        valign: 'middle',
        overflow: 'linebreak',
    };

    // ── Identificación ───────────────────────────────────────────────────────
    const filasId = [
        [ident.nombre_label, nombreEvaluado, ident.fecha_label, fecha],
        [ident.cargo_label, cargo, ident.evaluador_label, nombreEvaluador],
    ];
    if (ident.cedula_label) {
        filasId.push([ident.cedula_label, cedula, '', '']);
    }
    autoTable(doc, {
        startY: CONTENIDO_TOP,
        margin: margenTabla,
        theme: 'plain',
        body: filasId.map((f) => f.map(limpiar)),
        styles: { ...estiloBase, lineWidth: 0, fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 2, right: 4 } },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 60 },
            1: { cellWidth: anchoUtil / 2 - 60 - 10 },
            2: { fontStyle: 'bold', cellWidth: 95 },
            3: { cellWidth: 'auto' },
        },
        didDrawCell: (data) => {
            // Línea de subrayado bajo los valores, como en el formato
            if (data.section === 'body' && (data.column.index === 1 || data.column.index === 3) && filasId[data.row.index][data.column.index - 1]) {
                doc.setLineWidth(0.5);
                doc.line(data.cell.x, data.cell.y + data.cell.height - 1, data.cell.x + data.cell.width - 6, data.cell.y + data.cell.height - 1);
            }
        },
    });

    // ── Escala ───────────────────────────────────────────────────────────────
    let y = doc.lastAutoTable.finalY + 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(limpiar(plantilla.escala_instruccion), MARGEN, y);
    const anchoEscala = 360;
    autoTable(doc, {
        startY: y + 6,
        margin: { ...margenTabla, left: (anchoPag - anchoEscala) / 2, right: (anchoPag - anchoEscala) / 2 },
        theme: 'grid',
        body: plantilla.escala.map((e) => [String(e.valor), limpiar(e.etiqueta), limpiar(e.significado)]),
        styles: { ...estiloBase, halign: 'center' },
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 80 }, 2: { cellWidth: 'auto' } },
    });

    // ── Tabla principal: ítems por sección ───────────────────────────────────
    const cuerpo = [];
    plantilla.secciones.forEach((sec) => {
        cuerpo.push([
            { content: limpiar(sec.titulo), colSpan: 3, styles: { fontStyle: 'bold', halign: 'center', fillColor: GRIS_SECCION } },
            { content: String(promediosResumen.auto[sec.numero]), styles: { fontStyle: 'bold', halign: 'center', fillColor: GRIS_SECCION } },
            { content: String(promediosResumen.jefe[sec.numero]), styles: { fontStyle: 'bold', halign: 'center', fillColor: GRIS_SECCION } },
            { content: 'Promedio de sección', styles: { fontStyle: 'italic', fillColor: GRIS_SECCION } },
        ]);
        sec.items.forEach((it) => {
            const a = autoevaluacion[it.numero] || {};
            const j = evaluacionJefe[it.numero] || {};
            const obsAuto = limpiar(a.observacion);
            const obsJefe = limpiar(j.observacion);
            const obs = [obsAuto && `Auto: ${obsAuto}`, obsJefe && `Jefe: ${obsJefe}`].filter(Boolean).join('\n\n');
            cuerpo.push([
                limpiar(it.numero),
                limpiar(it.texto),
                limpiar(it.descripcion),
                String(a.calificacion || '—'),
                String(j.calificacion || '—'),
                obs || '—',
            ]);
        });
    });
    cuerpo.push([
        { content: 'PROMEDIO TOTAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: String(promediosResumen.totalAuto), styles: { fontStyle: 'bold', halign: 'center' } },
        { content: String(promediosResumen.totalJefe), styles: { fontStyle: 'bold', halign: 'center' } },
        '',
    ]);

    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 14,
        margin: margenTabla,
        theme: 'grid',
        head: [[col.no, col.factores, col.descripcion, col.calif_auto, col.calif_jefe, col.observacion].map(limpiar)],
        body: cuerpo,
        showHead: 'everyPage',
        // Un ítem no se parte entre páginas salvo que por sí solo no quepa en una página
        rowPageBreak: 'avoid',
        styles: estiloBase,
        headStyles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 255, 255], fontSize: 6.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 28, halign: 'center' },
            1: { cellWidth: 105 },
            2: { cellWidth: 150 },
            3: { cellWidth: 59, halign: 'center' },
            4: { cellWidth: 59, halign: 'center' },
            5: { cellWidth: 'auto' },
        },
    });

    // ── Compromisos generados ────────────────────────────────────────────────
    const cantComp = plantilla.compromisos_cantidad || compromisos.length;
    const filasComp = Array.from({ length: cantComp }, (_, i) => [String(i + 1), limpiar(compromisos[i])]);
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 16,
        margin: margenTabla,
        theme: 'grid',
        head: [[{ content: limpiar(plantilla.compromisos_label), colSpan: 2 }]],
        body: filasComp,
        rowPageBreak: 'avoid',
        styles: { ...estiloBase, fontSize: 7.5, minCellHeight: 24 },
        headStyles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 255, 255], minCellHeight: 0 },
        columnStyles: { 0: { cellWidth: 40, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
    });

    // ── Registro de envío (sin firma) ────────────────────────────────────────
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 16,
        margin: margenTabla,
        theme: 'grid',
        head: [['Paso', 'Cuenta que envió', 'Fecha y hora de envío (hora Colombia)']],
        body: [
            ['Autoevaluación', limpiar(cuentaAutoevaluacion), formatearFechaHora(evaluacionGuardada?.autoevaluacion_enviada_en)],
            ['Evaluación (Jefe)', limpiar(cuentaEvaluacion), formatearFechaHora(evaluacionGuardada?.evaluacion_enviada_en)],
        ],
        pageBreak: 'avoid',
        styles: { ...estiloBase, fontSize: 7 },
        headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 170 } },
    });

    // ── Encabezado y pie en todas las páginas (con total de páginas real) ───
    const total = doc.getNumberOfPages();
    const generadoEn = formatearFechaHora(new Date().toISOString());
    for (let p = 1; p <= total; p += 1) {
        doc.setPage(p);
        dibujarEncabezado(doc, plantilla, p, total);
        dibujarPie(doc, p, total, generadoEn);
    }

    doc.save(nombreArchivo(nombreEvaluado, plantillaId, fecha));
}
