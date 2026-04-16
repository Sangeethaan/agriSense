import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../supervisor.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function FarmerProfilePage() {
  const { farmerId }          = useParams();
  const { token, logout }     = useAuth();
  const navigate              = useNavigate();
  const [farmer, setFarmer]   = useState(null);
  const [farms,  setFarms]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!farmerId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API}/api/farmers/${farmerId}/farms`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.status === 401) { logout(); return; }
        if (res.status === 404) { setError('Farmer not found.'); return; }
        if (!res.ok) throw new Error('Failed to load farmer data');
        const data = await res.json();
        if (!cancelled) {
          setFarmer(data.farmer);
          setFarms(data.farms || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [farmerId, token, logout]);

  // ── Navigate to FarmDetailPage — IDs locked to URL params ──
  const goToFarm = (farmId) => {
    navigate(`/supervisor/farmer/${farmerId}/farm/${farmId}`);
  };

  return (
    <div className="sup-shell">
      {/* Nav */}
      <nav className="sup-navbar">
        <div className="sup-nav-crumb">
          <Link to="/supervisor" style={{ color: 'var(--sup-muted)', textDecoration: 'none' }}>
            Farmer Directory
          </Link>
          <span className="sep">›</span>
          <span>{farmer?.name || 'Farmer Profile'}</span>
        </div>
        <button
          className="sup-btn sup-btn-ghost sup-btn-sm"
          onClick={() => navigate('/supervisor')}
        >
          ← Back
        </button>
      </nav>

      <main className="sup-page">
        {/* Loading skeleton */}
        {loading && (
          <>
            <div className="sup-skeleton" style={{ height: 110, borderRadius: 22, marginBottom: 28 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="sup-skeleton" style={{ height: 170, borderRadius: 14 }} />
              ))}
            </div>
          </>
        )}

        {error && !loading && (
          <div className="sup-alert sup-alert-error">⚠️ {error}</div>
        )}

        {!loading && farmer && (
          <>
            {/* ── Profile hero ────────────────────────────── */}
            <div className="sup-profile-hero">
              <div className="sup-profile-avatar">{initials(farmer.name)}</div>
              <div>
                <div className="sup-profile-name">{farmer.name}</div>
                <div className="sup-profile-meta">
                  {farmer.village && <span>📍 {farmer.village}</span>}
                  {farmer.phone   && <span>📞 {farmer.phone}</span>}
                  <span>✉️ {farmer.email}</span>
                </div>
              </div>
            </div>

            {/* ── Farm grid ───────────────────────────────── */}
            <h2 className="sup-section-title" style={{ marginBottom: 4 }}>
              Farm Plots
              <span style={{ fontSize: '.82rem', fontWeight: 500, color: 'var(--sup-muted)', marginLeft: 10 }}>
                ({farms.length})
              </span>
            </h2>
            <p className="sup-section-sub">
              Select a plot to view its full history and start a new visit.
            </p>

            {farms.length === 0 ? (
              <div className="sup-empty">
                <div className="sup-empty-icon">🌿</div>
                <div className="sup-empty-title">No farms registered</div>
                <div className="sup-empty-sub">This farmer has no plots on record yet.</div>
              </div>
            ) : (
              <div className="sup-farm-grid">
                {farms.map(farm => (
                  <div
                    key={farm.id}
                    id={`farm-card-${farm.id}`}
                    className="sup-card sup-farm-card sup-card-interactive"
                    onClick={() => goToFarm(farm.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && goToFarm(farm.id)}
                  >
                    <div className="sup-farm-header">
                      <div className="sup-farm-icon">🌾</div>
                      <div>
                        <div className="sup-farm-name">{farm.name}</div>
                        <div className="sup-farm-loc">
                          {farm.location || 'No location set'}
                        </div>
                      </div>
                    </div>

                    {farm.crop_types?.length > 0 && (
                      <div className="sup-crop-tags">
                        {farm.crop_types.map(c => (
                          <span key={c} className="sup-crop-tag">{c}</span>
                        ))}
                      </div>
                    )}

                    <div className="sup-farm-stats">
                      <div>
                        <strong>{farm.visit_count || 0}</strong>{' '}
                        visit{farm.visit_count !== '1' ? 's' : ''}
                      </div>
                      <div>
                        Last: <strong>
                          {farm.last_visit_date ? formatDate(farm.last_visit_date) : 'Never'}
                        </strong>
                      </div>
                    </div>

                    <button
                      className="sup-btn sup-btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={e => { e.stopPropagation(); goToFarm(farm.id); }}
                      tabIndex={-1}
                    >
                      View Farm →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
