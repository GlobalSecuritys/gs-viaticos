"""
Configuración de Cloudinary para el almacenamiento de imágenes.
Este módulo centraliza la inicialización del SDK y expone
funciones reutilizables para subir archivos.
"""

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
}

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@dataclass
class CloudinaryUploadResult:
    """Resultado mínimo necesario tras subir una imagen."""

    secure_url: str
    public_id: str


def _validate_file(file: UploadFile, content: bytes) -> None:
    """Valida tipo y tamaño del archivo."""

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tipo de archivo no permitido: {file.content_type}. "
                "Formatos aceptados: JPEG, PNG y WEBP."
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


async def upload_evidencia_viatico(file: UploadFile) -> CloudinaryUploadResult:
    """
    Sube una imagen de evidencia de viático a Cloudinary.
    """

    content = await file.read()
    _validate_file(file, content)

    try:
        result = cloudinary.uploader.upload(
            content,
            folder=VIATICOS_FOLDER,
            resource_type="image",
            quality="auto",
            fetch_format="auto",
            use_filename=True,
            unique_filename=True,
        )

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