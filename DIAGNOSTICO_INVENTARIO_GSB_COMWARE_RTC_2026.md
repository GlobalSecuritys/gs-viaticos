# DIAGNÓSTICO — "INVENTARIO GSB_COMWARE  RTC 2026.xlsx"

Archivo analizado: `backend\data\migracion_inventario\INVENTARIO GSB_COMWARE  RTC 2026.xlsx` (doble espacio tras `GSB_COMWARE`). Lectura con openpyxl **valores y fórmulas**. 32 hojas, 1 oculta, 0 celdas combinadas. No se analizaron `-ACTUAL` ni `_BACKUP_OLD`.

---

## 1. ESTRUCTURA POR HOJA

| Hoja (exacta) | Estado | Dimensiones | Filas con datos* | Filas solo fórmulas | Columnas | Encabezados (fila 1) |
|---|---|---|---|---|---|---|
| `"INVENTARIO GENERAL"` | visible | A1:O61711 | 8634 (8633 datos + enc.) | 0 | 15 | FECHA / NUMERO DE ORDEN / CODIGO DE BARRAS / DESCRIPCIÓN / CANTIDAD / ID. EQUIPO / SERIALES GSB / CONCATENADO / OFICINA / TECNICO / FECHA DE DESPACHO / L, M, N, O vacías |
| `"CANTIDAD TOTAL"` | visible | A1:Y992 | 0 | 0 | 25 | (ninguno) |
| `"SALIDAS "` | visible | A1:U6575 | 838 (837 datos + enc.) | 0 | 21 | FECHA COMPRA\EQUIPO / FACTURA / CODIGO DE BARRAS / DESCRIPCIÓN / CANTIDAD / ID. EQUIPO / SERIALES GSB / CONCATENADO / OFICINA / TECNICO / FECHA DE DESPACHO / OBSERVACION / NUMERO DE ORDEN / OFICINA INSTALDA / FECHA DE INSTALACION / P-U vacías |
| 27 hojas de producto | visible | varía | 12 con datos / 15 vacías | 0 | 15 c/u | idéntico a GENERAL |
| `"STICKER ANULADOS "` | visible | A3:M8 | 6 | 0 | 13 | (sin encabezados) |
| `"FILTRO ACTA"` | **oculta** (hidden) | A1:F5 | 1 | 1 (fila 3) | 6 | TECNICO / LUIS FRANCISCO ANGULO MADERA / FECHA / 2024-08-30 / OFICINA / EL COPEY-CESAR MANTENIMIENTOS |

*\*Fila con cualquier valor o fórmula en el rango usado.*

Detalles: GENERAL filtro `$A$1:$O$41712`, paneles `A2`; SALIDAS filtro `$A$1:$U$5575`, paneles `A2`; FILTRO ACTA validación 1 (lista `FILTROS!$A$2:$A$29` en B1, hoja `FILTROS` inexistente) y fila 3 con fórmula `=IFERROR(__xludf.DUMMYFUNCTION("QUERY(SALIDAS!A:G,...")` que devuelve `#REF!`.


---

## 2. POR QUÉ NO SE VISUALIZA BIEN

| Causa | Cantidad afectada |
|---|---|
| Filas residuales vacías al final | GENERAL: 53.077 (filas 8635-61711 de 61.711); SALIDAS: 5.724 (filas 852-6575 de 6.575) |
| Filtro con rango sobredimensionado | GENERAL: filtro hasta fila 41.712 → 33.078 filas de filtro sin datos |
| Columnas vacías al 100 % | GENERAL: L, M, N, O (4 de 15); SALIDAS: P, Q, R, S, T, U (6 de 21) |
| Columnas casi vacías (1 celda) | GENERAL: I (OFICINA), J (TECNICO), K (FECHA DE DESPACHO) |
| Filas vacías espaciadoras | 12 dentro del bloque de datos de SALIDAS (filas 2-851) |
| Ancho de columna desproporcionado | GENERAL col F (ID. EQUIPO) 221,63; col D 51,75; col H 36,63 |
| Colores decorativos sin función | Cabecera GENERAL cian `FF00FFFF` (15 celdas); SALIDAS verde pálido `FFD9EAD3` (24) + cian (15) |
| Hojas de producto con formato pero sin datos | 15 hojas con hasta 1.405 filas formateadas y 0 datos |

---

## 3. CALIDAD DE DATOS – INVENTARIO GENERAL

- **Filas de datos:** 8.633 (filas 2-8634, sin huecos internos).
- **% llenado (sobre 8.633):** FECHA 100 %; DESCRIPCIÓN 100 %; CONCATENADO 100 % (fórmula); SERIALES GSB 93,6 % (8.079); CANTIDAD 99,2 % (8.568, suma 8.568, todas =1); ID. EQUIPO ~100 %; NUMERO DE ORDEN 82,8 % (7.145; mezcla texto `'S02288'` filas 23-25, fechas y números; 1.489 vacíos); CODIGO DE BARRAS 83,0 %; OFICINA / TECNICO / FECHA DESPACHO 0,01 % (1 celda cada una); L-O 0 %.
- **Descripciones únicas:** 304. Ejemplos de conteo: `PULSADOR FIJO 270R` 1.253; `INFRARROJO LINEAL CDL2-15G` 1.173; `CARRETA DE CABLE UTP CAT 5E` 479; `GABINETE 90X60X25 NEGRO` 55; `BATERIA CARGA SECA 12 V 7A` 185; `SIRENA 30W` 94; `FUENTE SWICHADA 3A` 98; `CONTACTO MAGNETICO LIVIANO` 20.
- **Variantes de descripción:** 4 con espacios al inicio/final (`REGULADOR DE CORRIENTE PROPC 1000 VA `, `SUPRESOR DE PICOS RETIE `, ` BATERIA CARGA SECA 12 V 7A`, `SISMICO ISN-SM-50 / GMX-P0 `); 0 diferencias solo de mayúsculas.
- **Seriales (col G):** 8.079 numéricos, rango 21-9.118; 554 `'N/A'`/vacíos; 68 duplicados (ej. serial `301` en filas 755-756, `4474`-`4480`); 1.107 huecos en 1-9.118 (ausentes 1-20).
- **Fechas (col A):** 8.633 válidas (`datetime`), rango 19-oct-2026 a 13-nov-2026; 0 inválidas ni guardadas como texto.


---

## 4. CALIDAD DE DATOS – "SALIDAS "

- **Filas:** 837 de datos (filas 2-851); 0 filas propias de correo/nota/total (todas llevan descripción de producto); 12 filas vacías espaciadoras dentro del bloque.
- **Estado:** 5 **instaladas** (filas 2-6: ANCUYA NARIÑO, LUCAS RICO, OFICINA INSTALDA `RTC/ ANCUYA`, FECHA DE INSTALACIÓN 29-oct-2026); 832 **pendientes** (OFICINA INSTALDA y FECHA DE INSTALACIÓN vacías).
- **Conteo por sede (top 3):** PEREIRA RISARALDA 105, MOÑITOS CORDOBA 100, ROLDANILLO VALLE DEL CAUCA 93 (ANCUYA NARIÑO 9). Variantes de sede: `PEREIRA RISARALDA` / `PEREIRA- RISARALDA`; `ANCUYA NARIÑO` / `DEVOLUCIÓN ANCUYÁ`.
- **Conteo por técnico (top 3):** JOSE URANGO 156, LUCAS RICO 108, FREDY PARDO 105. Variantes: `CAMILO HERRERA` / `CAMILO`; `NELSON VARGAS` / `NELSON VATGAS`.
- **Seriales:** 692 con valor, rango 1-11.208 (filas 22-25: `11205`-`11208`, BATERIA 12 VG ×3 y TRANSFORMADOR, pendientes).
- **Seriales también en INVENTARIO GENERAL:** 22 coinciden (ej. 2297, 2691, 4501) — **debería ser 0**.


---

## 5. CONTRASTE CON EL ANÁLISIS ANTERIOR (03-nov-2026)

| Referencia (03-nov-2026) | Valor hallado ahora | Estado |
|---|---|---|
| Stock GENERAL: 985 (301 serializadas 1-301 + 684 sin serial) | 8.633 (8.079 seriales 21-9.118 + 554 sin serial) | **DISTINTA** |
| Cable UTP 5E: 521 | 479 (`CARRETA DE CABLE UTP CAT 5E`) | **DISTINTA** |
| Regulador 1000VA: 113 | 103 | **DISTINTA** |
| Supresor RETIE: 113 | 102 | **DISTINTA** |
| Contacto magnético: 100 | 20 (`CONTACTO MAGNETICO LIVIANO`; no existe "puro") | **DISTINTA** |
| Gabinete 90x60x25: 63 | 55 | **DISTINTA** |
| Batería 12V: 30 | 185 | **DISTINTA** |
| Transformador: 25 | 2 (`TRANSFORMADOR 120 V 60 HZ 50 W`) | **DISTINTA** |
| Sirena doble tono: 17 | 94 (`SIRENA 30W`) | **DISTINTA** |
| Fuente switchada: 3 | 98 (`FUENTE SWICHADA 3A`) | **DISTINTA** |
| SALIDAS: 24 reales (5 instaladas Ancuya 29-oct, 19 pendientes) | 837 (5 instaladas Ancuya 29-oct-2026, 832 pendientes) | **DISTINTA** |
| Seriales despachados 11205-11208, numeración distinta a GENERAL | Rango 1-11.208; 22 seriales repetidos de GENERAL | **DISTINTA** |
| 27 hojas de producto vacías | 15 de 27 vacías (12 tienen datos) | **DISTINTA** |
| CANTIDAD TOTAL vacía | Vacía (0 filas) | **IGUAL** |
| FILTRO ACTA oculta con QUERY rota | Oculta; fórmula devuelve `#REF!`; DV lista `FILTROS` inexistente | **IGUAL** |

---

## 6. RECOMENDACIONES PARA IMPORTAR AL SISTEMA

1. **Filas a descartar:** 8635-61711 en GENERAL; 852-6575 y los 12 espacios internos en SALIDAS.
2. **Columnas/hojas a ignorar:** L-O (GENERAL), P-U (SALIDAS), hoja `CANTIDAD TOTAL` (vacía).
3. **Descripciones a unificar:** quitar espacios en 4 casos; `BATERIA 12 VG`→`BATERIA CARGA SECA 12 V 7A`; `FUENTE DE PODER 3A`→`FUENTE SWICHADA 3A`; estandarizar `TRANSFORMADOR 120 V 60 HZ 50 W`.
4. **Limpieza crítica:** col B (mezcla texto/fecha/número); 68 seriales duplicados y 1.107 huecos; 22 seriales de GENERAL ya despachados (quitar o anular para no duplicar stock).
5. **FILTRO ACTA:** reparar o eliminar (QUERY rota `#REF!`; validación de lista `FILTROS` inexistente).
6. **Datos faltantes que hay que pedir:** OFICINA / TECNICO / FECHA DE DESPACHO de GENERAL (vacíos); datos de instalación de las 832 salidas pendientes.

