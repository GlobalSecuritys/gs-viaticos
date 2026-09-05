/**
 * Configuración central y declarativa de los módulos del ecosistema GS-VIÁTICOS.
 * Para agregar un nuevo módulo (ej. Calidad de Procesos, CRM, etc.), basta con
 * agregarlo a este arreglo con sus permisos, rutas y chips.
 */

export const MODULES_CONFIG = [
  {
    id: 'viaticos',
    name: 'Viáticos & Operaciones',
    shortName: 'Viáticos',
    description: 'Control de gastos operativos, liquidaciones de campo, asignaciones técnicas y legalizaciones.',
    route: '/admin',
    aliases: ['/viaticos'],
    badge: 'OPERATIVO',
    accentClass: 'sm-card--viaticos',
    color: '#3B82F6',
    iconName: 'wallet',
    chips: [
      { label: 'Liquidaciones', icon: '📋' },
      { label: 'Gastos & Facturas', icon: '💳' },
      { label: 'Técnicos & OT', icon: '👷' },
      { label: 'Cuentas de Cobro', icon: '💵' },
      { label: 'Reportes Excel', icon: '📊' },
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
      { label: 'Directorio Personal', icon: '👤' },
      { label: 'Contratos & Docs', icon: '📄' },
      { label: 'Dotación & EPP', icon: '🦺' },
      { label: 'Solicitudes', icon: '📝' },
    ],
    canAccess: (user) => {
      return user?.rol === 'admin' || user?.rol === 'superadmin';
    },
    sidebarNav: [
      { id: 'personal', label: 'Directorio de Personal', icon: '👤', path: '/talento-humano' },
      { id: 'contratos', label: 'Contratos & Documentos', icon: '📄', path: '/talento-humano', tab: 'documentos' },
      { id: 'dotacion', label: 'Dotación & Seguridad', icon: '🦺', path: '/talento-humano', tab: 'dotacion' },
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
      { label: 'Mapa SGC', icon: '🗺️' },
      { label: 'Dirección', icon: '🎯' },
      { label: 'Misionales', icon: '⚙️' },
      { label: 'Apoyo', icon: '🛡️' },
      { label: 'Documentos', icon: '📁' },
    ],
    canAccess: (user) => {
      if (!user) return false;
      const correo = (user.correo || '').trim().toLowerCase();
      if (correo === 'pilaradmin@gsbank.com') return true;
      return user.acceso_mapa === true;
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
      { label: 'Visor Comprobantes', icon: '🖼️' },
      { label: 'Por Oficinas', icon: '🏢' },
      { label: 'Descargas ZIP', icon: '📦' },
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
  return (user?.correo || '').trim().toLowerCase() === 'admin@gsbank.com';
}

/**
 * Asignación de módulos operativos a procesos del Mapa SGC:
 * - Operaciones (OP) → Viáticos & Operaciones
 * - Mejora Continua (MC) → Backup & Evidencias
 * - Administrativo (AD) → Talento Humano
 * Los demás procesos (SS, GR, CO, CI, SA) no tienen módulo operativo asociado.
 */
export const MODULOS_SGC_ASOCIADOS = {
  OP: {
    codigo: 'OP',
    moduloId: 'viaticos',
    nombre: 'Viáticos & Operaciones',
    badge: 'OPERATIVO',
    colorTheme: 'blue',
    colorHex: '#3B82F6',
    descripcion: 'Control de gastos operativos, liquidaciones de campo, asignaciones técnicas, cuentas de cobro y reportes.',
    ruta: '/admin',
    botonTexto: 'Ingresar a Viáticos & Operaciones',
    chips: [
      { label: 'Liquidaciones', icon: '📋', path: '/admin' },
      { label: 'Gastos & Facturas', icon: '💳', path: '/admin' },
      { label: 'Técnicos & OT', icon: '👷', path: '/admin' },
      { label: 'Cuentas de Cobro', icon: '💵', path: '/admin/cuentas-cobro' },
      { label: 'Reportes Excel', icon: '📊', path: '/admin' },
    ],
    puedeAcceder: (user) => (user?.rol === 'admin' || user?.rol === 'superadmin') && user?.acceso_viaticos !== false,
    lockReason: 'Tu cuenta no tiene habilitado el acceso a Viáticos & Operaciones. Por favor solicita al Administrador Master (admin@gsbank.com) que active tus permisos.',
  },
  MC: {
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
      { label: 'Visor Comprobantes', icon: '🖼️', path: '/admin/backup' },
      { label: 'Por Oficinas', icon: '🏢', path: '/admin/backup' },
      { label: 'Descargas ZIP', icon: '📦', path: '/admin/backup' },
    ],
    puedeAcceder: (user) => user?.rol === 'admin' || user?.rol === 'superadmin',
    lockReason: 'El módulo de Backup & Evidencias requiere privilegios de Administrador o Superadministrador.',
  },
  AD: {
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
      { label: 'Directorio Personal', icon: '👤', path: '/talento-humano' },
      { label: 'Contratos & Docs', icon: '📄', path: '/talento-humano' },
      { label: 'Dotación & EPP', icon: '🦺', path: '/talento-humano' },
      { label: 'Solicitudes', icon: '📝', path: '/talento-humano' },
    ],
    puedeAcceder: (user) => user?.rol === 'admin' || user?.rol === 'superadmin',
    lockReason: 'El módulo de Talento Humano requiere privilegios de Administrador o Superadministrador.',
  },
};

export function getModuloSGCAsociado(codigo) {
  if (!codigo) return null;
  const key = String(codigo).trim().toUpperCase();
  return MODULOS_SGC_ASOCIADOS[key] || null;
}
