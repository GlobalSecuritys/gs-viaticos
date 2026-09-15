import { useAuth } from '../context/AuthContext';
import { esAdministradorSeccion, esLectorSeccion } from '../utils/permisos';
import InventarioPanel from './InventarioPanel';

/**
 * Dispatcher del módulo Inventario (proceso CI del Mapa SGC).
 *
 * El rol técnico no tiene acceso alguno a este módulo.
 * Para roles administrativos y de calidad, se evalúa el nivel en accesos_procesos:
 *   CI: admin   → panel de supervisión completo
 *   CI: lector  → el mismo panel, en solo lectura
 */
export default function Inventario({ scope, empresas = [] }) {
    const { user } = useAuth();

    if (user?.rol === 'tecnico') {
        return null;
    }

    if (esAdministradorSeccion(user, 'CI')) {
        return <InventarioPanel scope={scope} empresas={empresas} />;
    }

    if (esLectorSeccion(user, 'CI')) {
        return <InventarioPanel scope={scope} empresas={empresas} soloLectura />;
    }

    return (
        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>
                No tienes permisos asignados para visualizar o gestionar este inventario.
            </p>
        </div>
    );
}
