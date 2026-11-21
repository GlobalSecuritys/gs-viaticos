/**
 * Compresión de imágenes de alto rendimiento en el cliente (browser) antes de subir al backend.
 * Reduce fotos de smartphones (10MB-20MB) a ~300KB-800KB (max 1920px, JPEG 0.85).
 * 
 * PREVENCIÓN DE IMÁGENES EN BLANCO:
 * 1. NUNCA pintar el canvas con fillRect(#FFFFFF) ANTES de dibujar la foto.
 *    Si drawImage falla o se retrasa, un canvas pre-llenado de blanco genera un JPEG 100% blanco.
 * 2. Si se requiere fondo blanco para transparencias (PNG/WebP), se aplica 'destination-over'
 *    DESPUÉS de dibujar la foto, pintando únicamente detrás de los píxeles transparentes.
 * 3. NO cerrar ImageBitmap síncronamente antes de que canvas.toBlob() termine.
 * 4. Await img.decode() en el fallback de HTMLImageElement para garantizar decodificación completa.
 * 5. Validación post-render: si el canvas resultante es 100% blanco o vacío, se descarta el blob
 *    y se retorna el archivo original intacto como salvaguarda definitiva.
 */

export async function comprimirImagen(file, maxWidth = 1920, maxHeight = 1920, quality = 0.85) {
    if (!file || !(file instanceof File || file instanceof Blob)) {
        return file;
    }

    const mimeType = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    const esImagen = mimeType.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|tiff)$/i.test(fileName);

    // Si no es imagen (ej. PDF o documento), retornar el archivo original intacto
    if (!esImagen) {
        return file;
    }

    // No comprimir GIFs animados ni SVG
    if (mimeType === 'image/gif' || mimeType === 'image/svg+xml') {
        return file;
    }

    // 1. Intentar primero con createImageBitmap (estándar moderno de alto rendimiento)
    if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            const result = await renderBitmapToJpegFile(bitmap, file.name, maxWidth, maxHeight, quality, file);
            if (result) return result;
        } catch (err) {
            console.warn('[compressImage] createImageBitmap falló o no soportado para este formato, usando fallback Image:', err);
        }
    }

    // 2. Fallback con HTMLImageElement nativo
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

        img.onload = async () => {
            try {
                // Asegurar decodificación completa antes de dibujar en el canvas (crucial en móviles)
                if ('decode' in img) {
                    try {
                        await img.decode();
                    } catch {
                        // Si decode falla, continuamos con el dibujo normal
                    }
                }

                let { naturalWidth: width, naturalHeight: height } = img;
                if (!width || !height) {
                    cleanup();
                    return resolve(file);
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

                const ctx = canvas.getContext('2d', { alpha: true });
                if (!ctx) {
                    cleanup();
                    return resolve(file);
                }

                // Dibujar la foto directamente en el canvas LIMPIO (sin pre-llenar de blanco)
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                cleanup();

                // Si la imagen original tenía partes transparentes, poner fondo blanco DEBAJO de la foto
                ctx.globalCompositeOperation = 'destination-over';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, targetWidth, targetHeight);
                ctx.globalCompositeOperation = 'source-over';

                // Verificación de seguridad: si el canvas quedó completamente blanco o vacío, usar original
                if (esCanvasBlancoOVacio(canvas, ctx)) {
                    console.warn('[compressImage] Canvas resultante es blanco o vacío. Se conserva el archivo original.');
                    return resolve(file);
                }

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
            } catch (err) {
                console.error('[compressImage] Error en renderizado con Image:', err);
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

function renderBitmapToJpegFile(bitmap, originalName, maxWidth, maxHeight, quality, originalFile) {
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

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
            bitmap.close?.();
            return null;
        }

        // Dibujar directamente sobre el canvas limpio (SIN pre-llenar de blanco)
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

        // Si hay transparencia, aplicar fondo blanco SOLO debajo de los píxeles transparentes
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.globalCompositeOperation = 'source-over';

        // Verificación de seguridad: si el canvas quedó blanco o vacío, abortar y usar original
        if (esCanvasBlancoOVacio(canvas, ctx)) {
            console.warn('[compressImage] Bitmap renderizado produjo canvas blanco. Usando archivo original.');
            bitmap.close?.();
            return null; // Provoca que el llamador retorne el archivo original
        }

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                // Cerrar el bitmap ÚNICAMENTE después de que toBlob haya rasterizado el canvas
                bitmap.close?.();

                if (!blob || blob.size === 0) {
                    return resolve(originalFile || null);
                }
                const nombreBase = originalName ? originalName.replace(/\.[^/.]+$/, '') : 'evidencia';
                resolve(new File([blob], `${nombreBase}.jpg`, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                }));
            }, 'image/jpeg', quality);
        });
    } catch (err) {
        console.error('[compressImage] Error en renderBitmapToJpegFile:', err);
        bitmap.close?.();
        return null;
    }
}

/**
 * Inspecciona una cuadrícula de píxeles del canvas para verificar si la imagen
 * quedó 100% en blanco o vacía (transparente). Si todos los puntos muestreados
 * son blancos puros (o transparentes), se considera corrupta / en blanco.
 */
function esCanvasBlancoOVacio(canvas, ctx) {
    try {
        const w = canvas.width;
        const h = canvas.height;
        if (!w || !h) return true;

        const stepX = Math.max(1, Math.floor(w / 8));
        const stepY = Math.max(1, Math.floor(h / 8));

        let todosBlancos = true;
        let todosTransparentes = true;

        for (let x = Math.min(5, w - 1); x < w; x += stepX) {
            for (let y = Math.min(5, h - 1); y < h; y += stepY) {
                const pixel = ctx.getImageData(x, y, 1, 1).data;
                const r = pixel[0];
                const g = pixel[1];
                const b = pixel[2];
                const a = pixel[3];

                if (a > 10) {
                    todosTransparentes = false;
                }
                // Si encontramos píxeles que no sean casi blancos (<= 245), hay contenido real
                if (r < 245 || g < 245 || b < 245 || a < 200) {
                    todosBlancos = false;
                }

                // Si encontramos al menos un píxel con contenido visible que no sea blanco puro,
                // la imagen es válida y tiene información fotográfica real
                if (!todosBlancos && !todosTransparentes) {
                    return false;
                }
            }
        }

        return todosBlancos || todosTransparentes;
    } catch {
        // En caso de que getImageData esté restringido (ej. canvas tainted), no bloquear
        return false;
    }
}
