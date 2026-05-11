import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

const ROLE_CONFIG = {
  supervisor: { label: 'Supervisor', emoji: '🔍', accent: '#217a4a' },
  farmer:     { label: 'Farmer',     emoji: '🌾', accent: '#2da05f' },
  manager:    { label: 'Manager',    emoji: '📋', accent: '#e8a838' },
};

export default function DashboardPage() {
  const { user, role, logout } = useAuth();
  const navigate               = useNavigate();
  const location               = useLocation();
  const cfg                    = ROLE_CONFIG[role] || ROLE_CONFIG.farmer;

  // Access denied flash from ProtectedRoute redirect
  const [accessDenied, setAccessDenied] = useState(
    location.state?.accessDenied ?? false
  );

  useEffect(() => {
    if (accessDenied) {
      const t = setTimeout(() => setAccessDenied(false), 5000);
      return () => clearTimeout(t);
    }
  }, [accessDenied]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dashboard-wrap">
      <div style={{
        background: '#fff',
        border: '1.5px solid #dde5e0',
        borderRadius: 20,
        padding: '40px 48px',
        textAlign: 'center',
        boxShadow: '0 8px 40px rgba(13,43,26,.10)',
        maxWidth: 460,
        width: '90%',
      }}>
        {/* Access Denied banner */}
        {accessDenied && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid rgba(220,38,38,.25)',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#991b1b',
            fontSize: '.84rem',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            🚫 {location.state?.message || 'Access denied for this page.'}
          </div>
        )}

        <div style={{ fontSize: '3rem', marginBottom: 12 }}>{cfg.emoji}</div>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '1.6rem',
          color: '#0d2b1a',
          marginBottom: 4,
        }}>
          Welcome, {user?.name}!
        </h1>
        <p style={{ color: '#4d6659', fontSize: '.9rem', marginBottom: 24 }}>
          Signed in as <strong style={{ color: cfg.accent }}>{cfg.label}</strong> · {user?.email}
        </p>



        <button
          id="btn-dashboard-logout"
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px 28px',
            background: 'transparent',
            color: '#4d6659',
            border: '1.5px solid #dde5e0',
            borderRadius: 10,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '.9rem',
            fontFamily: 'inherit',
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
