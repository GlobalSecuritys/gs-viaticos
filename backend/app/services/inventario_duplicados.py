"""
Detección de ítems duplicados en inventario.

Es lógica determinista (normalización + Jaccard sobre tokens), no una llamada
a un modelo: el objetivo es advertir al usuario antes de crear un ítem que ya
existe con otra redacción ("BASE DETECTOR BOSCH" vs "DETECTOR BASE BOSCH").
"""

import re
import unicodedata
from typing import Iterable, List, Tuple

# Códigos que en el Excel original significan "sin código" y no deben tratarse
# como un part number real al buscar coincidencia exacta.
CODIGOS_NULOS = {"", "N A", "NA", "N D", "ND", "SIN CODIGO", "0"}


def normalizar(s: str | None) -> str:
    """MAYÚSCULAS, sin tildes, sin puntuación, con espacios colapsados."""
    s = (s or "").upper()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def jaccard(a: str | None, b: str | None) -> float:
    """Similitud de Jaccard entre los conjuntos de palabras de a y b."""
    A, B = set(normalizar(a).split()), set(normalizar(b).split())
    if not A or not B:
        return 0.0
    interseccion = len(A & B)
    return interseccion / (len(A) + len(B) - interseccion)


def buscar_duplicados(
    codigo: str | None,
    descripcion: str | None,
    marca: str | None,
    items_existentes: Iterable,
    umbral: float = 0.55,
    max_resultados: int = 3,
) -> Tuple[str, List[Tuple[float, object]]]:
    """
    Devuelve (tipo, [(score, item), ...]) donde tipo es:
      'exacto'  → mismo código de fábrica: casi seguro es el mismo ítem.
      'posible' → descripción suficientemente parecida; el usuario decide.
      'ninguno' → nada parecido.
    """
    items_existentes = list(items_existentes)

    codigo_norm = normalizar(codigo)
    if codigo_norm and codigo_norm not in CODIGOS_NULOS:
        exactos = [i for i in items_existentes if normalizar(i.codigo) == codigo_norm]
        if exactos:
            return "exacto", [(1.0, i) for i in exactos[:max_resultados]]

    marca_norm = normalizar(marca)
    candidatos: List[Tuple[float, object]] = []
    for item in items_existentes:
        score = jaccard(descripcion, item.descripcion)
        # Misma marca es evidencia adicional, no suficiente por sí sola.
        if marca_norm and marca_norm == normalizar(item.marca):
            score = min(1.0, score + 0.15)
        if score >= umbral:
            candidatos.append((score, item))

    if candidatos:
        candidatos.sort(key=lambda par: -par[0])
        return "posible", candidatos[:max_resultados]

    return "ninguno", []
