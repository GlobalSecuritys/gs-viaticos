import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NuevoViatico from './pages/NuevoViatico';
import MisViaticos from './pages/MisViaticos';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsuarios from './pages/AdminUsuarios';
import AdminViaticos from './pages/AdminViaticos';
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
            path="/admin/usuarios"
            element={
              <AdminRoute>
                <AdminUsuarios />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/viaticos"
            element={
              <AdminRoute>
                <AdminViaticos />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}