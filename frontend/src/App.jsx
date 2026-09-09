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
import AdminBackup from './pages/AdminBackup';
import CalidadProcesos from './pages/CalidadProcesos';
import CalidadCategoria from './pages/CalidadCategoria';
import CalidadDetalleProceso from './pages/CalidadDetalleProceso';
import SeccionEnConstruccion from './pages/SeccionEnConstruccion';
import Inventario from './pages/Inventario';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* ── HUB DE MÓDULOS — Accesible para cualquier usuario autenticado ── */}
          <Route
            path="/seleccion-modulo"
            element={
              <PrivateRoute>
                <SeleccionModulo />
              </PrivateRoute>
            }
          />
          {/* Aliases → Hub */}
          <Route path="/hub" element={<Navigate to="/seleccion-modulo" replace />} />
          <Route path="/modulos" element={<Navigate to="/seleccion-modulo" replace />} />

          {/* ── MÓDULO TALENTO HUMANO ── */}
          <Route
            path="/talento-humano"
            element={
              <PrivateRoute>
                <TalentoHumano />
              </PrivateRoute>
            }
          />
          {/* Alias de compatibilidad */}
          <Route path="/talento-humano/empleados" element={<Navigate to="/talento-humano" replace />} />

          {/* ── MÓDULO VIÁTICOS — Dashboard técnico ── */}
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

          {/* ── MÓDULO VIÁTICOS — Panel Admin ── */}
          <Route
            path="/superadmin"
            element={
              <AdminRoute requireViaticos>
                <SuperAdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute requireViaticos>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          {/* Aliases de compatibilidad → panel admin (no renombrar rutas existentes) */}
          <Route path="/viaticos" element={<Navigate to="/admin" replace />} />
          <Route path="/viaticos/*" element={<Navigate to="/admin" replace />} />

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
              <AdminRoute requireViaticos>
                <Asignaciones />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/asignaciones/nueva"
            element={
              <AdminRoute requireViaticos>
                <NuevaAsignacion />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/asignaciones/:id"
            element={
              <AdminRoute requireViaticos>
                <DetalleAsignacion />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/cuentas-cobro"
            element={
              <AdminRoute requireViaticos>
                <AdminCuentasCobro />
              </AdminRoute>
            }
          />

          {/* ── ADMINISTRACIÓN GLOBAL (Transversal) ── */}
          <Route
            path="/admin/usuarios"
            element={
              <AdminRoute>
                <AdminUsuarios />
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

          {/* ── MÓDULO BACKUP ── */}
          <Route
            path="/admin/backup"
            element={
              <AdminRoute>
                <AdminBackup />
              </AdminRoute>
            }
          />
          {/* Alias de compatibilidad */}
          <Route path="/backup" element={<Navigate to="/admin/backup" replace />} />

          {/* ── MÓDULO CALIDAD DE PROCESOS (SGC) ── */}
          <Route
            path="/calidad-de-procesos"
            element={
              <PrivateRoute>
                <CalidadProcesos />
              </PrivateRoute>
            }
          />
          {/* Aliases de compatibilidad */}
          <Route path="/mapa-de-procesos" element={<Navigate to="/calidad-de-procesos" replace />} />
          <Route path="/calidad" element={<Navigate to="/calidad-de-procesos" replace />} />

          <Route
            path="/calidad-de-procesos/categoria/:categoria"
            element={
              <PrivateRoute>
                <CalidadCategoria />
              </PrivateRoute>
            }
          />
          <Route
            path="/calidad-de-procesos/proceso/:id"
            element={
              <PrivateRoute>
                <CalidadDetalleProceso />
              </PrivateRoute>
            }
          />

          {/* ── MÓDULOS EN DESARROLLO (AUTOPLANER ODS & ESCUELA GSB) ── */}
          <Route
            path="/autoplaner-ods"
            element={
              <PrivateRoute>
                <SeccionEnConstruccion
                  titulo="Autoplaner ODS"
                  subtitulo="Planificación y Ruteo Automático de Órdenes de Servicio"
                  icono="⚡"
                  grupoPadre="Operaciones"
                  descripcion="Módulo para la programación inteligente, seguimiento en tiempo real y despacho automatizado de órdenes de servicio en campo."
                  colorTheme="blue"
                />
              </PrivateRoute>
            }
          />
          <Route
            path="/escuela-gsb"
            element={
              <PrivateRoute>
                <SeccionEnConstruccion
                  titulo="Escuela GSB"
                  subtitulo="Campus de Formación y Certificación Continua"
                  icono="🎓"
                  grupoPadre="Administrativo"
                  descripcion="Plataforma de capacitación técnica, inducción institucional, cursos normativos y evaluación periódica de competencias."
                  colorTheme="green"
                />
              </PrivateRoute>
            }
          />

          {/* El gateo fino ocurre dentro de <Inventario /> con accesos_procesos['CI']:
              admin y lector ven el panel de supervisión, el resto la vista de captura. */}
          <Route
            path="/inventario"
            element={
              <PrivateRoute>
                <Inventario />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}