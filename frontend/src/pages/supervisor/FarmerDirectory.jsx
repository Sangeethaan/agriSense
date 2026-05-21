import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../supervisor.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const CATEGORY_CLASS = {
  'Irrigation':   'irrigation',
  'Pesticide':    'pesticide',
  'Crop Health':  'crop-health',
  'Fertilizer':   'fertilizer',
  'Disease':      'disease',
  'Urgent':       'urgent',
  'General':      'general',
  'Farmer Note':  'farmer-note',
};

/* ── Debounce hook ─────────────────────────────────────────── */
function useDebounce(value, delay = 380) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}


/* ── Shared Supervisor Navbar ─────────────────────────────── */
export function SupervisorNav({ crumbs }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="sup-navbar">
      {/* Brand / Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="sup-nav-brand" onClick={() => navigate('/supervisor')}
          style={{ cursor: 'pointer' }}>
          <div className="sup-nav-logo">
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C12 22 4 16 4 9a8 8 0 0 1 16 0c0 7-8 13-8 13z" fill="#4ade80" opacity=".25"/>
              <path d="M12 22C12 22 4 16 4 9a8 8 0 0 1 16 0c0 7-8 13-8 13z" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 22V11" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="sup-nav-title">AgriSense</div>
            <div className="sup-nav-sub">Supervisor Portal</div>
          </div>
        </div>

        {crumbs && crumbs.length > 0 && (
          <div className="sup-nav-crumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="sep" style={{ color: 'var(--sup-border)' }}>›</span>
                {c.href
                  ? <span
                      onClick={() => navigate(c.href)}
                      style={{ color: 'var(--sup-muted)', cursor: 'pointer' }}
                    >{c.label}</span>
                  : <span style={{ color: 'var(--sup-text)', fontWeight: 600 }}>{c.label}</span>
                }
              </span>
            ))}
          </div>
        )}
      </div>

      {/* User info + Sign Out */}
      <div className="sup-nav-user">
        <div className="sup-nav-user-info">
          <span className="sup-nav-user-name">{user?.name}</span>
          <span className="sup-nav-role-badge">Supervisor</span>
        </div>
        <button
          id="btn-supervisor-signout"
          className="sup-btn-signout"
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}

/* ── Metric Card ─────────────────────────────────────────────── */
function MetricCard({ icon, value, label, accent, loading }) {
  return (
    <div className={`sup-metric-card ${accent ? `accent-${accent}` : ''} ${loading ? 'is-loading' : ''}`}>
      <span className="sup-metric-icon">{icon}</span>
      <div className="sup-metric-value">{loading ? '' : value}</div>
      <div className="sup-metric-label">{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Supervisor Dashboard (root: /supervisor)
═══════════════════════════════════════════════════════════════ */
export default function FarmerDirectory() {
  const { token, logout, user } = useAuth();
  const navigate = useNavigate();

  /* Stats */
  const [stats, setStats]               = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* All farmers */
  const [allFarmers, setAllFarmers]           = useState([]);
  const [farmersLoading, setFarmersLoading]   = useState(true);
  const [farmersExpanded, setFarmersExpanded] = useState(false);
  const [copyStatus, setCopyStatus]           = useState('idle'); // 'idle' | 'copying' | 'copied'
  const FARMERS_PREVIEW = 3;

  /* My last visits */
  const [myVisits, setMyVisits]         = useState([]);
  const [myVisitsLoading, setMyVisitsLoading] = useState(true);

  /* Search */
  const [query,   setQuery]   = useState('');
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const inputRef  = useRef(null);
  const debouncedQ = useDebounce(query);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  /* ── Fetch metrics ────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/supervisor/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        // Silently fail — metrics are non-critical
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, logout]);

  /* ── Fetch all farmers ────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/supervisor/farmers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setAllFarmers(data.farmers || []);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setFarmersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, logout]);

  /* ── Fetch my recent visits ───────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/supervisor/my-visits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setMyVisits(data.visits || []);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setMyVisitsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, logout]);

  /* ── Farmer search ────────────────────────────────────────── */
  const search = useCallback(async (q) => {
    if (!q.trim()) { setFarmers([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API}/api/farmers/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) { logout(); return; }
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setFarmers(data.farmers || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => { search(debouncedQ); }, [debouncedQ, search]);

  /* Farmers shown (collapsed vs expanded) */
  const visibleFarmers = farmersExpanded
    ? allFarmers
    : allFarmers.slice(0, FARMERS_PREVIEW);
  const hasMore = allFarmers.length > FARMERS_PREVIEW;

  /* Called when a new farmer is created via invite modal */
  const handleFarmerInvited = (newFarmer) => {
    setAllFarmers(prev => [...prev, { ...newFarmer, farm_count: '0', status: 'pending' }]
      .sort((a, b) => a.name.localeCompare(b.name)));
  };

  /* Copy the supervisor's permanent invite link to clipboard */
  const copyInviteLink = async () => {
    if (copyStatus !== 'idle') return;
    setCopyStatus('copying');
    try {
      const res  = await fetch(`${API}/api/supervisor/my-invite-link`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      await navigator.clipboard.writeText(data.invite_url);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2500);
    } catch {
      setCopyStatus('idle');
      alert('Could not copy link. Please try again.');
    }
  };

  return (
    <div className="sup-shell">
      <SupervisorNav />

      <main className="sup-page">

        {/* ── Page Header ──────────────────────────────────────── */}
        <div className="sup-page-header">
          <div>
            <h1 className="sup-page-title">Supervisor Dashboard</h1>
            <p className="sup-page-date">{today}</p>
          </div>
          <div className="sup-page-header-right">
            <span className="sup-page-role-tag">Supervisor</span>
          </div>
        </div>

        {/* ── Metric Cards ─────────────────────────────────────── */}
        <div className="sup-metric-row">
          <MetricCard
            icon="🌾"
            value={stats?.total_farms ?? 0}
            label="Total Farms"
            loading={statsLoading}
          />
          <MetricCard
            icon="📅"
            value={stats?.active_visits ?? 0}
            label="Visits This Week"
            accent="amber"
            loading={statsLoading}
          />
          <MetricCard
            icon="👥"
            value={stats?.total_farmers ?? 0}
            label="Registered Farmers"
            accent="blue"
            loading={statsLoading}
          />
          <MetricCard
            icon="📋"
            value={stats?.monthly_visits ?? 0}
            label="Visits This Month"
            loading={statsLoading}
          />
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 1 — SEARCH (moved to top)
        ══════════════════════════════════════════════════════ */}
        <div className="sup-section-block">
          <div className="sup-section-header">
            <div className="sup-section-header-left">
              <div>
                <div className="sup-section-title-text">Find a Farmer</div>
                <div className="sup-section-subtitle">Search by name, village, or farm location</div>
              </div>
            </div>
          </div>

          <div className="sup-search-wrap" style={{ marginBottom: 0 }}>
            <span className="sup-search-icon">🔍</span>
            <input
              ref={inputRef}
              id="farmer-search-input"
              type="text"
              className="sup-search-input"
              placeholder="Search by name, village, or farm location…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sup-muted)', fontSize: '1rem', padding: '0 8px' }}
              >×</button>
            )}
          </div>

          {error && (
            <div className="sup-alert sup-alert-error" style={{ marginTop: 14 }}>{error}</div>
          )}

          {loading && (
            <div className="sup-farmer-list" style={{ marginTop: 16 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="sup-card"
                  style={{ padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div className="sup-skeleton"
                    style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sup-skeleton" style={{ height: 14, width: '40%', marginBottom: 8 }} />
                    <div className="sup-skeleton" style={{ height: 11, width: '60%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && farmers.length === 0 && query.trim() && !error && (
            <div className="sup-empty" style={{ padding: '28px 0' }}>
              <div className="sup-empty-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 20C12 20 5 14 5 9a7 7 0 0 1 14 0c0 5-7 11-7 11z" fill="#4ade80" opacity=".25"/><path d="M12 20C12 20 5 14 5 9a7 7 0 0 1 14 0c0 5-7 11-7 11z" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 20V10" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
              <div className="sup-empty-title">No farmers found</div>
              <div className="sup-empty-sub">Try a different name, village, or farm area.</div>
            </div>
          )}

          {!loading && !query.trim() && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 16px', marginTop: 10,
              background: 'var(--sage-50)', border: '1px solid var(--sage-100)',
              borderRadius: 10, fontSize: '.82rem', color: 'var(--sup-muted)',
            }}>
              Start typing to search across all farmers in your network
            </div>
          )}

          {!loading && farmers.length > 0 && (
            <div className="sup-farmer-list" style={{ marginTop: 16 }}>
              {farmers.map(farmer => (
                <div
                  key={farmer.id}
                  id={`search-farmer-card-${farmer.id}`}
                  className="sup-card sup-farmer-card sup-card-interactive"
                  onClick={() => navigate(`/supervisor/farmer/${farmer.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate(`/supervisor/farmer/${farmer.id}`)}
                >
                  <div className="sup-farmer-avatar">{initials(farmer.name)}</div>
                  <div className="sup-farmer-info">
                    <div className="sup-farmer-name">{farmer.name}</div>
                    <div className="sup-farmer-meta">
                      <span>{farmer.farm_count || 0} plot{farmer.farm_count !== '1' ? 's' : ''}</span>
                    </div>
                  </div>
                  <button
                    className="sup-btn sup-btn-primary sup-btn-sm"
                    onClick={e => { e.stopPropagation(); navigate(`/supervisor/farmer/${farmer.id}`); }}
                    tabIndex={-1}
                  >
                    View Profile →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 2 — YOUR FARMERS (moved below search)
        ══════════════════════════════════════════════════════ */}
        <div className="sup-section-block">
          <div className="sup-section-header">
            <div className="sup-section-header-left">
              <div>
                <div className="sup-section-title-text">Your Farmers</div>
                <div className="sup-section-subtitle">
                  {farmersLoading
                    ? 'Loading…'
                    : `${allFarmers.length} farmer${allFarmers.length !== 1 ? 's' : ''} in your network`}
                </div>
              </div>
            </div>
            <button
              id="btn-copy-invite-link"
              className="sup-btn sup-btn-primary sup-btn-sm"
              onClick={copyInviteLink}
              disabled={copyStatus !== 'idle'}
            >
              {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'copying' ? '⋯' : 'Copy Invite Link'}
            </button>
          </div>

          {farmersLoading && (
            <div className="sup-farmer-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="sup-card"
                  style={{ padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div className="sup-skeleton"
                    style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sup-skeleton" style={{ height: 14, width: '40%', marginBottom: 8 }} />
                    <div className="sup-skeleton" style={{ height: 11, width: '60%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!farmersLoading && allFarmers.length === 0 && (
            <div className="sup-empty" style={{ padding: '32px 0' }}>
              <div className="sup-empty-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 20C12 20 5 14 5 9a7 7 0 0 1 14 0c0 5-7 11-7 11z" fill="#4ade80" opacity=".25"/><path d="M12 20C12 20 5 14 5 9a7 7 0 0 1 14 0c0 5-7 11-7 11z" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 20V10" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
              <div className="sup-empty-title">No farmers yet</div>
              <div className="sup-empty-sub">Use the <strong>Copy Invite Link</strong> above to add your first farmer.</div>
            </div>
          )}

          {!farmersLoading && allFarmers.length > 0 && (
            <>
              <div className="sup-farmer-list">
                {visibleFarmers.map(farmer => (
                  <div
                    key={farmer.id}
                    id={`farmer-card-${farmer.id}`}
                    className="sup-card sup-farmer-card sup-card-interactive"
                    onClick={() => navigate(`/supervisor/farmer/${farmer.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/supervisor/farmer/${farmer.id}`)}
                  >
                    <div className="sup-farmer-avatar" style={{
                      background: farmer.status === 'pending'
                        ? 'linear-gradient(135deg,#fef3c7,#fde68a)'
                        : undefined,
                      color: farmer.status === 'pending' ? '#92400e' : undefined,
                    }}>{initials(farmer.name)}</div>
                    <div className="sup-farmer-info">
                      <div className="sup-farmer-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {farmer.name}
                        {farmer.status === 'pending' && (
                          <span style={{
                            fontSize: '.62rem', fontWeight: 700, padding: '2px 7px',
                            background: '#fef3c7', color: '#92400e',
                            borderRadius: 99, border: '1px solid #fde68a',
                            textTransform: 'uppercase', letterSpacing: '.05em',
                          }}>Invite Pending</span>
                        )}
                      </div>
                      <div className="sup-farmer-meta">
                        <span>{farmer.farm_count || 0} plot{farmer.farm_count !== '1' ? 's' : ''}</span>
                      </div>
                    </div>
                    <button
                      className="sup-btn sup-btn-primary sup-btn-sm"
                      onClick={e => { e.stopPropagation(); navigate(`/supervisor/farmer/${farmer.id}`); }}
                      tabIndex={-1}
                      disabled={farmer.status === 'pending'}
                      style={farmer.status === 'pending' ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    >
                      {farmer.status === 'pending' ? 'Awaiting…' : 'View Profile →'}
                    </button>
                  </div>
                ))}
              </div>

              {hasMore && (
                <button
                  className="sup-expand-btn"
                  onClick={() => setFarmersExpanded(v => !v)}
                  id="btn-farmers-expand"
                >
                  {farmersExpanded
                    ? '▲ Show less'
                    : `▼ Show ${allFarmers.length - FARMERS_PREVIEW} more farmer${allFarmers.length - FARMERS_PREVIEW !== 1 ? 's' : ''}`
                  }
                </button>
              )}
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 3 — MY LAST 5 VISITS
        ══════════════════════════════════════════════════════ */}
        <div className="sup-section-block">
          <div className="sup-section-header">
            <div className="sup-section-header-left">
              
              <div>
                <div className="sup-section-title-text">My Recent Visits</div>
                <div className="sup-section-subtitle">Last 5 visits you recorded with farmers</div>
              </div>
            </div>
          </div>

          {myVisitsLoading && (
            <div className="sup-intel-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="sup-intel-item">
                  <div style={{ flex: 1 }}>
                    <div className="sup-skeleton" style={{ height: 13, width: '35%', marginBottom: 7 }} />
                    <div className="sup-skeleton" style={{ height: 11, width: '65%' }} />
                  </div>
                  <div className="sup-skeleton" style={{ height: 22, width: 72, borderRadius: 99 }} />
                </div>
              ))}
            </div>
          )}

          {!myVisitsLoading && myVisits.length === 0 && (
            <div className="sup-empty" style={{ padding: '32px 0' }}>
              
              <div className="sup-empty-title">No visits recorded yet</div>
              <div className="sup-empty-sub">Your field visits will appear here once you start recording.</div>
            </div>
          )}

          {!myVisitsLoading && myVisits.length > 0 && (
            <div className="sup-my-visits-list">
              {myVisits.map(v => {
                const cls = CATEGORY_CLASS[v.category] || 'general';
                const snippet = v.transcript_snippet
                  ? v.transcript_snippet.slice(0, 120) + (v.transcript_snippet.length > 120 ? '…' : '')
                  : v.supervisor_notes
                    ? v.supervisor_notes.slice(0, 120) + (v.supervisor_notes.length > 120 ? '…' : '')
                    : v.notes
                      ? v.notes.slice(0, 120) + (v.notes.length > 120 ? '…' : '')
                      : null;
                return (
                  <div
                    key={v.id}
                    className="sup-my-visit-card sup-card-interactive"
                    onClick={() => navigate(`/supervisor/farmer/${v.farmer_id}/farm/${v.farm_id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/supervisor/farmer/${v.farmer_id}/farm/${v.farm_id}`)}
                  >
                    <div className="sup-my-visit-left">
                      <div className="sup-my-visit-date">{fmtDate(v.visit_date || v.created_at)}</div>
                      <div className="sup-my-visit-names">
                        <span className="sup-my-visit-farmer">{v.farmer_name}</span>
                        <span className="sup-my-visit-dot">·</span>
                        <span className="sup-my-visit-farm">{v.farm_name}</span>
                      </div>
                      {snippet && <div className="sup-my-visit-snippet">{snippet}</div>}
                    </div>
                    <div className="sup-my-visit-right">
                      <span className={`sup-badge sup-badge-${cls}`}>{v.category || 'General'}</span>
                      <span className="sup-my-visit-ago">{timeAgo(v.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
