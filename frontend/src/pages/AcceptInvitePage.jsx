import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function AcceptInvitePage() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const { login } = useAuth();
  const token     = params.get('token') || '';

  // Token validation
  const [supName,   setSupName]   = useState(null);
  const [tokenErr,  setTokenErr]  = useState(null);
  const [validating, setValidating] = useState(true);

  // Form fields
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);

  // Submit state
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState(null);

  /* ── Validate supervisor token on mount ───────────────────── */
  useEffect(() => {
    if (!token) {
      setTokenErr('No invite token found in this link.');
      setValidating(false);
      return;
    }
    (async () => {
      try {
        const res  = await fetch(`${API}/api/auth/join/${token}`);
        const data = await res.json();
        if (!res.ok) setTokenErr(data.error || 'Invalid link.');
        else         setSupName(data.supervisor_name);
      } catch {
        setTokenErr('Unable to verify this link. Check your connection.');
      } finally {
        setValidating(false);
      }
    })();
  }, [token]);

  /* ── Submit registration ──────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErr(null);

    if (!name.trim())        return setFormErr('Please enter your full name.');
    if (!email.trim())       return setFormErr('Please enter your email address.');
    if (password.length < 8) return setFormErr('Password must be at least 8 characters.');
    if (password !== confirm) return setFormErr('Passwords do not match.');

    setSaving(true);
    try {
      const res  = await fetch(`${API}/api/auth/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supervisorToken: token,
          name:            name.trim(),
          email:           email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.error || 'Registration failed. Please try again.'); return; }

      login(data.token, data.user);
      navigate('/farmer/dashboard', { replace: true });
    } catch {
      setFormErr('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Loading state ────────────────────────────────────────── */
  if (validating) return (
    <div style={shell}>
      <div style={card}>
        <div style={logoBox}>🌱</div>
        <p style={{ color: '#5d7d6e', textAlign: 'center', marginTop: 16 }}>Verifying invite link…</p>
      </div>
    </div>
  );

  /* ── Invalid link state ───────────────────────────────────── */
  if (tokenErr) return (
    <div style={shell}>
      <div style={card}>
        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 16 }}>⚠️</div>
        <h2 style={{ ...heading, textAlign: 'center' }}>Invalid Link</h2>
        <p style={{ color: '#991b1b', fontSize: '.88rem', textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
          {tokenErr}
        </p>
        <p style={{ color: '#5d7d6e', fontSize: '.8rem', textAlign: 'center' }}>
          Ask your supervisor to share the invite link again.
        </p>
      </div>
    </div>
  );

  /* ── Registration form ────────────────────────────────────── */
  return (
    <div style={shell}>
      <div style={card}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={logoBox}>🌱</div>
          <h1 style={heading}>Join AgriSense</h1>
          <p style={{ color: '#5d7d6e', fontSize: '.88rem', margin: '6px 0 0', lineHeight: 1.5 }}>
            Invited by <strong style={{ color: '#1b3a2d' }}>{supName}</strong><br />
            <span style={{ fontSize: '.8rem' }}>Create your farmer account to get started</span>
          </p>
        </div>

        {/* Error */}
        {formErr && <div style={errBox}>{formErr}</div>}

        <form onSubmit={handleSubmit} noValidate>

          {/* Full Name */}
          <div style={fieldWrap}>
            <label style={label} htmlFor="join-name">Full Name</label>
            <input
              id="join-name"
              type="text"
              style={input}
              placeholder="e.g. Ravi Kumar"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>

          {/* Email */}
          <div style={fieldWrap}>
            <label style={label} htmlFor="join-email">Email Address</label>
            <input
              id="join-email"
              type="email"
              style={input}
              placeholder="ravi@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div style={fieldWrap}>
            <label style={label} htmlFor="join-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="join-password"
                type={showPwd ? 'text' : 'password'}
                style={{ ...input, paddingRight: 44 }}
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                style={eyeBtn}
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div style={fieldWrap}>
            <label style={label} htmlFor="join-confirm">Confirm Password</label>
            <input
              id="join-confirm"
              type={showPwd ? 'text' : 'password'}
              style={input}
              placeholder="Repeat password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            id="btn-join-submit"
            type="submit"
            disabled={saving}
            style={submitBtn}
          >
            {saving ? 'Creating account…' : 'Create My Account 🌾'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '.78rem', color: '#7a9b8b', marginTop: 20 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#4a9470', fontWeight: 600 }}>Sign in</Link>
        </p>

      </div>
    </div>
  );
}

/* ── Inline styles ──────────────────────────────────────────── */
const shell = {
  minHeight: '100dvh',
  background: 'linear-gradient(135deg,#f0faf5 0%,#e2f0ea 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const card = {
  background: '#fff',
  border: '1px solid #e2ece8',
  borderRadius: 20,
  padding: '36px 32px',
  width: '100%',
  maxWidth: 440,
  boxShadow: '0 8px 40px rgba(27,58,45,.12)',
};

const logoBox = {
  width: 56,
  height: 56,
  background: 'linear-gradient(135deg,#4a9470,#2d6649)',
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.6rem',
  margin: '0 auto 16px',
  boxShadow: '0 4px 16px rgba(74,148,112,.3)',
};

const heading = {
  fontFamily: "'Playfair Display', serif",
  fontSize: '1.4rem',
  fontWeight: 700,
  color: '#1b3a2d',
  margin: '0 0 4px',
  letterSpacing: '-.02em',
};

const errBox = {
  background: '#fef2f2',
  border: '1px solid rgba(220,38,38,.25)',
  borderRadius: 10,
  padding: '11px 14px',
  color: '#991b1b',
  fontSize: '.84rem',
  marginBottom: 18,
  lineHeight: 1.5,
};

const fieldWrap = { marginBottom: 16 };

const label = {
  display: 'block',
  fontSize: '.75rem',
  fontWeight: 700,
  color: '#5d7d6e',
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  marginBottom: 6,
};

const input = {
  width: '100%',
  padding: '12px 14px',
  background: '#fff',
  border: '1.5px solid #e2ece8',
  borderRadius: 10,
  fontSize: '.95rem',
  color: '#1b3a2d',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color .18s',
};

const eyeBtn = {
  position: 'absolute',
  right: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1rem',
  padding: 0,
  lineHeight: 1,
};

const submitBtn = {
  width: '100%',
  padding: '14px 0',
  background: 'linear-gradient(135deg,#4a9470,#2d6649)',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  marginTop: 8,
  boxShadow: '0 4px 16px rgba(74,148,112,.30)',
};
