import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getToken())); // true while checking a saved token
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setSessionExpired(true);
    });

    if (!getToken()) return;
    api.get('/users/me')
      .then((data) => setUser(data.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password }, { auth: false });
    setToken(data.token);
    setSessionExpired(false);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await api.post('/auth/register', { name, email, password }, { auth: false });
    setToken(data.token);
    setSessionExpired(false);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout'); // revokes the token on the server
    } catch {
      /* even if this fails, the user wants to be logged out locally */
    }
    clearToken();
    setSessionExpired(false);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, sessionExpired, login, register, logout }),
    [user, loading, sessionExpired, login, register, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);