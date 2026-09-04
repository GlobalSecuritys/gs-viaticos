import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('gs_user');
    return stored ? JSON.parse(stored) : null;
  });

  const navigate = useNavigate();

  // Sincronizar siempre los datos frescos del perfil (especialmente el nombre) desde la BD
  useEffect(() => {
    const token = localStorage.getItem('gs_token');
    if (!token) return;

    api.get('/auth/me')
      .then(({ data }) => {
        if (data) {
          setUser((prev) => {
            const updated = {
              ...(prev || {}),
              id: data.id,
              correo: data.correo,
              nombre: data.nombre,
              rol: data.rol,
              codigo_empleado: data.codigo_empleado,
              acceso_viaticos: Boolean(data.acceso_viaticos),
              es_admin_calidad: Boolean(data.es_admin_calidad),
            };
            localStorage.setItem('gs_user', JSON.stringify(updated));
            return updated;
          });
        }
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          logout();
        }
      });
  }, []);

  async function login(correo, password) {
    const formData = new URLSearchParams();
    formData.append('username', correo);
    formData.append('password', password);

    const { data } = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    localStorage.setItem('gs_token', data.access_token);

    // Decodificar payload del JWT para obtener datos del usuario
    const payload = JSON.parse(atob(data.access_token.split('.')[1]));
    let userData = {
      correo: payload.sub,
      rol: payload.rol,
      id: payload.id,
      nombre: payload.nombre,
      codigo_empleado: payload.codigo_empleado,
      acceso_viaticos: Boolean(payload.acceso_viaticos),
    };

    // Si por alguna razón nombre no viene en el payload, obtenerlo de /auth/me
    if (!userData.nombre) {
      try {
        const resMe = await api.get('/auth/me');
        if (resMe.data?.nombre) {
          userData.nombre = resMe.data.nombre;
        }
      } catch {}
    }

    localStorage.setItem('gs_user', JSON.stringify(userData));
    setUser(userData);

    if (userData.rol === 'superadmin' || userData.rol === 'admin') {
      navigate('/seleccion-modulo');
    } else {
      navigate('/dashboard');
    }
  }

  function logout() {
    localStorage.removeItem('gs_token');
    localStorage.removeItem('gs_user');
    setUser(null);
    navigate('/login');
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
