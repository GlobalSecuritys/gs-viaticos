/**
 * Compresión de imágenes en el cliente (browser) antes de subir al backend.
 * Reduce fotos de smartphones (10MB-20MB) a ~300KB-800KB (max 1920px, JPEG 0.82)
 * en milisegundos, evitando timeouts de red en Render y errores 413.
 */

export async function comprimirImagen(file, maxWidth = 1920, maxHeight = 1920, quality = 0.82) {
    if (!file || !(file instanceof File || file instanceof Blob)) {
        return file;
    }

    // Si no es imagen (ej. PDF o tipo raro), retornar el original
    if (file.type && !file.type.startsWith('image/')) {
        return file;
    }

    const getOrientation = (arrayBuffer) => {
        const view = new DataView(arrayBuffer);
        if (view.getUint16(0, false) !== 0xFFD8) return -2;
        let length = view.byteLength, offset = 2;
        while (offset < length) {
            if (view.getUint16(offset + 2, false) <= 8) return -1;
            let marker = view.getUint16(offset, false);
            offset += 2;
            if (marker === 0xFFE1) {
                if (view.getUint32(offset += 2, false) !== 0x45786966) return -1;
                let little = view.getUint16(offset += 6, false) === 0x4949;
                offset += view.getUint32(offset + 4, little);
                let tags = view.getUint16(offset, little);
                offset += 2;
                for (let i = 0; i < tags; i++) {
                    if (view.getUint16(offset + (i * 12), little) === 0x0112) {
                        return view.getUint16(offset + (i * 12) + 8, little);
                    }
                }
            } else if ((marker & 0xFF00) !== 0xFF00) break;
            else offset += view.getUint16(offset, false);
        }
        return -1;
    };

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => {
            const orientation = getOrientation(e.target.result);
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                let { width, height } = img;

                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                if (orientation >= 5 && orientation <= 8) {
                    canvas.width = height;
                    canvas.height = width;
                } else {
                    canvas.width = width;
                    canvas.height = height;
                }

                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(file);

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Aplicar transformación por orientación EXIF
                // Tabla indexada por (orientation - 2) ya que solo entramos cuando orientation > 1
                //   2=flip-H, 3=180°, 4=flip-V, 5=90°+flip, 6=90°CW, 7=270°+flip, 8=270°CW
                const transforms = {
                    2: [-1, 0, 0, 1, width, 0],
                    3: [-1, 0, 0, -1, width, height],
                    4: [1, 0, 0, -1, 0, height],
                    5: [0, 1, 1, 0, 0, 0],
                    6: [0, 1, -1, 0, height, 0],
                    7: [0, -1, -1, 0, height, width],
                    8: [0, -1, 1, 0, 0, width],
                };
                if (transforms[orientation]) {
                    ctx.transform(...transforms[orientation]);
                }

                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) return resolve(file);
                    const nombreBase = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'evidencia';
                    resolve(new File([blob], `${nombreBase}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', quality);
            };

            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        };
        reader.onerror = () => resolve(file);
    });
}
