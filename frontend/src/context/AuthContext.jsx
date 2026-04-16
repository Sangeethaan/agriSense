import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { id, name, email, role }
  const [token, setToken]     = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Rehydrate from localStorage on mount ──────────────────
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('agrisense_token');
      const storedUser  = localStorage.getItem('agrisense_user');
      if (storedToken && storedUser) {
        const parsedUser = JSON.parse(storedUser);
        // Verify the stored object has the required fields
        if (parsedUser?.id && parsedUser?.role) {
          setToken(storedToken);
          setUser(parsedUser);
        } else {
          throw new Error('Malformed stored user');
        }
      }
    } catch (_) {
      // Corrupted storage — clear it
      localStorage.removeItem('agrisense_token');
      localStorage.removeItem('agrisense_user');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── login — called after /register or /login succeeds ─────
  // Both endpoints return: { token, user: { id, name, email, role } }
  // The `role` field is sourced from the JWT payload (set by the backend).
  const login = useCallback((tokenValue, userData) => {
    if (!userData?.role) {
      console.warn('[AuthContext] login() called without a role in userData', userData);
    }
    localStorage.setItem('agrisense_token', tokenValue);
    localStorage.setItem('agrisense_user', JSON.stringify(userData));
    setToken(tokenValue);
    setUser(userData);
  }, []);

  // ── logout ─────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('agrisense_token');
    localStorage.removeItem('agrisense_user');
    setToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = !!token;

  /**
   * `role` is derived directly from the user object returned by the backend
   * (echoed from the JWT: { id, name, email, role }).
   * ProtectedRoute reads this to enforce role-based access.
   * Possible values: 'farmer' | 'supervisor' | 'manager'
   */
  const role = user?.role ?? null;

  return (
    <AuthContext.Provider
      value={{ user, token, role, isAuthenticated, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
