/**
 * genera-iconos-pwa.js
 * Genera los PNGs 192×192 y 512×512 para el manifest de la PWA
 * usando solo módulos de Node.js sin dependencias externas.
 * Ejecutar desde: c:\gs-viaticos\frontend\
 * > node genera-iconos-pwa.js
 */

const { createCanvas } = (() => {
  try {
    return require('canvas');
  } catch {
    return null;
  }
})() || {};

// Si no hay canvas nativo, generamos PNGs mínimos válidos como Buffer puro
// usando la especificación binaria de PNG (sin dependencias).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Colores corporativos ──
const BG_DARK  = [10,  58,  96];  // #0A3A60
const BG_MID   = [29,  99, 200];  // #1D63C8
const BG_GRAD  = [13,  46,  78];  // #0D2E4E
const WHITE    = [255, 255, 255];
const GOLD     = [197, 160,  41];  // #C5A029

// ── Primitivas de dibujo sobre un buffer RGBA ──
function createBuf(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4, 0) };
}

function setPixel(buf, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  // Alpha-composite sobre fondo existente
  const srcA = a / 255;
  const dstA = buf.data[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  buf.data[i]     = Math.round((r * srcA + buf.data[i]     * dstA * (1 - srcA)) / outA);
  buf.data[i + 1] = Math.round((g * srcA + buf.data[i + 1] * dstA * (1 - srcA)) / outA);
  buf.data[i + 2] = Math.round((b * srcA + buf.data[i + 2] * dstA * (1 - srcA)) / outA);
  buf.data[i + 3] = Math.round(outA * 255);
}

function fillRect(buf, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      setPixel(buf, x, y, r, g, b, a);
}

function fillCircle(buf, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, x, y, r, g, b, a);
    }
  }
}

// Rectángulo con esquinas redondeadas
function fillRoundRect(buf, x0, y0, x1, y1, radius, r, g, b, a = 255) {
  // Rellenar el cuerpo sin esquinas
  fillRect(buf, x0 + radius, y0, x1 - radius, y1, r, g, b, a);
  fillRect(buf, x0, y0 + radius, x1, y1 - radius, r, g, b, a);
  // 4 esquinas redondeadas
  const corners = [[x0+radius, y0+radius], [x1-radius, y0+radius],
                   [x0+radius, y1-radius], [x1-radius, y1-radius]];
  for (const [cx, cy] of corners) fillCircle(buf, cx, cy, radius, r, g, b, a);
}

// Texto simple con píxeles (solo letras A-Z, 0-9, $)
// En vez de tipografía real, dibujamos el símbolo "$" como forma vectorial
function drawDollarSign(buf, cx, cy, size, [r, g, b]) {
  const s = size;
  // Barra vertical
  fillRect(buf, cx - Math.round(s*0.06), cy - Math.round(s*0.55),
                cx + Math.round(s*0.06), cy + Math.round(s*0.55), r, g, b);
  // Curva superior (arco simplificado como rectángulo con puntas redondeadas)
  fillRoundRect(buf,
    cx - Math.round(s*0.3), cy - Math.round(s*0.45),
    cx + Math.round(s*0.3), cy - Math.round(s*0.05),
    Math.round(s*0.12), r, g, b);
  // Curva inferior
  fillRoundRect(buf,
    cx - Math.round(s*0.3), cy + Math.round(s*0.05),
    cx + Math.round(s*0.3), cy + Math.round(s*0.45),
    Math.round(s*0.12), r, g, b);
  // Abrir la curva superior a la izquierda
  fillRect(buf,
    cx - Math.round(s*0.3), cy - Math.round(s*0.45),
    cx - Math.round(s*0.12), cy - Math.round(s*0.05),
    ...BG_MID);
  // Abrir la curva inferior a la derecha
  fillRect(buf,
    cx + Math.round(s*0.12), cy + Math.round(s*0.05),
    cx + Math.round(s*0.3), cy + Math.round(s*0.45),
    ...BG_MID);
}

function drawDocument(buf, x0, y0, x1, y1, cornerSize) {
  // Cuerpo blanco del documento
  const r = 8;
  fillRoundRect(buf, x0, y0, x1 - cornerSize, y1, r, 255, 255, 255, 240);
  fillRoundRect(buf, x0, y0 + cornerSize, x1, y1, r, 255, 255, 255, 240);
  // Esquina doblada (triángulo): línea diagonal
  const cs = cornerSize;
  for (let i = 0; i <= cs; i++) {
    const lineLen = i;
    setPixel(buf, x1 - cs + i, y0 + i, 180, 210, 240, 200);
    for (let j = 0; j < i; j++) {
      setPixel(buf, x1 - cs + j, y0 + i, 200, 225, 250, 150);
    }
  }
}

function drawLines(buf, x0, startY, lineW, lineH, lineGap, count, [r, g, b], opacity = 60) {
  for (let i = 0; i < count; i++) {
    fillRect(buf, x0, startY + i*(lineH+lineGap), x0+lineW, startY + i*(lineH+lineGap)+lineH, r, g, b, opacity);
  }
}

// ── Renderiza el ícono en el buffer ──
function renderIcon(size) {
  const buf = createBuf(size, size);
  const s = size;
  const cornerR = Math.round(s * 0.22);

  // 1) Fondo con gradiente diagonal manual
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const t = (x + y) / (2 * s); // 0..1
      const r = Math.round(BG_DARK[0] + (BG_GRAD[0] - BG_DARK[0]) * t);
      const g = Math.round(BG_DARK[1] + (BG_GRAD[1] - BG_DARK[1]) * t);
      const b = Math.round(BG_DARK[2] + (BG_GRAD[2] - BG_DARK[2]) * t);
      setPixel(buf, x, y, r, g, b);
    }
  }

  // 2) Máscara de esquinas redondeadas (borra las esquinas)
  const cr = cornerR;
  function insideRoundedRect(x, y) {
    const dx = Math.max(cr - x, 0, x - (s - 1 - cr));
    const dy = Math.max(cr - y, 0, y - (s - 1 - cr));
    return dx * dx + dy * dy <= cr * cr;
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // Esquinas del bounding box
      const inCorner =
        (x < cr || x > s - 1 - cr) &&
        (y < cr || y > s - 1 - cr);
      if (inCorner && !insideRoundedRect(x, y)) {
        // Transparente
        const i = (y * s + x) * 4;
        buf.data[i] = buf.data[i+1] = buf.data[i+2] = buf.data[i+3] = 0;
      }
    }
  }

  // 3) Documento (hoja de papel)
  const docX0 = Math.round(s * 0.20);
  const docY0 = Math.round(s * 0.15);
  const docX1 = Math.round(s * 0.72);
  const docY1 = Math.round(s * 0.82);
  const cs    = Math.round(s * 0.14);
  drawDocument(buf, docX0, docY0, docX1, docY1, cs);

  // 4) Líneas de contenido
  const lx = docX0 + Math.round(s * 0.05);
  const lw1 = Math.round(s * 0.22);
  const lw2 = Math.round(s * 0.33);
  const lh  = Math.round(s * 0.025);
  const lg  = Math.round(s * 0.025);
  const ly  = docY0 + Math.round(s * 0.19);
  drawLines(buf, lx, ly, lw1, lh, lg, 1, BG_DARK, 40);
  drawLines(buf, lx, ly + (lh+lg)*1, lw2, lh, lg, 3, BG_DARK, 30);

  // Divisor
  const divY = ly + (lh+lg)*4 + Math.round(s*0.015);
  fillRect(buf, lx, divY, docX1 - Math.round(s*0.06), divY+1, ...BG_DARK, 25);

  // Total row
  fillRect(buf, lx, divY+Math.round(s*0.02), lx+Math.round(s*0.13), divY+Math.round(s*0.02)+lh, ...BG_DARK, 40);
  fillRect(buf, lx+Math.round(s*0.16), divY+Math.round(s*0.02), lx+Math.round(s*0.30), divY+Math.round(s*0.02)+lh, ...GOLD, 200);

  // 5) Círculo azul con símbolo $
  const circR = Math.round(s * 0.22);
  const circX = Math.round(s * 0.68);
  const circY = Math.round(s * 0.70);
  fillCircle(buf, circX, circY, circR, ...BG_MID);
  fillCircle(buf, circX, circY, Math.round(circR * 0.85), 30, 64, 175);  // Sombra interior sutil
  // Símbolo $ en blanco
  drawDollarSign(buf, circX, circY, circR * 1.1, WHITE);

  return buf;
}

// ── Codificador PNG mínimo (sin dependencias) ──
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (const byte of data) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, data]);
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crc32(crcInput))]);
}

function encodePNG(buf) {
  const { w, h, data } = buf;
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  // Filtrar filas (filtro None = 0)
  const rawRows = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    rawRows[y * (w * 4 + 1)] = 0; // filtro None
    data.copy(rawRows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = zlib.deflateSync(rawRows, { level: 6 });

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Genera los archivos ──
const outDir = path.join(__dirname, 'public');

for (const size of [192, 512]) {
  console.log(`Generando icon-${size}.png...`);
  const buf = renderIcon(size);
  const png = encodePNG(buf);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`  ✅ ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
}

console.log('\n✅ Íconos PNG generados. Actualiza el manifest.json para usar .png en vez de .svg');
