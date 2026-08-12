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

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            // Calcular nuevas dimensiones manteniendo la relación de aspecto
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
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file); // Fallback al archivo original si canvas falla
                return;
            }

            // Fondo blanco para imágenes PNG con transparencia convertidas a JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }

                    // Nombrar el nuevo archivo comprimido con extensión .jpg
                    const nombreBase = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'evidencia';
                    const compressedFile = new File([blob], `${nombreBase}.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });

                    resolve(compressedFile);
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file); // Fallback al archivo original si falla la lectura
        };

        img.src = url;
    });
}
