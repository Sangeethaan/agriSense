import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const ROLES = [
  {
    value: 'farmer',
    label: 'Farmer',
    emoji: '🌾',
    desc: 'I grow crops and manage my own farm',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    emoji: '🔍',
    desc: 'I conduct field visits and audit farms',
  },
  {
    value: 'manager',
    label: 'Manager',
    emoji: '📋',
    desc: 'I oversee multiple supervisors & operations',
  },
];

export default function CompleteProfile() {
  const { token, user, login } = useAuth();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRole) return setError('Please choose your role to continue.');
    setError('');

    try {
      setLoading(true);
      const res = await fetch(`${BASE}/auth/update-role`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({ role: selectedRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');

      // Replace the old pending token+user with the fresh ones
      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #0d2b1a 0%, #14432a 50%, #1c1007 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Floating orbs */}
      {['top:-60px;right:-60px;width:240px;height:240px;background:#4dc17f',
        'bottom:40px;left:-40px;width:160px;height:160px;background:#f0bb5a',
        'bottom:-30px;right:80px;width:100px;height:100px;background:#80d9a6',
      ].map((style, i) => (
        <div key={i} style={{
          position: 'fixed',
          borderRadius: '50%',
          opacity: .12,
          pointerEvents: 'none',
          ...Object.fromEntries(style.split(';').map(s => {
            const [k, v] = s.split(':');
            // Convert kebab-case to camelCase
            return [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v];
          })),
        }} />
      ))}

      <div style={{
        background: 'rgba(255,255,255,.97)',
        borderRadius: '24px',
        padding: '48px 40px',
        width: '100%',
        maxWidth: '480px',
        boxShadow: '0 24px 80px rgba(0,0,0,.25)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40,
            background: 'linear-gradient(135deg,#217a4a,#2da05f)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
          }}>🌱</div>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', color: '#0d2b1a', fontWeight: 700 }}>
            AgriSense
          </span>
        </div>

        {/* Header */}
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '1.7rem',
          color: '#0d2b1a',
          marginBottom: 8,
        }}>
          One last step, {user?.name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p style={{ color: '#4d6659', fontSize: '.9rem', marginBottom: 28, lineHeight: 1.6 }}>
          Since you signed in with Google, tell us your role so we can personalise your AgriSense experience.
        </p>

        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid rgba(217,79,79,.2)',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#d94f4f',
            fontSize: '.85rem',
            marginBottom: 20,
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Role cards */}
          <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={selectedRole === r.value}
                onClick={() => { setSelectedRole(r.value); setError(''); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  border: `2px solid ${selectedRole === r.value ? '#2da05f' : '#dde5e0'}`,
                  borderRadius: 14,
                  background: selectedRole === r.value ? '#edfaf3' : '#f8faf9',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 200ms ease',
                  boxShadow: selectedRole === r.value ? '0 0 0 3px rgba(45,160,95,.12)' : 'none',
                }}
              >
                <span style={{
                  fontSize: '2rem',
                  width: 48, height: 48,
                  background: selectedRole === r.value ? 'rgba(45,160,95,.12)' : '#eff3f1',
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {r.emoji}
                </span>
                <div>
                  <div style={{
                    fontWeight: 600,
                    fontSize: '.95rem',
                    color: selectedRole === r.value ? '#1a5c39' : '#1e2e27',
                    marginBottom: 3,
                  }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize: '.8rem', color: '#4d6659', lineHeight: 1.4 }}>
                    {r.desc}
                  </div>
                </div>
                {/* Selected checkmark */}
                {selectedRole === r.value && (
                  <div style={{
                    marginLeft: 'auto',
                    width: 22, height: 22,
                    background: '#2da05f',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                    fontSize: '.75rem',
                    flexShrink: 0,
                  }}>✓</div>
                )}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !selectedRole}
            style={{
              width: '100%',
              padding: '13px 20px',
              background: selectedRole
                ? 'linear-gradient(135deg,#217a4a,#2da05f)'
                : '#dde5e0',
              color: selectedRole ? '#fff' : '#8fa99a',
              border: 'none',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: '.95rem',
              cursor: selectedRole ? 'pointer' : 'not-allowed',
              transition: 'all 200ms ease',
              boxShadow: selectedRole ? '0 4px 14px rgba(33,122,74,.30)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? (
              <><span className="spinner" /> Saving…</>
            ) : (
              <>Continue to Dashboard →</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
