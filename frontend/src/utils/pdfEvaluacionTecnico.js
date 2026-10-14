/**
 * pdfEvaluacionTecnico.js
 * Generador PDF oficial para el formato AD-FR-35 "Evaluacion de Tecnicos Contratistas".
 * Reproduce fielmente la estructura de la hoja 'Formato individual (PDF)' del archivo Excel oficial.
 * Cero peticiones al backend: se construye a partir de los datos pasados en memoria.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoDataUrl from "../assets/logo-gsb.png?inline";

const MARGEN = 28;
const NEGRO = [0, 0, 0];
const GRIS_BORDE = [200, 205, 215];
const AZUL_HEADER = [29, 99, 200];
const GRIS_FONDO = [245, 247, 250];

const CRITERIOS_DEF = [
  { seccion: "1. SERVICIO EN CAMPO", items: [
    { num: "1.1", desc: "Puntualidad" },
    { num: "1.2", desc: "Tiempos de ejecucion del servicio (SLA)" },
    { num: "1.3", desc: "Atencion y actitud del servicio" },
    { num: "1.4", desc: "Uso de los elementos de proteccion personal" },
    { num: "1.5", desc: "Calidad del servicio" },
  ]},
  { seccion: "2. GESTION ADMINISTRATIVA", items: [
    { num: "2.1", desc: "Comunicacion cliente interno" },
    { num: "2.2", desc: "Procedimientos administrativos (manejo de plataforma de viaticos)" },
    { num: "2.3", desc: "Manejo de inventario" },
    { num: "2.4", desc: "Manejo de la plataforma de ODS" },
    { num: "2.5", desc: "Procedimientos administrativos (cuentas de cobro - pago de seguridad social)" },
  ]},
  { seccion: "3. CONOCIMIENTO TECNICO", items: [
    { num: "3.1", desc: "Conocimientos tecnicos" },
  ]},
];

function limpiar(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .normalize("NFC")
    .split("")
    .filter((c) => {
      const code = c.charCodeAt(0);
      return c === "\n" || c === "\t" || (code >= 0x20 && code <= 0xff);
    })
    .join("")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function fmtNum(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toFixed(2);
}

function fmtValCelda(v) {
  if (v == null || v === "") return "—";
  const s = String(v).trim().toUpperCase();
  if (s === "N/A" || s === "NA") return "N/A";
  const n = Number(s);
  return Number.isNaN(n) ? s : String(n);
}

export function generarPdfEvaluacionTecnico({ detalle }) {
  if (!detalle) return;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const printableWidth = pageWidth - MARGEN * 2;

  const tecnico = detalle.tecnico || {
    nombre: detalle.tecnico_nombre,
    cedula: detalle.tecnico_cedula,
    correo: detalle.tecnico_correo,
  };
  const periodo = detalle.periodo || {
    nombre: detalle.periodo_nombre,
  };
  const capas = detalle.capas || {};
  const resumen = detalle.resumen || {};

  const respAuto = capas.auto?.respuestas || {};
  const respViaticos = capas.viaticos?.respuestas || {};
  const respAsistente = capas.asistente_oper?.respuestas || {};

  /* ── 1. ENCABEZADO CORPORATIVO (LOGO + AD-FR-35) ── */
  let curY = MARGEN;

  // Recuadro del encabezado
  const boxH = 55;
  doc.setDrawColor(...GRIS_BORDE);
  doc.setLineWidth(1);
  doc.rect(MARGEN, curY, printableWidth, boxH);

  // Logo GSB (izq)
  try {
    doc.addImage(logoDataUrl, "PNG", MARGEN + 10, curY + 6, 75, 42);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...AZUL_HEADER);
    doc.text("GLOBAL SECURITY", MARGEN + 10, curY + 28);
  }

  // Línea divisoria vertical 1
  doc.line(MARGEN + 110, curY, MARGEN + 110, curY + boxH);

  // Título central
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NEGRO);
  doc.text("GLOBAL SECURITY BANK S.A.S.", MARGEN + 110 + (printableWidth - 250) / 2, curY + 20, { align: "center" });
  doc.setFontSize(9.5);
  doc.setTextColor(...AZUL_HEADER);
  doc.text("EVALUACION DE TECNICOS CONTRATISTAS", MARGEN + 110 + (printableWidth - 250) / 2, curY + 36, { align: "center" });

  // Línea divisoria vertical 2
  doc.line(pageWidth - MARGEN - 140, curY, pageWidth - MARGEN - 140, curY + boxH);

  // Metadatos de calidad (der)
  const metaX = pageWidth - MARGEN - 135;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...NEGRO);
  doc.text("CODIGO: AD-FR-35", metaX, curY + 16);
  doc.text("VERSION: 2", metaX, curY + 28);
  doc.text("FECHA ACT: 08/01/2026", metaX, curY + 40);

  curY += boxH + 10;

  /* ── 2. FICHA TÉCNICA DE EVALUACIÓN ── */
  const fechaEval = detalle.fecha || (resumen.cerrado_en ? resumen.cerrado_en.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const estadoTexto = detalle.estado === "completado" ? "COMPLETADO" : "EN EVALUACION";

  autoTable(doc, {
    startY: curY,
    margin: { left: MARGEN, right: MARGEN },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3.5, textColor: NEGRO, lineColor: GRIS_BORDE, lineWidth: 0.5 },
    body: [
      [
        { content: "TECNICO CONTRATISTA:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO, width: 120 } },
        { content: `${limpiar(tecnico.nombre || "—")} (CC: ${limpiar(tecnico.cedula || "—")})` },
        { content: "PERIODO:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO, width: 70 } },
        { content: limpiar(periodo.nombre || "—") },
      ],
      [
        { content: "EVALUADOR:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } },
        { content: "PILAR ARISTIZABAL GIL" },
        { content: "CARGO:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } },
        { content: "Directora Administrativa" },
      ],
      [
        { content: "FECHA EVALUACION:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } },
        { content: fechaEval },
        { content: "ESTADO:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } },
        { content: estadoTexto, styles: { fontStyle: "bold", textColor: detalle.estado === "completado" ? [5, 150, 105] : [2, 132, 199] } },
      ],
    ],
  });

  curY = doc.lastAutoTable.finalY + 8;

  /* ── 3. ESCALA Y CAPAS (MINI-TABLAS RESUMEN) ── */
  autoTable(doc, {
    startY: curY,
    margin: { left: MARGEN, right: MARGEN },
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2.5, textColor: NEGRO, lineColor: GRIS_BORDE, lineWidth: 0.5 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
    head: [
      [
        { content: "ESCALA DE EVALUACION", colSpan: 3, styles: { halign: "center" } },
        { content: "CAPAS DE EVALUACION (3 AREAS)", colSpan: 2, styles: { halign: "center" } },
      ],
      [
        { content: "DESEMPEÑO", styles: { fontStyle: "bold" } },
        { content: "PUNTO", styles: { halign: "center" } },
        { content: "PORCENTAJE", styles: { halign: "center" } },
        { content: "CAPA", styles: { fontStyle: "bold" } },
        { content: "EVALUADOR RESPONSABLE" },
      ],
    ],
    body: [
      [{ content: "MUY BUENO" }, { content: "4", styles: { halign: "center" } }, { content: "100%", styles: { halign: "center" } }, { content: "AUTO", styles: { fontStyle: "bold" } }, { content: "El propio tecnico contratista" }],
      [{ content: "BUENO" }, { content: "3", styles: { halign: "center" } }, { content: ">= 70% y < 100%", styles: { halign: "center" } }, { content: "VIATICOS", styles: { fontStyle: "bold" } }, { content: "Administrativa a cargo de viaticos" }],
      [{ content: "ACEPTABLE" }, { content: "2", styles: { halign: "center" } }, { content: ">= 40% y < 70%", styles: { halign: "center" } }, { content: "ASISTENTE OPER", styles: { fontStyle: "bold" } }, { content: "Asistente de operaciones" }],
      [{ content: "DEFICIENTE" }, { content: "1", styles: { halign: "center" } }, { content: "< 40%", styles: { halign: "center" } }, { content: "* Criterio N/A", styles: { fontStyle: "italic" } }, { content: "No se promedia en el calculo" }],
    ],
  });

  curY = doc.lastAutoTable.finalY + 8;

  /* ── 4. TABLA DE LOS 11 CRITERIOS (3 SECCIONES) ── */
  const tableRows = [];

  CRITERIOS_DEF.forEach((sec) => {
    // Fila cabecera de sección
    tableRows.push([
      { content: sec.seccion, colSpan: 5, styles: { fontStyle: "bold", fillColor: [226, 232, 240], textColor: [15, 23, 42] } },
    ]);

    sec.items.forEach((it) => {
      const vAuto = respAuto[it.num];
      const vViat = respViaticos[it.num];
      const vAsis = respAsistente[it.num];

      const vals = [vAuto, vViat, vAsis].filter((x) => x != null && String(x).toUpperCase() !== "N/A" && x !== "");
      const nums = vals.map(Number).filter((n) => !Number.isNaN(n));
      const promCrit = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "—";

      tableRows.push([
        { content: `${it.num}  ${it.desc}`, styles: { halign: "left" } },
        { content: fmtValCelda(vAuto), styles: { halign: "center" } },
        { content: fmtValCelda(vViat), styles: { halign: "center" } },
        { content: fmtValCelda(vAsis), styles: { halign: "center" } },
        { content: promCrit, styles: { halign: "center", fontStyle: "bold" } },
      ]);
    });
  });

  // Fila Calificación por área
  tableRows.push([
    { content: "CALIFICACION POR AREA (Promedio de criterios)", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } },
    { content: fmtNum(resumen.calificacion_auto), styles: { halign: "center", fontStyle: "bold", fillColor: GRIS_FONDO } },
    { content: fmtNum(resumen.calificacion_viaticos), styles: { halign: "center", fontStyle: "bold", fillColor: GRIS_FONDO } },
    { content: fmtNum(resumen.calificacion_asistente_oper), styles: { halign: "center", fontStyle: "bold", fillColor: GRIS_FONDO } },
    { content: "—", styles: { halign: "center", fillColor: GRIS_FONDO } },
  ]);

  autoTable(doc, {
    startY: curY,
    margin: { left: MARGEN, right: MARGEN },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 3, textColor: NEGRO, lineColor: GRIS_BORDE, lineWidth: 0.5 },
    headStyles: { fillColor: AZUL_HEADER, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    head: [[
      { content: "CRITERIO DE EVALUACION", styles: { halign: "left", width: 250 } },
      { content: "AUTO", styles: { width: 55 } },
      { content: "VIATICOS", styles: { width: 55 } },
      { content: "ASIST.OPER", styles: { width: 65 } },
      { content: "PROM.CRIT", styles: { width: 65 } },
    ]],
    body: tableRows,
  });

  curY = doc.lastAutoTable.finalY + 8;

  /* ── 5. CUADRO DE RESULTADO FINAL Y NIVEL ── */
  const calFinal = fmtNum(resumen.calificacion_final);
  const pctFinal = resumen.porcentaje != null ? `${(resumen.porcentaje * 100).toFixed(1)}%` : "—";
  const nivel = resumen.nivel || "—";
  const aprueba = resumen.resultado === "APRUEBA";

  autoTable(doc, {
    startY: curY,
    margin: { left: MARGEN, right: MARGEN },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 4, textColor: NEGRO, lineColor: GRIS_BORDE, lineWidth: 0.5 },
    body: [
      [
        { content: "CALIFICACION FINAL:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO, width: 140 } },
        { content: `${calFinal} / 4.00`, styles: { fontStyle: "bold", fontSize: 10 } },
        { content: "PORCENTAJE:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO, width: 100 } },
        { content: pctFinal, styles: { fontStyle: "bold" } },
      ],
      [
        { content: "NIVEL DE DESEMPEÑO:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } },
        { content: nivel, styles: { fontStyle: "bold", textColor: aprueba ? [5, 150, 105] : [220, 38, 38] } },
        { content: "RESULTADO:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } },
        {
          content: aprueba ? "APRUEBA ✓" : (resumen.resultado || "—"),
          styles: { fontStyle: "bold", fontSize: 9.5, textColor: aprueba ? [5, 150, 105] : [220, 38, 38] },
        },
      ],
    ],
  });

  curY = doc.lastAutoTable.finalY + 8;

  /* ── 6. OBSERVACIONES POR CAPA Y FINAL ── */
  const obsAuto = limpiar(capas.auto?.observacion || "Sin observaciones.");
  const obsViat = limpiar(capas.viaticos?.observacion || "Sin observaciones.");
  const obsAsis = limpiar(capas.asistente_oper?.observacion || "Sin observaciones.");
  const obsFinal = limpiar(resumen.observacion_final || "Sin observaciones de cierre.");

  autoTable(doc, {
    startY: curY,
    margin: { left: MARGEN, right: MARGEN },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 3, textColor: NEGRO, lineColor: GRIS_BORDE, lineWidth: 0.5 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: "bold" },
    head: [[{ content: "OBSERVACIONES POR CAPA Y CONCEPTO FINAL", colSpan: 2 }]],
    body: [
      [{ content: "AUTOEVALUACION:", styles: { fontStyle: "bold", width: 130, fillColor: GRIS_FONDO } }, { content: obsAuto }],
      [{ content: "VIATICOS:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } }, { content: obsViat }],
      [{ content: "ASISTENTE OPER.:", styles: { fontStyle: "bold", fillColor: GRIS_FONDO } }, { content: obsAsis }],
      [{ content: "DIR. ADMINISTRATIVA:", styles: { fontStyle: "bold", fillColor: [254, 243, 199] } }, { content: obsFinal, styles: { fontStyle: "bold" } }],
    ],
  });

  curY = doc.lastAutoTable.finalY + 12;

  /* ── 7. SECCIÓN DE FIRMAS ── */
  // Si no cabe, agregamos página
  if (curY + 60 > pageHeight - MARGEN) {
    doc.addPage();
    curY = MARGEN + 20;
  }

  const firmaW = (printableWidth - 40) / 2;
  const col1X = MARGEN;
  const col2X = MARGEN + firmaW + 40;

  doc.setDrawColor(...GRIS_BORDE);
  doc.setLineWidth(0.8);

  // Línea firma 1
  doc.line(col1X, curY + 30, col1X + firmaW, curY + 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NEGRO);
  doc.text(limpiar(tecnico.nombre || "Técnico Contratista"), col1X, curY + 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`CC: ${limpiar(tecnico.cedula || "—")} · Firma / Envío Autoevaluación`, col1X, curY + 52);

  // Línea firma 2
  doc.line(col2X, curY + 30, col2X + firmaW, curY + 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NEGRO);
  doc.text("PILAR ARISTIZABAL GIL", col2X, curY + 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Directora Administrativa · Cierre y Calificación Final", col2X, curY + 52);

  // Nota pie
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.text(
    "* Los compromisos se diligencian en el formato de compromisos AD-FR-06 (documento independiente).",
    MARGEN,
    pageHeight - 15
  );

  // Descarga del PDF
  const baseTecnico = limpiar(tecnico.nombre || "Tecnico")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const basePeriodo = limpiar(periodo.nombre || "Periodo")
    .replace(/[^A-Za-z0-9]+/g, "_");

  doc.save(`AD-FR-35_${baseTecnico}_${basePeriodo}.pdf`);
}
