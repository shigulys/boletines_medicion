import React, { createContext, useState, useContext, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
  isApproved: boolean;
  accessIngenieria: boolean;
  accessSubcontratos: boolean;
  accessContabilidad: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const syncUser = async () => {
      const savedUser = localStorage.getItem('user');
      if (savedUser && token) {
        try {
          console.log('🔄 Sincronizando estado del usuario con el servidor (v1.5)...');
          const response = await fetch('http://localhost:5000/api/me', {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Cache-Control': 'no-cache'
            }
          });
          
          if (response.ok) {
            const latestUser = await response.json();
            console.log('✅ Estado sincronizado:', latestUser);
            setUser(latestUser);
            localStorage.setItem('user', JSON.stringify(latestUser));
          } else if (response.status === 401 || response.status === 403) {
            console.warn('⚠️ Sesión inválida o expirada. Cerrando sesión...');
            logout();
          } else {
            setUser(JSON.parse(savedUser));
          }
        } catch (error) {
          console.error('❌ Error de conexión al sincronizar:', error);
          setUser(JSON.parse(savedUser));
        }
      } else if (!token) {
        setUser(null);
      }
      setIsLoading(false);
    };

    syncUser();
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
