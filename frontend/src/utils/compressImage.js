/**
 * Compresión de imágenes de alto rendimiento en el cliente (browser) antes de subir al backend.
 * Reduce fotos de smartphones (10MB-20MB) a ~300KB-800KB (max 1920px, JPEG 0.85).
 * 
 * SOLUCIÓN AL PROBLEMA DE FOTOS EN BLANCO:
 * Los navegadores modernos decodifican y orientan las imágenes EXIF automáticamente.
 * Las implementaciones que intentaban reorientar manualmente aplicando transformaciones
 * sobre el canvas hacían que drawImage dibujara la foto por fuera del área visible,
 * dejando únicamente el fondo blanco (fillRect #FFFFFF) y generando una imagen blanca.
 * 
 * Esta versión utiliza createImageBitmap o Image nativo respetando la orientación real
 * del navegador, dibuja directamente sobre el área visible y asegura que nunca se
 * genere una imagen en blanco ni vacía.
 */

export async function comprimirImagen(file, maxWidth = 1920, maxHeight = 1920, quality = 0.85) {
    if (!file || !(file instanceof File || file instanceof Blob)) {
        return file;
    }

    // Si no es imagen (ej. PDF o tipo no estándar), retornar el archivo original intacto
    if (file.type && !file.type.startsWith('image/')) {
        return file;
    }

    // No comprimir GIFs animados ni SVG
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        return file;
    }

    // Intentar primero con createImageBitmap (estándar moderno, ultra rápido y fuera del hilo principal)
    if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
        try {
            // imageOrientation: 'from-image' es el estándar para respetar EXIF nativo
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            const result = await renderBitmapToJpegFile(bitmap, file.name, maxWidth, maxHeight, quality);
            if (result) return result;
        } catch {
            // Fallback a HTMLImageElement tradicional si createImageBitmap falla con algún formato específico
        }
    }

    // Fallback con HTMLImageElement
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        const cleanup = () => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // Ignore cleanup errors
            }
        };

        img.onload = () => {
            try {
                let { naturalWidth: width, naturalHeight: height } = img;
                if (!width || !height) {
                    cleanup();
                    return resolve(file); // Imagen inválida o tamaño 0, retornar original
                }

                // Calcular escala manteniendo la proporción
                let scale = 1;
                if (width > maxWidth || height > maxHeight) {
                    scale = Math.min(maxWidth / width, maxHeight / height);
                }

                const targetWidth = Math.max(1, Math.round(width * scale));
                const targetHeight = Math.max(1, Math.round(height * scale));

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;

                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) {
                    cleanup();
                    return resolve(file);
                }

                // Fondo blanco suave de base solo si no hay canal alfa o por si el formato original era transparente
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, targetWidth, targetHeight);

                // Dibujar directamente en el canvas con las dimensiones exactas calculadas
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                cleanup();

                canvas.toBlob((blob) => {
                    if (!blob || blob.size === 0) {
                        return resolve(file);
                    }
                    const nombreBase = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'evidencia';
                    const compressedFile = new File([blob], `${nombreBase}.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            } catch {
                cleanup();
                resolve(file);
            }
        };

        img.onerror = () => {
            cleanup();
            resolve(file); // En caso de error, siempre preservar el archivo original
        };

        img.src = url;
    });
}

function renderBitmapToJpegFile(bitmap, originalName, maxWidth, maxHeight, quality) {
    try {
        const width = bitmap.width;
        const height = bitmap.height;

        if (!width || !height) {
            bitmap.close?.();
            return null;
        }

        let scale = 1;
        if (width > maxWidth || height > maxHeight) {
            scale = Math.min(maxWidth / width, maxHeight / height);
        }

        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
            bitmap.close?.();
            return null;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
        bitmap.close?.();

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (!blob || blob.size === 0) {
                    return resolve(null);
                }
                const nombreBase = originalName ? originalName.replace(/\.[^/.]+$/, '') : 'evidencia';
                resolve(new File([blob], `${nombreBase}.jpg`, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                }));
            }, 'image/jpeg', quality);
        });
    } catch {
        bitmap.close?.();
        return null;
    }
}
