/**
 * Configuración central y declarativa de los módulos del ecosistema GS-VIÁTICOS.
 * Para agregar un nuevo módulo (ej. Calidad de Procesos, CRM, etc.), basta con
 * agregarlo a este arreglo con sus permisos, rutas y chips.
 */

export const MODULES_CONFIG = [
  {
    id: 'viaticos',
    name: 'Viáticos',
    shortName: 'Viáticos',
    description: 'Control de gastos operativos, liquidaciones de campo, asignaciones técnicas y legalizaciones.',
    route: '/admin',
    aliases: ['/viaticos'],
    badge: 'OPERATIVO',
    accentClass: 'sm-card--viaticos',
    color: '#3B82F6',
    iconName: 'wallet',
    chips: [
      {
        label: 'Liquidaciones',
        icon: '📋',
        path: '/admin',
        badge: 'GESTIÓN',
        descripcion: 'Control, registro y aprobación de liquidaciones y anticipos de campo.',
      },
      {
        label: 'Gastos & Facturas',
        icon: '💳',
        path: '/admin',
        badge: 'CONTABLE',
        descripcion: 'Validación de soportes contables, facturas electrónicas y gastos de viaje.',
      },
      {
        label: 'Técnicos & OT',
        icon: '👷',
        path: '/admin',
        badge: 'ASIGNACIÓN',
        descripcion: 'Gestión de personal técnico y asignaciones por órdenes de trabajo.',
      },
      {
        label: 'Cuentas de Cobro',
        icon: '💵',
        path: '/admin/cuentas-cobro',
        badge: 'FINANZAS',
        descripcion: 'Revisión, auditoría y radicación de cuentas de cobro contratistas.',
      },
      {
        label: 'Reportes Excel',
        icon: '📊',
        path: '/admin',
        badge: 'REPORTES',
        descripcion: 'Descarga analítica consolidada y reportes financieros para auditoría.',
      },
    ],
    canAccess: (user) => {
      // Admins y superadmins con permiso de viáticos activo
      return (user?.rol === 'admin' || user?.rol === 'superadmin') && user?.acceso_viaticos !== false;
    },
    sidebarNav: [
      { id: 'inicio', label: 'Resumen General', icon: '🏠', path: '/admin', sectionId: 'top' },
      { id: 'gastos', label: 'Gastos & Comprobantes', icon: '💳', path: '/admin', sectionId: 'gastos' },
      { id: 'tecnicos', label: 'Asignaciones & Técnicos', icon: '👷', path: '/admin', sectionId: 'tecnicos' },
      { id: 'cuentas-cobro', label: 'Cuentas de Cobro', icon: '💵', path: '/admin/cuentas-cobro' },
      { id: 'reportes', label: 'Reportes & Exportación', icon: '📊', path: '/admin', sectionId: 'reportes' },
    ],
  },
  {
    id: 'talento',
    name: 'Talento Humano',
    shortName: 'Talento Humano',
    description: 'Gestión integral de colaboradores, contratos laborales, dotaciones y expedientes de personal.',
    route: '/talento-humano',
    aliases: ['/talento-humano/empleados'],
    badge: 'RRHH',
    accentClass: 'sm-card--talento',
    color: '#14B8A6',
    iconName: 'users',
    chips: [
      {
        label: 'Directorio Personal',
        icon: '👤',
        path: '/talento-humano',
        badge: 'COLABORADORES',
        descripcion: 'Censo institucional y hoja de vida de colaboradores activos.',
      },
      {
        label: 'Contratos & Docs',
        icon: '📄',
        path: '/talento-humano',
        badge: 'LEGAL',
        descripcion: 'Expedientes contractuales, afiliaciones y soportes de vinculación.',
      },
      {
        label: 'Dotación & EPP',
        icon: '🦺',
        path: '/talento-humano',
        badge: 'SEGURIDAD',
        descripcion: 'Registro de entrega de prendas de trabajo y equipos de protección.',
      },
      {
        label: 'Solicitudes',
        icon: '📝',
        path: '/talento-humano',
        badge: 'NOVEDADES',
        descripcion: 'Recepción y trámite de permisos, licencias y novedades laborales.',
      },
    ],
    canAccess: (user) => {
      return user?.rol === 'admin' || user?.rol === 'superadmin';
    },
    sidebarNav: [
      { id: 'personal', label: 'Directorio de Personal', icon: '👤', path: '/talento-humano' },
      { id: 'contratos', label: 'Contratos & Documentos', icon: '📄', path: '/talento-humano', tab: 'documentos' },
      { id: 'dotacion', label: 'Dotaciones', icon: '🦺', path: '/talento-humano', tab: 'dotacion' },
      { id: 'solicitudes', label: 'Historial & Solicitudes', icon: '📝', path: '/talento-humano', tab: 'historial' },
    ],
  },
  {
    id: 'calidad',
    name: 'Calidad de Procesos',
    shortName: 'Calidad SGC',
    description: 'Mapa de procesos SGC, direccionamiento estratégico, procesos misionales y gestión documental.',
    route: '/calidad-de-procesos',
    aliases: ['/mapa-de-procesos'],
    badge: 'SGC ISO',
    accentClass: 'sm-card--calidad',
    color: '#A855F7',
    iconName: 'map',
    chips: [
      {
        label: 'Mapa SGC',
        icon: '🗺️',
        path: '/calidad-de-procesos',
        badge: 'MAPA',
        descripcion: 'Vista global interactiva de macroprocesos y la cadena de valor.',
      },
      {
        label: 'Dirección',
        icon: '🎯',
        path: '/calidad-de-procesos/categoria/direccion',
        badge: 'ESTRATEGIA',
        descripcion: 'Procesos estratégicos, directrices gerenciales y planeación.',
      },
      {
        label: 'Misionales',
        icon: '⚙️',
        path: '/calidad-de-procesos/categoria/misional',
        badge: 'OPERACIÓN',
        descripcion: 'Procesos operativos clave que entregan valor directo al cliente.',
      },
      {
        label: 'Apoyo',
        icon: '🛡️',
        path: '/calidad-de-procesos/categoria/apoyo',
        badge: 'SOPORTE',
        descripcion: 'Procesos de respaldo administrativo, financiero y logístico.',
      },
      {
        label: 'Documentos',
        icon: '📁',
        path: '/calidad-de-procesos',
        badge: 'ARCHIVOS',
        descripcion: 'Repositorio documental unificado de caracterizaciones y formatos.',
      },
    ],
    canAccess: (user) => {
      return Boolean(user);
    },
    sidebarNav: [
      { id: 'mapa', label: 'Mapa de Procesos SGC', icon: '🗺️', path: '/calidad-de-procesos' },
      { id: 'direccion', label: 'Procesos de Dirección', icon: '🎯', path: '/calidad-de-procesos/categoria/direccion' },
      { id: 'misionales', label: 'Procesos Misionales', icon: '⚙️', path: '/calidad-de-procesos/categoria/misional' },
      { id: 'apoyo', label: 'Procesos de Apoyo', icon: '🛡️', path: '/calidad-de-procesos/categoria/apoyo' },
    ],
  },
  {
    id: 'backup',
    name: 'Backup & Evidencias',
    shortName: 'Backup',
    description: 'Visor masivo de comprobantes, organización por oficinas y descarga comprimida en ZIP.',
    route: '/admin/backup',
    aliases: ['/backup'],
    badge: '🔒 Solo Admin',
    accentClass: 'sm-card--backup',
    color: '#F59E0B',
    iconName: 'database',
    chips: [
      {
        label: 'Visor Comprobantes',
        icon: '🖼️',
        path: '/admin/backup',
        badge: 'EVIDENCIAS',
        descripcion: 'Galería fotográfica y visualización centralizada de soportes.',
      },
      {
        label: 'Por Oficinas',
        icon: '🏢',
        path: '/admin/backup',
        badge: 'SEDES',
        descripcion: 'Clasificación y consulta estructurada por sedes y dependencias.',
      },
      {
        label: 'Descargas ZIP',
        icon: '📦',
        path: '/admin/backup',
        badge: 'EXPORTACIÓN',
        descripcion: 'Empaquetado masivo y resguardo de soportes en archivo comprimido.',
      },
    ],
    canAccess: (user) => {
      // Estrictamente exclusivo para administradores y superadministradores
      return user?.rol === 'admin' || user?.rol === 'superadmin';
    },
    sidebarNav: [
      { id: 'visor', label: 'Visor de Comprobantes', icon: '🖼️', path: '/admin/backup' },
      { id: 'oficinas', label: 'Organización por Oficinas', icon: '🏢', path: '/admin/backup' },
      { id: 'descargas', label: 'Descarga Masiva ZIP', icon: '📦', path: '/admin/backup' },
    ],
  },
];

/**
 * Secciones de Administración Global (Transversales a todo el ecosistema)
 */
export const GLOBAL_ADMIN_NAV = [
  {
    id: 'usuarios',
    label: 'Usuarios & Roles',
    icon: '👥',
    description: 'Gestión de cuentas, permisos de acceso y estados de colaboradores.',
    path: '/admin/usuarios',
    minRole: 'admin', // admins y superadmins gestionan usuarios y roles
  },
  {
    id: 'auditoria',
    label: 'Auditoría del Sistema',
    icon: '📊',
    description: 'Registro cronológico y trazabilidad de acciones operativas y administrativas.',
    path: '/admin/auditoria',
    minRole: 'admin',
  },
  {
    id: 'perfil',
    label: 'Mi Perfil / Configuración',
    icon: '⚙️',
    description: 'Ajustes de cuenta, contraseña y datos personales del usuario activo.',
    getPath: (user) => (user?.id ? `/admin/personal/${user.id}` : '/dashboard'),
    minRole: 'tecnico',
  },
];

/**
 * Helpers
 */
export function getAvailableModules(user) {
  if (!user) return [];
  return MODULES_CONFIG.filter((m) => m.canAccess(user));
}

export function getModuleById(moduleId) {
  return MODULES_CONFIG.find((m) => m.id === moduleId) || null;
}

export function isAdminMaster(user) {
  return (user?.correo || '').trim().toLowerCase() === 'pilaradmin@gsbank.com';
}

/**
 * Asignación de módulos operativos a procesos del Mapa SGC:
 * - Operaciones (OP) → [Viáticos, Autoplaner ODS]
 * - Compras e Inventario (CI) → [Inventario]
 * - Mejora Continua (MC) → [Backup & Evidencias]
 * - Administrativo (AD) → [Talento Humano, Escuela GSB]
 */
export const MODULOS_SGC_ASOCIADOS = {
  OP: [
    {
      codigo: 'OP',
      moduloId: 'viaticos',
      nombre: 'Viáticos',
      badge: 'OPERATIVO',
      colorTheme: 'blue',
      colorHex: '#3B82F6',
      descripcion: 'Control de gastos operativos, liquidaciones de campo, asignaciones técnicas, cuentas de cobro y reportes.',
      ruta: '/admin',
      botonTexto: 'Ingresar a Viáticos',
      chips: [
        {
          label: 'Liquidaciones',
          icon: '📋',
          path: '/admin',
          badge: 'GESTIÓN',
          descripcion: 'Control, registro y aprobación de liquidaciones y anticipos de campo.',
        },
        {
          label: 'Gastos & Facturas',
          icon: '💳',
          path: '/admin',
          badge: 'CONTABLE',
          descripcion: 'Validación de soportes contables, facturas electrónicas y gastos de viaje.',
        },
        {
          label: 'Técnicos & OT',
          icon: '👷',
          path: '/admin',
          badge: 'ASIGNACIÓN',
          descripcion: 'Gestión de personal técnico y asignaciones por órdenes de trabajo.',
        },
        {
          label: 'Cuentas de Cobro',
          icon: '💵',
          path: '/admin/cuentas-cobro',
          badge: 'FINANZAS',
          descripcion: 'Revisión, auditoría y radicación de cuentas de cobro contratistas.',
        },
        {
          label: 'Reportes Excel',
          icon: '📊',
          path: '/admin',
          badge: 'REPORTES',
          descripcion: 'Descarga analítica consolidada y reportes financieros para auditoría.',
        },
      ],
      puedeAcceder: (user) => (user?.rol === 'admin' || user?.rol === 'superadmin') && user?.acceso_viaticos !== false,
      lockReason: 'Tu cuenta no tiene habilitado el acceso a Viáticos. Por favor solicita a la Administradora Master (PilarAdmin@gsbank.com) que active tus permisos.',
    },
    {
      codigo: 'OP',
      moduloId: 'autoplaner-ods',
      nombre: 'Autoplaner ODS',
      badge: 'MUY PRONTO',
      colorTheme: 'blue',
      colorHex: '#3B82F6',
      descripcion: 'Planificación inteligente, ruteo automático y despacho de órdenes de servicio en campo.',
      ruta: '/autoplaner-ods',
      botonTexto: 'Ingresar a Autoplaner ODS',
      chips: [
        {
          label: 'Planificación ODS',
          icon: '⚡',
          path: '/autoplaner-ods',
          badge: 'PLAN',
          descripcion: 'Programación sistemática y priorización de servicios asignados.',
        },
        {
          label: 'Ruteo de Técnicos',
          icon: '🗺️',
          path: '/autoplaner-ods',
          badge: 'RUTAS',
          descripcion: 'Optimización de recorridos geográficos y tiempos de desplazamiento.',
        },
        {
          label: 'Monitoreo en Tiempo Real',
          icon: '📡',
          path: '/autoplaner-ods',
          badge: 'EN VIVO',
          descripcion: 'Seguimiento satelital y estado de avance de servicios en tiempo real.',
        },
        {
          label: 'Despacho Automático',
          icon: '📋',
          path: '/autoplaner-ods',
          badge: 'DESPACHO',
          descripcion: 'Asignación algorítmica y balanceada de personal técnico.',
        },
      ],
      puedeAcceder: () => true,
      lockReason: '',
    },
  ],
  CI: [
    {
      codigo: 'CI',
      moduloId: 'inventario',
      nombre: 'Inventario',
      badge: 'INVENTARIO',
      colorTheme: 'blue',
      colorHex: '#3B82F6',
      descripcion: 'Control de stock por planillas, kardex de entradas y salidas de material, y consolidado de bodega.',
      ruta: '/inventario',
      botonTexto: 'Ingresar a Inventario',
      chips: [
        {
          label: 'Stock por Planilla',
          icon: '📦',
          path: '/inventario',
          badge: 'BODEGA',
          descripcion: 'Existencias vigentes agrupadas por línea de trabajo (mantenimiento, RTC, ...).',
        },
        {
          label: 'Entradas & Salidas',
          icon: '🔁',
          path: '/inventario',
          badge: 'MOVIMIENTOS',
          descripcion: 'Registro de salidas a servicio, devoluciones a bodega e ingresos por compra.',
        },
        {
          label: 'Kardex por Ítem',
          icon: '📒',
          path: '/inventario',
          badge: 'TRAZABILIDAD',
          descripcion: 'Historial completo de cada elemento con responsable y stock resultante.',
        },
        {
          label: 'Consolidado',
          icon: '📊',
          path: '/inventario',
          badge: 'REPORTES',
          descripcion: 'Totales por planilla, unidades en stock y alerta de elementos agotados.',
        },
      ],
      // El módulo es accesible para todo usuario autenticado: cualquier técnico
      // registra sus propios movimientos. El nivel de accesos_procesos['CI']
      // decide adentro si ve el panel de supervisión o la vista de captura.
      puedeAcceder: () => true,
      lockReason: '',
    },
  ],
  MC: [
    {
      codigo: 'MC',
      moduloId: 'backup',
      nombre: 'Backup & Evidencias',
      badge: 'BACKUP',
      colorTheme: 'gold',
      colorHex: '#F59E0B',
      descripcion: 'Visor masivo de comprobantes, organización por oficinas y descarga comprimida en ZIP de soportes contables y operativos.',
      ruta: '/admin/backup',
      botonTexto: 'Ingresar a Backup & Evidencias',
      chips: [
        {
          label: 'Visor Comprobantes',
          icon: '🖼️',
          path: '/admin/backup',
          badge: 'EVIDENCIAS',
          descripcion: 'Galería fotográfica y visualización centralizada de soportes.',
        },
        {
          label: 'Por Oficinas',
          icon: '🏢',
          path: '/admin/backup',
          badge: 'SEDES',
          descripcion: 'Clasificación y consulta estructurada por sedes y dependencias.',
        },
        {
          label: 'Descargas ZIP',
          icon: '📦',
          path: '/admin/backup',
          badge: 'EXPORTACIÓN',
          descripcion: 'Empaquetado masivo y resguardo de soportes en archivo comprimido.',
        },
      ],
      puedeAcceder: (user) => user?.rol === 'admin' || user?.rol === 'superadmin',
      lockReason: 'El módulo de Backup & Evidencias requiere privilegios de Administrador.',
    },
  ],
  AD: [
    {
      codigo: 'AD',
      moduloId: 'talento',
      nombre: 'Talento Humano',
      badge: 'TALENTO HUMANO',
      colorTheme: 'green',
      colorHex: '#10B981',
      descripcion: 'Gestión integral de colaboradores, contratos laborales, dotaciones y expedientes de personal.',
      ruta: '/talento-humano',
      botonTexto: 'Ingresar a Talento Humano',
      chips: [
        {
          label: 'Directorio Personal',
          icon: '👤',
          path: '/talento-humano',
          badge: 'COLABORADORES',
          descripcion: 'Censo institucional y hoja de vida de colaboradores activos.',
        },
        {
          label: 'Contratos & Docs',
          icon: '📄',
          path: '/talento-humano',
          badge: 'LEGAL',
          descripcion: 'Expedientes contractuales, afiliaciones y soportes de vinculación.',
        },
        {
          label: 'Dotación & EPP',
          icon: '🦺',
          path: '/talento-humano',
          badge: 'SEGURIDAD',
          descripcion: 'Registro de entrega de prendas de trabajo y equipos de protección.',
        },
        {
          label: 'Solicitudes',
          icon: '📝',
          path: '/talento-humano',
          badge: 'NOVEDADES',
          descripcion: 'Recepción y trámite de permisos, licencias y novedades laborales.',
        },
      ],
      puedeAcceder: (user) => user?.rol === 'admin' || user?.rol === 'superadmin',
      lockReason: 'El módulo de Talento Humano requiere privilegios de Administrador.',
    },
    {
      codigo: 'AD',
      moduloId: 'escuela-gsb',
      nombre: 'Escuela GSB',
      badge: 'MUY PRONTO',
      colorTheme: 'green',
      colorHex: '#10B981',
      descripcion: 'Campus virtual de capacitación técnica, inducción institucional, cursos normativos y certificación de competencias.',
      ruta: '/escuela-gsb',
      botonTexto: 'Ingresar a Escuela GSB',
      chips: [
        {
          label: 'Cursos Técnicos',
          icon: '🎓',
          path: '/escuela-gsb',
          badge: 'CAMPUS',
          descripcion: 'Módulos de formación especializada y adiestramiento para campo.',
        },
        {
          label: 'Inducción Institucional',
          icon: '📚',
          path: '/escuela-gsb',
          badge: 'CULTURA',
          descripcion: 'Programa de bienvenida, políticas corporativas y directrices.',
        },
        {
          label: 'Certificaciones',
          icon: '📜',
          path: '/escuela-gsb',
          badge: 'APTITUD',
          descripcion: 'Acreditaciones de competencias técnicas y estándares de calidad.',
        },
        {
          label: 'Evaluación Periódica',
          icon: '📝',
          path: '/escuela-gsb',
          badge: 'EVALUACIÓN',
          descripcion: 'Medición continua de desempeño y asimilación de contenidos.',
        },
      ],
      puedeAcceder: () => true,
      lockReason: '',
    },
  ],
};

export function getModulosSGCAsociados(codigo) {
  if (!codigo) return [];
  const key = String(codigo).trim().toUpperCase();
  const res = MODULOS_SGC_ASOCIADOS[key];
  if (!res) return [];
  return Array.isArray(res) ? res : [res];
}

export function getModuloSGCAsociado(codigo) {
  const list = getModulosSGCAsociados(codigo);
  return list.length > 0 ? list[0] : null;
}

