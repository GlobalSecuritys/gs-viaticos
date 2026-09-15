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
from app.services.pdf_cuenta_cobro import generar_pdf_cuenta_cobro

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


def _extension_de_url(url: str, por_defecto: str = ".jpg") -> str:
    try:
        ruta = urlparse(url).path.lower()
        if ".pdf" in ruta:
            return ".pdf"
        punto = ruta.rfind(".")
        if punto != -1:
            ext = ruta[punto:]
            if ext in EXTENSIONES_VALIDAS:
                return ext
    except Exception:
        pass
    return por_defecto


def _formato_fecha(valor) -> str:
    if isinstance(valor, (date, datetime)):
        return valor.strftime("%Y-%m-%d")
    return str(valor or "—")


MESES_CORTO = {
    1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
}


def _formato_fecha_corta(valor) -> str:
    if isinstance(valor, (date, datetime)):
        mes_txt = MESES_CORTO.get(valor.month, valor.strftime("%b"))
        return f"{valor.day}{mes_txt}"
    if isinstance(valor, str) and valor:
        try:
            partes = valor.split("-")
            if len(partes) == 3:
                dia = int(partes[2])
                mes = int(partes[1])
                return f"{dia}{MESES_CORTO.get(mes, '')}"
        except Exception:
            pass
        return slug(valor)
    return ""


def slug_legible(texto: Optional[str], por_defecto: str = "") -> str:
    """Convierte texto en formato CamelCase/Capitalizado sin caracteres especiales."""
    if not texto:
        return por_defecto
    limpio = slug(texto, por_defecto)
    palabras = [p.capitalize() for p in limpio.split("_") if p]
    return "".join(palabras) if palabras else por_defecto


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


def nombre_carpeta_asignacion(asignacion: "Asignacion", numero: int = 0) -> str:
    """Nombre de la subcarpeta dentro del ZIP general. Si se indica `numero`, se
    antepone como prefijo con 2 dígitos (01, 02... 18) para que el orden alfabético
    del explorador de archivos coincida con el orden numérico y visual del Historial."""
    cliente = slug_legible(asignacion.cliente, "Cliente")
    ciudad = slug_legible(asignacion.ciudad, "")
    fecha = _formato_fecha_corta(asignacion.fecha_inicio) or _formato_fecha(asignacion.fecha_inicio)

    partes = [p for p in [cliente, ciudad, fecha] if p]
    cuerpo = "_".join(partes)

    if numero > 0:
        return f"{numero:02d}_{cuerpo}"
    return f"Asignacion_{cuerpo}_{asignacion.id}"


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

    cuenta_cobro = getattr(asignacion, "cuenta_cobro", None)
    if cuenta_cobro is not None and getattr(cuenta_cobro, "secure_url", None):
        lineas += ["", "Cuenta de cobro       : Archivo adjunto incluido en esta carpeta."]

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

    # 4) Cuentas de Cobro
    # 4.1) Cuenta de cobro adjunta a nivel asignación (archivo en Cloudinary)
    cuenta_cobro_asig = getattr(asignacion, "cuenta_cobro", None)
    if cuenta_cobro_asig is not None and getattr(cuenta_cobro_asig, "secure_url", None):
        url_cc = cuenta_cobro_asig.secure_url
        ext_cc = _extension_de_url(url_cc, por_defecto=".pdf")
        tecnico_cc = slug(
            getattr(getattr(cuenta_cobro_asig, "tecnico", None), "nombre", None)
            or getattr(getattr(asignacion, "tecnico", None), "nombre", None),
            "tecnico",
        )
        nombre_cc = f"Cuenta_Cobro_{tecnico_cc}{ext_cc}"

        info_cc = zipfile.ZipInfo(
            f"{base}{nombre_cc}",
            date_time=datetime.now().timetuple()[:6],
        )
        info_cc.compress_type = zipfile.ZIP_STORED

        try:
            with client.stream("GET", url_cc) as respuesta:
                respuesta.raise_for_status()
                with zf.open(info_cc, "w") as destino:
                    for trozo in respuesta.iter_bytes(CHUNK_SIZE):
                        destino.write(trozo)
                        datos = buffer.drain()
                        if datos:
                            yield datos
        except Exception:
            logger.warning(
                "No se pudo descargar la cuenta de cobro de la asignación %s (url: %s)",
                asignacion.id,
                url_cc,
            )
            zf.writestr(
                f"{base}Cuenta_Cobro_ERROR.txt",
                f"No fue posible descargar el archivo de la cuenta de cobro desde {url_cc}",
            )
            datos = buffer.drain()
            if datos:
                yield datos

    # 4.2) Cuentas de cobro digitales emitidas para los viáticos de la asignación
    cuentas_vistas: set[int] = set()
    for viatico in viaticos:
        cc_viatico = getattr(viatico, "cuenta_cobro", None)
        if cc_viatico is not None and cc_viatico.id not in cuentas_vistas:
            cuentas_vistas.add(cc_viatico.id)
            try:
                pdf_bytes = generar_pdf_cuenta_cobro(cc_viatico)
                consecutivo = cc_viatico.consecutivo or f"{cc_viatico.id}"
                concepto = slug(cc_viatico.concepto_servicio or viatico.tipo_gasto, "gasto")[:20]
                nombre_pdf = f"Cuenta_Cobro_{consecutivo}_{concepto}.pdf"

                info_pdf = zipfile.ZipInfo(
                    f"{base}{nombre_pdf}",
                    date_time=datetime.now().timetuple()[:6],
                )
                info_pdf.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(info_pdf, pdf_bytes)
                datos = buffer.drain()
                if datos:
                    yield datos
            except Exception:
                logger.exception(
                    "No se pudo generar el PDF de la cuenta de cobro %s (viático %s)",
                    cc_viatico.id,
                    viatico.id,
                )
                zf.writestr(
                    f"{base}Cuenta_Cobro_{cc_viatico.id}_ERROR.txt",
                    f"No fue posible generar el PDF de la cuenta de cobro ID {cc_viatico.id}.",
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
            for num, (asignacion, viaticos, resumen) in enumerate(asignaciones, start=1):
                vacio = False
                carpeta = nombre_carpeta_asignacion(asignacion, numero=num)
                contador = 2
                while carpeta in carpetas_usadas:
                    carpeta = f"{carpeta}_{contador}"
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
