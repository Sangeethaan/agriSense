import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/auth';

const GOOGLE_URL = 'http://localhost:3000/api/auth/google';

// ── SVG Icons ────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const EyeIcon = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

// ── Role data with SVG icons ─────────────────────────────────
const ROLES = [
  {
    value: 'farmer',
    label: 'Farmer',
    desc: 'I grow crops and manage my farm',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#217a4a' : '#8fa99a'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a9 9 0 0 0-9 9c0 4 2.5 7 6 8.5V22h6v-2.5C18.5 18 21 15 21 11a9 9 0 0 0-9-9z"/>
        <path d="M12 6v6M9 9l3-3 3 3"/>
      </svg>
    ),
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    desc: 'I conduct field visits and audit farms',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#217a4a' : '#8fa99a'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        <path d="M11 8v6M8 11h6"/>
      </svg>
    ),
  },
  {
    value: 'manager',
    label: 'Manager',
    desc: 'I oversee operations and teams',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#217a4a' : '#8fa99a'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
        <path d="M7 8h4M7 11h4M15 8h2M15 11h2"/>
      </svg>
    ),
  },
];

// ── Sidebar (shared w/ Login) ─────────────────────────────────
function Sidebar() {
  return (
    <aside className="auth-sidebar">
      <div className="sb-orb sb-orb-1" />
      <div className="sb-orb sb-orb-2" />
      <div className="sb-orb sb-orb-3" />
      <div className="sb-orb sb-orb-4" />

      <div className="sb-content">
        <div className="sb-logo">
          <div className="sb-logo-mark">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <path d="M16 3C10.5 3 5 8 5 14c0 4 2 7.5 5.5 9.5L12 28h8l1.5-4.5C25 21.5 27 18 27 14c0-6-5.5-11-11-11z" fill="rgba(255,255,255,.9)"/>
              <path d="M16 8v10M12.5 12l3.5-4 3.5 4" stroke="rgba(14,67,42,.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="sb-logo-text">AgriSense</span>
        </div>

        <h2 className="sb-headline">
          Join the future<br />of <em>smart farming.</em>
        </h2>
        <p className="sb-sub">
          AI-Powered Field Conversation Intelligence — capture farm visits, transcribe field notes, and generate reports across 12 Indian languages.
        </p>

        <div className="sb-stats">
          {[
            { icon: '🌿', label: 'Active Farms',  value: '1,200+'  },
            { icon: '📊', label: 'Reports / Day', value: '400+'    },
            { icon: '⚡',  label: 'Report Speed', value: '< 60 sec' },
          ].map(s => (
            <div className="sb-stat" key={s.label}>
              <div className="sb-stat-icon">{s.icon}</div>
              <div>
                <div className="sb-stat-label">{s.label}</div>
                <div className="sb-stat-value">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ── SignupPage ────────────────────────────────────────────────
export default function SignupPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [role, setRole]           = useState('');
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [alert, setAlert]         = useState(null);

  const roleSelected = !!role;

  const handleRoleSelect = (v) => {
    setRole(v);
    setAlert(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    if (!role)               return setAlert({ type: 'error', msg: 'Please select your role.' });
    if (!name.trim())        return setAlert({ type: 'error', msg: 'Full name is required.' });
    if (!email)              return setAlert({ type: 'error', msg: 'Email address is required.' });
    if (password.length < 8) return setAlert({ type: 'error', msg: 'Password must be at least 8 characters.' });

    try {
      setLoading(true);
      const data = await authAPI.register({ name: name.trim(), email, password, role });
      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <Sidebar />

      <main className="auth-panel">
        <div className="auth-card">
          <span className="auth-eyebrow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="5"/></svg>
            Create Account
          </span>
          <h1 className="auth-title">Get started</h1>
          <p className="auth-subtitle">
            First, choose how you'll use AgriSense.
          </p>

          {/* ── Step 1: Role selection (always visible) ── */}
          <p className="role-section-label">Select your role</p>
          <div className="role-grid">
            {ROLES.map(r => (
              <button
                key={r.value}
                type="button"
                className={`role-card ${role === r.value ? 'active' : ''}`}
                onClick={() => handleRoleSelect(r.value)}
                aria-pressed={role === r.value}
              >
                <div className="role-icon-wrap">
                  {r.icon(role === r.value)}
                </div>
                <div className="role-card-body">
                  <div className="role-card-name">{r.label}</div>
                  <div className="role-card-desc">{r.desc}</div>
                </div>
                <div className="role-check" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2 6 5 9 10 3"/>
                  </svg>
                </div>
              </button>
            ))}
          </div>

          {/* ── Step 2: Registration options (revealed after role pick) ── */}
          <div className={`reg-options ${roleSelected ? 'visible' : 'hidden'}`}>

            {alert && (
              <div className={`auth-alert ${alert.type}`} role="alert">
                {alert.type === 'error'
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  : '✓'
                }
                {alert.msg}
              </div>
            )}

            {/* Google */}
            <button
              className="btn-google"
              type="button"
              onClick={() => (window.location.href = GOOGLE_URL)}
              style={{ marginBottom: 0 }}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="auth-divider">or register with email</div>

            <form onSubmit={handleSubmit} noValidate>
              {/* Name */}
              <div className="form-group">
                <label className="form-label" htmlFor="signup-name">Full Name</label>
                <div className="field-wrap">
                  <span className="field-icon"><UserIcon /></span>
                  <input
                    id="signup-name"
                    type="text"
                    className="field-input"
                    placeholder="Ravi Kumar"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="form-group">
                <label className="form-label" htmlFor="signup-email">Email Address</label>
                <div className="field-wrap">
                  <span className="field-icon"><MailIcon /></span>
                  <input
                    id="signup-email"
                    type="email"
                    className="field-input"
                    placeholder="ravi@agrisense.app"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="signup-password">Password</label>
                <div className="field-wrap">
                  <span className="field-icon"><LockIcon /></span>
                  <input
                    id="signup-password"
                    type={showPwd ? 'text' : 'password'}
                    className="field-input"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" className="field-eye" aria-label={showPwd ? 'Hide' : 'Show'} onClick={() => setShowPwd(s => !s)}>
                    <EyeIcon open={showPwd} />
                  </button>
                </div>
              </div>

              <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
                {loading
                  ? <><span className="spinner" /> Creating account…</>
                  : `Create ${role.charAt(0).toUpperCase() + role.slice(1)} Account →`
                }
              </button>
            </form>
          </div>

          <p className="auth-footer" style={{ marginTop: roleSelected ? 22 : 12 }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
