import { useAuth } from '../context/AuthContext';
import { esAdministradorSeccion, esLectorSeccion } from '../utils/permisos';
import InventarioCaptura from './InventarioCaptura';
import InventarioPanel from './InventarioPanel';

/**
 * Dispatcher del módulo Inventario (proceso CI del Mapa SGC).
 *
 * El corte no es por rol global sino por nivel de sección, igual que el resto
 * de módulos operativos gobernados por accesos_procesos:
 *   CI: admin   → panel de supervisión completo
 *   CI: lector  → el mismo panel, en solo lectura
 *   sin acceso  → vista de captura: cualquier técnico registra sus propios
 *                 movimientos, como pasa con sus propios viáticos.
 *
 * `scope` ({ empresaId, clienteId, ... }) llega desde InventarioNavegacion y
 * acota todo lo que ambas vistas consultan a una sola entidad de la jerarquía.
 * Sin scope no hay vista de inventario: la navegación siempre entra por una
 * empresa o una tarjeta.
 */
export default function Inventario({ scope, empresas = [] }) {
    const { user } = useAuth();

    if (esAdministradorSeccion(user, 'CI')) {
        return <InventarioPanel scope={scope} empresas={empresas} />;
    }

    if (esLectorSeccion(user, 'CI')) {
        return <InventarioPanel scope={scope} empresas={empresas} soloLectura />;
    }

    return <InventarioCaptura scope={scope} />;
}
