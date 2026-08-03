import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NuevoViatico from './pages/NuevoViatico';
import MisViaticos from './pages/MisViaticos';

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
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
