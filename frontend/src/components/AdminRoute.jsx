import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute({ children }) {
    const { user } = useAuth();
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    if (user?.rol !== 'admin' && user?.rol !== 'superadmin') {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
}