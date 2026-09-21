import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { authApi, setAuthToken, getAuthToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts true so guarded routes wait instead of bouncing a signed-in user
  // to the login page while the stored token is being checked.
  const [loading, setLoading] = useState(Boolean(getAuthToken()));

  const signOut = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  // Restore the session from the stored token on first load.
  useEffect(() => {
    if (!getAuthToken()) return;

    let cancelled = false;
    authApi
      .me()
      .then((me) => !cancelled && setUser(me))
      .catch(() => !cancelled && signOut())
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [signOut]);

  // Drop the session as soon as the API rejects the token.
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const authenticate = useCallback(async (request) => {
    const { token, user: account } = await request();
    setAuthToken(token);
    setUser(account);
    return account;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login: (credentials) => authenticate(() => authApi.login(credentials)),
      register: (details) => authenticate(() => authApi.register(details)),
      logout: signOut,
    }),
    [user, loading, authenticate, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
