import os
import sys
import unittest
from datetime import date, datetime
from unittest.mock import MagicMock, patch

import dotenv

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

dotenv.load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from app.models.evaluacion_desempeno import (
    EvaluacionCompromiso,
    EvaluacionConfigCapa,
    EvaluacionDesempeno,
    EvaluacionPeriodoTecnico,
    EvaluacionTecnicoCapa,
    EvaluacionTecnicoResumen,
)
from app.models.usuario import Usuario
from app.routers.evaluacion_desempeno import _obtener_items_requeridos, _plantilla_para_usuario
from app.routers.evaluacion_tecnicos import (
    _CRITERIOS_ADFR35,
    _determinar_nivel,
    _determinar_resultado,
    _verificar_permiso_capa,
)


class TestCalculosADFR35(unittest.TestCase):
    """Pruebas unitarias de cálculos contra la hoja 'Ejemplo diligenciado' de evaluacion tecnicos.xlsx."""

    def test_calculo_ejemplo_diligenciado_exacto(self):
        # Datos del ejemplo diligenciado
        resp_auto = {
            "1.1": 4, "1.2": 4, "1.3": 4, "1.4": 4, "1.5": 4,
            "2.1": 3, "2.2": 4, "2.3": 3, "2.4": 3, "2.5": 4,
            "3.1": 4,
        }
        resp_viaticos = {
            "1.1": 3, "1.2": 3, "1.3": 4, "1.4": "N/A", "1.5": 3,
            "2.1": 3, "2.2": 2, "2.3": 3, "2.4": 3, "2.5": 2,
            "3.1": "N/A",
        }
        resp_asistente = {
            "1.1": 4, "1.2": 3, "1.3": 3, "1.4": 4, "1.5": 3,
            "2.1": 3, "2.2": 3, "2.3": 3, "2.4": 3, "2.5": 3,
            "3.1": 3,
        }

        # Promedios de capa
        nums_auto = [float(v) for v in resp_auto.values() if str(v).upper() != "N/A"]
        nums_viaticos = [float(v) for v in resp_viaticos.values() if str(v).upper() != "N/A"]
        nums_asistente = [float(v) for v in resp_asistente.values() if str(v).upper() != "N/A"]

        self.assertEqual(len(nums_auto), 11)
        self.assertEqual(len(nums_viaticos), 9)
        self.assertEqual(len(nums_asistente), 11)

        c_auto = sum(nums_auto) / len(nums_auto)
        c_viaticos = sum(nums_viaticos) / len(nums_viaticos)
        c_asistente = sum(nums_asistente) / len(nums_asistente)

        # Validación con 2 decimales esperados en la hoja Ejemplo
        self.assertAlmostEqual(c_auto, 3.727272727272727, places=7)
        self.assertEqual(round(c_auto, 2), 3.73)

        self.assertAlmostEqual(c_viaticos, 2.888888888888889, places=7)
        self.assertEqual(round(c_viaticos, 2), 2.89)

        self.assertAlmostEqual(c_asistente, 3.1818181818181817, places=7)
        self.assertEqual(round(c_asistente, 2), 3.18)

        # Calificación final: promedio de las 3 calificaciones por área
        c_final = (c_auto + c_viaticos + c_asistente) / 3.0
        self.assertAlmostEqual(c_final, 3.265993265993266, places=7)
        self.assertEqual(round(c_final, 2), 3.27)

        # Porcentaje: final / 4
        porcentaje = c_final / 4.0
        self.assertAlmostEqual(porcentaje, 0.8164983164983165, places=7)
        self.assertEqual(round(porcentaje * 100, 1), 81.6)

        # Nivel y resultado
        nivel = _determinar_nivel(porcentaje)
        resultado = _determinar_resultado(c_final)

        self.assertEqual(nivel, "BUENO")
        self.assertEqual(resultado, "APRUEBA")

    def test_umbrales_nivel_y_aprobacion(self):
        # >= 100%: MUY BUENO
        self.assertEqual(_determinar_nivel(1.0), "MUY BUENO")
        self.assertEqual(_determinar_nivel(1.05), "MUY BUENO")

        # >= 70% y < 100%: BUENO
        self.assertEqual(_determinar_nivel(0.70), "BUENO")
        self.assertEqual(_determinar_nivel(0.999), "BUENO")

        # >= 40% y < 70%: ACEPTABLE
        self.assertEqual(_determinar_nivel(0.40), "ACEPTABLE")
        self.assertEqual(_determinar_nivel(0.699), "ACEPTABLE")

        # < 40%: DEFICIENTE
        self.assertEqual(_determinar_nivel(0.399), "DEFICIENTE")
        self.assertEqual(_determinar_nivel(0.10), "DEFICIENTE")

        # Aprobación: >= 3.0 APRUEBA, < 3.0 NO APRUEBA
        self.assertEqual(_determinar_resultado(3.0), "APRUEBA")
        self.assertEqual(_determinar_resultado(3.5), "APRUEBA")
        self.assertEqual(_determinar_resultado(2.99), "NO APRUEBA")
        self.assertEqual(_determinar_resultado(1.5), "NO APRUEBA")


class TestPermisosCapas(unittest.TestCase):
    """Verifica reglas de aislamiento por capa."""

    def setUp(self):
        self.pilar = Usuario(id=1, nombre="Pilar Aristizabal", correo="pilaradmin@gsbank.com", rol="superadmin")
        self.tecnico1 = Usuario(id=10, nombre="Juan Tecnico", correo="juan@gsbank.com", rol="tecnico")
        self.tecnico2 = Usuario(id=20, nombre="Pedro Tecnico", correo="pedro@gsbank.com", rol="tecnico")
        self.eval_viaticos = Usuario(id=30, nombre="Luisa Viaticos", correo="luisa@gsbank.com", rol="auxiliar_operaciones")
        self.eval_oper = Usuario(id=40, nombre="Claudia Operaciones", correo="claudia@gsbank.com", rol="asistente")
        self.intruso = Usuario(id=99, nombre="Usuario Intruso", correo="intruso@gsbank.com", rol="usuario")

        self.evaluacion = EvaluacionDesempeno(id=100, usuario_evaluado_id=10, plantilla="tecnico_adfr35")
        self.config_capas = {
            "viaticos": 30,
            "asistente_oper": 40,
        }

    def test_permiso_capa_auto(self):
        # El técnico evaluado puede editar auto
        self.assertTrue(_verificar_permiso_capa("auto", self.evaluacion, self.tecnico1, self.config_capas))
        # Otro técnico NO puede editar auto de esta evaluación
        self.assertFalse(_verificar_permiso_capa("auto", self.evaluacion, self.tecnico2, self.config_capas))
        # Evaluadoras no pueden editar auto
        self.assertFalse(_verificar_permiso_capa("auto", self.evaluacion, self.eval_viaticos, self.config_capas))
        self.assertFalse(_verificar_permiso_capa("auto", self.evaluacion, self.eval_oper, self.config_capas))
        # Pilar siempre puede
        self.assertTrue(_verificar_permiso_capa("auto", self.evaluacion, self.pilar, self.config_capas))

    def test_permiso_capa_viaticos(self):
        # Evaluadora asignada a viáticos puede editar viáticos
        self.assertTrue(_verificar_permiso_capa("viaticos", self.evaluacion, self.eval_viaticos, self.config_capas))
        # El técnico NO puede editar viáticos
        self.assertFalse(_verificar_permiso_capa("viaticos", self.evaluacion, self.tecnico1, self.config_capas))
        # La otra evaluadora NO puede editar viáticos
        self.assertFalse(_verificar_permiso_capa("viaticos", self.evaluacion, self.eval_oper, self.config_capas))
        # Pilar puede
        self.assertTrue(_verificar_permiso_capa("viaticos", self.evaluacion, self.pilar, self.config_capas))

    def test_permiso_capa_asistente_oper(self):
        # Evaluadora asignada a asistente_oper puede editar asistente_oper
        self.assertTrue(_verificar_permiso_capa("asistente_oper", self.evaluacion, self.eval_oper, self.config_capas))
        # El técnico NO puede
        self.assertFalse(_verificar_permiso_capa("asistente_oper", self.evaluacion, self.tecnico1, self.config_capas))
        # Evaluadora de viáticos NO puede
        self.assertFalse(_verificar_permiso_capa("asistente_oper", self.evaluacion, self.eval_viaticos, self.config_capas))
        # Pilar puede
        self.assertTrue(_verificar_permiso_capa("asistente_oper", self.evaluacion, self.pilar, self.config_capas))


class TestRegresionFlujoAdministrativos(unittest.TestCase):
    """
    CRÍTICO: Garantiza que el flujo preexistente de administrativos no sufra regresiones.
    """

    def test_plantillas_viejas_se_mantienen(self):
        # 1. directivos, contable, operaciones y tecnico (22 items) siguen intactas
        items_dir = _obtener_items_requeridos("directivos")
        items_contable = _obtener_items_requeridos("contable")
        items_oper = _obtener_items_requeridos("operaciones")
        items_tec_viejo = _obtener_items_requeridos("tecnico")

        self.assertEqual(len(items_dir), 25)
        self.assertEqual(len(items_contable), 22)
        self.assertEqual(len(items_oper), 22)
        self.assertEqual(len(items_tec_viejo), 22)

    def test_resolucion_plantilla_administrativos_intacta(self):
        u_yeimy = Usuario(id=34, correo="secretaria@gsbsecurity.com", rol="superadmin")
        u_luisa = Usuario(id=32, correo="auxiliar.operaciones@gsbsecurity.com", rol="superadmin")
        u_claudia = Usuario(id=23, correo="claudia@gsbank.com", rol="superadmin")
        u_tecnico = Usuario(id=50, correo="tec@gsbank.com", rol="tecnico")

        self.assertEqual(_plantilla_para_usuario(u_yeimy), "contable")
        self.assertEqual(_plantilla_para_usuario(u_luisa), "operaciones")
        self.assertEqual(_plantilla_para_usuario(u_claudia), "operaciones")
        # El técnico viejo resuelve "tecnico" (22 items) en el router viejo
        self.assertEqual(_plantilla_para_usuario(u_tecnico), "tecnico")


if __name__ == "__main__":
    unittest.main()
