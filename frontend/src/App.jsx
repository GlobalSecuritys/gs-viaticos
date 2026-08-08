import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NuevoViatico from './pages/NuevoViatico';
import MisViaticos from './pages/MisViaticos';
import AdminDashboard from './pages/AdminDashboard';
import PerfilEmpleado from './pages/PerfilEmpleado';
import Asignaciones from './pages/Asignaciones';
import NuevaAsignacion from './pages/NuevaAsignacion';
import DetalleAsignacion from './pages/DetalleAsignacion';
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/nuevo-viatico"
            element={
              <PrivateRoute>
                <NuevoViatico />
              </PrivateRoute>
            }
          />
          <Route
            path="/mis-viaticos"
            element={
              <PrivateRoute>
                <MisViaticos />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/personal/:id"
            element={
              <AdminRoute>
                <PerfilEmpleado />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/asignaciones"
            element={
              <AdminRoute>
                <Asignaciones />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/asignaciones/nueva"
            element={
              <AdminRoute>
                <NuevaAsignacion />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/asignaciones/:id"
            element={
              <AdminRoute>
                <DetalleAsignacion />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}