"""
Escuela GSB: catálogo de ítems AD-FR-06 y registro de módulos didácticos.

Los módulos los escribe el equipo de desarrollo en escuela_modulos.json
(no hay editor). Hay UN módulo por ítem, identificado por "familia:número":
las plantillas que comparten los mismos ítems forman una familia, así que el
módulo "general:1.1" sirve para cualquier contable, operativo o técnico de
planta con falencia en el ítem 1.1.
"""
import json
import logging
import os
from functools import lru_cache
from typing import Optional

logger = logging.getLogger("uvicorn.error")

_CORE_DIR = os.path.dirname(__file__)
_PLANTILLAS_FILE = os.path.join(_CORE_DIR, "plantillas_evaluacion.json")
# En producción escuela_modulos.json está vacío ({}): no se publica contenido
# didáctico hasta que Dirección Administrativa lo entregue. Los módulos de
# prueba viven en escuela_modulos.ejemplo.json, que nunca se carga salvo que
# se apunte ESCUELA_MODULOS_FILE a él en un entorno de pruebas.
_MODULOS_FILE = os.environ.get("ESCUELA_MODULOS_FILE") or os.path.join(_CORE_DIR, "escuela_modulos.json")

# Lista blanca: plantilla → familia de ítems. Solo estas plantillas generan
# falencias. contable/operaciones/tecnico tienen los mismos 22 ítems (texto y
# descripción verificados); directivos tiene 25 distintos.
# Para incluir AD-FR-35 más adelante: "tecnico_adfr35": "adfr35"
# (su calificación vive en evaluaciones_tecnicos_capas, no en el JSON
# "evaluacion", así que también hará falta adaptar la detección).
FAMILIA_POR_PLANTILLA: dict[str, str] = {
    "directivos": "directivos",
    "contable": "general",
    "operaciones": "general",
    "tecnico": "general",
}

# Calificaciones del jefe que cuentan como falencia (escala 1 a 4).
CALIFICACIONES_FALENCIA = (1, 2)


def clave_modulo(plantilla: str, numero: str) -> Optional[str]:
    familia = FAMILIA_POR_PLANTILLA.get(plantilla)
    return f"{familia}:{numero}" if familia else None


@lru_cache(maxsize=1)
def catalogo_items() -> dict[str, dict[str, str]]:
    """{plantilla: {numero: texto}} para las plantillas de la lista blanca."""
    with open(_PLANTILLAS_FILE, encoding="utf-8") as f:
        plantillas = json.load(f)
    catalogo: dict[str, dict[str, str]] = {}
    for pid in FAMILIA_POR_PLANTILLA:
        tpl = plantillas.get(pid) or {}
        catalogo[pid] = {
            item["numero"]: item["texto"].strip()
            for seccion in tpl.get("secciones", [])
            for item in seccion.get("items", [])
        }
    return catalogo


@lru_cache(maxsize=1)
def registro_modulos() -> dict[str, dict]:
    """{clave: módulo}. Si el archivo aún no existe, el registro está vacío."""
    if not os.path.exists(_MODULOS_FILE):
        return {}
    with open(_MODULOS_FILE, encoding="utf-8") as f:
        return json.load(f)


def validar_registro_modulos() -> None:
    """Se llama al arrancar: avisa en el log de claves que no corresponden a
    ningún ítem de las plantillas. No detiene el arranque."""
    try:
        catalogo = catalogo_items()
        validas = {
            clave_modulo(pid, numero)
            for pid, items in catalogo.items()
            for numero in items
        }
        modulos = registro_modulos()
    except Exception as exc:  # JSON mal formado: avisar sin tumbar la API
        logger.warning("Escuela GSB: no se pudo cargar el registro de módulos: %s", exc)
        return

    for clave in modulos:
        if clave not in validas:
            logger.warning(
                "Escuela GSB: el módulo '%s' de escuela_modulos.json no corresponde "
                "a ningún ítem de las plantillas AD-FR-06; no se mostrará a nadie.",
                clave,
            )
