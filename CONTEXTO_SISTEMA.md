# CONTEXTO_SISTEMA — Ecosistema GS-Viáticos

> Documento de contexto generado **exclusivamente a partir de la lectura del código** del repositorio (frontend React + Vite y backend FastAPI). No refleja planes, historial de conversación ni supuestos; cualquier afirmación aquí es verificable en el código (referencias `archivo:línea`).
>
> Fecha de revisión: basada en el estado del working tree (rama `main`). Cambios posteriores pueden desactualizar este documento.

---

## 1. ROLES DE USUARIO

### 1.1 Modelo de base de datos

El modelo `Usuario` (`backend/app/models/usuario.py`) guarda el rol como **string** en la columna `rol VARCHAR(20)` con `server_default="tecnico"` (`usuario.py:19`). **No existe un enum** en BD; el rol es texto libre validado en las capas de schema/backend.

Columnas relevantes de `usuarios`:
| Columna | Tipo / default | Línea | Nota |
|---|---|---|---|
| `rol` | `String(20)`, default `tecnico` | `usuario.py:19` | Valor de rol |
| `activo` | `Boolean`, default `true` | `usuario.py:20` | Estado de cuenta |
| `acceso_viaticos` | `Boolean`, default `false` | `usuario.py:21` | Acceso al módulo Viáticos |
| `es_admin_calidad` | `Boolean`, default `false` | `usuario.py:22` | Residuo del sistema antiguo de edición SGC |
| `acceso_mapa` | `Boolean`, default `false` | `usuario.py:23` | **Flag obsoleto/legacy** (ver 2.8) |
| `rol_mapa` | `String(20)`, default `lector` | `usuario.py:24` | Residuo del sistema antiguo; seteados pero sin efecto real |

### 1.2 Roles que existen realmente

El rol `'admin'` fue **eliminado** y migrado a `superadmin` (ver `backend/app/main.py:71-106` `_migrar_rol_admin_a_superadmin` y `backend/alembic/versiones/0012_add_acceso_viaticos_y_migrar_admins.py`). Los roles válidos actuales:

| Rol en BD | UI muestra | Creado/validado en | Qué puede hacer (verificado) |
|---|---|---|---|
| **`tecnico`** | "Técnico" | Creación: `admin.py:105`; `auth.py registro` usa `rol="tecnico"`. Validación en schemas (`usuario.py:40-41`) | Solo lectura de su dashboard de viáticos, crear sus propios viáticos y evidencias (`viaticos.py` exige `get_current_user`), consultar sus asignaciones activas (`asignaciones.py` router_tecnico), acceder al Hub y al Mapa SGC. **No** puede: entrar a rutas admin (`AdminRoute.jsx:9`), ver KPIs de administración, gestionar usuarios. |
| **`superadmin`** | "Administrador" (y "👑 Master" si es PilarAdmin) | Es el único rol que `get_current_admin` acepta (`security.py:95`). Validación en `usuario.py:38-39,103-104` | Acceso a paneles admin/dashboard de viáticos y demás módulos aptos, gestión de usuarios, ver auditoría, respaldos, calidad de procesos. Es el objetivo de los "Accesos por Proceso" (ver 2.3). |
| **`admin`** | (no debería existir) | **Ya no se crea ni valida.** Solo referencias residuales (ver §6). | Eliminado del sistema. `main.py:71-106` y `schemas/usuario.py:38,103` lo convierten en `superadmin` al detectarlo. |

> **Master**: no es un rol de BD. "Master" es el usuario `pilaradmin@gsbank.com`, detectado por correo (`security.py:117,144`, `esPilarAdmin` en `permisos.js:27-31`, `isAdminMaster` en `modulesConfig.js:265-267`). Tiene privilegios exclusivos sobre Accesos por Proceso y sobre el acceso a Viáticos.

### 1.3 Inconsistencias de roles encontradas

- **`LABEL_CARGO`** (`frontend/src/utils/personal.js:20-24`) aún lista `admin: 'Administrador'` y `superadmin: 'Super Administrador'`. El rol `admin` ya no existe, y "Super Administrador" contradice la convención UI de mostrar "Administrador" para `superadmin` (p.ej. `AdminUsuarios.jsx:211`).
- **`AdminRoute.jsx:9`**, **`GlobalHeader.jsx:190`**, **`modulesConfig.js:58,110,213,324,405,450`**: comprobaciones `user?.rol === 'admin' || ...` → referencia residual al rol `admin` eliminado.
- **`admin.py:72`** (`bootstrap_admin`): asigna `usuario.rol = "admin"` → escribe un valor de rol ya no válido (quedará `'admin'` hasta que el startup lo migre de nuevo).

---

## 2. SISTEMAS DE PERMISOS

Existen **varios mecanismos de control de acceso** superpuestos. Se enumeran todos.

### 2.1 Acceso genérico autenticado (PrivateRoute / get_current_user)
- **Qué controla:** que exista usuario autenticado.
- **Frontend:** `PrivateRoute.jsx` (redirige a `/login` si no hay `user`).
- **Backend:** `get_current_user` (`security.py:41-90`) — decodifica el JWT y carga el `Usuario` activo.
- **Estado:** **Activo** (mecanismo base de todo el sistema).

### 2.2 Acceso al Mapa de Procesos SGC
- **Qué controla:** ver el Mapa SGC y sus fichas de detalle (información general de los procesos).
- **Regla real (verificada):** `puedeVerMapa` (`permisos.js:37-39`) retorna `Boolean(user)` → **todo usuario autenticado** puede ver el mapa. En backend, `listar_procesos`, `listar_procesos_por_categoria`, `listar_usuarios_disponibles` y `obtener_detalle_proceso` usan `Depends(get_current_user)` (`calidad_procesos.py:137,190,242,549`). La antigua dependencia `validar_acceso_mapa` fue **eliminada** (ya no existe en `security.py`).
- **Quién puede modificar el mapa (editar procesos, responsables, documentos):** `get_current_admin_calidad` (`security.py:152-164`) → solo PilarAdmin (por correo) o `superadmin`. En frontend, `puedeEditarMapa`/`esAdminCalidad` (`permisos.js:45-56`) = `esPilarAdmin || user.rol === 'superadmin'`.
- **Dónde se define:** `security.py`, `permisos.js`, `admin.py`.
- **Estado:** **Activo** (lectura automática; edición requiere superadmin/Pilar).
### 2.3 Accesos por Proceso (módulos operativos dentro de cada ficha SGC)
- **Qué controla:** el acceso a los **módulos operativos / tarjetas internas** asociados a cada proceso (ej. Viáticos en Operaciones, Talento Humano/Backup). Niveles: `admin` (Administrador de Sección), `lector` (Lector de Sección), `ninguno` (sin acceso).
- **Quién puede modificarlo:** **exclusivamente PilarAdmin** (`get_current_pilar_admin`, `security.py:139-149`), vía el panel `PanelRolesAdminsMapa.jsx` (solo se renderiza para `esPilarAdmin`, `:97-99`).
- **Dónde se define (backend):** tabla `procesos_calidad_accesos_admin` (modelo `calidad_procesos.py:112-147`), endpoints `GET/PUT /calidad-procesos/accesos-proceso` (`calidad_procesos.py:368,438`). El listado de procesos está en `PROCESOS_ACCESO_MAP` (`calidad_procesos.py:351-363`). Niveles válidos: `{admin, lector, ninguno}` (`:365`).
- **Dónde se usa (frontend):** `esAdministradorSeccion`, `esLectorSeccion`, `tieneAccesoSeccion` (`permisos.js:73-93`) leen **exclusivamente** `user.accesos_procesos[codigo]`.
- **Sincronización OP→Viáticos:** al cambiar el acceso a `OP`, el backend sincroniza `target_user.acceso_viaticos = (nivel in ('admin','lector'))` (`calidad_procesos.py:500-502`). La UI de viáticos gatea con `acceso_viaticos` (`AdminRoute.jsx:15`, `modulesConfig.js:58,324`), pero este flag **NO se valida en los endpoints backend de viáticos** (ver §6.4).
- **Estado:** **Activo** (es el mecanismo operativo principal para módulos).
- **Nota de arquitectura (documentada en código):** el "Lector SGC" del mapa sí puede abrir fichas de detalle documental; el "Lector de Sección" de un módulo operativo NO puede abrir las tarjetas internas de detalle.

### 2.4 Acceso administrativo global (get_current_admin / AdminRoute)
- **Qué controla:** rutas `/admin/*`, `/superadmin`, `/admin/usuarios`, `/admin/auditoria`, `/admin/backup`, asignaciones admin.
- **Backend:** `get_current_admin` (`security.py:92-100`) exige `rol == 'superadmin'`.
- **Frontend:** `AdminRoute.jsx` exige `user.rol` en {`admin`, `superadmin`} (pero `admin` está eliminado → efectivamente `superadmin`).
- **Estado:** **Activo**.

### 2.5 Exclusivo Superadmin (get_current_superadmin)
- **Qué controla:** auditoría (`GET /admin/auditoria`) y `AdminRoute requireSuperadmin`.
- **Backend:** `get_current_superadmin` (`security.py:102-110`).
- **Frontend:** `AdminRoute.jsx:12-14`.
- **Estado:** **Activo**.

### 2.6 Exclusivo Master/Pilar (get_current_master_admin, get_current_pilar_admin)
- **Qué controla:** solo `pilaradmin@gsbank.com`. `get_current_master_admin` (`security.py:112-122`) se usa en `PUT /admin/usuarios/{id}/acceso-viaticos` (`admin.py:283-316`). `get_current_pilar_admin` (`security.py:139-149`) protege los endpoints de accesos-proceso y permisos-admins del mapa.
- **Estado:** **Activo**.
- **Duplicación de mecanismos:** `get_current_master_admin` y `get_current_pilar_admin` son lógicamente idénticos (validar `pilaradmin@gsbank.com`) separados solo por el mensaje de error. Ver §6.

### 2.7 Blindaje sobre la cuenta Master (verificar_autoridad_sobre_usuario)
- **Qué controla:** ningún administrador puede modificar/desactivar/eliminar la cuenta `pilaradmin@gsbank.com`.
- **Dónde:** `security.py:124-137`, invocado en varias rutas admin.
- **Estado:** **Activo**.

### 2.8 Sistema "legacy" de acceso al mapa (acceso_mapa / rol_mapa / es_admin_calidad)
- **Qué controla:** era el mecanismo antiguo para autorizar acceso/edición del SGC.
- **Estado:** **Obsoleto / parcialmente activo**. Los campos `acceso_mapa` y `rol_mapa` aún se setean como columnas y se leen/emiten en schemas, pero ya **no** se usan para autorizar el acceso al mapa (que hoy es automático). `es_admin_calidad`/`rol_mapa` ya no se leen en `puedeEditarMapa`/`get_current_admin_calidad` (sustituidos por `user.rol === 'superadmin'`). Columnas en `usuario.py:22-24` y `main.py:46-50`.

### 2.9 Mecanismo "Bloque Antiguo" de permisos de operaciones (permiso_operaciones)
- **Qué controlaba:** el acceso a Operaciones como campo separado en el JWT/`/me`.
- **Estado:** **Eliminado**. Ya no existe `permiso_operaciones` en el JWT (`auth.py`), en `get_current_user` (`security.py`, sin `_permiso_operaciones`), ni en `schemas/usuario.py`. Las funciones de sección leen solo `accesos_procesos`. No queda referencia en `frontend/src` ni en `backend/app` (grep sin coincidencias).

---

## 3. MÓDULOS Y PROCESOS

### 3.1 Procesos del Mapa SGC

El seed siembra **8 procesos** (`PROCESOS_INICIALES`, `calidad_procesos.py:44-113`), la tabla `procesos_calidad`. `PROCESOS_ACCESO_MAP` define esos mismos 8 (`calidad_procesos.py:351-363`):

| Código | Nombre | Categoría | ¿Tiene módulo funcional? | Módulo operativo asociado |
|---|---|---|---|---|
| `GR` | Gerencia | Dirección | No (placeholder) | — |
| `MC` | Mejora Continua | Dirección | **Sí (parcial)** | Backup & Evidencias (`MODULOS_SGC_ASOCIADOS.MC`, `modulesConfig.js:371-407`) |
| `CO` | Comercial | Misional | No | — |
| `CI` | Compras e Inventario | Misional | No (hay card "Inventario" hardcodeada en UI) | — |
| `OP` | Operaciones | Misional | **Sí** | Viáticos (`/admin`) y Autoplaner ODS (`/autoplaner-ods`, placeholder) |
| `SA` | Ambiental | Apoyo | No | — |
| `AD` | Administrativo | Apoyo | **Sí (parcial)** | Talento Humano (`/talento-humano`) y Escuela GSB (`/escuela-gsb`, placeholder) |
| `SS` | SG - SST | Apoyo | No | — |

### 3.2 Módulos funcionales reales (con rutas y componentes existentes)

| Módulo | Ruta(s) | Componentes/páginas | Backend | ¿Funcional real o placeholder? |
|---|---|---|---|---|
| **Viáticos (panel admin)** | `/admin`, `/superadmin`, `/admin/asignaciones*`, `/admin/cuentas-cobro` | `AdminDashboard.jsx`, `SuperAdminDashboard.jsx`, `Asignaciones.jsx`, `NuevaAsignacion.jsx`, `DetalleAsignacion.jsx`, `AdminCuentasCobro.jsx` | `viaticos.py`, `admin.py`, `asignaciones.py`, `cuentas_cobro.py` | **Funcional** |
| **Viáticos (técnico)** | `/dashboard`, `/nuevo-viatico`, `/mis-viaticos`, `/mis-asignaciones`, `/cuenta-cobro` | `Dashboard.jsx`, `NuevoViatico.jsx`, `MisViaticos.jsx`, `MisAsignaciones.jsx`, `CuentaCobro.jsx`, `TecnicoLayout.jsx` | `viaticos.py`, `asignaciones.py` (router_tecnico) | **Funcional** |
| **Talento Humano** | `/talento-humano`, `/talento-humano/empleados` | `TalentoHumano.jsx`, `TalentoHumanoAdmin.jsx`, `TalentoHumanoTecnico.jsx`, `PerfilEmpleado.jsx` | `talento_humano.py` | **Funcional** |
| **Backup & Evidencias** | `/admin/backup`, `/backup` | `AdminBackup.jsx` | `admin.py` (evidencias, exportar) | **Funcional** |
| **Calidad de Procesos (SGC)** | `/calidad-de-procesos*` | `CalidadProcesos.jsx`, `CalidadCategoria.jsx`, `CalidadDetalleProceso.jsx`, `MapaProcesosSGC.jsx`, `PanelRolesAdminsMapa.jsx` | `calidad_procesos.py` | **Funcional** |
| **Administración global** | `/admin/usuarios`, `/admin/auditoria`, `/admin/personal/:id` | `AdminUsuarios.jsx`, `Auditoria.jsx`, `PerfilEmpleado.jsx` | `admin.py` | **Funcional** |
| **Autoplaner ODS** | `/autoplaner-ods` | `SeccionEnConstruccion.jsx` | — | **Placeholder (en desarrollo)** |
| **Escuela GSB** | `/escuela-gsb` | `SeccionEnConstruccion.jsx` | — | **Placeholder (en desarrollo)** |
| **Inventario** | `/inventario` | `SeccionEnConstruccion.jsx` | — | **Placeholder (en desarrollo)** |

### 3.3 Quién accede a cada módulo (según código)

| Módulo | Condición de acceso (frontend) |
|---|---|
| Viáticos admin | `AdminRoute requireViaticos` → `rol` en {`superadmin`} (efectivo) **y** `acceso_viaticos !== false` (`AdminRoute.jsx:15`). El `acceso_viaticos` lo asigna Pilar (por proceso OP o por `PUT /admin/usuarios/{id}/acceso-viaticos`). |
| Viáticos técnico | Cualquier usuario autenticado (`PrivateRoute`); el backend valida que el viático/asignación pertenezca al propio usuario. |
| Talento Humano | `canAccess` → `rol admin/superadmin` (`modulesConfig.js:110`); rutas con `PrivateRoute`. Vistas diferenciadas admin/técnico. |
| Backup & Evidencias | `AdminRoute` + `canAccess` → `rol superadmin` (`modulesConfig.js:213`, `App.jsx:186`). |
| Calidad SGC (ver) | Cualquier usuario autenticado (`PrivateRoute`, `modulesConfig.js:167-169`). |
| Calidad SGC (editar) | `superadmin` o Pilar (`puedeEditarMapa`). |
| Panel Roles/Accesos por Proceso | **Solo PilarAdmin** (`PanelRolesAdminsMapa.jsx:96-99`). |
| Autoplaner/Escuela/Inventario | Cualquier usuario autenticado (placeholder). |

---

## 4. FLUJOS CRÍTICOS
### 4.1 Autenticación y generación de sesión/token

**Flujo de login** (`backend/app/routers/auth.py:login` y `frontend/src/context/AuthContext.jsx:login`):
1. `POST /auth/login` usa `OAuth2PasswordRequestForm` (`auth.py`). El campo `username` admite **correo, código de empleado o nombre en minúsculas** (query con `func.lower`).
2. Existen "alias administrativos" reservados: `tecnicoplantagsb@gsbsecurity.com`, `tecnicoplantagsb`, `admin`, `admin@gsbank.com`, `admin gsb` → mapean al usuario con `id == 4` (hardcoded en `auth.py`).
3. Se valida contraseña (`verify_password`), se verifica `usuario.activo`.
4. Se cargan los accesos por proceso desde `procesos_calidad_accesos_admin` (Pilar recibe `admin` en los 8 procesos).
5. Se genera JWT (`create_access_token`, `security.py:29-38`) con claims: `sub` (correo), `rol`, `id`, `nombre`, `codigo_empleado`, `acceso_viaticos`, `es_admin_calidad`, `rol_mapa`, `accesos_procesos`, `exp`. Algoritmo `HS256` (`config.py:8`), `SECRET_KEY`, default expiración 7 días (`ACCESS_TOKEN_EXPIRE_MINUTES=10080`, `config.py:9`).

**Frontend:**
- `AuthContext.jsx` guarda `gs_token` y `gs_user` en `localStorage`.
- En `login`, decodifica el JWT (`atob`) y construye `userData` con: `correo, rol, id, nombre, codigo_empleado, acceso_viaticos, es_admin_calidad, accesos_procesos, rol_mapa` (`AuthContext.jsx:61-70`).
- En `/auth/me`, refresca datos (`AuthContext.jsx:20-38`), incluido `accesos_procesos`.
- Redirige: `superadmin/admin` → `/seleccion-modulo`; resto → `/dashboard` (`AuthContext.jsx:85-89`).

**Dependencias backend que leen el token:**
- `get_current_user` (`security.py:41-90`): decodifica JWT, carga usuario, verifica `activo`, adjunta `_accesos_procesos` (atributo virtual).
- Derivadas: `get_current_admin`, `get_current_superadmin`, `get_current_master_admin`, `get_current_pilar_admin`, `get_current_admin_calidad`.

### 4.2 Recuperación de contraseña

**Flujo de 3 pasos** (backend `auth.py`; UI `Login.jsx` → `RecuperarPasswordModal`):
1. **Solicitar código** — `POST /auth/solicitar-reset`: acepta correo, código de empleado o nombre. Genera OTP de 6 dígitos (`_generar_codigo`) con TTL 10 min (`OTP_TTL_SECONDS=600`). Lo almacena **en memoria** (`_reset_store`), y envía correo vía `email_reset.enviar_codigo_reset`.
   - **El código SIEMPRE llega a un buzón fijo** `RESET_EMAIL_DESTINO` (default `tecnicoplantagsb@gsbsecurity.com`, `config.py:23`), no al correo del solicitante; el correo indica de qué cuenta es la solicitud.
   - Si no hay SMTP, imprime el código en logs (dev mode) y devuelve True (`email_reset.py:39-44`).
   - La respuesta incluye `correo_cuenta` (correo real), usado en pasos 2 y 3 (`Login.jsx:48`).
2. **Verificar código** — `POST /auth/verificar-codigo`: valida OTP, marca verificado, extiende TTL a 5 min (`OTP_VERIFICADO_TTL_SECONDS=300`).
3. **Cambiar contraseña** — `POST /auth/cambiar-password`: exige ≥8 caracteres y código verificado/no expirado; actualiza SOLO la cuenta vinculada al OTP. Limpia el código al terminar.

**Limitaciones (verificadas):**
- El store OTP es **en memoria** (`auth.py:43-44`): se pierde al reiniciar y no funciona multi-instancia.
- El destino del correo es **fijo** (no llega al correo real), residuo del "buzón único".

### 4.3 Otro flujo transversal: registro de usuario
- `POST /auth/registro` (`auth.py`): crea usuario con `rol="tecnico"`, correo y código de empleado únicos (autoregistro público).
- Creación desde panel: `POST /admin/usuarios` (schema `UsuarioCreateAdmin`, `admin.py:77`) permite rol `superadmin` o `tecnico`; la UI permite elegir "Administrador" (se mapea a `superadmin`).

### 4.4 Auditoría (transversal)
- `LogAuditoria` (`models/log_auditoria.py`) + `service auditoria.registrar_auditoria`. Lectura exclusiva `superadmin` (`GET /admin/auditoria`, `admin.py:797`).
## 5. ENDPOINTS Y MODELOS DE DATOS

### 5.1 Mapa de endpoints backend (agrupados por router)

**Auth (`/auth`, `routers/auth.py`)**
| Método y ruta | Qué hace |
|---|---|
| `POST /auth/registro` | Crea usuario (rol técnico). |
| `POST /auth/login` | Login OAuth2 password, devuelve JWT. |
| `GET /auth/me` | Datos del usuario autenticado (incluye `accesos_procesos`). |
| `POST /auth/solicitar-reset` | Genera OTP y lo envía al buzón fijo. |
| `POST /auth/verificar-codigo` | Valida OTP. |
| `POST /auth/cambiar-password` | Cambia la contraseña con OTP verificado. |

**Admin (`/admin`, `routers/admin.py`)** — la mayoría exige `get_current_admin` (superadmin):
| Método y ruta | Qué hace / protección |
|---|---|
| `POST /admin/bootstrap` | Configura la cuenta Master (usa `MASTER_KEY`); **asigna `rol="admin"` residual**. |
| `POST /admin/usuarios` | Crea usuario (técnico/superadmin por schema). |
| `PUT /admin/usuarios/{id}` | Edita nombre/correo/cédula. Protege a Master. |
| `PUT /admin/usuarios/{id}/rol` | Cambia rol (schema restringe a `superadmin`/`tecnico`). |
| `PUT /admin/usuarios/{id}/estado` | Activar/desactivar; no permite auto-desactivación. |
| `PUT /admin/usuarios/{id}/acceso-viaticos` | **Exclusivo Master** (`get_current_master_admin`). |
| `DELETE /admin/usuarios/{id}` | Eliminación permanente con cascade lógico. |
| `GET /admin/viaticos` | Lista todos los viáticos (admin). |
| `GET /admin/viaticos/exportar` | Exporta Excel de viáticos. |
| `PUT /admin/viaticos/{id}/presupuesto` | Define presupuesto del viático. |
| `PUT /admin/viaticos/{id}/aprobar` / `rechazar` | Aprueba/rechaza viático. |
| `POST /admin/viaticos/{id}/evidencias` | Sube evidencia (admin). |
| `DELETE /admin/viaticos/{id}/evidencias/{evidencia_id}` | Elimina evidencia (admin). |
| `GET /admin/usuarios` | Lista usuarios. |
| `GET /admin/auditoria` | **Exclusivo superadmin** (`get_current_superadmin`), con filtros/paginación. |
| `GET /admin/notificaciones` | Lista notificaciones. |
**Viáticos técnico (`/viaticos`, `routers/viaticos.py`)** — todas `get_current_user`, validan propiedad:
| Método y ruta | Qué hace |
|---|---|
| `POST /viaticos` (y `/`) | Crea viático (propio o de su asignación). |
| `GET /viaticos` (y `/`) | Lista viáticos del usuario. |
| `GET /viaticos/{id}` | Detalle de un viático propio. |
| `PUT /viaticos/{id}` | Actualiza viático propio (con límites de estado/plazo). |
| `DELETE /viaticos/{id}` | Elimina viático propio (si estado lo permite). |
| `POST /viaticos/{id}/evidencias` | Sube evidencias (máx. 5, ventana de gracia 24h tras cierre). |
| `DELETE /viaticos/{id}/evidencias/{evidencia_id}` | Elimina evidencia propia (solo pendiente/rechazado y dentro de plazo). |

**Asignaciones admin (`/admin/asignaciones`, `routers/asignaciones.py`)** — `get_current_admin` salvo router_tecnico:
| Método y ruta | Qué hace |
|---|---|
| `GET /admin/asignaciones` | Lista asignaciones. |
| `GET /admin/asignaciones/{id}` | Detalle. |
| `GET /admin/asignaciones/{id}/exportar` | Exporta Excel de viáticos de la asignación. |
| `POST /admin/asignaciones` | Crea asignación. |
| `PUT /admin/asignaciones/{id}` | Actualiza. |
| `PUT /admin/asignaciones/{id}/finalizar` | Finaliza. |
| `PATCH /admin/asignaciones/{id}/extender-fecha` | Extiende fecha de fin. |
| `DELETE /admin/asignaciones/{id}` | Soft-delete (`eliminado_en`). |
| `GET /asignaciones/activas` (router_tecnico, `get_current_user`) | Asignaciones activas del técnico autenticado. |
| `POST /asignaciones/{id}/cuenta-cobro` (router_tecnico) | Sube cuenta de cobro de una asignación. |

**Cuentas de cobro (`/cuentas-cobro`, `routers/cuentas_cobro.py`)**
| Método y ruta | Qué hace |
|---|---|
| `POST /cuentas-cobro` (y `/`) | Crea cuenta de cobro. |
| `GET /cuentas-cobro` (y `/`) | Lista cuentas de cobro. |
| `GET /cuentas-cobro/{id}` | Detalle. |

**Proveedores (`/proveedores`, `routers/proveedores.py`)** — `get_current_user`:
| Método y ruta | Qué hace |
|---|---|
| `GET /proveedores/buscar` | Busca por NIT/nombre (mín. 3 caracteres, máx. 15). |

**Talento Humano (`/talento-humano`, `routers/talento_humano.py`)** — mixto admin/técnico:
| Método y ruta | Qué hace / protección |
|---|---|
| `GET /talento-humano/empleados` | Lista empleados (admin). |
| `POST /talento-humano/empleados` | Crea perfil de empleado (admin). |
| `GET /talento-humano/empleados/{usuario_id}` | Detalle empleado (admin). |
| `PUT /talento-humano/empleados/{usuario_id}` | Edita perfil (admin). |
| `PUT /talento-humano/empleados/{usuario_id}/estado` | Cambia estado laboral (admin/superadmin). |
| `POST/DELETE .../documentos` | Gestiona documentos del empleado (admin). |
| `GET /talento-humano/exportar-excel` | Exporta (admin). |
| `GET /talento-humano/me` | Perfil del técnico autenticado. |
| `GET /talento-humano/me/documentos` | Sus documentos. |
| `POST /talento-humano/solicitudes` | Crea solicitud (técnico). |
| `GET /talento-humano/solicitudes` | Lista solicitudes. |
| `PUT /talento-humano/solicitudes/{id}/responder` | Respuesta (admin). |
| `GET/POST/PUT/DELETE .../dotaciones` | Gestión de dotaciones (admin). |
| `GET/POST/DELETE .../evaluaciones` | Gestión de evaluaciones (admin). |
| `POST /talento-humano/empleados` (docstring) | También setea `acceso_viaticos=True` en ciertos casos (ver `talento_humano.py:233`). |

**Calidad de Procesos (`/calidad-procesos`, `routers/calidad_procesos.py`)**
| Método y ruta | Qué hace / protección |
|---|---|
| `GET /calidad-procesos` | Lista procesos (cualquier autenticado). |
| `GET /calidad-procesos/categoria/{categoria}` | Lista por categoría (autenticado). |
| `GET /calidad-procesos/usuarios-disponibles` | Usuarios para asignar responsable (autenticado). |
| `GET /calidad-procesos/permisos-admins` | **Exclusivo PilarAdmin.** Lista admins con acceso/rol mapa (Bloque Antiguo). |
| `PUT /calidad-procesos/permisos-admins/{usuario_id}` | **Exclusivo PilarAdmin.** Actualiza acceso/rol mapa (Bloque Antiguo; huérfano en UI). |
| `GET /calidad-procesos/accesos-proceso` | **Exclusivo PilarAdmin.** Overview de accesos por proceso. |
| `PUT /calidad-procesos/accesos-proceso` | **Exclusivo PilarAdmin.** Asigna nivel por proceso (sincroniza OP→acceso_viaticos). |
| `GET /calidad-procesos/{id}` | Detalle de proceso (autenticado). |
| `PUT /calidad-procesos/{id}` | Edita proceso (`get_current_admin_calidad`). |
| `POST /calidad-procesos/{id}/asignaciones` | Asigna responsable (`get_current_admin_calidad`). |
| `DELETE /calidad-procesos/{id}/asignaciones/{asignacion_id}` | Remueve responsable (`get_current_admin_calidad`). |
| `POST /calidad-procesos/{id}/documentos` | Sube documento (`get_current_admin_calidad`). |
| `PUT /calidad-procesos/documentos/{doc_id}` | Edita documento (`get_current_admin_calidad`). |
| `DELETE /calidad-procesos/documentos/{doc_id}` | Elimina documento (`get_current_admin_calidad`). |
> **"9 nodos":** el mapa de la UI (`MapaProcesosSGC.jsx`) renderiza las 8 fichas de proceso **más** una card **"Inventario" hardcodeada** (`:322-339`) que NO es un proceso de BD (placeholder que navega a `/inventario`, `App.jsx:256-270`). La aclaración de "9 nodos" corresponde a **8 procesos + 1 card Inventario hardcodeada**.

---

## 6. INCONSISTENCIAS Y DEUDA CONOCIDA

### 6.1 Código muerto / no usado

| Hallazgo | Ubicación | Nota |
|---|---|---|
| `esSoloLectura` definida pero nunca invocada | `frontend/src/utils/permisos.js:19-21` | Función exportada sin consumidor. |
| `actualizarPermisoAdminMapa` (cliente API) | `frontend/src/services/calidadProcesos.js:73-76` | Conecta con `PUT /permisos-admins/{id}` que ya no se consume desde ninguna vista. |
| `PUT /calidad-procesos/permisos-admins/{id}` (endpoint) | `backend/.../calidad_procesos.py:297-341` | Huérfano: ningún componente lo invoca. Solo el `GET /permisos-admins` sigue usándose (para listar). |
| `acceso_mapa` hardcodeado a `TRUE` | `backend/app/main.py:49`, `AuthContext.jsx:33,70` | Flag sin efecto real (siempre true). |
| `permiso_operaciones` como campo separado | `auth.py:179`, `security.py:87` | Duplica `accesos_procesos['OP']`; fuente de verdad duplicada. |
| `esAdministradorSeccion` / `esLectorSeccion` / `tieneAccesoSeccion` con reglas divergentes | `frontend/src/utils/permisos.js:73-102` | Tres funciones con combinaciones distintas de fallback (rol, `acceso_viaticos`, `permiso_operaciones`) → riesgo de comportamiento inconsistente. |
| Clases CSS huérfanas | `CalidadDetalleProceso.css:789,795` `.sgc-btn-modulo-cta--locked`; `MapaProcesosSGC.css` `.sgc-proc-card--locked`, `.sgc-operativo-badge--locked`, `.sgc-operativo-chip--locked`, `.sgc-btn-primary-operativo--locked`, `.sgc-subgroup-icon`; `PanelRolesAdminsMapa.css` `.sgc-ap-role-info-card--blue`, `.sgc-ap-role-info-badge--blue` | Residuos de estados "locked" que ya no se renderizan o variantes no usadas. |

### 6.2 Duplicados / redundantes

| Hallazgo | Ubicación | Nota |
|---|---|---|
| KPIs vs filtros rápidos repiten los mismos 3 contadores | `PanelRolesAdminsMapa.jsx:310-324` (tarjetas) vs `:352-361` (pills) | Misma métrica mostrada dos veces contiguas. |
| Guía de niveles vs panel expandido | `PanelRolesAdminsMapa.jsx:638-675` vs fila expandida de cada admin | El concepto de niveles (Sin Acceso / Lector / Administrador) se explica tres veces en la misma pantalla. |
| Lista de 8 procesos duplicada en 4 fuentes | `PanelRolesAdminsMapa.jsx:14-41`, `security.py:75`, `auth.py:170`, `calidad_procesos.py:352` | Riesgo de divergencia. |
| `get_current_master_admin` ≈ `get_current_pilar_admin` | `security.py:114` vs `:144` | Misma lógica (validar `pilaradmin@gsbank.com`) con distinto mensaje. |
| Derivación de `accesos_procesos` duplicada | `security.py:70-90` (get_current_user) y `auth.py:167-193` (/auth/me) | Misma construcción en dos sitios. |

### 6.3 Nomenclatura inconsistente

| Hallazgo | Ubicación |
|---|---|
| `LABEL_CARGO` lista `admin: 'Administrador'` y `superadmin: 'Super Administrador'` | `frontend/src/utils/personal.js:20-24` |
| `AdminRoute.jsx:9`, `GlobalHeader.jsx:190`, `modulesConfig.js:58,110,213,324,405,450` | Comprobaciones `user?.rol === 'admin' ||` (residual) |
| Mensaje backend "superadministrador" vs UI "Administrador" | `security.py:110` |
| Tres nombres para la misma cuenta Pilar | `PanelRolesAdminsMapa.jsx:278` "Administradora Master SGC", `CalidadProcesos.jsx:34` "Master Calidad SGC", badge "👑 Master" (`:431`) |

### 6.4 Lógica de permisos contradictoria

| Hallazgo | Ubicación | Nota |
|---|---|---|
| Dos mecanismos de acceso superpuestos | (a) `acceso_mapa`/`rol_mapa`/`es_admin_calidad` vs (b) `procesos_calidad_accesos_admin` (admin/lector/ninguno) | El panel nuevo solo gestiona (b), pero la edición del mapa sigue dependiendo de (a). |
| `permiso_operaciones` es espejo de `accesos_procesos['OP']` | `auth.py:179`, `security.py:87` | Se expone como campo distinto en el mismo token/usuario. |
| `acceso_viaticos` es espejo sincronizado de `accesos_procesos['OP']` | `calidad_procesos.py:489-496` (PUT accesos-proceso sincroniza) | Dos fuentes de verdad para el mismo permiso; el PUT las mantiene coherentes. |

### 6.5 Endpoints huérfanos / parcialmente activos

| Hallazgo | Ubicación | Nota |
|---|---|---|
| `PUT /permisos-admins/{id}` sin consumidor UI | `calidad_procesos.py:297-341` | El cliente `actualizarPermisoAdminMapa` nunca se invoca. |
| Columnas `acceso_mapa`, `rol_mapa`, `es_admin_calidad` se leen pero ya no se escriben desde UI | `main.py:46-52`, `AuthContext.jsx:32-34` | Sistema viejo a medio camino: lectura sin gestión. |

---

## 7. GLOSARIO

| Término | Definición según el código |
|---|---|
| **SGC** | "Sistema de Gestión de Calidad". Nombre del mapa de procesos (`MapaProcesosSGC.jsx`) y del módulo de calidad. |
| **Master** | No es un rol de BD. Es el usuario `pilaradmin@gsbank.com`, detectado por correo (`security.py:117,144`, `permisos.js:27-31`, `modulesConfig.js:265-267`). Tiene privilegios exclusivos: gestionar "Accesos por Proceso" y el acceso a Viáticos. En UI se muestra como "👑 Master" o "Administradora Master SGC". |
| **Administrador** | Rol `superadmin` en BD. En UI se muestra como "Administrador" (no "Super Administrador", aunque `LABEL_CARGO` aún diga lo contrario). Acceso a paneles admin, gestión de usuarios, auditoría, calidad. |
| **Técnico** | Rol `tecnico` en BD (default). Usuario operativo que crea y gestiona sus propios viáticos, sube evidencias, consulta asignaciones. |
| **Lector de Sección** | Nivel dentro de "Accesos por Proceso" (`accesos_procesos[codigo] === 'lector'`). Acceso de solo lectura a la ficha de un proceso. |
| **Administrador de Sección** | Nivel dentro de "Accesos por Proceso" (`accesos_procesos[codigo] === 'admin'`). Acceso completo a la ficha de un proceso (editar, asignar responsable, subir documentos). |
| **Acceso al Mapa SGC** | Ver los 9 nodos (8 procesos + Inventario) y entrar a la ficha de detalle de cada proceso. Automático para todo Administrador/Master. No incluye acceso a tarjetas/módulos operativos internos. |
| **Accesos por Proceso** | Sistema de niveles (Sin acceso / Lector / Administrador) por cada proceso, gestionado exclusivamente por PilarAdmin. Tabla `procesos_calidad_accesos_admin`. |
| **Bloque A / Bloque Antiguo** | Sistema anterior de permisos (`acceso_mapa`, `rol_mapa`, `es_admin_calidad`). Parcialmente obsoleto: se lee pero ya no se gestiona desde UI. |
| **PilarAdmin** | Sinónimo de "Master". Usuario `pilaradmin@gsbank.com`. |
| **Placeholder** | Ficha de proceso sin módulo operativo desarrollado (ej. Gestión Documental, Compras, Infraestructura, Talento Humano, SST, Auditoría Interna, Servicios Administrativos, Sistemas de Información). Muestra "Próximamente" o panel informativo. |
| **Módulo operativo** | Ficha de proceso con funcionalidad real desarrollada (ej. Viáticos en Operaciones). Acceso gobernado por "Accesos por Proceso" + `acceso_viaticos`. |
| **JWT** | Token de sesión generado en `/auth/login` y `/auth/me`. Contiene `sub` (email), `rol`, `nombre`, `cargo`, `activo`, `acceso_viaticos`, `accesos_procesos`. No contiene `permiso_operaciones` (eliminado). |
| **Hub** | Panel central al hacer login (`SeleccionModulo.jsx`). Muestra accesos directos a módulos según rol. |
| **Inventario** | Card hardcodeada en `MapaProcesosSGC.jsx:322-339` que NO es un proceso de BD. Placeholder que navega a `/inventario`. |

---

> **Nota final:** Este documento refleja el estado del código al momento de la revisión. Los cambios posteriores (commits, migraciones) pueden desactualizar las referencias. Se recomienda regenerar este contexto tras cambios significativos en roles, permisos o estructura de módulos.