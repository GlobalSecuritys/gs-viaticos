"""
Escuela GSB — almacenamiento PRIVADO del material académico por estudiante.

Independiente de Talento Humano, evidencias y cuentas de cobro: carpeta propia
(gs_viaticos/escuela/estudiantes/{usuario_id}) y entrega type="authenticated",
así que los archivos no tienen URL pública. Para abrirlos, el backend verifica
el permiso y genera un enlace firmado que caduca (private_download_url).

Solo se reutiliza la configuración del SDK de app.core.cloudinary.
"""
import asyncio
import io
import logging
import os
import time
import uuid
import zipfile
from dataclasses import dataclass

import cloudinary
import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
from cloudinary.exceptions import Error as CloudinaryError
from fastapi import HTTPException, UploadFile, status

import app.core.cloudinary  # noqa: F401  (inicializa cloudinary.config)

logger = logging.getLogger("uvicorn.error")

ESCUELA_FOLDER = "gs_viaticos/escuela/estudiantes"
ENTREGA = "authenticated"
MAX_BYTES = 10 * 1024 * 1024  # 10 MB
EXPIRACION_ENLACE_SEG = 300  # 5 minutos

_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

# extensión → (mime, resource_type de Cloudinary). Imágenes como "image"; PDF y
# Office como "raw": Cloudinary no los analiza, así un PDF que no sabe procesar
# no se rechaza (con "image" falla con "Invalid PDF file").
TIPOS = {
    "pdf": ("application/pdf", "raw"),
    "jpg": ("image/jpeg", "image"),
    "jpeg": ("image/jpeg", "image"),
    "png": ("image/png", "image"),
    "webp": ("image/webp", "image"),
    "heic": ("image/heic", "image"),
    "doc": ("application/msword", "raw"),
    "xls": ("application/vnd.ms-excel", "raw"),
    "ppt": ("application/vnd.ms-powerpoint", "raw"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "raw"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "raw"),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "raw"),
}
_CARPETA_OOXML = {"docx": "word/", "xlsx": "xl/", "pptx": "ppt/"}


@dataclass
class ArchivoSubido:
    public_id: str
    resource_type: str
    extension: str
    tipo_mime: str
    tamano_bytes: int
    nombre_original: str


def _contenido_coincide(ext: str, content: bytes) -> bool:
    """Comprueba la firma real del archivo: la extensión sola no basta."""
    if ext == "pdf":
        return content.startswith(b"%PDF")
    if ext in ("jpg", "jpeg"):
        return content.startswith(b"\xff\xd8\xff")
    if ext == "png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == "webp":
        return content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    if ext == "heic":
        return content[4:8] == b"ftyp" and content[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc", b"heif")
    if ext in ("doc", "xls", "ppt"):
        return content.startswith(_OLE)
    if ext in _CARPETA_OOXML:
        if not content.startswith(b"PK\x03\x04"):
            return False
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                return any(n.startswith(_CARPETA_OOXML[ext]) for n in z.namelist())
        except zipfile.BadZipFile:
            return False
    return False


def _rechazar(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detalle)


async def subir_material(file: UploadFile, estudiante_id: int) -> ArchivoSubido:
    nombre = os.path.basename((file.filename or "").replace("\\", "/")).strip()[:255] or "archivo"
    ext = nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    if ext not in TIPOS:
        raise _rechazar("Tipo de archivo no permitido. Usa PDF, imágenes (JPG, PNG, WEBP, HEIC) u Office (Word, Excel, PowerPoint).")

    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise _rechazar(f"El archivo '{nombre}' supera el tamaño máximo de {MAX_BYTES // (1024 * 1024)} MB.")
    if not content:
        raise _rechazar(f"El archivo '{nombre}' está vacío.")
    if not _contenido_coincide(ext, content):
        raise _rechazar(f"El contenido de '{nombre}' no corresponde a un archivo .{ext} válido.")

    mime, resource_type = TIPOS[ext]
    # Identificador opaco (sin nombres de personas). En "raw" Cloudinary no guarda
    # el formato aparte, así que la extensión va en el public_id.
    clave = uuid.uuid4().hex + (f".{ext}" if resource_type == "raw" else "")

    def _subir() -> dict:
        return cloudinary.uploader.upload(
            content,
            folder=f"{ESCUELA_FOLDER}/{estudiante_id}",
            public_id=clave,
            resource_type=resource_type,
            type=ENTREGA,
            overwrite=False,
            timeout=60,
        )

    try:
        res = await asyncio.to_thread(_subir)
    except CloudinaryError as exc:
        logger.error("Escuela GSB: error al subir material a Cloudinary: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo subir el archivo. Intenta nuevamente.",
        )

    return ArchivoSubido(
        public_id=res["public_id"],
        resource_type=resource_type,
        extension=ext,
        tipo_mime=mime,
        tamano_bytes=len(content),
        nombre_original=nombre,
    )


def enlace_firmado(public_id: str, resource_type: str, extension: str,
                   segundos: int = EXPIRACION_ENLACE_SEG) -> tuple[str, int]:
    """URL de descarga firmada que caduca en `segundos`. Devuelve (url, expira_en_epoch)."""
    expira = int(time.time()) + segundos
    url = cloudinary.utils.private_download_url(
        public_id,
        "" if resource_type == "raw" else extension,
        resource_type=resource_type,
        type=ENTREGA,
        expires_at=expira,
    )
    return url, expira


def eliminar_material(public_id: str, resource_type: str) -> None:
    """Borra el archivo en Cloudinary. 'not found' cuenta como borrado."""
    res = cloudinary.uploader.destroy(public_id, resource_type=resource_type, type=ENTREGA, invalidate=True)
    if res.get("result") not in ("ok", "not found"):
        raise CloudinaryError(f"Cloudinary respondió: {res}")


def limpiar_material_de_usuario(usuario_id: int) -> None:
    """Al eliminar un usuario: borra su carpeta de la Escuela. Nunca lanza;
    si Cloudinary falla queda registrado en el log y el llamador sigue."""
    prefijo = f"{ESCUELA_FOLDER}/{usuario_id}/"
    for resource_type in ("image", "raw"):
        try:
            cloudinary.api.delete_resources_by_prefix(prefijo, resource_type=resource_type, type=ENTREGA)
        except Exception as exc:  # noqa: BLE001 — limpieza best-effort
            logger.warning("Escuela GSB: no se pudo limpiar %s (%s) en Cloudinary: %s", prefijo, resource_type, exc)
