import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * OAuthCallback  —  /auth/callback
 *
 * The backend redirects here after a successful Google sign-in:
 *   http://localhost:5173/auth/callback?token=JWT&id=...&name=...&email=...&role=...
 *
 * This page:
 *  1. Reads the query params
 *  2. Calls AuthContext.login() to persist token + user
 *  3. Redirects to /dashboard (or /login on error)
 */
export default function OAuthCallback() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const processed  = useRef(false); // guard against double-execution in StrictMode

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    const id     = params.get('id');
    const name   = params.get('name');
    const email  = params.get('email');
    const role   = params.get('role');
    const error  = params.get('error');

    if (error || !token || !id || !role) {
      console.error('[OAuthCallback] Missing params or OAuth error:', error);
      navigate('/login?error=google_failed', { replace: true });
      return;
    }

    // Persist auth state globally
    login(token, { id, name, email, role });

    // Clean the URL and go to dashboard
    navigate('/dashboard', { replace: true });
  }, [login, navigate]);

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      background: 'var(--clr-gray-50, #f8faf9)',
      gap: '16px',
    }}>
      {/* Animated leaf spinner */}
      <div style={{
        width: 52, height: 52,
        background: 'linear-gradient(135deg, #217a4a, #2da05f)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pulse 1.2s ease-in-out infinite',
        fontSize: '1.5rem',
      }}>
        🌿
      </div>
      <p style={{ color: '#4d6659', fontSize: '0.95rem' }}>
        Signing you in with Google…
      </p>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(1.1); opacity: .8; }
        }
      `}</style>
    </div>
  );
}
