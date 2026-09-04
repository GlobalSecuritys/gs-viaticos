import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute({ children, requireViaticos = false, requireSuperadmin = false }) {
    const { user } = useAuth();
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    if (user?.rol !== 'admin' && user?.rol !== 'superadmin') {
        return <Navigate to="/dashboard" replace />;
    }
    if (requireSuperadmin && user?.rol !== 'superadmin') {
        return <Navigate to="/seleccion-modulo" replace />;
    }
    if (requireViaticos && user?.acceso_viaticos === false) {
        return <Navigate to="/seleccion-modulo" replace />;
    }
    return children;
}