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

        {/* Supervisor module CTA */}
        {role === 'supervisor' && (
          <button
            id="btn-open-supervisor-module"
            onClick={() => navigate('/supervisor')}
            style={{
              width: '100%',
              padding: '13px 20px',
              background: 'linear-gradient(135deg, #4a9470, #2d6649)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: '.95rem',
              cursor: 'pointer',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              boxShadow: '0 4px 18px rgba(74,148,112,.32)',
              transition: 'box-shadow .2s, transform .2s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 28px rgba(74,148,112,.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(74,148,112,.32)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            🔍 Open Supervisor Module →
          </button>
        )}

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
