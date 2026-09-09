# CONTEXTO_SISTEMA — Ecosistema GS-Viáticos

> Documento de contexto generado **exclusivamente a partir de la lectura del código** del repositorio (frontend React + Vite y backend FastAPI). No refleja planes, historial de conversación ni supuestos; cualquier afirmación aquí es verificable en el código (referencias `archivo:línea`).
>
> Fecha de revisión: `commit 47e641ec` — rama `main`, working tree limpio. Cambios posteriores (commits, migraciones) pueden desactualizar este documento.

---

## 1. ROLES DE USUARIO

### 1.1 Modelo de base de datos

El modelo `Usuario` (`backend/app/models/usuario.py`) guarda el rol como **string** en la columna `rol VARCHAR(20)` con `server_default="tecnico"` (`usuario.py:19`). **No existe un enum en BD**; el rol es texto libre validado en las capas de schema/backend.

Columnas relevantes de `usuarios`:

| Columna | Tipo / default | Línea | Nota |
|---|---|---|---|
| `codigo_empleado` | `String(15)`, unique | `usuario.py:17` | Código de empleado; usado en login y recuperación |
| `rol` | `String(20)`, default `tecnico` | `usuario.py:19` | Valor de rol |
| `activo` | `Boolean`, default `true` | `usuario.py:20` | Estado de cuenta |
| `acceso_viaticos` | `Boolean`, default `false` | `usuario.py:21` | Acceso al módulo Viáticos |
| `es_admin_calidad` | `Boolean`, default `false` | `usuario.py:22` | Residuo del sistema antiguo de edición SGC (ver §6) |
| `acceso_mapa` | `Boolean`, default `false` | `usuario.py:23` | **Flag legacy**: se lee pero ya no se gestiona |
| `rol_mapa` | `String(20)`, default `lector` | `usuario.py:24` | Residuo del sistema antiguo; se setea pero sin efecto real |
| `created_at` | `DateTime` | `usuario.py:25-29` | Fecha de creación |

> El rol `'admin'` fue **eliminado** y migrado a `superadmin`. La migración es idempotente y corre en cada startup: `main.py:81-116` (`_migrar_rol_admin_a_superadmin`) y `backend/alembic/versiones/0012_add_acceso_viaticos_y_migrar_admins.py`.

### 1.2 Roles que existen realmente

| Rol en BD | UI muestra | Creado/validado en | Qué puede hacer (verificado) |
|---|---|---|---|
| **`tecnico`** | "Técnico" | Creación: `admin.py:77` (panel) y `auth.py` `/auth/registro` (autoregistro, `rol="tecnico"`). Validación: `schemas/usuario.py:40-41` | Ver su dashboard de viáticos, crear sus propios viáticos y evidencias (`viaticos.py` usa `get_current_user`), consultar sus asignaciones activas (`asignaciones.py` → `router_tecnico`), registrar movimientos de inventario (`inventario.py`), ver su perfil en Talento Humano (`talento_humano.py` `/me`), acceder al Hub y al Mapa SGC en modo lector. **No** puede: entrar a rutas admin (`AdminRoute.jsx`), ver KPIs de administración, gestionar usuarios. |
| **`superadmin`** | "Administrador" | Es el único rol que `get_current_admin` acepta (`security.py:95`). Validación: `schemas/usuario.py:38-39,103-104` | Paneles admin/dashboard de viáticos y demás módulos aptos, gestión de usuarios, ver auditoría, respaldos, calidad de procesos, supervisión de inventario, talento humano. Es el objetivo de los "Accesos por Proceso" (ver §5). |
| **`admin`** | (no debería existir) | **Ya no se crea ni valida** salvo referencias residuales (ver §6). | Eliminado del sistema. `main.py:81-116` y `schemas/usuario.py:28,38,103` lo convierten en `superadmin` al detectarlo. |

> **Master / PilarAdmin**: no es un rol de BD. Es el usuario `pilaradmin@gsbank.com`, detectado por correo. Dependencias exclusivas: `get_current_master_admin` (`security.py:112-122`) y `get_current_pilar_admin` (`security.py:139-149`). En UI: `esPilarAdmin` (`frontend/src/utils/permisos.js:27-31`) e `isAdminMaster` (`modulesConfig.js`). Tiene privilegios exclusivos sobre "Accesos por Proceso" y sobre `acceso_viaticos`.

### 1.3 Inconsistencias de roles encontradas

- **`LABEL_CARGO`** (`frontend/src/utils/personal.js:17-24`) aún lista `admin: 'Administrador'` y `superadmin: 'Super Administrador'`. El rol `admin` ya no existe, y "Super Administrador" contradice la convención UI de mostrar "Administrador" para `superadmin`.
- **`GlobalHeader.jsx:190`**, **`AdminRoute.jsx`**, **`modulesConfig.js`** (varias líneas) y **`PanelRolesAdminsMapa.jsx:61-69`** aún comprueban `rol === 'admin'` como caso residual (cae en la misma rama que `superadmin`). No rompe, pero mantiene el rol fantasma vivo en la UI.
- `UsuarioCreateAdmin` (`schemas/usuario.py:26-30`) documenta que el rol intermedio `admin` fue eliminado; la UI de `AdminUsuarios.jsx` ofrece "Administrador" (→ `superadmin`) y "Técnico".

---

## 2. AUTENTICACIÓN Y TOKENS

### 2.1 Endpoints de autenticación (`backend/app/routers/auth.py`, prefix `/auth`)

| Endpoint | Línea | Descripción |
|---|---|---|
| `POST /auth/registro` | `auth.py:87` | Autoregistro público de técnico (`rol="tecnico"`); correo y código de empleado únicos. |
| `POST /auth/login` | `auth.py` | Login OAuth2 password (acepta correo o código de empleado). |
| `GET /auth/me` | `auth.py` | Datos del usuario autenticado (incluye `accesos_procesos`). |
| `POST /auth/solicitar-reset` | `auth.py` | Solicita código OTP de 6 dígitos (acepta correo o código de empleado). |
| `POST /auth/verificar-codigo` | `auth.py` | Verifica que el código es válido. |
| `POST /auth/cambiar-password` | `auth.py:331` | Cambia la contraseña (mín. 8 caracteres) con el código ya verificado. |

### 2.2 Flujo de recuperación de contraseña (OTP)

- Códigos numéricos de 6 dígitos guardados **en memoria** (`_reset_store`, `auth.py:43`). TTL: `OTP_TTL_SECONDS = 600` (10 min) `auth.py:46`; `OTP_VERIFICADO_TTL_SECONDS = 300` (5 min extra) `auth.py:47`.
- `correo_o_usuario` acepta correo o código de empleado (`auth.py:68-69`).
- La contraseña se cambia **solo** para la cuenta que solicitó el reset (`auth.py:331-406`), nunca para otra.
- **Destino fijo del correo**: `RESET_EMAIL_DESTINO = "tecnicoplantagsb@gsbsecurity.com"` (`config.py:23`). SMTP Gmail en `config.py:18-21`.

### 2.3 Token JWT

- Generado en login/`me` (`security.py:29-38`); expiración `ACCESS_TOKEN_EXPIRE_MINUTES = 60*24*7` (7 días) `config.py:9`.
- `get_current_user` (`security.py:41-90`) descifra el token, busca el `Usuario` por `sub` (correo), rechaza si está inactivo, y **enriquece** la instancia con `_accesos_procesos` leído de `ProcesoCalidadAccesoAdmin` (`security.py:70-88`). Si es la cuenta Master, recibe `{proceso: "admin"}` para los 8 procesos (`security.py:76-77`, lista en `security.py:75`).
- El JWT contiene `sub` (email), `rol`, `nombre`, `cargo`, `activo`, `acceso_viaticos`, `accesos_procesos`.

### 2.4 Dependencias de protección (`backend/app/core/security.py`)

| Dependencia | Línea | Regla |
|---|---|---|
| `get_current_user` | `41` | Cualquier usuario activo autenticado. |
| `get_current_admin` | `92` | **Solo** `rol == "superadmin"`. |
| `get_current_superadmin` | `102` | **Solo** `rol == "superadmin"`. |
| `get_current_master_admin` | `112` | **Solo** `pilaradmin@gsbank.com` (usada en `acceso-viaticos`). |
| `verificar_autoridad_sobre_usuario` | `124` | Blindaje: nadie puede tocar la cuenta Master salvo Master. |
| `get_current_pilar_admin` | `139` | Solo `pilaradmin@gsbank.com` (Accesos por Proceso). |
| `get_current_admin_calidad` | `152` | Master o `superadmin` (editar Mapa SGC). |
| `require_seccion(codigo, nivel)` | `176` | Exige al menos un nivel en `accesos_procesos[codigo]`; `superadmin` y Master pasan siempre. Niveles: `ninguno=0, lector=1, admin=2` (`security.py:173`). |

---

## 3. MODELOS DE DATOS

En cada startup (`main.py:45-77`) se crean por `checkfirst` las tablas de CuentaCobro, CuentaCobroAsignación, Talento Humano (6), Calidad de Procesos (4) e Inventario (3); se siembran los procesos SGC y las planillas de inventario; y se migra `admin`→`superadmin` (`main.py:74-77`).

| Tabla | Modelo (`backend/app/models/`) | Notas |
|---|---|---|
| `usuarios` | `usuario.py` | Ver §1.1. |
| `viaticos` | `viatico.py` | Viáticos independientes y ligados a asignación (`asignacion_id`). `monto_presupuesto` (mig. 0008); `comentario_admin` añadido vía `ALTER` en startup (`main.py:49`). |
| `evidencias_viatico` | `evidencia_viatico.py` | Fotos/soportes en Cloudinary; columna `origen` (`tecnico`/`admin`) (mig. 0013). Máx. 5 por viático (`viaticos.py:28-29`). |
| `asignaciones` | `asignacion.py` | OT de campo. `eliminado_en` (soft delete, mig. 0014) y `cerrada_en` (mig. 0014 / `main.py:51`). Regla de 24 h de gracia (`asignaciones.py:36-87`). |
| `cuentas_cobro` | `cuenta_cobro.py` | Cuenta de cobro independiente; `items` como string JSON. |
| `cuentas_cobro_asignacion` | `cuenta_cobro_asignacion.py` | Cuenta de cobro ligada a una asignación (mig. 0011). |
| `proveedores` | `proveedor.py` | Importados desde Excel (`scripts/importar_proveedores.py`). |
| `notificaciones` | `notificacion.py` | Alertas (mig. 0005). |
| `log_auditoria` | `log_auditoria.py` | Auditoría transversal (mig. 0006). |
| `inventario_planillas` | `inventario.py:18` | Grupo de ítems (hojas MANTENIMIENTO, RTC). Seed inicial `inventario.py:57,60-72`. |
| `inventario_items` | `inventario.py:41` | Ficha de elemento; `stock_actual` derivado; soft delete `eliminado_en`; foto Cloudinary. |
| `inventario_movimientos` | `inventario.py:83` | Kardex inmutable; tipos `ajuste_inicial/compra/devolucion` (entrada) y `salida` (`inventario.py:13-15`); `origen` reserva `foto_ia` (mig. 0015). |
| `procesos_calidad` (+ responsables, documentos, accesos_admin) | `calidad_procesos.py` | Mapa SGC + responsable + documentos + niveles de acceso por proceso. |
| `empleados_perfil`, `empleados_documentos`, `empleados_historial`, `empleados_solicitudes`, `empleados_dotaciones`, `empleados_evaluaciones` | `talento_humano.py` | Módulo Talento Humano (perfil, documentos, historial, solicitudes, dotación/EPP, evaluaciones 1-5⭐). |

---

## 4. ENDPOINTS POR MÓDULO

Routers registrados en `main.py:138-147`. Prefixes confirmados (`routers/*.py`).

### 4.1 Viáticos (técnico) — `/viaticos` (`viaticos.py`)

| Endpoint | Línea | Protección / notas |
|---|---|---|
| `POST /viaticos` | `55` | Técnico autenticado. Valida asignación propia + gracia 24 h (`asignaciones.calcular_limite_subida_asignacion`). |
| `GET /viaticos` | `108` | Técnico: solo sus viáticos. |
| `GET /viaticos/{id}` | `130` | Técnico: solo los suyos. |
| `PUT /viaticos/{id}` | `155` | Actualizar su viático (en estados válidos). |
| `DELETE /viaticos/{id}` | `209` | Eliminar su viático. |
| `POST /viaticos/{id}/evidencias` | `256` | Adjunta fotos (Cloudinary) hasta MAX 5 (`viaticos.py:28-29`). |
| `DELETE /viaticos/{id}/evidencias/{evidencia_id}` | `334` | Solo pendiente/rechazado y dentro de gracia. |

### 4.2 Asignaciones (admin) — `/admin/asignaciones` (`asignaciones.py`)

| Endpoint | Línea | Protección |
|---|---|---|
| `GET /admin/asignaciones` | `233` | `get_current_admin`. |
| `GET /admin/asignaciones/{id}` | `254` | `get_current_admin`. |
| `GET /admin/asignaciones/{id}/exportar` | `264` | Exporta Excel de viáticos de la asignación. |
| `POST /admin/asignaciones` | `305` | `get_current_admin`. |
| `PUT /admin/asignaciones/{id}` | `344` | `get_current_admin`. |
| `PUT /admin/asignaciones/{id}/finalizar` | `384` | Marca finalizada; activa ventana de gracia. |
| `PATCH /admin/asignaciones/{id}/extender-fecha` | `405` | Extiende `fecha_fin` (para volver a subir viáticos). |
| `DELETE /admin/asignaciones/{id}` | `434` | Soft delete (`eliminado_en`). |

### 4.3 Asignaciones técnicas (router_tecnico) — `/asignaciones` (`asignaciones.py`)

| Endpoint | Línea | Protección / notas |
|---|---|---|
| `GET /asignaciones/activas` | `448` | `get_current_user`; solo las del técnico activo (pendiente/en_curso o finalizada con gracia vigente). |
| `POST /asignaciones/{id}/cuenta-cobro` | `482` | Sube el documento PDF/imagen de cuenta de cobro ligada a la asignación del técnico. |

### 4.4 Administración — `/admin` (`admin.py`)

| Endpoint | Línea | Protección / notas |
|---|---|---|
| `POST /admin/bootstrap` | `53` | Clave maestra (`MASTER_KEY`); coloca rol `admin` (luego migrado). |
| `POST /admin/usuarios` | `77` | `get_current_admin`. Crea técnico/superadmin (schema `UsuarioCreateAdmin`). |
| `PUT /admin/usuarios/{id}` | `123` | Edita datos; protege a Master (`verificar_autoridad_sobre_usuario`). |
| `PUT /admin/usuarios/{id}/rol` | `191` | Cambia rol (schema restringe a `superadmin`/`tecnico`). |
| `PUT /admin/usuarios/{id}/estado` | `228` | Activar/desactivar; no auto-desactivación. |
| `PUT /admin/usuarios/{id}/acceso-viaticos` | `283` | **Exclusivo Master** (`get_current_master_admin`). |
| `DELETE /admin/usuarios/{id}` | `319` | Eliminación definitiva (borra cascada Talento Humano, etc.). |
| `GET /admin/viaticos` | `470` | Lista admin de viáticos (pendientes primero). |
| `GET /admin/viaticos/exportar` | `493` | Exporta Excel de viáticos independientes por usuario. |
| `PUT /admin/viaticos/{id}/presupuesto` | `546` | Define `monto_presupuesto`. |
| `PUT /admin/viaticos/{id}/aprobar` | `585` | Aprueba (solo desde `pendiente`). |
| `PUT /admin/viaticos/{id}/rechazar` | `631` | Rechazar. |
| `POST /admin/viaticos/{id}/evidencias` | `677` | Sube evidencia admin (origen `admin`). |
| `DELETE /admin/viaticos/{id}/evidencias/{evidencia_id}` | `732` | Elimina evidencia si tiene autoridad. |
| `GET /admin/usuarios` | `787` | Lista todos los usuarios. |
| `GET /admin/auditoria` | `797` | **Exclusivo SuperAdmin** (`get_current_superadmin`); filtros + paginación. |
| `GET /admin/notificaciones` | `828` | `get_current_admin`. |

### 4.5 Cuentas de Cobro — `/cuentas-cobro` (`cuentas_cobro.py`)

| Endpoint | Línea | Protección / notas |
|---|---|---|
| `POST /cuentas-cobro` | `19` | Técnico autenticado; exige `autorizacion_datos`. |
| `GET /cuentas-cobro` | `61` | Admin ve todas; técnico solo las suyas. |
| `GET /cuentas-cobro/{id}` | `79` | Idem (admin todas; técnico solo las suyas). |

### 4.6 Proveedores — `/proveedores` (`proveedores.py`)

| Endpoint | Línea | Protección |
|---|---|---|
| `GET /proveedores/buscar` | `22` | `get_current_user`; busca NIT/nombre (mín. 3 caracteres, máx. 15). |

### 4.7 Calidad de Procesos (SGC) — `/calidad-procesos` (`calidad_procesos.py`)

| Endpoint | Línea | Protección / notas |
|---|---|---|
| `GET /calidad-procesos` | `227` | Lista procesos. |
| `GET /calidad-procesos/categoria/{categoria}` | `279` | Filtra por categoría. |
| `GET /calidad-procesos/usuarios-disponibles` | `332` | Usuarios para asignar responsable. |
| `GET /calidad-procesos/permisos-admins` | `354` | Lista roles admin del mapa. |
| `PUT /calidad-procesos/permisos-admins/{usuario_id}` | `389` | Actualiza permiso admin del mapa. |
| `GET /calidad-procesos/accesos-proceso` | `462` | `get_current_pilar_admin`; overview de accesos por proceso. |
| `PUT /calidad-procesos/accesos-proceso` | `532` | `get_current_pilar_admin`; establece nivel; **sincroniza** `accesos_procesos` ↔ `acceso_viaticos` para `OP`. |
| `GET /calidad-procesos/{id}` | `639` | Detalle de proceso. |
| `PUT /calidad-procesos/{id}` | `706` | Edita proceso (admin_calidad). |
| `POST /calidad-procesos/{id}/asignaciones` | `741` | Asigna responsable. |
| `DELETE /calidad-procesos/{id}/asignaciones/{asignacion_id}` | `795` | Quita responsable. |
| `POST /calidad-procesos/{id}/documentos` | `817` | Sube documento del proceso. |
| `PUT /calidad-procesos/documentos/{doc_id}` | `872` | Actualiza documento. |
| `DELETE /calidad-procesos/documentos/{doc_id}` | `918` | Elimina documento. |

### 4.8 Inventario (SGC `IN`) — `/inventario` (`inventario.py`)

Control de acceso declarado en el docstring (`inventario.py:1-10`): captura/consulta con `get_current_user`; supervisión con `require_seccion("IN", "admin")`; reportes con `require_seccion("IN", "lector")`. Alias locales: `CurrentUser`, `AdminIN`, `LectorIN` (`inventario.py:52-54`).

| Endpoint | Línea | Protección |
|---|---|---|
| `GET /inventario/planillas` | `233` | `CurrentUser`. |
| `POST /inventario/planillas` | `270` | `AdminIN`. |
| `PUT /inventario/planillas/{planilla_id}` | `310` | `AdminIN`. |
| `GET /inventario/items` | `356` | `CurrentUser`. |
| `GET /inventario/duplicados` | `393` | `AdminIN` (detección de duplicados). |
| `GET /inventario/siguiente-codigo` | `418` | Sugiere código (`CodigoSugeridoResponse`). |
| `POST /inventario/items` | `430` | `CurrentUser` (captura). |
| `PUT /inventario/items/{item_id}` | `480` | `AdminIN`. |
| `DELETE /inventario/items/{item_id}` | `517` | `AdminIN` (soft delete `eliminado_en`). |
| `POST /inventario/items/{item_id}/foto` | `536` | Sube foto referencia (Cloudinary). |
| `POST /inventario/items/{item_id}/movimientos` | `557` | Registra entrada/salida (kardex). |
| `GET /inventario/items/{item_id}/kardex` | `580` | Lista historial de movimientos. |
| `GET /inventario/reportes/global` | `600` | `LectorIN` (reporte consolidado). |

### 4.9 Talento Humano (`AD`) — `/talento-humano` (`talento_humano.py`)

| Endpoint | Línea | Protección / notas |
|---|---|---|
| `GET /talento-humano/empleados` | `136` | `get_current_admin`. |
| `POST /talento-humano/empleados` | `197` | `get_current_admin` (crea perfil + usuario). |
| `GET /talento-humano/empleados/{usuario_id}` | `318` | `get_current_admin`. |
| `PUT /talento-humano/empleados/{usuario_id}` | `385` | `get_current_admin`. |
| `PUT /talento-humano/empleados/{usuario_id}/estado` | `553` | `get_current_admin`. |
| `POST /talento-humano/empleados/{usuario_id}/documentos` | `633` | Sube documento (Cloudinary). |
| `DELETE /talento-humano/empleados/{usuario_id}/documentos/{documento_id}` | `717` | Elimina documento. |
| `GET /talento-humano/exportar-excel` | `777` | Exporta Excel de talento humano. |
| `GET /talento-humano/me` | `828` | `get_current_user` (perfil del propio técnico). |
| `GET /talento-humano/me/documentos` | `868` | Documentos del propio técnico. |
| `POST /talento-humano/solicitudes` | `891` | Técnico crea solicitud (permisos, licencias…). |
| `GET /talento-humano/solicitudes` | `915` | Colección de solicitudes. |
| `PUT /talento-humano/solicitudes/{solicitud_id}/responder` | `935` | Responde/actualiza estado. |
| `GET /talento-humano/empleados/{usuario_id}/dotaciones` | `965` | `get_current_admin`. |
| `POST /talento-humano/empleados/{usuario_id}/dotaciones` | `989` | Registra entrega de dotación/EPP. |
| `PUT /talento-humano/empleados/{usuario_id}/dotaciones/{dotacion_id}` | `1044` | Actualiza dotación. |
| `DELETE /talento-humano/empleados/{usuario_id}/dotaciones/{dotacion_id}` | `1085` | Elimina dotación. |
| `GET /talento-humano/empleados/{usuario_id}/evaluaciones` | `1111` | Lista evaluaciones. |
| `POST /talento-humano/empleados/{usuario_id}/evaluaciones` | `1134` | Crea evaluación (1-5⭐). |
| `DELETE /talento-humano/empleados/{usuario_id}/evaluaciones/{evaluacion_id}` | `1199` | Elimina evaluación. |

---

## 5. ACCESOS POR PROCESO (MAPA SGC)

### 5.1 Modelo de acceso

- Tabla `procesos_calidad_accesos_admin` (`calidad_procesos.py`), modelo `ProcesoCalidadAccesoAdmin`: fila por (usuario, proceso) con `nivel_acceso`.
- Niveles: `ninguno`/`lector`/`admin` (`NIVELES_SECCION`, `security.py:173`; labels UI en `PanelRolesAdminsMapa.jsx:46-50`).
- `get_current_user` carga `_accesos_procesos` al autenticar (`security.py:70-88`).
- `require_seccion(codigo, nivel)` (fabrica de dependencias, `security.py:176-207`) lo valida por proceso.
- **Master** (`pilaradmin@gsbank.com`) siempre obtiene `admin` en los 8 procesos (`security.py:76-77`). `superadmin` y Master pasan cualquier `require_seccion` (`security.py:192`).

### 5.2 Procesos del mapa

Definición de grupos (códigos) en `PanelRolesAdminsMapa.jsx:14-44` y `modulesConfig.js`:

| Grupo | Procesos (código) |
|---|---|
| **Dirección** | `GR` Gerencia, `MC` Mejora Continua |
| **Misionales** | `CO` Comercial, `CI` Compras, `IN` Inventario, `OP` Operaciones |
| **Apoyo** | `SA` Ambiental, `AD` Administrativo, `SS` SG-SST |

### 5.3 Módulos operativos ligados a procesos SGC

| Proceso | Módulo asociado | `moduloId` | Acceso |
|---|---|---|---|
| `OP` | Viáticos | `viaticos` (`modulesConfig.js:281`) + `Autoplaner ODS` (próximamente, `modulesConfig.js:331`) | `canAccess`: rol admin/superadmin y `acceso_viaticos` (`modulesConfig.js:56-59`). |
| `IN` | Inventario | `inventario` (`modulesConfig.js:379`) | Módulo real activo (`PanelRolesAdminsMapa.jsx:29`). |
| `MC` | Backup & Evidencias | `backup` (`modulesConfig.js:427`) | Solo aparece como card; requiere módulo. |
| `AD` | Talento Humano + Escuela GSB (próximamente) | `talento` (`modulesConfig.js:465`), `escuela-gsb` (`modulesConfig.js:508`) | `puedeAcceder`: rol admin/superadmin (`modulesConfig.js:503`). |

### 5.4 Sincronización `acceso_viaticos` ↔ `OP`

El campo `usuarios.acceso_viaticos` es **espejo** del nivel `admin` del proceso `OP` en `accesos_procesos`. `PUT /calidad-procesos/accesos-proceso` sincroniza el primero cuando cambia `OP` (`calidad_procesos.py:489-496`), y `get_current_user` siempre devuelve el estado real de BD (`security.py:70-72`).

---

## 6. HALLAZGOS / DEUDA TÉCNICA

| Hallazgo | Ubicación | Nota |
|---|---|---|
| Rol `admin` fantasma en UI | `personal.js:17-24`, `GlobalHeader.jsx:190`, `AdminRoute.jsx`, `modulesConfig.js`, `PanelRolesAdminsMapa.jsx:61-69`, `cuentas_cobro.py:67,85` | Se comprueba `rol === 'admin'` como caso residual; el backend lo migra a `superadmin` en startup. |
| `LABEL_CARGO` inconsistente | `personal.js:17-24` | "Super Administrador" en vez de "Administrador"; lista `admin`. |
| Columnas legacy del mapa sin efecto | `main.py:52-56`, `usuario.py:22-24` | `acceso_mapa`, `rol_mapa`, `es_admin_calidad` se leen/setean pero ya no gobiernan accesos (el sistema real es "Accesos por Proceso"). |
| `PUT /permisos-admins/{id}` sin consumidor UI claro | `calidad_procesos.py:389` | Endpoint presente; la gestión moderna pasa por `accesos-proceso`. |
| Duplicidad de fuente de verdad en `acceso_viaticos` | `calidad_procesos.py:489-496` | Campo espejo de `OP`; mantenido por el PUT. |
| Reset OTP en memoria (no persistente) | `auth.py:43` | Los códigos se pierden al reiniciar el servidor; single-process. |
| Inventario `origen='foto_ia'` reservado | `inventario.py:99-101` | Fase 2 de captura por foto planificada sin migración de columna. |

---

## 7. GLOSARIO

| Término | Definición según el código |
|---|---|
| **SGC** | "Sistema de Gestión de Calidad". Nombre del mapa de procesos y módulos de calidad/inventario. |
| **Master / PilarAdmin** | No es un rol de BD. Usuario `pilaradmin@gsbank.com`, detectado por correo (`security.py:76,112,139`). Gestiona "Accesos por Proceso", el acceso a Viáticos y Blindaje anti-modificación. |
| **Administrador** | Rol `superadmin` en BD. UI lo muestra como "Administrador"; acceso a paneles admin, usuarios, auditoría, calidad, inventario, talento humano. |
| **Técnico** | Rol `tecnico` en BD (default). Usuario operativo: crea sus viáticos, sube evidencias, consulta asignaciones, registra movimientos de inventario, ve su perfil y crea solicitudes. |
| **Lector de Sección** | Nivel `accesos_procesos[codigo] === 'lector'`. Solo lectura de la ficha de un proceso. |
| **Administrador de Sección** | Nivel `accesos_procesos[codigo] === 'admin'`. Edición completa de la ficha del proceso. |
| **Accesos por Proceso** | Sistema de niveles (Ninguno/Lector/Administrador) por proceso SGC, gestionado por PilarAdmin. Tabla `procesos_calidad_accesos_admin`. |
| **Bloque Antiguo (legacy)** | `acceso_mapa`, `rol_mapa`, `es_admin_calidad`. Se leen/setean pero ya no gobiernan accesos. |
| **Módulo operativo** | Ficha de proceso con funcionalidad real (Inventario en `IN`, Viáticos en `OP`, Talento Humano en `AD`). |
| **Placeholder** | Ficha de proceso sin módulo desarrollado (Autoplaner ODS, Escuela GSB y demás procesos). |
| **OTP** | Código de 6 dígitos para recuperar contraseña, guardado en memoria (`auth.py`). |
| **Kardex** | Registro inmutable de movimientos de inventario (`inventario_movimientos`). |
| **Hub** | Panel central al hacer login (`SeleccionModulo.jsx`); muestra accesos a módulos según rol. |
| **Inventario** | Proceso `IN` del mapa SGC, con módulo operativo real (`Inventario.jsx`, `inventario.py`). Planillas MANTENIMIENTO y RTC. |
| **JWT** | Token de sesión. Contiene `sub`, `rol`, `nombre`, `cargo`, `activo`, `acceso_viaticos`, `accesos_procesos`. |

---

> **Nota final:** Este documento refleja el estado del código al momento de la revisión (`commit 47e641ec`, rama `main`). Los cambios posteriores (commits, migraciones) pueden desactualizar las referencias. Se recomienda regenerar este contexto tras cambios significativos en roles, permisos o estructura de módulos.