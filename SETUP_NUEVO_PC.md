# SETUP_NUEVO_PC.md â€” GuÃ­a de recuperaciÃ³n del entorno (GS-VIÃTICOS)

> Documento generado a partir del diagnÃ³stico del repositorio en el nuevo PC.
> Fecha de diagnÃ³stico: 2026-10-29.
> **No se instalaron ni modificaron programas, ni se alterÃ³ cÃ³digo fuente, ni se borraron datos.** Todos los pasos de instalaciÃ³n son propuestos y deben ejecutarse manualmente.

## 1. Resumen del proyecto

- **Nombre:** gs-viaticos (Sistema Integral de GestiÃ³n GSB)
- **Tipo:** AplicaciÃ³n web Full Stack
- **Backend:** Python 3.14.6 + FastAPI 0.141.1 (uvicorn)
- **Frontend:** React 19.2.8 + Vite 8.2.0
- **Base de datos:** PostgreSQL (Neon, remota) â€” no requiere instalaciÃ³n local
- **Servicios externos:** Cloudinary (evidencias), SMTP Gmail (recuperaciÃ³n de contraseÃ±a)
- **Repositorio:** Git presente en `.git`, pero `git` no estÃ¡ instalado en este PC.

Estructura principal:

```
gs-viaticos/
â”œâ”€â”€ backend/          # FastAPI (app/, alembic/, requirements.txt, .env)
â”œâ”€â”€ frontend/         # React + Vite (package.json, package-lock.json, .env)
â”œâ”€â”€ venv/             # Entorno virtual Python (COPIADO del PC anterior â€” no reutilizable tal cual)
â”œâ”€â”€ .vscode/          # settings.json (gitignored)
â”œâ”€â”€ render.yaml       # Despliegue en Render
â””â”€â”€ CONTEXTO_SISTEMA.md
```

## 2. Versiones requeridas (confirmadas por archivos)

| Herramienta | VersiÃ³n requerida | Fuente de confirmaciÃ³n |
|---|---|---|
| Python | 3.14.6 | `venv/pyvenv.cfg` (`home = C:\Python314`, `version = 3.14.6`) |
| Node.js | ^20.19.0 o >=22.12.0 | `frontend/package-lock.json` (engines de Vite 8.2.0 y @vitejs/plugin-react) |
| npm | lockfileVersion 3 | `frontend/package-lock.json` |
| pip | (incluido con Python) | â€” |

RecomendaciÃ³n: usar **Node.js 22 LTS** (compatible y estable).

## 3. Estado actual del nuevo PC (diagnÃ³stico)

| Componente | Estado | Evidencia |
|---|---|---|
| Python (`python`, `py`) | NO instalado (solo alias de Microsoft Store) | `python --version` â†’ "no se encontrÃ³ Python" |
| Node.js (`node`) | NO instalado / no en PATH | `node --version` â†’ no reconocido |
| npm | NO instalado / no en PATH | `npm --version` â†’ no reconocido |
| Git | NO instalado | `git` â†’ no reconocido |
| `venv/Scripts/python.exe` | Existe pero ROTO | Apunta a `C:\Python314\python.exe` (inexistente) â†’ error "did not find executable" |
| PowerShell ExecutionPolicy | Undefined en todos los scopes (efecto: Restricted) | `Get-ExecutionPolicy -List` |
| `frontend/node_modules` | Presente (copiado) | Puede tener binarios nativos incompatibles |
| `.env` backend | Existe con las claves requeridas | Verificado por existencia (valores no mostrados) |
| `.env` frontend | Existe (`VITE_API_URL=http://127.0.0.1:8000`) | Verificado |
| Base de datos | Remota (Neon) | `DATABASE_URL` en backend/.env |
| Tests automatizados | No existen | No hay pytest/conftest/setup.cfg |

### Origen del venv (importante)

`venv/pyvenv.cfg` indica que se creÃ³ con:

```
command = C:\Python314\python.exe -m venv C:\gs-viaticos\venv
```

Es decir, en el PC anterior el proyecto estaba en `C:\gs-viaticos` y Python en `C:\Python314`.
El venv fue **copiado** al nuevo equipo y sus rutas absolutas ya no son vÃ¡lidas. **No reutilizar directamente.** Se conservarÃ¡ como respaldo hasta crear uno nuevo.

## 4. Problemas detectados (priorizados)

| # | Problema | Causa confirmada / hipÃ³tesis | SoluciÃ³n | Riesgo |
|---|---|---|---|---|
| 1 | Python no instalado | Confirmado | Instalar Python 3.14.x y agregar a PATH | Bajo |
| 2 | venv roto (base inexistente) | Confirmado | Recrear venv con Python 3.14 (conservar el viejo como respaldo) | Medio |
| 3 | Node.js/npm no instalados | Confirmado | Instalar Node.js 22 LTS y agregar a PATH | Bajo |
| 4 | Git no instalado | Confirmado | Instalar Git (opcional, recomendado) | Bajo |
| 5 | ActivaciÃ³n de venv bloqueada por PowerShell | Confirmado (policy Undefinedâ†’Restricted) | Usar Bypass por proceso o CMD; no deshabilitar polÃ­ticas globalmente | Bajo |
| 6 | `node_modules` copiado del PC anterior | HipÃ³tesis (binarios nativos) | Reinstalar con `npm ci` en `frontend/` | Medio |
| 7 | `.env` presente con secretos | Confirmado existencia | No sobrescribir; verificar claves requeridas | Bajo |
| 8 | Sin pruebas automatizadas | Confirmado | ValidaciÃ³n manual de endpoints/UI | Bajo |
## 5. Variables de entorno requeridas (sin valores)

### Backend (`backend/.env`) â€” claves requeridas por `app/core/config.py`

```
DATABASE_URL
SECRET_KEY
ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES
MASTER_KEY
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
RESET_EMAIL_DESTINO
DATABASE_URL_TEST   (opcional, para pruebas)
```

Ejemplo de plantilla: `backend/.env.example`.

### Frontend (`frontend/.env`)

```
VITE_API_URL
```

(ProducciÃ³n usa `frontend/.env.production`.)

> No se imprimen valores. Conservar los `.env` existentes; no sobrescribir.

## 6. Pasos de recuperaciÃ³n (propuestos, no ejecutados)

### 6.1 Instalar Python 3.14.x

OpciÃ³n A (winget), en PowerShell:

```
winget install --id Python.Python.3.14 --source winget
```

OpciÃ³n B: descarga manual desde https://www.python.org/downloads/ (instalador Windows x86-64).
Marcar "Add python.exe to PATH" y "Install for all users" (opcional).
Verificar:

```
python --version
py --version
```

Debe mostrar 3.14.x.

### 6.2 Recrear el entorno virtual (sin borrar el viejo)

Desde la raÃ­z del proyecto:

```
cd "C:\Users\Global Security Bank\Documents\plataforma\gs-viaticos"
python -m venv venv_new
```

Instalar dependencias:

```
.\venv_new\Scripts\python.exe -m pip install --upgrade pip
.\venv_new\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Verificar importaciones:

```
.\venv_new\Scripts\python.exe -c "import fastapi, sqlalchemy, uvicorn; print('OK')"
```

Solo cuando todo funcione, renombrar `venv` â†’ `venv_old` y `venv_new` â†’ `venv`.
Actualizar `.vscode/settings.json` si se cambia la ruta (actualmente apunta a `venv/Scripts/python.exe`).

### 6.3 Instalar Node.js 22 LTS

OpciÃ³n A:

```
winget install --id OpenJS.NodeJS.LTS --source winget
```

OpciÃ³n B: descarga manual desde https://nodejs.org/ (LTS).
Verificar:

```
node --version
npm --version
```

Debe mostrar v22.x y npm 10.x.

### 6.4 Instalar dependencias del frontend

```
cd "C:\Users\Global Security Bank\Documents\plataforma\gs-viaticos\frontend"
npm ci
```

(Usar `npm ci` para respetar `package-lock.json`; usar `npm install` solo si falla.)

### 6.5 Activar entorno sin deshabilitar polÃ­ticas globales

OpciÃ³n recomendada (por proceso):

```
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

Alternativa (CMD):

```
venv\Scripts\activate.bat
```

Alternativa (sin activar, usando el ejecutable directo):

```
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

### 6.6 Instalar Git (opcional pero recomendado)

```
winget install --id Git.Git --source winget
```

Verificar: `git --version`.
## 7. CÃ³mo iniciar la aplicaciÃ³n

### Backend (FastAPI)

Directorio de trabajo: `backend/` (para que cargue `backend/.env`).

```
cd "C:\Users\Global Security Bank\Documents\plataforma\gs-viaticos\backend"
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verificar: abrir http://127.0.0.1:8000/docs (Swagger).

### Frontend (Vite)

```
cd "C:\Users\Global Security Bank\Documents\plataforma\gs-viaticos\frontend"
npm run dev
```

Verificar: abrir http://127.0.0.1:5173.
El frontend usa `VITE_API_URL=http://127.0.0.1:8000` en desarrollo.

### Orden recomendado

1. Iniciar backend y confirmar `/docs`.
2. Iniciar frontend y confirmar carga de la UI.
3. Probar login y un flujo bÃ¡sico (viÃ¡ticos).

## 8. VerificaciÃ³n de servicios externos (sin exponer credenciales)

- **Base de datos (Neon):** el backend ejecuta migraciones/alteraciones en startup. Si falla la conexiÃ³n, revisar `DATABASE_URL` en `backend/.env` y conectividad a internet. No exponer la URL.
- **Cloudinary:** verificar que `CLOUDINARY_*` estÃ©n presentes. Probar subida de evidencia.
- **SMTP:** verificar `SMTP_USER`/`SMTP_PASSWORD`. Probar recuperaciÃ³n de contraseÃ±a.

## 9. Problemas frecuentes y soluciones

| SÃ­ntoma | Causa probable | SoluciÃ³n |
|---|---|---|
| `Activate.ps1` bloqueado | ExecutionPolicy Restricted | Usar `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` o CMD |
| `python` abre Microsoft Store | Alias de ejecuciÃ³n activo | Instalar Python real y desactivar el alias en ConfiguraciÃ³n > Aplicaciones |
| `node`/`npm` no reconocidos | No instalados o PATH no actualizado | Reinstalar y reiniciar la terminal/VS Code |
| `uvicorn` no encuentra `.env` | CWD incorrecto | Ejecutar desde `backend/` |
| Error de conexiÃ³n a BD | `DATABASE_URL` invÃ¡lido o red | Verificar `.env` y conectividad; no exponer la URL |
| MÃ³dulos nativos fallan (psycopg2, pandas) | Python incompatible o wheels faltantes | Usar Python 3.14.x y reinstalar dependencias |
| Frontend no conecta al backend | `VITE_API_URL` incorrecto o backend apagado | Verificar `.env` y que el backend estÃ© en 8000 |

## 10. Dependencias externas necesarias

- ConexiÃ³n a internet (Neon, Cloudinary, npm, pip).
- Cuenta/servicio Neon PostgreSQL (ya configurado en `.env`).
- Cuenta Cloudinary (ya configurado en `.env`).
- Cuenta Gmail con contraseÃ±a de aplicaciÃ³n para SMTP (ya configurado en `.env`).
- (Opcional) Git para control de versiones.

## 11. Notas de seguridad

- No se imprimen ni almacenan secretos en este documento.
- No se sobrescriben `.env`.
- No se borran bases de datos, migraciones ni archivos subidos.
- El venv antiguo (`venv/`) se conserva como respaldo; no eliminar hasta validar el nuevo.
- No se desactivan antivirus ni polÃ­ticas corporativas.

---
*GuÃ­a generada en modo diagnÃ³stico. Los comandos de instalaciÃ³n no se han ejecutado en este PC; verificar cada paso antes de continuar.*


## 12. Paso 1 – Herramientas instaladas

- **Fecha de ejecución:** 2026-10-29
- **Estado:** Completado exitosamente.

### Herramientas base instaladas

| Herramienta | Versión instalada | Ruta | Método de instalación | Estado |
|---|---|---|---|---|
| **Git for Windows** | 2.56.0.windows.3 | `C:\Program Files\Git\cmd\git.exe` | winget (`Git.Git`, oficial git-scm.com) | OK |
| **Python** | 3.14.7 | `C:\Users\Global Security Bank\AppData\Local\Programs\Python\Python314\python.exe` | winget (`Python.Python.3.14`, oficial python.org) | OK |
| **py launcher** | 3.14 (`-V:3.14 *`) | `C:\Users\Global Security Bank\AppData\Local\Programs\Python\Launcher\py.exe` | Incluido con instalador oficial de Python | OK |
| **pip** | 26.2.1 | `C:\Users\Global Security Bank\AppData\Local\Programs\Python\Python314\Lib\site-packages\pip` | Incluido con Python 3.14 | OK |
| **Node.js** | 22.23.4 (LTS) | `C:\Program Files\nodejs\node.exe` | winget (`OpenJS.NodeJS.22`, oficial nodejs.org) | OK |
| **npm** | 10.9.9 | `C:\Program Files\nodejs\npm.cmd` | Incluido con Node.js 22 | OK |

### Decisión de versión de Python y justificación

Se verificó contra la API JSON de PyPI (`https://pypi.org/pypi/<paquete>/<version>/json`) la disponibilidad de wheels precompilados para la arquitectura Windows x64 (`win_amd64`) en Python 3.14 (`cp314`):
- `psycopg2-binary`: Dispone de wheels `cp314` oficiales (`2.9.12` y `2.9.13`).
- `pandas`: Dispone de wheels `cp314` oficiales (`3.0.5` y `3.1.0`).
- `Pillow`: Dispone de wheels `cp314` oficiales (`12.3.0` y `13.0.0`).
- `numpy`: Dispone de wheels `cp314` oficiales (`2.5.1` y `2.5.4`).

Dado que el 100% de los paquetes nativos críticos disponen de wheels precompilados para `cp314` y `win_amd64`, se adoptó la regla de instalar la versión moderna y estable: **Python 3.14.7**.


## 13. Paso 2 – Entorno backend

- **Fecha de ejecución:** 2026-10-29
- **Estado:** Completado exitosamente.

### Acciones ejecutadas

1. **Extracción de versiones del venv anterior (respaldo intacto):**
   - Se leyeron las carpetas `*.dist-info` de `venv/Lib/site-packages` y se generó `backend/requirements.freeze_old.txt` con los 55 paquetes exactos que funcionaban en el PC previo.
   - Se confirmó que el 100% de los paquetes listados en `backend/requirements.txt` estaban presentes en el entorno anterior (0 ausentes).
2. **Creación del entorno virtual limpio (`venv_new`):**
   - Comando: `python -m venv venv_new`
   - Python verificado: `Python 3.14.7`
3. **Instalación de paquetes con versiones exactas:**
   - Comando: `.\venv_new\Scripts\python.exe -m pip install -r backend\requirements.freeze_old.txt --only-binary=:all: --no-binary=cloudinary`
   - Nota técnica: Se utilizó `--only-binary=:all:` para garantizar que ningún paquete requiriera compiladores locales de C/C++; únicamente se exceptuó `cloudinary==1.40.0` mediante `--no-binary=cloudinary` debido a que en PyPI solo existe como distribución de código fuente (`sdist`), siendo un paquete de Python puro sin binarios compilados.
4. **Verificación y validación:**
   - `pip check`: `No broken requirements found.`
   - `pip freeze`: Generado en `backend/requirements.lock.txt` (54 paquetes con paridad exacta 1:1 con el entorno anterior).
   - Prueba de humo de importaciones: `import fastapi, sqlalchemy, alembic, uvicorn, psycopg2, pandas, PIL, cloudinary` -> `OK`.


## 14. Paso 3 – Entorno frontend

- **Fecha de ejecución:** 2026-10-29
- **Estado:** Completado exitosamente.

### Acciones ejecutadas

1. **Verificación previa:**
   - Confirmada presencia de `frontend/package.json` y `frontend/package-lock.json` (lockfileVersion 3).
   - Node.js `v22.23.4` y npm `10.9.9` validados contra los requerimientos de motores (`engines`) de Vite 8.
   - Estado inicial de `frontend/node_modules`: 15.965 archivos (~168.44 MB) heredados del PC previo.
2. **Reconstrucción limpia (`npm.cmd ci`):**
   - Ejecutado en `frontend/`: `npm.cmd ci`
   - Reconstrucción total completada en 1 minuto (249 paquetes añadidos, 250 auditados).
   - Sin ejecución de comandos de modificación (`audit fix`, `install`, etc.).
3. **Validación de dependencias y compilación:**
   - `npm.cmd ls --depth=0`: `react@19.2.8`, `react-dom@19.2.8`, `vite@8.2.0`, `react-router-dom@7.18.2` consistentes al 100% con el lockfile.
   - `npm.cmd run build`: Compilación exitosa en 1.60s (996 módulos transformados), generando la carpeta `frontend/dist` con 22 archivos (~4.27 MB).
   - `npm.cmd run lint`: Ejecutado para registro diagnóstico (91 observaciones preexistentes en código, 80 errores / 11 warnings; sin modificaciones aplicadas).
4. **Auditoría de .gitignore (diagnóstico):**
   - Se identificó que `venv_new/` y `venv_old/` no están cubiertos en el `.gitignore` raíz y deben añadirse posteriormente.


## 15. Paso 4 – Validación

- **Fecha de ejecución:** 2026-10-29
- **Estado:** Servidores levantados y validados vía HTTP 200; listos para pruebas manuales de usuario.

### Acciones ejecutadas

1. **Verificación previa:**
   - Punto de entrada backend: `app.main:app` (FastAPI).
   - Configuración CORS: `http://localhost:5173`, `http://127.0.0.1:5173` y regex local/onrender expresamente permitidos.
   - Variables de entorno: Confirmada existencia de `backend/.env` (14 variables requeridas) y `frontend/.env` (`VITE_API_URL=http://127.0.0.1:8000`).
2. **Arranque del Backend (FastAPI / Uvicorn):**
   - Comando: `..\venv_new\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000` (desde `backend/`).
   - Salida: Proceso iniciado limpiamente, eventos de startup completados (`startup_validar_escuela` y `startup_db_check` con conexión exitosa a Neon).
   - Respuesta HTTP: `http://127.0.0.1:8000/docs` respondió `200 OK`. `openapi.json` respondió `200 OK`.
3. **Arranque del Frontend (Vite / React 19):**
   - Comando: `npm.cmd run dev` (desde `frontend/`).
   - Salida: Vite 8.2.0 listo en 627 ms en `http://localhost:5173/` y `http://127.0.0.1:5173/`.
   - Respuesta HTTP: `http://127.0.0.1:5173` respondió `200 OK`.
