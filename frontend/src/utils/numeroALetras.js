/**
 * Convierte un número en pesos colombianos a su representación textual en español.
 * Ejemplo: 100000 -> "CIEN MIL PESOS"
 */
export function numeroALetras(num) {
    if (num === null || num === undefined || isNaN(num)) return 'CERO PESOS';
    const n = Math.floor(Math.abs(Number(num)));
    if (n === 0) return 'CERO PESOS';

    const Unidades = (num) => {
        switch (num) {
            case 1: return 'UN';
            case 2: return 'DOS';
            case 3: return 'TRES';
            case 4: return 'CUATRO';
            case 5: return 'CINCO';
            case 6: return 'SEIS';
            case 7: return 'SIETE';
            case 8: return 'OCHO';
            case 9: return 'NUEVE';
            default: return '';
        }
    };

    const Decenas = (num) => {
        const decena = Math.floor(num / 10);
        const unidad = num - (decena * 10);

        switch (decena) {
            case 1:
                switch (unidad) {
                    case 0: return 'DIEZ';
                    case 1: return 'ONCE';
                    case 2: return 'DOCE';
                    case 3: return 'TRECE';
                    case 4: return 'CATORCE';
                    case 5: return 'QUINCE';
                    default: return 'DIECI' + Unidades(unidad);
                }
            case 2:
                if (unidad === 0) return 'VEINTE';
                return 'VEINTI' + Unidades(unidad);
            case 3: return DecenasY('TREINTA', unidad);
            case 4: return DecenasY('CUARENTA', unidad);
            case 5: return DecenasY('CINCUENTA', unidad);
            case 6: return DecenasY('SESENTA', unidad);
            case 7: return DecenasY('SETENTA', unidad);
            case 8: return DecenasY('OCHENTA', unidad);
            case 9: return DecenasY('NOVENTA', unidad);
            case 0: return Unidades(unidad);
            default: return '';
        }
    };

    const DecenasY = (strSin, numUnidades) => {
        if (numUnidades > 0) return strSin + ' Y ' + Unidades(numUnidades);
        return strSin;
    };

    const Centenas = (num) => {
        const centenas = Math.floor(num / 100);
        const decenas = num - (centenas * 100);

        switch (centenas) {
            case 1:
                if (decenas > 0) return 'CIENTO ' + Decenas(decenas);
                return 'CIEN';
            case 2: return 'DOSCIENTOS ' + Decenas(decenas);
            case 3: return 'TRESCIENTOS ' + Decenas(decenas);
            case 4: return 'CUATROCIENTOS ' + Decenas(decenas);
            case 5: return 'QUINIENTOS ' + Decenas(decenas);
            case 6: return 'SEISCIENTOS ' + Decenas(decenas);
            case 7: return 'SETECIENTOS ' + Decenas(decenas);
            case 8: return 'OCHOCIENTOS ' + Decenas(decenas);
            case 9: return 'NOVECIENTOS ' + Decenas(decenas);
            default: return Decenas(decenas);
        }
    };

    const Secciones = (num, divisor, strSingular, strPlural) => {
        const cientos = Math.floor(num / divisor);
        const resto = num - (cientos * divisor);
        let letras = '';

        if (cientos > 0) {
            if (cientos > 1) {
                letras = Centenas(cientos) + ' ' + strPlural;
            } else {
                letras = strSingular;
            }
        }
        if (resto > 0) {
            letras += ' ';
        }
        return { letras, resto };
    };

    const Miles = (num) => {
        const divisor = 1000;
        const cientos = Math.floor(num / divisor);
        const resto = num - (cientos * divisor);
        const strMiles = Secciones(num, divisor, 'UN MIL', 'MIL');
        const strUnidades = Centenas(resto);

        if (strMiles.letras === '') return strUnidades;
        return (strMiles.letras + ' ' + strUnidades).trim();
    };

    const Millones = (num) => {
        const divisor = 1000000;
        const cientos = Math.floor(num / divisor);
        const resto = num - (cientos * divisor);
        const strMillones = Secciones(num, divisor, 'UN MILLON', 'MILLONES');
        const strMiles = Miles(resto);

        if (strMillones.letras === '') return strMiles;
        return (strMillones.letras + ' ' + strMiles).trim();
    };

    const letras = Millones(n);
    return letras ? `${letras} PESOS` : 'CERO PESOS';
}
