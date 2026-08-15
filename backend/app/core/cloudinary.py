"""
Configuración de Cloudinary para el almacenamiento de imágenes.
Este módulo centraliza la inicialización del SDK y expone
funciones reutilizables para subir archivos.
"""

import asyncio
import logging
from dataclasses import dataclass

import cloudinary
import cloudinary.uploader
from cloudinary.exceptions import Error as CloudinaryError
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Configuración del SDK
# ---------------------------------------------------------------------

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)

# ---------------------------------------------------------------------
# Configuración de negocio
# ---------------------------------------------------------------------

VIATICOS_FOLDER = "gs_viaticos/evidencias"

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/pjpeg",
    "image/x-png",
    "image/bmp",
    "image/tiff",
    "application/octet-stream",
}

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tiff"
}

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


@dataclass
class CloudinaryUploadResult:
    """Resultado mínimo necesario tras subir una imagen."""

    secure_url: str
    public_id: str


def _validate_file(file: UploadFile, content: bytes) -> None:
    """Valida tipo y tamaño del archivo (tolerante con navegadores móviles iOS/Android)."""

    content_type = (file.content_type or "").lower().strip()
    filename = (file.filename or "").lower().strip()
    ext = "." + filename.split(".")[-1] if "." in filename else ""

    es_content_type_valido = content_type in ALLOWED_CONTENT_TYPES or content_type.startswith("image/")
    es_extension_valida = ext in ALLOWED_EXTENSIONS

    if not (es_content_type_valido or es_extension_valida):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tipo de archivo no permitido ({file.content_type}). "
                "Por favor adjunta una imagen (JPG, PNG, WEBP, HEIC)."
            ),
        )

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El archivo '{file.filename}' supera el tamaño máximo "
                f"de {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
            ),
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El archivo '{file.filename}' está vacío.",
        )


def _upload_a_cloudinary_sync(content: bytes) -> dict:
    """
    Llamada bloqueante real al SDK de Cloudinary (I/O de red síncrono).
    Se ejecuta siempre en un hilo aparte vía asyncio.to_thread, nunca
    directamente en el event loop.
    """
    return cloudinary.uploader.upload(
        content,
        folder=VIATICOS_FOLDER,
        resource_type="image",
        quality="auto",
        fetch_format="auto",
        use_filename=True,
        unique_filename=True,
        timeout=45,
    )


async def upload_evidencia_viatico(file: UploadFile) -> CloudinaryUploadResult:
    """
    Sube una imagen de evidencia de viático a Cloudinary.
    """

    content = await file.read()
    _validate_file(file, content)

    try:
        result = await asyncio.to_thread(_upload_a_cloudinary_sync, content)

    except CloudinaryError as exc:
        logger.error("Error al subir imagen a Cloudinary: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo subir la imagen. Intenta nuevamente.",
        ) from exc

    except Exception as exc:
        logger.exception("Error inesperado al subir imagen a Cloudinary")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ocurrió un error inesperado al procesar la imagen.",
        ) from exc

    finally:
        await file.close()

    secure_url = result.get("secure_url")
    public_id = result.get("public_id")

    if not secure_url or not public_id:
        logger.error("Respuesta inesperada de Cloudinary: %s", result)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Respuesta inválida del servicio de imágenes.",
        )

    return CloudinaryUploadResult(
        secure_url=secure_url,
        public_id=public_id,
    )


CUENTAS_COBRO_FOLDER = "gs_viaticos/cuentas_cobro"
ALLOWED_CUENTA_COBRO_CONTENT_TYPES = ALLOWED_CONTENT_TYPES | {
    "application/pdf",
    "application/x-pdf",
}
ALLOWED_CUENTA_COBRO_EXTENSIONS = ALLOWED_EXTENSIONS | {".pdf"}


def _validate_cuenta_cobro_file(file: UploadFile, content: bytes) -> None:
    """Valida tipo y tamaño para archivos de cuenta de cobro (PDF o Imagen)."""
    content_type = (file.content_type or "").lower().strip()
    filename = (file.filename or "").lower().strip()
    ext = "." + filename.split(".")[-1] if "." in filename else ""

    es_content_type_valido = (
        content_type in ALLOWED_CUENTA_COBRO_CONTENT_TYPES
        or content_type.startswith("image/")
        or content_type == "application/pdf"
    )
    es_extension_valida = ext in ALLOWED_CUENTA_COBRO_EXTENSIONS

    if not (es_content_type_valido or es_extension_valida):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tipo de archivo no permitido ({file.content_type}). "
                "Por favor adjunta un archivo PDF o imagen (JPG, PNG)."
            ),
        )

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El archivo '{file.filename}' supera el tamaño máximo "
                f"de {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
            ),
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El archivo '{file.filename}' está vacío.",
        )


def _upload_cuenta_cobro_sync(content: bytes) -> dict:
    return cloudinary.uploader.upload(
        content,
        folder=CUENTAS_COBRO_FOLDER,
        resource_type="auto",
        use_filename=True,
        unique_filename=True,
        timeout=45,
    )


async def upload_cuenta_cobro(file: UploadFile) -> CloudinaryUploadResult:
    """
    Sube un archivo de cuenta de cobro (PDF o imagen) a Cloudinary.
    """
    content = await file.read()
    _validate_cuenta_cobro_file(file, content)

    try:
        result = await asyncio.to_thread(_upload_cuenta_cobro_sync, content)
    except CloudinaryError as exc:
        logger.error("Error al subir cuenta de cobro a Cloudinary: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo subir el archivo de cuenta de cobro. Intenta nuevamente.",
        ) from exc
    except Exception as exc:
        logger.exception("Error inesperado al subir cuenta de cobro a Cloudinary")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ocurrió un error inesperado al procesar el archivo.",
        ) from exc
    finally:
        await file.close()

    secure_url = result.get("secure_url")
    public_id = result.get("public_id")

    if not secure_url or not public_id:
        logger.error("Respuesta inesperada de Cloudinary: %s", result)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Respuesta inválida del servicio de almacenamiento.",
        )

    return CloudinaryUploadResult(
        secure_url=secure_url,
        public_id=public_id,
    )