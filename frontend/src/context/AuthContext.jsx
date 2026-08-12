import { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('gs_user');
    return stored ? JSON.parse(stored) : null;
  });

  const navigate = useNavigate();

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
    const userData = { correo: payload.sub, rol: payload.rol, id: payload.id, nombre: payload.nombre, codigo_empleado: payload.codigo_empleado };
    localStorage.setItem('gs_user', JSON.stringify(userData));
    setUser(userData);
    if (userData.rol === 'admin' || userData.rol === 'superadmin') {
      navigate('/admin');
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
