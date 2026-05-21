import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { downloadReportPdf } from '../../utils/generateReportPdf';
import '../../manager.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TIER_CONFIG = {
  red:    { label: 'At Risk',   cssClass: 'mg-tier-red'    },
  yellow: { label: 'Attention', cssClass: 'mg-tier-yellow' },
  green:  { label: 'Healthy',   cssClass: 'mg-tier-green'  },
  grey:   { label: 'No Data',   cssClass: 'mg-tier-grey'   },
};

function daysAgoLabel(days) {
  if (days === null || days === undefined) return 'Never visited';
  if (days === 0) return 'Visited today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ManagerNav({ user, logout }) {
  const initials = user?.name
    ?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'M';

  return (
    <header className="mg-header">
      <div className="mg-header-inner">
        <div className="mg-header-left">
          <div class="mg-logo-mark"><svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M3 21h18M9 21V11l3-3 3 3v10M5 21V13l-2 2M19 21V13l2 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
          <div>
            <div className="mg-logo-text">AgriSense</div>
            <div className="mg-portal-badge">Manager Portal</div>
          </div>
        </div>
        <div className="mg-header-right">
          <div className="mg-user-chip">
            <div className="mg-user-avatar">{initials}</div>
            <span className="mg-user-name">{user?.name}</span>
          </div>
          <button className="mg-signout" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </header>
  );
}

function KpiCard({ label, count, tier, active, onClick }) {
  return (
    <button
      className={`mg-kpi-card ${tier ? `mg-kpi-${tier}` : 'mg-kpi-total'} ${active ? 'mg-kpi-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="mg-kpi-count">{count ?? '—'}</div>
      <div className="mg-kpi-label">{label}</div>
      {tier && <div className="mg-kpi-hint">Click to filter</div>}
    </button>
  );
}

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.grey;
  return (
    <span className={`mg-tier-badge ${cfg.cssClass}`}>
      <span className="mg-tier-dot" />
      {cfg.label}
    </span>
  );
}

function FarmCard({ farm, onClick, token }) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleReportDownload = async (e) => {
    e.stopPropagation(); // prevent card click/navigation
    setDownloadingPdf(true);
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${API}/api/farms/${farm.id}/saved-reports/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No saved report');
      const data = await res.json();
      await downloadReportPdf(data, 'manager', null);
    } catch (e) {
      console.error('PDF download failed:', e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div
      className={`mg-farm-card mg-farm-${farm.health_tier}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-label={`${farm.name} — ${TIER_CONFIG[farm.health_tier]?.label}`}
    >
      <div className="mg-farm-header">
        <div className="mg-farm-name">{farm.name}</div>
        <TierBadge tier={farm.health_tier} />
      </div>

      <div className="mg-farm-meta">
        <span className="mg-farm-meta-row">
          <span class="mg-meta-icon"><svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
          {farm.farmer_name}
          {farm.farmer_village && (
            <span className="mg-meta-muted"> · {farm.farmer_village}</span>
          )}
        </span>
        <span className="mg-farm-meta-row">
          <span class="mg-meta-icon"><svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
          {farm.supervisor_name
            ? farm.supervisor_name
            : <em className="mg-meta-muted">Unassigned</em>
          }
        </span>
      </div>

      <div className="mg-farm-footer">
        <span className="mg-visit-label">
          {daysAgoLabel(farm.days_since_visit)}
        </span>
        {farm.risk_count > 0 && (
          <span className="mg-risk-chip">
            {farm.risk_count} risk{farm.risk_count > 1 ? 's' : ''}
          </span>
        )}
        {farm.health_tier === 'yellow' && farm.task_count > 0 && farm.risk_count === 0 && (
          <span className="mg-task-chip">
            {farm.completed_count}/{farm.task_count} tasks
          </span>
        )}
        {/* Report download button — only shown if a saved report exists */}
        <button
          onClick={handleReportDownload}
          disabled={downloadingPdf}
          title={farm.has_saved_report ? 'Download Farm Health Report PDF' : 'No report saved yet'}
          style={{
            padding: '3px 10px',
            borderRadius: 99,
            border: farm.has_saved_report ? '1.5px solid #86efac' : '1.5px solid #e5e7eb',
            background: farm.has_saved_report ? '#f0fdf4' : '#f9fafb',
            color: farm.has_saved_report ? '#166534' : '#9ca3af',
            fontSize: '.7rem', fontWeight: 600,
            cursor: farm.has_saved_report && !downloadingPdf ? 'pointer' : 'default',
            opacity: downloadingPdf ? 0.6 : 1,
            marginLeft: 'auto',
            pointerEvents: farm.has_saved_report ? 'auto' : 'none',
          }}
        >
          {downloadingPdf ? 'Loading…' : farm.has_saved_report ? 'Report' : 'No report'}
        </button>
      </div>
    </div>
  );
}

function AuditCard({ audit, followed, onFollowUp }) {
  const tier = audit.status?.toLowerCase() === 'red' ? 'red' : 'yellow';

  // Build the oversight line from SQL data (no AI needed)
  const daysLabel = audit.days_since_visit === null || audit.days_since_visit === undefined
    ? 'Never visited'
    : audit.days_since_visit === 0
      ? 'Visited today'
      : audit.days_since_visit === 1
        ? 'Visited yesterday'
        : `Visited ${audit.days_since_visit} days ago`;

  const taskPct = audit.total_tasks > 0
    ? Math.round((audit.completed_count / audit.total_tasks) * 100)
    : null;

  return (
    <div className={`mg-audit-card mg-audit-${tier}`}>
      <div className="mg-audit-header">
        <span className={`mg-audit-dot mg-audit-dot-${tier}`} />
        <span className="mg-audit-farm-name">{audit.farm_name}</span>
        <span className={`mg-audit-badge mg-audit-badge-${tier}`}>{audit.status}</span>
      </div>

      <div className="mg-audit-people">
        <span className="mg-audit-person mg-audit-farmer">{audit.farmer_name}</span>
        <button
          className="mg-audit-person mg-audit-supervisor"
          onClick={() => onFollowUp(audit)}
          title="Mark follow-up reminder"
        >
          {audit.supervisor_name}
          <span className="mg-sup-arrow">↗</span>
        </button>
        {followed && <span className="mg-follow-toast">Noted</span>}
      </div>

      {/* SQL-derived oversight line (factual, no AI) */}
      <div style={{
        fontSize: '.78rem',
        color: '#555',
        padding: '6px 12px',
        background: '#f8f9fa',
        border: '1px solid #eee',
        borderRadius: 7,
        marginTop: 6,
        lineHeight: 1.5,
      }}>
        <span style={{ fontWeight: 600 }}>{daysLabel}</span>
        {taskPct !== null && (
          <>
            {' · '}
            <span style={{
              fontWeight: 600,
              color: taskPct >= 100 ? '#16a34a' : taskPct >= 50 ? '#d97706' : '#dc2626',
            }}>
              {audit.completed_count}/{audit.total_tasks} tasks ({taskPct}%)
            </span>
          </>
        )}
      </div>

      {audit.situation && (
        <div className="mg-audit-situation">
          <span className="mg-situation-icon">!</span>
          <span>{audit.situation}</span>
        </div>
      )}

      {audit.action && (
        <div className="mg-audit-action">
          <span className="mg-action-arrow">→</span>
          <span>{audit.action}</span>
        </div>
      )}
    </div>
  );
}

function BriefingPanel({ token }) {
  const [loading,     setLoading]     = useState(false);
  const [briefing,    setBriefing]    = useState(null);
  const [error,       setError]       = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [followedUp,  setFollowedUp]  = useState(new Set());

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/manager/briefing`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate briefing');
      setBriefing(data.briefing);
      setGeneratedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = (audit) => {
    const key = audit.farm_name;
    setFollowedUp(prev => new Set([...prev, key]));
    setTimeout(() => {
      setFollowedUp(prev => { const n = new Set(prev); n.delete(key); return n; });
    }, 2500);
  };

  const timeLabel = generatedAt
    ? `Generated at ${generatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    : 'Supervisor & farmer accountability breakdown';

  const redAudits    = briefing?.audits?.filter(a => a.status?.toLowerCase() === 'red')    || [];
  const yellowAudits = briefing?.audits?.filter(a => a.status?.toLowerCase() !== 'red')    || [];

  return (
    <div className="mg-report-section">
      {/* ── Section header ── */}
      <div className="mg-report-header">
        <div className="mg-report-title-block">
          <span className="mg-report-icon"><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
          <div>
            <div className="mg-report-title">Operations Audit</div>
            <div className="mg-report-sub">{timeLabel}</div>
          </div>
        </div>
        <button
          className={`mg-report-btn${loading ? '' : ' mg-report-btn-active'}`}
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading
            ? <><span className="mg-btn-spinner" /> Analyzing…</>
            : briefing
              ? 'Regenerate Report'
              : 'Generate AI Report'}
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="mg-report-loading">
          <span style={{display:"inline-block",width:16,height:16,border:"2px solid #22c55e",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite"}}></span>
          <span>Analyzing supervisor &amp; farmer activity across all farms…</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="mg-report-error">{error}</div>
      )}

      {/* ── Placeholder ── */}
      {!loading && !briefing && !error && (
        <div className="mg-report-placeholder">
          <div className="mg-placeholder-icon"><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
          <p>Generate the audit to see a structured accountability breakdown — who visited, what was flagged, and what action each farm needs.</p>
        </div>
      )}

      {/* ── Report body ── */}
      {!loading && briefing && (
        <div className="mg-report-body">

          {briefing.audits?.length === 0 ? (
            <div className="mg-report-all-clear">
              
              <span>No farms need immediate attention. Portfolio is healthy.</span>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="mg-report-summary">
                <span className="mg-summary-total">{briefing.audits.length} farms flagged</span>
                {redAudits.length > 0 && (
                  <span className="mg-summary-chip mg-summary-red">
                    {redAudits.length} Critical
                  </span>
                )}
                {yellowAudits.length > 0 && (
                  <span className="mg-summary-chip mg-summary-yellow">
                    {yellowAudits.length} Attention
                  </span>
                )}
              </div>

              {/* Red group */}
              {redAudits.length > 0 && (
                <div className="mg-report-group">
                  <div className="mg-group-label mg-group-red">
                    Critical — Immediate Action Required
                  </div>
                  <div className="mg-audit-grid">
                    {redAudits.map((audit, i) => (
                      <AuditCard
                        key={i}
                        audit={audit}
                        followed={followedUp.has(audit.farm_name)}
                        onFollowUp={handleFollowUp}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Yellow group */}
              {yellowAudits.length > 0 && (
                <div className="mg-report-group">
                  <div className="mg-group-label mg-group-yellow">
                    Attention — Follow Up Needed
                  </div>
                  <div className="mg-audit-grid">
                    {yellowAudits.map((audit, i) => (
                      <AuditCard
                        key={i}
                        audit={audit}
                        followed={followedUp.has(audit.farm_name)}
                        onFollowUp={handleFollowUp}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Regional outlook */}
          {briefing.regional_outlook && (
            <div className="mg-report-outlook">
              <span className="mg-outlook-label">Regional Outlook</span>
              <p className="mg-outlook-text">{briefing.regional_outlook}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function ManagerDashboard() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();

  const [portfolio, setPortfolio] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/manager/portfolio`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load portfolio data');
        const data = await res.json();
        setPortfolio(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleFarmClick = (farm) => {
    navigate(`/supervisor/farmer/${farm.farmer_id}/farm/${farm.id}`);
  };

  const toggleFilter = (tier) => {
    setFilter(prev => (prev === tier ? 'all' : tier));
  };

  const visibleFarms = portfolio?.farms.filter(
    f => filter === 'all' || f.health_tier === filter
  ) || [];

  return (
    <div className="mg-shell">
      <ManagerNav user={user} logout={logout} />

      <main className="mg-main">

        {loading && (
          <div className="mg-loading">
            <span style={{display:"inline-block",width:16,height:16,border:"2px solid #22c55e",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite"}}></span>
            <span>Loading portfolio…</span>
          </div>
        )}

        {error && !loading && (
          <div className="mg-alert mg-alert-error"> {error}</div>
        )}

        {portfolio && !loading && (
          <>
            {/* ── KPI Strip ─────────────────────────────────────── */}
            <div className="mg-kpi-strip">
              <KpiCard
                label="Total Farms"
                count={portfolio.summary.total}
                active={filter === 'all'}
                onClick={() => setFilter('all')}
              />
              <KpiCard
                label="At Risk"
                count={portfolio.summary.red}
                tier="red"
                active={filter === 'red'}
                onClick={() => toggleFilter('red')}
              />
              <KpiCard
                label="Attention"
                count={portfolio.summary.yellow}
                tier="yellow"
                active={filter === 'yellow'}
                onClick={() => toggleFilter('yellow')}
              />
              <KpiCard
                label="Healthy"
                count={portfolio.summary.green}
                tier="green"
                active={filter === 'green'}
                onClick={() => toggleFilter('green')}
              />
            </div>

            {/* ── Farm Portfolio ──────────────────────────────── */}
            <div className="mg-farm-section">
              <div className="mg-grid-header">
                <span className="mg-grid-title">
                  Farm Portfolio
                  <span className="mg-grid-count">
                    {filter === 'all'
                      ? `${portfolio.summary.total} farms`
                      : `${visibleFarms.length} of ${portfolio.summary.total} shown`}
                  </span>
                </span>
                {filter !== 'all' && (
                  <button
                    className="mg-clear-filter"
                    onClick={() => setFilter('all')}
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {visibleFarms.length === 0 ? (
                <div className="mg-empty">
                  <div className="mg-empty-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 20C12 20 5 14 5 9a7 7 0 0 1 14 0c0 5-7 11-7 11z" fill="#4ade80" opacity=".25"/><path d="M12 20C12 20 5 14 5 9a7 7 0 0 1 14 0c0 5-7 11-7 11z" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 20V10" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
                  <div className="mg-empty-msg">No farms in this category</div>
                </div>
              ) : (
                <div className="mg-farm-grid">
                  {visibleFarms.map(farm => (
                    <FarmCard
                      key={farm.id}
                      farm={farm}
                      onClick={() => handleFarmClick(farm)}
                      token={token}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Operations Audit — full width below ─────────── */}
            <BriefingPanel token={token} />
          </>
        )}

      </main>
    </div>
  );
}
