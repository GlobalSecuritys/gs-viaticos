import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NuevoViatico from './pages/NuevoViatico';
import MisViaticos from './pages/MisViaticos';
import MisAsignaciones from './pages/MisAsignaciones';
import CuentaCobro from './pages/CuentaCobro';
import AdminDashboard from './pages/AdminDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import PerfilEmpleado from './pages/PerfilEmpleado';
import AdminUsuarios from './pages/AdminUsuarios';
import Asignaciones from './pages/Asignaciones';
import NuevaAsignacion from './pages/NuevaAsignacion';
import DetalleAsignacion from './pages/DetalleAsignacion';
import Auditoria from './pages/Auditoria';
import AdminCuentasCobro from './pages/AdminCuentasCobro';
import SeleccionModulo from './pages/SeleccionModulo';
import TalentoHumano from './pages/TalentoHumano';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/seleccion-modulo"
            element={
              <AdminRoute>
                <SeleccionModulo />
              </AdminRoute>
            }
          />
          <Route
            path="/talento-humano"
            element={
              <PrivateRoute>
                <TalentoHumano />
              </PrivateRoute>
            }
          />
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
            path="/mis-asignaciones"
            element={
              <PrivateRoute>
                <MisAsignaciones />
              </PrivateRoute>
            }
          />
          <Route
            path="/cuenta-cobro"
            element={
              <PrivateRoute>
                <CuentaCobro />
              </PrivateRoute>
            }
          />
          <Route
            path="/superadmin"
            element={
              <AdminRoute>
                <SuperAdminDashboard />
              </AdminRoute>
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
            path="/admin/usuarios"
            element={
              <AdminRoute>
                <AdminUsuarios />
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
          <Route
            path="/admin/cuentas-cobro"
            element={
              <AdminRoute>
                <AdminCuentasCobro />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/auditoria"
            element={
              <AdminRoute>
                <Auditoria />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}