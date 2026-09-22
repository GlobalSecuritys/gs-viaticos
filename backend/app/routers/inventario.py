"""
Modulo Inventario (proceso IN del Mapa SGC).
Rediseño completo: el archivo Excel en servidor (inventario_general.xlsx) es la fuente visual.
Se gestionan visualizacion de hojas, filtros dinamicos, busqueda de equipos y registro de salidas.

Permisos:
  * Tecnicos: sin acceso al modulo.
  * Consulta: require_seccion("IN", "lector").
  * Crear / editar / salidas: require_seccion("IN", "admin") o "lector" segun operacion.
"""

from typing import Annotated, Any, Dict, List, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_seccion
from app.database import get_db
from app.models.inventario_salida import InventarioSalidaRegistro
from app.models.usuario import Usuario
from app.schemas.inventario_nuevo import (
    BusquedaResultadoResponse,
    ExcelContenidoResponse,
    SalidaRegistroCreate,
    SalidaRegistroResponse,
)
from app.services.inventario_excel import (
    existe_archivo_excel,
    obtener_datos_inventario_excel,
)


def require_no_tecnico(current_user: Annotated[Usuario, Depends(get_current_user)]) -> Usuario:
    if current_user.rol == "tecnico":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Los tecnicos no tienen acceso al modulo de inventario.",
        )
    return current_user


router = APIRouter(
    prefix="/inventario",
    tags=["Inventario (IN)"],
    dependencies=[Depends(require_no_tecnico)],
)

LectorIN = Annotated[Usuario, Depends(require_seccion("IN", "lector"))]
DB = Annotated[Session, Depends(get_db)]


# -----------------------------------------------------------------------------
# 1. VISUALIZACION DEL EXCEL (Paso 1)
# -----------------------------------------------------------------------------
@router.get("/excel", response_model=ExcelContenidoResponse)
def obtener_excel(
    current_user: LectorIN,
    hoja: Optional[str] = Query(None, description="Nombre de la hoja solicitada"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    """Devuelve las hojas disponibles y el contenido de la hoja solicitada desde la memoria cache."""
    datos = obtener_datos_inventario_excel()
    if not datos.get("existe"):
        return ExcelContenidoResponse(
            existe=False,
            archivo=datos.get("archivo", "inventario_general.xlsx"),
            hojas=[],
            mensaje=datos.get("mensaje", "Archivo no encontrado en el servidor."),
        )

    hojas: List[str] = datos.get("hojas", [])
    if not hojas:
        return ExcelContenidoResponse(
            existe=True,
            archivo=datos.get("archivo", "inventario_general.xlsx"),
            hojas=[],
            mensaje="El archivo no contiene hojas visibles con datos.",
        )

    hoja_activa = hoja if (hoja and hoja in hojas) else hojas[0]
    info_hoja = datos.get("datos_hojas", {}).get(hoja_activa, {})
    columnas = info_hoja.get("columnas", [])
    filas_todas = info_hoja.get("filas", [])
    total_filas = len(filas_todas)
    filas_paginadas = filas_todas[offset : offset + limit]

    return ExcelContenidoResponse(
        existe=True,
        archivo=datos.get("archivo", "inventario_general.xlsx"),
        hojas=hojas,
        hoja_activa=hoja_activa,
        columnas=columnas,
        total_filas=total_filas,
        filas=filas_paginadas,
    )


# -----------------------------------------------------------------------------
# 2. BUSQUEDA DINAMICA (Paso 2)
# -----------------------------------------------------------------------------
@router.get("/buscar", response_model=BusquedaResultadoResponse)
def buscar_en_excel(
    current_user: LectorIN,
    hoja: Optional[str] = Query(None),
    serial: Optional[str] = Query(None),
    oficina: Optional[str] = Query(None),
    tecnico: Optional[str] = Query(None),
    fecha: Optional[str] = Query(None),
):
    """Filtra progresivamente sobre las filas de la hoja segun los campos diligenciados.

    Requiere al menos un campo con valor.
    """
    criterios_limpios = {
        "serial": (serial or "").strip(),
        "oficina": (oficina or "").strip(),
        "tecnico": (tecnico or "").strip(),
        "fecha": (fecha or "").strip(),
    }

    if not any(criterios_limpios.values()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes ingresar al menos un criterio de busqueda (Serial, Oficina, Tecnico o Fecha).",
        )

    datos = obtener_datos_inventario_excel()
    if not datos.get("existe"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo inventario_general.xlsx no se encuentra en el servidor.",
        )

    hojas: List[str] = datos.get("hojas", [])
    if not hojas:
        return BusquedaResultadoResponse(
            total_encontrados=0,
            hoja="",
            criterios=criterios_limpios,
            resultados=[],
        )

    hoja_activa = hoja if (hoja and hoja in hojas) else hojas[0]
    info_hoja = datos.get("datos_hojas", {}).get(hoja_activa, {})
    columnas: List[str] = info_hoja.get("columnas", [])
    filas: List[Dict[str, Any]] = info_hoja.get("filas", [])

    def buscar_en_fila(fila: Dict[str, Any]) -> bool:
        if criterios_limpios["serial"]:
            crit = criterios_limpios["serial"].lower()
            encontrado = False
            for col, val in fila.items():
                col_low = col.lower()
                if any(k in col_low for k in ["serial", "serie", "sn", "s/n", "equipo", "codigo"]):
                    if crit in str(val).lower():
                        encontrado = True
                        break
            if not encontrado and any(crit in str(val).lower() for val in fila.values()):
                encontrado = True
            if not encontrado:
                return False

        if criterios_limpios["oficina"]:
            crit = criterios_limpios["oficina"].lower()
            encontrado = False
            for col, val in fila.items():
                col_low = col.lower()
                if any(k in col_low for k in ["oficina", "sede", "destino", "ubicacion", "lugar", "cliente"]):
                    if crit in str(val).lower():
                        encontrado = True
                        break
            if not encontrado and any(crit in str(val).lower() for val in fila.values()):
                encontrado = True
            if not encontrado:
                return False

        if criterios_limpios["tecnico"]:
            crit = criterios_limpios["tecnico"].lower()
            encontrado = False
            for col, val in fila.items():
                col_low = col.lower()
                if any(k in col_low for k in ["tecnico", "tecnico", "responsable", "custodio", "asignado", "recibe"]):
                    if crit in str(val).lower():
                        encontrado = True
                        break
            if not encontrado and any(crit in str(val).lower() for val in fila.values()):
                encontrado = True
            if not encontrado:
                return False

        if criterios_limpios["fecha"]:
            crit = criterios_limpios["fecha"].lower()
            encontrado = False
            for col, val in fila.items():
                col_low = col.lower()
                if "fecha" in col_low or "date" in col_low:
                    if crit in str(val).lower():
                        encontrado = True
                        break
            if not encontrado and any(crit in str(val).lower() for val in fila.values()):
                encontrado = True
            if not encontrado:
                return False

        return True

    resultados_filtrados = [f for f in filas if buscar_en_fila(f)]

    return BusquedaResultadoResponse(
        total_encontrados=len(resultados_filtrados),
        hoja=hoja_activa,
        criterios=criterios_limpios,
        resultados=resultados_filtrados,
    )


# -----------------------------------------------------------------------------
# 3. GUARDAR SALIDA (Paso 3)
# -----------------------------------------------------------------------------
@router.post("/salidas", response_model=SalidaRegistroResponse, status_code=status.HTTP_201_CREATED)
def crear_salida_registro(
    datos: SalidaRegistroCreate,
    current_user: LectorIN,
    db: DB,
):
    """Guarda un nuevo registro de salida en inventario_salidas_registro."""
    nuevo = InventarioSalidaRegistro(
        serial=datos.serial,
        oficina=datos.oficina,
        tecnico=datos.tecnico,
        fecha_busqueda=datos.fecha_busqueda,
        orden=datos.orden,
        oficina_instalada=datos.oficina_instalada,
        fecha=datos.fecha,
        observaciones=datos.observaciones,
        creado_por_id=current_user.id,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.get("/salidas", response_model=List[SalidaRegistroResponse])
def listar_salidas_registradas(
    current_user: LectorIN,
    db: DB,
    limit: int = Query(100, ge=1, le=500),
):
    """Lista las ultimas salidas registradas."""
    query = select(InventarioSalidaRegistro).order_by(desc(InventarioSalidaRegistro.id)).limit(limit)
    return db.scalars(query).all()