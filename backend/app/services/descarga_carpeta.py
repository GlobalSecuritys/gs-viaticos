"""
Generación por streaming de "carpetas" (ZIP) de asignaciones finalizadas.

Cada carpeta contiene:
  - Excel_Viaticos.xlsx  -> reutiliza generar_excel_viaticos_asignacion (sin modificarla)
  - Fotos/               -> evidencias descargadas de Cloudinary al vuelo
  - Descripcion.txt      -> resumen textual de la asignación

El ZIP se arma EN STREAMING: nunca se acumula el archivo completo (ni las
fotos) en memoria. Se escribe sobre un buffer que se vacía tras cada bloque,
y las fotos se copian de Cloudinary al ZIP en trozos de 64 KB.
"""

import logging
import re
import unicodedata
import zipfile
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Iterable, Iterator, Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.services.excel_export import generar_excel_viaticos_asignacion

if TYPE_CHECKING:
    from app.models.asignacion import Asignacion
    from app.models.viatico import Viatico

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024
TIMEOUT_DESCARGA = 60.0

EXTENSIONES_VALIDAS = {
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tiff", ".pdf"
}


class _BufferStream:
    """
    Objeto tipo archivo (solo escritura, NO seekable) sobre el que zipfile
    escribe. Se vacía con drain() tras cada operación, de modo que la memoria
    usada es únicamente la del último bloque escrito.

    Importante: define tell() pero NO define seek(), para que zipfile lo trate
    como stream no-seekable y use descriptores de datos.
    """

    def __init__(self) -> None:
        self._buffer = bytearray()
        self._pos = 0

    def write(self, data: bytes) -> int:
        self._buffer.extend(data)
        self._pos += len(data)
        return len(data)

    def tell(self) -> int:
        return self._pos

    def flush(self) -> None:
        pass

    def close(self) -> None:
        pass

    def drain(self) -> bytes:
        if not self._buffer:
            return b""
        datos = bytes(self._buffer)
        self._buffer.clear()
        return datos


def slug(texto: Optional[str], por_defecto: str = "sin-dato") -> str:
    """Normaliza un texto para usarlo como nombre de archivo/carpeta."""
    base = str(texto or "").strip()
    base = unicodedata.normalize("NFD", base)
    base = "".join(c for c in base if unicodedata.category(c) != "Mn")
    base = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_")
    return base or por_defecto


def _extension_de_url(url: str) -> str:
    try:
        ruta = urlparse(url).path
        punto = ruta.rfind(".")
        if punto != -1:
            ext = ruta[punto:].lower()
            if ext in EXTENSIONES_VALIDAS:
                return ext
    except Exception:
        pass
    return ".jpg"


def _formato_fecha(valor) -> str:
    if isinstance(valor, (date, datetime)):
        return valor.strftime("%Y-%m-%d")
    return str(valor or "—")


def _formato_money(valor) -> str:
    try:
        return f"${Decimal(str(valor or 0)):,.2f}"
    except Exception:
        return str(valor)


def nombre_zip_asignacion(asignacion: "Asignacion") -> str:
    """Asignacion_{cliente}_{fecha_inicio}.zip"""
    return (
        f"Asignacion_{slug(asignacion.cliente, 'cliente')}"
        f"_{_formato_fecha(asignacion.fecha_inicio)}.zip"
    )


def nombre_carpeta_asignacion(asignacion: "Asignacion") -> str:
    """Nombre de la subcarpeta dentro del ZIP general."""
    return (
        f"Asignacion_{slug(asignacion.cliente, 'cliente')}"
        f"_{_formato_fecha(asignacion.fecha_inicio)}_{asignacion.id}"
    )


def _construir_descripcion(
    asignacion: "Asignacion",
    viaticos: Iterable["Viatico"],
    resumen: dict,
) -> str:
    """
    Descripcion.txt. Los montos vienen en `resumen`, calculado por el router con
    la misma lógica ya usada en el resumen de gastos (no se recalcula aquí).
    """
    tecnicos = []
    tecnico_asig = getattr(asignacion, "tecnico", None)
    if tecnico_asig is not None and tecnico_asig.nombre:
        tecnicos.append(tecnico_asig.nombre)
    for v in viaticos:
        usuario = getattr(v, "usuario", None)
        if usuario is not None and usuario.nombre and usuario.nombre not in tecnicos:
            tecnicos.append(usuario.nombre)

    lineas = [
        "RESUMEN DE LA ASIGNACIÓN",
        "=" * 60,
        "",
        f"Descripción / Cliente : {asignacion.cliente or '—'}",
    ]
    if asignacion.empresa:
        lineas.append(f"Oficina / Empresa     : {asignacion.empresa}")
    lineas += [
        f"Ciudad                : {asignacion.ciudad or '—'}",
        f"Período               : {_formato_fecha(asignacion.fecha_inicio)} a "
        f"{_formato_fecha(asignacion.fecha_fin)}",
        f"Técnico(s)            : {', '.join(tecnicos) if tecnicos else '—'}",
        "",
        "-" * 60,
        f"Anticipo entregado    : {_formato_money(resumen.get('monto_anticipo'))}",
        f"Total gastado         : {_formato_money(resumen.get('total_gastado'))}",
        f"Saldo restante        : {_formato_money(resumen.get('saldo_restante'))}",
        f"Cantidad de ítems     : {resumen.get('cantidad_viaticos', 0)}",
        "-" * 60,
    ]
    if asignacion.observaciones:
        lineas += ["", f"Observaciones         : {asignacion.observaciones}"]

    lineas += [
        "",
        f"Documento generado el {datetime.now().strftime('%Y-%m-%d %H:%M')}.",
    ]
    return "\n".join(lineas)


def _escribir_asignacion(
    zf: zipfile.ZipFile,
    buffer: _BufferStream,
    client: httpx.Client,
    asignacion: "Asignacion",
    viaticos: list,
    resumen: dict,
    prefijo: str = "",
) -> Iterator[bytes]:
    """
    Escribe dentro de `zf` el contenido de UNA asignación, cediendo los bytes
    generados a medida que se producen. `prefijo` permite anidar la asignación
    en una subcarpeta (descarga general).
    """
    base = f"{prefijo}/" if prefijo else ""

    # 1) Excel (reutiliza la exportación existente tal cual)
    try:
        excel_stream = generar_excel_viaticos_asignacion(
            asignacion=asignacion,
            viaticos=viaticos,
        )
        zf.writestr(f"{base}Excel_Viaticos.xlsx", excel_stream.getvalue())
    except Exception:
        logger.exception("No se pudo generar el Excel de la asignación %s", asignacion.id)
        zf.writestr(
            f"{base}Excel_Viaticos_ERROR.txt",
            "No fue posible generar el archivo de Excel para esta asignación.",
        )
    datos = buffer.drain()
    if datos:
        yield datos

    # 2) Descripcion.txt
    zf.writestr(
        f"{base}Descripcion.txt",
        _construir_descripcion(asignacion, viaticos, resumen).encode("utf-8"),
    )
    datos = buffer.drain()
    if datos:
        yield datos

    # 3) Fotos (descargadas de Cloudinary en streaming, una a una)
    usados: set[str] = set()
    for viatico in viaticos:
        tecnico_nombre = slug(
            getattr(getattr(viatico, "usuario", None), "nombre", None)
            or getattr(getattr(asignacion, "tecnico", None), "nombre", None),
            "tecnico",
        )
        evidencias = list(getattr(viatico, "evidencias", []) or [])
        for indice, evidencia in enumerate(evidencias, start=1):
            url = evidencia.secure_url
            if not url:
                continue

            sufijo = "" if len(evidencias) == 1 else f"_{indice}"
            nombre = f"{tecnico_nombre}_viatico{viatico.id}{sufijo}{_extension_de_url(url)}"
            contador = 2
            while nombre in usados:
                nombre = (
                    f"{tecnico_nombre}_viatico{viatico.id}{sufijo}"
                    f"_{contador}{_extension_de_url(url)}"
                )
                contador += 1
            usados.add(nombre)

            # ZIP_STORED: las fotos ya vienen comprimidas; evita gasto de CPU.
            info = zipfile.ZipInfo(
                f"{base}Fotos/{nombre}",
                date_time=datetime.now().timetuple()[:6],
            )
            info.compress_type = zipfile.ZIP_STORED

            try:
                with client.stream("GET", url) as respuesta:
                    respuesta.raise_for_status()
                    with zf.open(info, "w") as destino:
                        for trozo in respuesta.iter_bytes(CHUNK_SIZE):
                            destino.write(trozo)
                            datos = buffer.drain()
                            if datos:
                                yield datos
            except Exception:
                # Una foto inaccesible no debe abortar toda la descarga.
                logger.warning(
                    "No se pudo descargar la evidencia %s del viático %s",
                    evidencia.id,
                    viatico.id,
                )

            datos = buffer.drain()
            if datos:
                yield datos


def iter_zip_asignacion(
    asignacion: "Asignacion",
    viaticos: list,
    resumen: dict,
) -> Iterator[bytes]:
    """ZIP con la carpeta de UNA asignación finalizada."""
    buffer = _BufferStream()
    with httpx.Client(timeout=TIMEOUT_DESCARGA, follow_redirects=True) as client:
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            yield from _escribir_asignacion(
                zf, buffer, client, asignacion, viaticos, resumen
            )
    datos = buffer.drain()
    if datos:
        yield datos


def iter_zip_historial(
    asignaciones: Iterable[Tuple["Asignacion", list, dict]],
) -> Iterator[bytes]:
    """
    ZIP con una subcarpeta por asignación finalizada.

    `asignaciones` debe ser un iterable PEREZOSO (generador) que entregue una
    asignación a la vez; así nunca se cargan todas en memoria simultáneamente.
    """
    buffer = _BufferStream()
    carpetas_usadas: set[str] = set()

    with httpx.Client(timeout=TIMEOUT_DESCARGA, follow_redirects=True) as client:
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            vacio = True
            for asignacion, viaticos, resumen in asignaciones:
                vacio = False
                carpeta = nombre_carpeta_asignacion(asignacion)
                contador = 2
                while carpeta in carpetas_usadas:
                    carpeta = f"{nombre_carpeta_asignacion(asignacion)}_{contador}"
                    contador += 1
                carpetas_usadas.add(carpeta)

                yield from _escribir_asignacion(
                    zf, buffer, client, asignacion, viaticos, resumen, prefijo=carpeta
                )

            if vacio:
                zf.writestr(
                    "SIN_ASIGNACIONES.txt",
                    "No hay asignaciones finalizadas para descargar.",
                )
                datos = buffer.drain()
                if datos:
                    yield datos

    datos = buffer.drain()
    if datos:
        yield datos
