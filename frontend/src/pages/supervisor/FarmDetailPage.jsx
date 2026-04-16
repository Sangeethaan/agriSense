import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import VisitCard from '../../components/supervisor/VisitCard';
import '../../supervisor.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const CATEGORIES = ['Irrigation', 'Pesticide', 'Crop Health', 'Fertilizer', 'General'];

export default function FarmDetailPage() {
  // ── IDs are strictly sourced from URL — the "No Mix-Up" lock ──
  const { farmerId, farmId } = useParams();
  const { token, logout }    = useAuth();
  const navigate             = useNavigate();

  const [farm,     setFarm]     = useState(null);
  const [farmer,   setFarmer]   = useState(null);
  const [visits,   setVisits]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [selCat,   setSelCat]   = useState('General');

  // ── Fetch farm meta & visit history ─────────────────────────
  useEffect(() => {
    if (!farmId || !farmerId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Farmer info (for breadcrumb / hero)
        const fRes = await fetch(
          `${API}/api/farmers/${farmerId}/farms`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (fRes.status === 401) { logout(); return; }
        if (!fRes.ok) throw new Error('Failed to load farmer data');
        const fData = await fRes.json();

        // 2. Visit history for this specific farm
        const hRes = await fetch(
          `${API}/api/farms/${farmId}/history`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!hRes.ok) throw new Error('Failed to load visit history');
        const hData = await hRes.json();

        if (!cancelled) {
          setFarmer(fData.farmer);
          // Find the specific farm from the list
          const thisFarm = fData.farms.find(f => f.id === farmId);
          setFarm(thisFarm || { name: 'Farm', id: farmId });
          setVisits(hData.visits || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [farmId, farmerId, token, logout]);

  return (
    <div className="sup-shell">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="sup-navbar">
        <div className="sup-nav-crumb">
          <Link to="/supervisor"
            style={{ color: 'var(--sup-muted)', textDecoration: 'none' }}>
            Directory
          </Link>
          <span className="sep">›</span>
          <Link to={`/supervisor/farmer/${farmerId}`}
            style={{ color: 'var(--sup-muted)', textDecoration: 'none' }}>
            {farmer?.name || '…'}
          </Link>
          <span className="sep">›</span>
          <span>{farm?.name || '…'}</span>
        </div>
        <button
          className="sup-btn sup-btn-ghost sup-btn-sm"
          onClick={() => navigate(`/supervisor/farmer/${farmerId}`)}
        >
          ← Back
        </button>
      </nav>

      <main className="sup-page">
        {error && (
          <div className="sup-alert sup-alert-error">⚠️ {error}</div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="sup-skeleton" style={{ height: 110, borderRadius: 14 }} />
            <div className="sup-skeleton" style={{ height: 160, borderRadius: 14 }} />
            <div className="sup-skeleton" style={{ height: 100, borderRadius: 14 }} />
            <div className="sup-skeleton" style={{ height: 100, borderRadius: 14 }} />
          </div>
        )}

        {!loading && farm && (
          <>
            {/* ── Section 1: Living Master Report ─────────── */}
            <section aria-label="Living Master Report">
              <div className="sup-master-card sup-card">
                <div className="sup-live-badge">
                  <span className="sup-live-dot" />
                  LIVE
                </div>
                <h2 style={{
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: 'var(--sup-text)',
                  marginBottom: 6,
                }}>
                  Living Master Report
                </h2>
                <p style={{
                  fontSize: '.88rem',
                  color: 'var(--sup-muted)',
                  lineHeight: 1.6,
                  maxWidth: 520,
                  marginBottom: 20,
                }}>
                  This document is automatically compiled by Sarvam-30B from all visit transcripts
                  for <strong>{farm.name}</strong>. It updates after every documented visit.
                </p>
                <div style={{
                  background: 'rgba(245,251,248,.8)',
                  border: '1px dashed var(--sage-300)',
                  borderRadius: 10,
                  padding: '18px 20px',
                  color: 'var(--sup-muted)',
                  fontSize: '.84rem',
                  fontStyle: 'italic',
                }}>
                  📋 No AI-generated report yet. Complete and document your first visit to generate one.
                </div>
              </div>
            </section>

            {/* ── Section 2: Start New Visit ───────────────── */}
            <section aria-label="Start New Visit" style={{ marginTop: 28 }}>
              <div className="sup-action-area">
                <div className="sup-action-title">Start New Visit</div>

                {/* Category selector */}
                <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--sup-muted)', marginBottom: 10 }}>
                  Visit Category
                </div>
                <div className="sup-category-row" role="group" aria-label="Visit category">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      id={`cat-btn-${cat.toLowerCase().replace(' ', '-')}`}
                      className={`sup-cat-btn${selCat === cat ? ' active' : ''}`}
                      onClick={() => setSelCat(cat)}
                      aria-pressed={selCat === cat}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Data integrity notice — context lock */}
                <div style={{
                  fontSize: '.74rem',
                  color: 'var(--sup-muted)',
                  background: 'var(--sage-50)',
                  border: '1px solid var(--sage-100)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}>
                  🔒 All data on this page is locked to:
                  <strong style={{ color: 'var(--sage-700)' }}>{farmer?.name}</strong> ›
                  <strong style={{ color: 'var(--sage-700)' }}>{farm.name}</strong>
                </div>

                {/* Action buttons (wired up in next phase) */}
                <div className="sup-action-btns">
                  <button
                    id="btn-record-audio"
                    className="sup-btn sup-btn-primary"
                    onClick={() => alert('Audio recording — coming in next phase')}
                  >
                    🎙️ Record Audio
                  </button>
                  <button
                    id="btn-upload-audio"
                    className="sup-btn sup-btn-ghost"
                    onClick={() => alert('Audio upload — coming in next phase')}
                  >
                    📁 Upload Audio
                  </button>
                </div>
              </div>
            </section>

            {/* ── Section 3: Visit History Timeline ────────── */}
            <section aria-label="Visit History" style={{ marginTop: 8 }}>
              <h2 className="sup-section-title" style={{ marginBottom: 4 }}>
                Visit History
                {visits.length > 0 && (
                  <span style={{ fontSize: '.82rem', fontWeight: 500, color: 'var(--sup-muted)', marginLeft: 10 }}>
                    ({visits.length} visit{visits.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h2>
              <p className="sup-section-sub">
                Chronological log of all field visits for this plot.
              </p>

              {visits.length === 0 ? (
                <div className="sup-empty" style={{ paddingTop: 40 }}>
                  <div className="sup-empty-icon">📋</div>
                  <div className="sup-empty-title">No visits yet</div>
                  <div className="sup-empty-sub">
                    Use "Start New Visit" above to record the first field visit.
                  </div>
                </div>
              ) : (
                <div className="sup-timeline">
                  {visits.map(visit => (
                    <VisitCard key={visit.id} visit={visit} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
