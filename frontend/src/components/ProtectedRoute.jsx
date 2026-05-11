import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute
 *
 * Guard logic (in order):
 *  1. Still loading localStorage rehydration  → spinner
 *  2. Not authenticated                        → /login
 *  3. Authenticated but role is 'pending'      → /complete-profile
 *  4. requiredRole supplied and role doesn't match
 *       - farmer trying /supervisor/*          → /dashboard (access denied flash)
 *       - any other mismatch                  → /dashboard
 *  5. All checks pass                          → render children
 *
 * Usage:
 *   <ProtectedRoute>                         // any authenticated user
 *   <ProtectedRoute requiredRole="supervisor"> // supervisor-only
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <span style={{ fontSize: '1.5rem', animation: 'spin .65s linear infinite' }}>🌱</span>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Google OAuth new-user: must complete profile before anything else
  if (role === 'pending') return <Navigate to="/complete-profile" replace />;

  // Role guard — accepts a single role string or an array of allowed roles
  const allowed = requiredRole
    ? (Array.isArray(requiredRole) ? requiredRole : [requiredRole])
    : null;

  if (allowed && !allowed.includes(role)) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{
          accessDenied: true,
          message: `You need the "${allowed.join(' or ')}" role to access this page.`,
          from: location.pathname,
        }}
      />
    );
  }

  return children;
}
