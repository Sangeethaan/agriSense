import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../supervisor.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/* ── Debounce hook ─────────────────────────────────────────── */
function useDebounce(value, delay = 380) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ── Farmer initials helper ────────────────────────────────── */
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function FarmerDirectory() {
  const { token, logout }  = useAuth();
  const navigate           = useNavigate();
  const [query, setQuery]  = useState('');
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const inputRef              = useRef(null);
  const debouncedQ            = useDebounce(query);

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

  // Auto-focus search on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="sup-shell">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="sup-navbar">
        <div className="sup-nav-brand">
          <div className="sup-nav-logo">🌱</div>
          <div>
            <div className="sup-nav-title">AgriSense</div>
            <div className="sup-nav-sub">Supervisor Portal</div>
          </div>
        </div>
        <button
          className="sup-btn sup-btn-ghost sup-btn-sm"
          onClick={() => navigate('/dashboard')}
        >
          ← Dashboard
        </button>
      </nav>

      {/* ── Page ────────────────────────────────────────────── */}
      <main className="sup-page">
        <h1 className="sup-section-title">Farmer Directory</h1>
        <p className="sup-section-sub">
          Search by farmer name, village, or farm location to find and visit their plots.
        </p>

        {/* Search bar */}
        <div className="sup-search-wrap">
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
        </div>

        {/* Results */}
        {error && (
          <div className="sup-alert sup-alert-error">⚠️ {error}</div>
        )}

        {loading && (
          <div className="sup-farmer-list">
            {[1, 2, 3].map(i => (
              <div key={i} className="sup-card" style={{ padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div className="sup-skeleton" style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="sup-skeleton" style={{ height: 14, width: '45%', marginBottom: 8 }} />
                  <div className="sup-skeleton" style={{ height: 11, width: '65%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && farmers.length === 0 && query.trim() && !error && (
          <div className="sup-empty">
            <div className="sup-empty-icon">🌾</div>
            <div className="sup-empty-title">No farmers found</div>
            <div className="sup-empty-sub">
              Try searching by name, village, or farm area.
            </div>
          </div>
        )}

        {!loading && farmers.length === 0 && !query.trim() && (
          <div className="sup-empty">
            <div className="sup-empty-icon">🔎</div>
            <div className="sup-empty-title">Start searching</div>
            <div className="sup-empty-sub">Type above to find farmers in your area.</div>
          </div>
        )}

        {!loading && farmers.length > 0 && (
          <div className="sup-farmer-list">
            {farmers.map(farmer => (
              <div
                key={farmer.id}
                id={`farmer-card-${farmer.id}`}
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
                    {farmer.village && <span>📍 {farmer.village}</span>}
                    {farmer.village && <span className="dot">·</span>}
                    <span>🌾 {farmer.farm_count || 0} plot{farmer.farm_count !== '1' ? 's' : ''}</span>
                    {farmer.phone && <><span className="dot">·</span><span>📞 {farmer.phone}</span></>}
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
      </main>
    </div>
  );
}
