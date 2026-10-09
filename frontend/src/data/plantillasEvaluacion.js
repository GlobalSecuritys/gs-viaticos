export const PLANTILLAS_EVALUACION = {
  "directivos": {
    "id": "directivos",
    "nombre": "DIRECTIVOS (DIRECT ADMI)",
    "encabezado": {
      "empresa": "GLOBAL SECURITY BANK SAS",
      "codigo": "AD-FR-06",
      "version": "2",
      "titulo": "EVALUACIÓN DE DESEMPEÑO DIRECTIVOS",
      "fecha_act": "ABRIL 2023",
      "pagina": "1"
    },
    "identificacion": {
      "nombre_label": "NOMBRE",
      "fecha_label": "FECHA",
      "cargo_label": "CARGO",
      "cargo_default": "DIRECTORA ADMINSITRATIVA",
      "evaluador_label": "NOMBRE EVALUADOR"
    },
    "escala_instruccion": "Califique al colaborador utilizando la siguiente escala:",
    "escala": [
      {
        "valor": 4,
        "etiqueta": "Muy Bien",
        "significado": "El empleado cumple muy bien el aspecto a evaluar."
      },
      {
        "valor": 3,
        "etiqueta": "Bueno",
        "significado": "El empleado cumple bien el aspecto a evaluar"
      },
      {
        "valor": 2,
        "etiqueta": "Aceptable",
        "significado": "El empleado cumple aceptablemente el aspecto a evaluar"
      },
      {
        "valor": 1,
        "etiqueta": "Pobre",
        "significado": "El empleado no cumple suficientemente con el aspecto a evaluar"
      }
    ],
    "columnas": {
      "no": "No.",
      "factores": "FACTORES DE EVALUACIÓN",
      "descripcion": "DESCRIPCIÓN",
      "calif_auto": "CALIF. AUTO",
      "calif_jefe": "CALIF JEFE",
      "calif": "CALIF",
      "observacion": "OBSERVACIÓN"
    },
    "pasos_disponibles": ["auto", "eval", "resumen"],
    "requiere_evaluador": true,
    "compromisos_label": "COMPROMISOS GENERADOS",
    "compromisos_cantidad": 4,
    "secciones": [
      {
        "numero": "1",
        "titulo": "1.  DESEMPEÑO",
        "items": [
          {
            "numero": "1.1",
            "texto": "Atención y asesoría al cliente.",
            "descripcion": "Este factor indica en que medida la persona cumple y satisface los requerimientos del cliente interno como externo."
          },
          {
            "numero": "1.2",
            "texto": "Interés e iniciativa en su trabajo.",
            "descripcion": "Este factor considera la capacidad del empleado para crear, sugerir, aportar y llevar a cabo nuevas ideas y proyectos."
          },
          {
            "numero": "1.3",
            "texto": "Disposición para recibir y realizar instrucciones",
            "descripcion": "Este factor señala la disposición del empleado para acatar y ejecutar las órdenes, sugerencias e instrucciones que le imparte su jefe inmediato."
          },
          {
            "numero": "1.4",
            "texto": "Propositividad",
            "descripcion": "Este factor determina la capacidad de mostrar una tendencia hacia la busqueda o propuesta de soluciones ante problemas o conflictos externos o internos de la compañía"
          },
          {
            "numero": "1.5",
            "texto": "Disposición y apertura para el cambio.",
            "descripcion": "Este factor determina la manera o forma en que el empleado recibe las propuestas y sugerencias de mejoramiento y su disposición para poner en práctica."
          },
          {
            "numero": "1.6",
            "texto": "Liderazgo",
            "descripcion": "Este factor determina la capacidad para organizar unidades diferentes en función del logro de fines y estrategias de la institución, generar confianza y desarrollar habilidadesy conocimientos en subordinados, de tal forma que fomentan en ellos mayores ámbitos de acción y responsabilidad"
          },
          {
            "numero": "1.7",
            "texto": "Capacidad de Gestión",
            "descripcion": "Este factor estima la capacidad para planear, organizar, dirigir y controlar las actividades bajo su responsabilidad con el proposito de alcanzar los objetivos de mediano y largo plazo de la organización"
          },
          {
            "numero": "1.8",
            "texto": "Capacidad de decisión",
            "descripcion": "Este factor corresponde a la capacidad de ejecutar una acción adecuada utilizando la facultad de resolver en los ámbitos de trabajo correspondiente"
          },
          {
            "numero": "1.9",
            "texto": "Capacidad de análisis",
            "descripcion": "Este factor estima la capacidad que le permite a un individuo interpretar la información para responder de manera coherente a las diferentes situaciones  que se le presentan en el entorno de trabajo"
          }
        ]
      },
      {
        "numero": "2",
        "titulo": "2. CUMPLIMIENTO DE LAS NORMAS INTERNAS",
        "items": [
          {
            "numero": "2.1",
            "texto": "Cumplimiento de horarios.",
            "descripcion": "Este factor considera la puntualidad del empleado para iniciar y cumplir con su jornada laboral."
          },
          {
            "numero": "2.2",
            "texto": "Respeto a las líneas de mando y acatamiento de normas y reglamento interno.",
            "descripcion": "Este factor establece la disposición para tratar, dirigirse y obedecer a sus superiores, además de su disposición para acatar ordenes."
          }
        ]
      },
      {
        "numero": "3",
        "titulo": "3.  CAPACITACIÓN Y EL ENTRENAMIENTO",
        "items": [
          {
            "numero": "3.1",
            "texto": "Habilidad y Disposición para el reentrenamiento y la capacitación",
            "descripcion": "Grado de receptividad, asimilación y desenvolvimiento para aplicar los conocimientos adquiridos."
          },
          {
            "numero": "3.2",
            "texto": "Capacidad para transmitir conocimientos adquiridos.",
            "descripcion": "Este factor indica la capacidad del empleado para trasmitir y explicar la aplicación de los conocimientos que ha adquirido, a sus compañeros."
          },
          {
            "numero": "3.3",
            "texto": "Iniciativa y realización de programas de autocapacitación.",
            "descripcion": "Este factor indica el interés y la preocupación del empleado, en desarrollar por iniciativa propia, programas de capacitación que le permitan su crecimiento intelectual, aplicados a su vida laboral y personal"
          }
        ]
      },
      {
        "numero": "4",
        "titulo": "4.  COMPROMISO CON EL SISTEMA DE GESTIÓN INTEGRAL",
        "items": [
          {
            "numero": "4.1",
            "texto": "Cumplimiento y diligenciamiento de documentos del proceso de calidad",
            "descripcion": "Este factor evalúa el grado de empleado del empleado con el desarrollo eficaz del Sistema de Gestión de la Calidad."
          },
          {
            "numero": "4.2",
            "texto": "Capacidad de iniciativa para el mejoramiento de los procesos.",
            "descripcion": "Este factor evalúa el interés del empleado por generar y proponer nuevas estrategias y metodologías para incrementar la eficiencia y la productividad en el desarrollo de sus labores."
          },
          {
            "numero": "4.3",
            "texto": "Participación de las actividades de intervención del SGSST y cumplimiento de las responsabilidades del SGSST",
            "descripcion": "Este factor evalúa el grado de compromiso del empleado con el desarrollo eficaz del Sistema de Gestión de Seguridad y Salud en el Trabajo. Tiene en cuenta el conocimiento de las políticas, la participación en las actividades de prevención, el cumplimiento de sus responsabilidades según rol frente al SGSST."
          }
        ]
      },
      {
        "numero": "5",
        "titulo": "5.  HABILIDADES PERSONALES",
        "items": [
          {
            "numero": "5.1",
            "texto": "ATENCION AL CLIENTE",
            "descripcion": "Valora el cliente, le interesa satisfacerlo y tiende a agregar valor para conservarlo."
          },
          {
            "numero": "5.2",
            "texto": "COMUNICACIÓN Y NEGOCIACIÓN",
            "descripcion": "Buena expresión verbal, facilidad para expresar sus ideas de forma clara precisa y coherente. Crea un ambiente de confianza con el cliente y lo compromete en el negocio"
          },
          {
            "numero": "5.3",
            "texto": "TRABAJO EN EQUIPO",
            "descripcion": "Conoce el objetivo de trabajar en equipo, aporta para la consecución de metas comunes, busca llegar a acuerdos, apoya a los demás cuando lo requieren."
          },
          {
            "numero": "5.4",
            "texto": "VERIFICACIÓN Y CONTROL",
            "descripcion": "Presta atención a cada uno de los detalles para garantizar la calidad de la información y de los procesos que recibe y entrega, compara datos y se asegura que estén correctos."
          },
          {
            "numero": "5.5",
            "texto": "RECURSIVIDAD",
            "descripcion": "Busca diferentes alternativas para solucionar los inconvenientes que se presentan, tiende a actuar con creatividad."
          },
          {
            "numero": "5.6",
            "texto": "RESPONSABILIDAD Y COMPROMISO",
            "descripcion": "Asume con seriedad el trabajo entregado, conoce la importancia de cumplir en el momento indicado, se esfuerza por lograr las metas requeridas."
          },
          {
            "numero": "5.7",
            "texto": "ORIENTACIÓN AL MEJORAMIENTO CONTÍNUO",
            "descripcion": "Le gusta aprender nuevas cosas, busca diferentes alternativas para aportar a su mejoramiento, busca superación en las diferentes áreas."
          },
          {
            "numero": "5.8",
            "texto": "CAPACIDAD PARA ESTABLECER PRIORIDADES",
            "descripcion": "Diferencia lo realmente importante y de esta manera establece prioridades en su trabajo."
          }
        ]
      }
    ]
  },
  "contable": {
    "id": "contable",
    "nombre": "OPERATIVOS (AUXILIAR CONTA)",
    "encabezado": {
      "empresa": "GLOBAL SECURITY BANK SAS ",
      "codigo": "AD-FR-06",
      "version": "2",
      "titulo": "EVALUACIÓN DE DESEMPEÑO",
      "fecha_act": "Septiembre 2024",
      "pagina": "1 de 1"
    },
    "identificacion": {
      "nombre_label": "NOMBRE:",
      "fecha_label": "FECHA:",
      "cargo_label": "CARGO:",
      "cargo_default": "AUXILIAR CONTABLE ",
      "evaluador_label": "NOMBRE EVALUADOR:",
      "nombre_default": "Yeimy Rocio Riaño",
      "cedula_label": "CC",
      "cedula_default": "1014202829"
    },
    "escala_instruccion": "Califique al empleado utilizando la siguiente escala:",
    "escala": [
      {
        "valor": 4,
        "etiqueta": "Muy bueno",
        "significado": "El empleado cumple sobradamente el aspecto a evaluar."
      },
      {
        "valor": 3,
        "etiqueta": "Bueno",
        "significado": "El empleado cumple bien el aspecto a evaluar"
      },
      {
        "valor": 2,
        "etiqueta": "Medio",
        "significado": "El empleado cumple suficientemente el aspecto a evaluar"
      },
      {
        "valor": 1,
        "etiqueta": "Pobre",
        "significado": "El empleado no cumple suficientemente con el aspecto a evaluar"
      }
    ],
    "columnas": {
      "no": "No.",
      "factores": "FACTORES DE EVALUACIÓN",
      "descripcion": "DESCRIPCIÓN",
      "calif_auto": "CALIF. COLABORADOR",
      "calif_jefe": "CALF EVALUADOR",
      "calif": "CALIF. DEFINITIVA",
      "observacion": "OBSERVACIÓN "
    },
    "pasos_disponibles": ["auto", "eval", "resumen"],
    "requiere_evaluador": true,
    "compromisos_label": "COMPROMISOS GENERADOS",
    "compromisos_cantidad": 8,
    "secciones": [
      {
        "numero": "1",
        "titulo": "1.  DESEMPEÑO ",
        "items": [
          {
            "numero": "1.1",
            "texto": "Cumplimiento de funciones y responsabilidades del cargo",
            "descripcion": "Este factor indica en que medida el colaborador entiende y  cumple satisfactoriamente las funciones y responsabilidades de su cargo"
          },
          {
            "numero": "1.2",
            "texto": "Organización en el área de trabajo",
            "descripcion": "Este factor indica en que medida el colaborador es organizado en su área de trabajo y con respecto a la información que entrega de una manera confiable y oportuna"
          },
          {
            "numero": "1.3",
            "texto": "Objetivos en su área de trabajo",
            "descripcion": "Este factor indica en que medida el colaborador conoce los objetivos de su área y aporta para la consecución de los mismos"
          },
          {
            "numero": "1.4",
            "texto": "Atención al cliente externo y/o interno",
            "descripcion": "Este factor indica en que medida el colaborador cumple y satisface los requerimientos del cliente y sus compañeros de trabajo"
          },
          {
            "numero": "1.5",
            "texto": "Interés e iniciativa en su trabajo.",
            "descripcion": "Este factor considera la capacidad del empleado para crear, sugerir, aportar y llevar a cabo nuevas ideas y proyectos."
          },
          {
            "numero": "1.6",
            "texto": "Colaboración que ofrece a sus superiores y compañeros.",
            "descripcion": "Este factor señala la colaboración que el empleado presta a los superiores o compañeros, tanto a los que tienen que ver directamente con su trabajo, como a los que indirectamente se relacionan con él."
          },
          {
            "numero": "1.7",
            "texto": "Disposición y apertura para el cambio.",
            "descripcion": "Este factor determina la manera o forma en que el empleado recibe las propuestas y sugerencias de mejoramiento y su disposición para ponerlas en práctica."
          },
          {
            "numero": "1.8",
            "texto": "Presentación personal durante el trabajo.",
            "descripcion": "Este factor valora la presentación personal del colaborador en cuanto a uniforme si lo tiene o no."
          },
          {
            "numero": "1.9",
            "texto": "Procedimientos del cargo",
            "descripcion": "Este factor evalúa el desempeño frente al cumplimiento de los procedimientos específicos de su cargo"
          }
        ]
      },
      {
        "numero": "2",
        "titulo": "2. CUMPLIMIENTO DE LAS NORMAS INTERNAS ",
        "items": [
          {
            "numero": "2.1",
            "texto": "Cumplimiento de horarios.",
            "descripcion": "Este factor considera la puntualidad del empleado para iniciar y cumplir con su jornada laboral."
          },
          {
            "numero": "2.2",
            "texto": "Respeto a las líneas de mando y acatamiento de normas y reglamento interno.",
            "descripcion": "Este factor establece la disposición para tratar, dirigirse y obedecer a sus superiores, además de su disposición para acatar ordenes."
          }
        ]
      },
      {
        "numero": "3",
        "titulo": "3.  CAPACITACIÓN Y EL ENTRENAMIENTO",
        "items": [
          {
            "numero": "3.1",
            "texto": "Iniciativa y realización de programas de capacitación.",
            "descripcion": "Este factor indica el interés y la preocupación del empleado, en desarrollar por iniciativa propia, programas de capacitación que le permitan su crecimiento intelectual, aplicados a su vida laboral y personal. También tiene en cuenta la participación activa dentro de los programas de capacitación establecidos por la organización y la aplicación de los conceptos dados allí en las labores cotidianas desarrolladas en su lugar del trabajo."
          }
        ]
      },
      {
        "numero": "4",
        "titulo": "4.  COMPROMISO CON EL SISTEMA DE GESTIÓN INTEGRAL",
        "items": [
          {
            "numero": "4.1",
            "texto": "Cumplimiento y diligenciamiento de documentos del Sistema Gestion Calidad",
            "descripcion": "Este factor evalúa el grado de compromiso del empleado con el desarrollo eficaz del Sistema de Gestión de la Calidad. Tiene en cuenta el diligenciamiento de formatos, cumplimiento de procedimientos, conocimiento de las politicas y objetivos establecidos, entre otros aspectos."
          },
          {
            "numero": "4.2",
            "texto": "Participación de las actividades de intervención del SGSST y cumplimiento de las responsabilidades del SGSST",
            "descripcion": "Este factor evalúa el grado de compromiso del empleado con el desarrollo eficaz del Sistema de Gestión de Seguridad y Salud en el Trabajo. Tiene en cuenta el conocimiento de las políticas, la participación en las actividades de prevención, el cumplimiento de sus responsabilidades según rol frente al SGSST."
          }
        ]
      },
      {
        "numero": "5",
        "titulo": "5.  HABILIDADES PERSONALES",
        "items": [
          {
            "numero": "5.1",
            "texto": "Trabajo en equipo",
            "descripcion": "Este factor evalua si el colaborador conoce el objetivo de trabajar en equipo, aporta para la consecución de metas comunes, busca llegar a acuerdos, apoya a los demás cuando lo requieren."
          },
          {
            "numero": "5.2",
            "texto": "Adaptación al cambio",
            "descripcion": "Este factor evalua en que medida el colaborador se adapta facilmente cuando cambian los procedimientos de su área y cómo los pone en práctica."
          },
          {
            "numero": "5.3",
            "texto": "Actitud laboral",
            "descripcion": "Este factor evalua la actitud del colaborador frente a prioridades, presiones, cambios e instrucciones requeridas en la ejecución de sus funciones y responsabilidades"
          },
          {
            "numero": "5.4",
            "texto": "Verificación y control",
            "descripcion": "Este factor evalua si el colaborador presta atención a cada uno de los detalles para garantizar la calidad de la información de los procesos que recibe y entrega, compara datos y se asegura que estén correctos."
          },
          {
            "numero": "5.5",
            "texto": "Recursividad",
            "descripcion": "Este factor evalua si el colaborador busca diferentes alternativas para solucionar los inconvenientes que se presentan, tiende a actuar con creatividad."
          },
          {
            "numero": "5.6",
            "texto": "Responsabilidad y compromiso",
            "descripcion": "Este factor evalua si el colaborador asume con seriedad el trabajo entregado, conoce la importancia de cumplir en el momento indicado y se esfuerza por lograr las metas requeridas."
          },
          {
            "numero": "5.7",
            "texto": "Orientación al mejoramiento contínuo",
            "descripcion": "Este factor evalua si al colaborador le gusta aprender nuevas cosas, busca diferentes alternativas para aportar a su mejoramiento, busca superación en las diferentes áreas."
          },
          {
            "numero": "5.8",
            "texto": "Comunicación y negociación",
            "descripcion": "Este factor evalua si al colaborador tiene buena expresión verbal, facilidad para  llegar a acuerdos y expresar sus ideas de forma clara, precisa y coherente."
          }
        ]
      }
    ]
  }
};

export default PLANTILLAS_EVALUACION;
