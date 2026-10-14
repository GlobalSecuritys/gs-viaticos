import json
import os
import subprocess
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND_JSON_PATH = os.path.join(ROOT_DIR, "backend", "app", "core", "plantillas_evaluacion.json")
FRONTEND_JS_PATH = os.path.join(ROOT_DIR, "frontend", "src", "data", "plantillasEvaluacion.js")


class TestPlantillasSincronizadas(unittest.TestCase):
    def setUp(self):
        self.assertTrue(os.path.exists(BACKEND_JSON_PATH), f"No existe {BACKEND_JSON_PATH}")
        self.assertTrue(os.path.exists(FRONTEND_JS_PATH), f"No existe {FRONTEND_JS_PATH}")

        with open(BACKEND_JSON_PATH, "r", encoding="utf-8") as f:
            self.backend_data = json.load(f)

        # Cargar frontend usando node
        node_script = (
            "const p = require("
            + json.dumps(FRONTEND_JS_PATH.replace("\\", "/"))
            + "); process.stdout.write(JSON.stringify(p.PLANTILLAS_EVALUACION || p));"
        )
        res = subprocess.run(["node", "-e", node_script], capture_output=True, text=True, encoding="utf-8", check=True)
        self.frontend_data = json.loads(res.stdout)

    def test_todas_las_plantillas_existen_en_ambos(self):
        backend_keys = set(self.backend_data.keys())
        frontend_keys = set(self.frontend_data.keys())
        self.assertEqual(
            backend_keys,
            frontend_keys,
            f"Diferencia de plantillas: Backend tiene {backend_keys - frontend_keys}, Frontend tiene {frontend_keys - backend_keys}",
        )

    def test_tecnico_adfr35_estructura_identica(self):
        self.assertIn("tecnico_adfr35", self.backend_data)
        self.assertIn("tecnico_adfr35", self.frontend_data)

        b_adfr35 = self.backend_data["tecnico_adfr35"]
        f_adfr35 = self.frontend_data["tecnico_adfr35"]

        self.assertEqual(b_adfr35["id"], "tecnico_adfr35")
        self.assertEqual(f_adfr35["id"], "tecnico_adfr35")
        self.assertEqual(b_adfr35["encabezado"]["codigo"], "AD-FR-35")
        self.assertEqual(f_adfr35["encabezado"]["codigo"], "AD-FR-35")

        # Verificar 3 secciones
        self.assertEqual(len(b_adfr35["secciones"]), 3)
        self.assertEqual(len(f_adfr35["secciones"]), 3)

        # Extraer items exactos
        b_items = [(it["numero"], it["texto"]) for sec in b_adfr35["secciones"] for it in sec["items"]]
        f_items = [(it["numero"], it["texto"]) for sec in f_adfr35["secciones"] for it in sec["items"]]

        items_esperados = [
            ("1.1", "Puntualidad"),
            ("1.2", "Tiempos de ejecución del servicio (SLA)"),
            ("1.3", "Atención y actitud del servicio"),
            ("1.4", "Uso de los elementos de protección personal"),
            ("1.5", "Calidad del servicio"),
            ("2.1", "Comunicación cliente interno"),
            ("2.2", "Procedimientos administrativos (manejo de plataforma de viáticos)"),
            ("2.3", "Manejo de inventario"),
            ("2.4", "Manejo de la plataforma de ODS"),
            ("2.5", "Procedimientos administrativos (cuentas de cobro - pago de seguridad social)"),
            ("3.1", "Conocimientos técnicos"),
        ]

        self.assertEqual(b_items, items_esperados)
        self.assertEqual(f_items, items_esperados)
        self.assertEqual(b_adfr35, f_adfr35, "La plantilla tecnico_adfr35 diverge entre backend y frontend")


if __name__ == "__main__":
    unittest.main()
