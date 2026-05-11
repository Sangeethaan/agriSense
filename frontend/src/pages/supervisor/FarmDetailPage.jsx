import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { SupervisorNav } from './FarmerDirectory';
import VisitCard from '../../components/supervisor/VisitCard';
import VisitRecorder from '../../components/supervisor/VisitRecorder';
import { downloadReportPdf, openReportPdfInTab } from '../../utils/generateReportPdf';
import '../../supervisor.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Safely extract a string value from a report field.
 * Handles cases where the field is still a raw JSON string
 * (corrupted/legacy data stored before the JSONB migration).
 */
function safeStr(value) {
  if (!value) return null;
  if (typeof value !== 'string') return String(value);
  // If it looks like a JSON object / array, try to extract current_health recursively
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) {
    // May be a single or concatenated JSON object — grab the first one
    try {
      const match = trimmed.match(/\{[^{}]*\}/g);
      if (match) {
        // Try to extract current_health from any matching object
        for (const m of match) {
          try {
            const obj = JSON.parse(m);
            if (typeof obj?.current_health === 'string') return obj.current_health;
          } catch { /* skip */ }
        }
      }
    } catch { /* fall through */ }
  }
  return value;
}


export default function FarmDetailPage() {
  // ── IDs are strictly sourced from URL — the "No Mix-Up" lock ──
  const { farmerId, farmId } = useParams();
  const { token, logout, role } = useAuth();
  const isManager = role === 'manager';

  const [farm,         setFarm]         = useState(null);
  const [farmer,       setFarmer]       = useState(null);
  const [visits,       setVisits]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [report,       setReport]       = useState(null);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState(null);
  const [aiAdvice,     setAiAdvice]     = useState(null);     // consultant mode
  const [consulting,   setConsulting]   = useState(false);
  const [consultErr,   setConsultErr]   = useState(null);
  // ── Report pipeline state ─────────────────────────────────────
  const [draftReport,  setDraftReport]  = useState(null);
  const [draftMeta,    setDraftMeta]    = useState(null);
  const [showPreview,  setShowPreview]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState(null);
  const [saveSuccess,  setSaveSuccess]  = useState(null);
  const [savedReports, setSavedReports] = useState([]);
  const [showOlder,    setShowOlder]    = useState(false);    // collapse older reports
  const [loadingPdf,   setLoadingPdf]   = useState(false);

  // Called by VisitRecorder on successful upload → prepend to timeline
  const handleNewVisit = useCallback((newVisit) => {
    setVisits(prev => [newVisit, ...prev]);
  }, []);

  // ── Generate incremental draft (does NOT save) ───────────────
  const generateDraft = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    setDraftReport(null);
    setDraftMeta(null);
    try {
      const res = await fetch(`${API}/api/farms/${farmId}/generate-report`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate report');
      }
      const data = await res.json();
      setDraftReport(data.report);
      setDraftMeta({
        mode:              data.mode,
        new_visit_count:   data.new_visit_count,
        last_visit_id:     data.last_visit_id,
        has_prior_saved:   data.has_prior_saved,
        prior_report_number: data.prior_report_number,
      });
      setShowPreview(true);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }, [farmId, token]);

  // ── Save the current draft to saved_reports ───────────────────
  const saveDraft = useCallback(async () => {
    if (!draftReport || !draftMeta) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API}/api/farms/${farmId}/save-report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content:       draftReport,
          last_visit_id: draftMeta.last_visit_id,
          visit_count:   draftMeta.new_visit_count,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save report');
      }
      const data = await res.json();
      const saved = data.saved_report;
      setSavedReports(prev => [saved, ...prev]);
      setShowPreview(false);
      setDraftReport(null);
      setDraftMeta(null);
      setShowOlder(false);                             // collapse older on new save
      setSaveSuccess({ report_number: saved.report_number });
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }, [draftReport, draftMeta, farmId, token]);

  // ── Fetch saved report history ────────────────────────────────
  const fetchSavedReports = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/farms/${farmId}/saved-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSavedReports(data.saved_reports || []);
    } catch { /* non-critical */ }
  }, [farmId, token]);

  // ── Download a saved report as PDF ────────────────────────────
  const downloadSavedReport = useCallback(async (reportId) => {
    setLoadingPdf(true);
    try {
      const res = await fetch(`${API}/api/farms/${farmId}/saved-reports/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load report data');
      const data = await res.json();
      await downloadReportPdf(data, 'supervisor', aiAdvice);
    } catch (e) {
      console.error('PDF download failed:', e);
    } finally {
      setLoadingPdf(false);
    }
  }, [farmId, token, aiAdvice]);

  // ── On-demand AI Consultant (supervisor only) ─────────────────
  const getAIAdvice = useCallback(async () => {
    // Pull the latest transcript from the most recent visit
    const latestTranscript = visits
      .map(v => v.transcript_text || v.notes || '')
      .filter(Boolean)
      .join('\n\n---\n\n')
      .slice(0, 4000); // keep within token budget

    if (!latestTranscript) {
      setConsultErr('No transcript available. Record a visit first.');
      return;
    }
    setConsulting(true);
    setConsultErr(null);
    setAiAdvice(null);
    try {
      const res = await fetch(`${API}/api/visits/consult-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transcript: latestTranscript }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Consultant call failed');
      }
      const data = await res.json();
      setAiAdvice(data);
    } catch (e) {
      setConsultErr(e.message);
    } finally {
      setConsulting(false);
    }
  }, [visits, token]);

  // Called by VisitCard on successful delete → remove from timeline
  const handleDeleteVisit = useCallback((deletedId) => {
    setVisits(prev => prev.filter(v => v.id !== deletedId));
  }, []);

  // ── Fetch farm meta, visit history & saved reports ───────────
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
          const thisFarm = fData.farms.find(f => f.id === farmId);
          setFarm(thisFarm || { name: 'Farm', id: farmId });
          setVisits(hData.visits || []);
          setReport(hData.master_report || null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [farmId, farmerId, token, logout]);

  // Fetch saved report history separately (non-blocking)
  useEffect(() => {
    if (!farmId) return;
    fetchSavedReports();
  }, [farmId, fetchSavedReports]);

  return (
    <div className="sup-shell">
      <SupervisorNav
        crumbs={[
          { label: 'Dashboard', href: '/supervisor' },
          { label: farmer?.name || '…', href: `/supervisor/farmer/${farmerId}` },
          { label: farm?.name || '…' },
        ]}
      />

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

                {/* Header row */}
                <div className="sup-report-header">
                  <div>
                    <div className="sup-live-badge">
                      <span className="sup-live-dot" />
                      AI · GEMINI
                    </div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--sup-text)', marginBottom: 2 }}>
                      Living Master Report
                    </h2>
                    {report?.updated_at && (
                      <div className="sup-report-meta">
                        Last updated {new Date(report.updated_at).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    )}
                    {!report && (
                      <div className="sup-report-meta">
                        Auto-compiled from visit transcripts for <strong>{farm.name}</strong>
                      </div>
                    )}
                    {/* Strict-transcript disclaimer */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      marginTop: 6, padding: '3px 10px',
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                      borderRadius: 99, fontSize: '.68rem', color: '#166534',
                      fontWeight: 600, letterSpacing: '.01em',
                    }}>
                      🔒 Strictly generated from supervisor transcripts only
                    </div>
                  </div>
                  {!isManager && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="sup-btn-regenerate"
                        onClick={generateDraft}
                        disabled={generating || visits.length === 0}
                        title={visits.length === 0 ? 'Add a visit first' : 'Generate a new report draft'}
                      >
                        {generating ? '⏳ Generating…' : '📄 Generate Report'}
                      </button>
                      <button
                        className="sup-btn-consult"
                        onClick={getAIAdvice}
                        disabled={consulting || visits.length === 0}
                        title="Get on-demand AI expert suggestions (not stored, not shown to farmer)"
                      >
                        {consulting ? '🔬 Analysing…' : '🧠 AI Expert Suggestions'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Error banner */}
                {genError && (
                  <div className="sup-alert sup-alert-error" style={{ marginBottom: 16 }}>
                    ⚠️ {genError}
                  </div>
                )}

                {/* Generating state */}
                {generating && (
                  <div className="sup-report-generating">
                    <span className="sup-live-dot" style={{ width: 10, height: 10 }} />
                    Gemini is analysing visit transcripts…
                  </div>
                )}

                {/* Empty state */}
                {!generating && !report && (
                  <div style={{
                    background: 'rgba(245,251,248,.8)',
                    border: '1px dashed var(--sage-300)',
                    borderRadius: 10,
                    padding: '18px 20px',
                    color: 'var(--sup-muted)',
                    fontSize: '.84rem',
                    fontStyle: 'italic',
                  }}>
                    📋 {visits.length === 0
                      ? 'No AI report yet. Document your first visit to generate one.'
                      : 'No report yet. Click ✨ Regenerate to create one from existing visits.'}
                  </div>
                )}

                {/* Report grid */}
                {!generating && report && (
                  <div className="sup-report-grid">
                    <div className="sup-report-section">
                      <div className="sup-report-section-icon">🌿</div>
                      <div className="sup-report-section-title">Current Crop Health</div>
                      <div className="sup-report-section-content">
                        {safeStr(report.current_health) || <span className="sup-report-no-data">No information provided by supervisor.</span>}
                      </div>
                    </div>

                    <div className="sup-report-section">
                      <div className="sup-report-section-icon">⚠️</div>
                      <div className="sup-report-section-title">Detected Risks</div>
                      {report.risks?.length > 0 ? (
                        <ul className="sup-report-list">
                          {report.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                        </ul>
                      ) : (
                        <span className="sup-report-no-data">No data reported</span>
                      )}
                    </div>

                    <div className="sup-report-section">
                      <div className="sup-report-section-icon">📋</div>
                      <div className="sup-report-section-title">Supervisor Instructions</div>
                      {(report.supervisor_instructions ?? report.next_steps)?.length > 0 ? (
                        <ul className="sup-report-list">
                          {(report.supervisor_instructions ?? report.next_steps).map((step, i) => <li key={i}>{step}</li>)}
                        </ul>
                      ) : (
                        <span className="sup-report-no-data">No instructions recorded</span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── AI Consultant panel (supervisor only, hidden-by-default) ── */}
                {!isManager && (
                  <>
                    {consultErr && (
                      <div className="sup-alert sup-alert-error" style={{ marginTop: 14 }}>
                        ⚠️ {consultErr}
                      </div>
                    )}
                    {aiAdvice && (
                      <div style={{
                        marginTop: 18,
                        background: '#fffbeb',
                        border: '1.5px solid #fcd34d',
                        borderRadius: 12,
                        padding: '16px 18px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: '1.1rem' }}>🧠</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#92400e' }}>AI Expert Suggestions</div>
                            <div style={{ fontSize: '.72rem', color: '#b45309' }}>
                              {aiAdvice.disclaimer}
                            </div>
                          </div>
                          <button
                            onClick={() => setAiAdvice(null)}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', fontSize: '.85rem' }}
                          >✕ Dismiss</button>
                        </div>
                        {aiAdvice.advice?.potential_risks?.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠️ Potential Risks</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {aiAdvice.advice.potential_risks.map((r, i) => (
                                <li key={i} style={{ fontSize: '.82rem', color: '#78350f', marginBottom: 3 }}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {aiAdvice.advice?.suggested_treatments?.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#92400e', marginBottom: 4 }}>💊 Suggested Treatments</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {aiAdvice.advice.suggested_treatments.map((t, i) => (
                                <li key={i} style={{ fontSize: '.82rem', color: '#78350f', marginBottom: 3 }}>{t}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {aiAdvice.advice?.notes && (
                          <div style={{ fontSize: '.78rem', color: '#92400e', fontStyle: 'italic', borderTop: '1px solid #fde68a', paddingTop: 8 }}>
                            📝 {aiAdvice.advice.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

              </div>
            </section>

            {/* ── Section 2: Farmer Task Progress ─────────── */}
            {((report?.supervisor_instructions ?? report?.next_steps) || []).length > 0 && (
              <section aria-label="Farmer Task Progress" style={{ marginTop: 20 }}>
                <div className="sup-card" style={{ padding: '18px 22px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 12,
                  }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--sup-text)' }}>
                      👨‍🌾 Farmer Progress
                    </div>
                    <span style={{
                      fontSize: '.78rem',
                      fontWeight: 700,
                      color: (report.completed_tasks || []).length >= (report.supervisor_instructions ?? report.next_steps ?? []).length ? '#16a34a' : '#d97706',
                      background: (report.completed_tasks || []).length >= (report.supervisor_instructions ?? report.next_steps ?? []).length ? '#f0fdf4' : '#fffbeb',
                      border: `1px solid ${(report.completed_tasks || []).length >= (report.supervisor_instructions ?? report.next_steps ?? []).length ? '#86efac' : '#fde68a'}`,
                      borderRadius: 999,
                      padding: '3px 12px',
                    }}>
                      {(report.completed_tasks || []).length} of {(report.supervisor_instructions ?? report.next_steps ?? []).length} tasks completed
                      {(report.completed_tasks || []).length >= (report.supervisor_instructions ?? report.next_steps ?? []).length ? ' ✅' : ''}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{
                    height: 8, borderRadius: 99,
                    background: 'var(--sage-100)',
                    marginBottom: 14,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      borderRadius: 99,
                      background: (report.completed_tasks || []).length >= (report.supervisor_instructions ?? report.next_steps ?? []).length
                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                        : 'linear-gradient(90deg, #f59e0b, #d97706)',
                      width: `${Math.round(((report.completed_tasks || []).length / (report.supervisor_instructions ?? report.next_steps ?? []).length) * 100)}%`,
                      transition: 'width .4s ease',
                    }} />
                  </div>

                  {/* Task list (read-only for supervisor/manager) */}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(report.supervisor_instructions ?? report.next_steps ?? []).map((step, i) => {
                      const done = (report.completed_tasks || []).includes(step);
                      return (
                        <li
                          key={i}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: done ? '#f0fdf4' : '#fafafa',
                            border: `1px solid ${done ? '#bbf7d0' : '#f0f0f0'}`,
                            fontSize: '.82rem',
                            color: done ? '#15803d' : 'var(--sup-text)',
                            opacity: done ? 0.85 : 1,
                          }}
                        >
                          <span style={{
                            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: done ? '#22c55e' : 'var(--sage-100)',
                            color: done ? '#fff' : 'var(--sup-muted)',
                            fontSize: '.7rem', fontWeight: 700,
                            marginTop: 1,
                          }}>
                            {done ? '✓' : (i + 1)}
                          </span>
                          <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{step}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            )}

            {/* ── Section 3: Start New Visit (supervisor only) ── */}
            {!isManager && (
            <section aria-label="Start New Visit" style={{ marginTop: 28 }}>
              <div className="sup-action-area">
                <div className="sup-action-title">Start New Visit</div>


                {/* Data integrity notice */}
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

                {/* VisitRecorder — live audio + file upload */}
                <VisitRecorder
                  farmId={farmId}
                  farmerId={farmerId}
                  token={token}
                  onSuccess={handleNewVisit}
                  onDelete={handleDeleteVisit}
                />
              </div>
            </section>
            )}

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
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      token={token}
                      onDelete={handleDeleteVisit}
                      readOnly={isManager}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── Saved Reports — always-visible section (supervisor only) ─ */}
            {!isManager && (
              <section aria-label="Saved Reports" style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                  <h2 className="sup-section-title" style={{ marginBottom: 0 }}>Saved Reports</h2>
                  {savedReports.length > 0 && (
                    <span style={{ fontSize: '.8rem', color: 'var(--sup-muted)', fontWeight: 500 }}>
                      {savedReports.length} saved
                    </span>
                  )}
                </div>
                <p className="sup-section-sub">
                  Approved snapshots published to farmer and manager.
                </p>

                {savedReports.length === 0 ? (
                  <div style={{
                    background: 'rgba(245,251,248,.8)',
                    border: '1px dashed var(--sage-300)',
                    borderRadius: 12, padding: '20px 22px',
                    color: 'var(--sup-muted)', fontSize: '.83rem', fontStyle: 'italic',
                  }}>
                    No saved reports yet. Generate a report and click “Save Report” to publish it.
                  </div>
                ) : (() => {
                  const latest   = savedReports[0];
                  const older    = savedReports.slice(1);
                  const latestContent = latest.content || {};
                  const risks    = latestContent.risks || [];
                  const hasRisk  = risks.length > 0;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* ── Latest report — expanded quick-summary ──────────── */}
                      <div style={{
                        borderRadius: 14,
                        border: `1.5px solid ${hasRisk ? '#fecaca' : '#86efac'}`,
                        background: hasRisk ? '#fff5f5' : '#f0fdf4',
                        overflow: 'hidden',
                      }}>
                        {/* Card header */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderBottom: `1px solid ${hasRisk ? '#fecaca' : '#86efac'}`,
                          background: hasRisk ? '#fef2f2' : '#dcfce7',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1rem' }}>{hasRisk ? '⚠️' : '✅'}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '.88rem', color: hasRisk ? '#991b1b' : '#166534' }}>
                                Report #{latest.report_number}
                                <span style={{
                                  marginLeft: 8, fontSize: '.72rem', fontWeight: 600,
                                  background: hasRisk ? '#fee2e2' : '#bbf7d0',
                                  color: hasRisk ? '#b91c1c' : '#15803d',
                                  padding: '2px 8px', borderRadius: 99,
                                }}>
                                  {hasRisk ? `${risks.length} risk${risks.length > 1 ? 's' : ''}` : 'Healthy'}
                                </span>
                              </div>
                              <div style={{ fontSize: '.72rem', color: hasRisk ? '#9f1b1b' : '#15803d', opacity: 0.8, marginTop: 1 }}>
                                {latest.visit_count} visit{latest.visit_count !== 1 ? 's' : ''} ·{' '}
                                {new Date(latest.saved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {latest.supervisor_name && ` · ${latest.supervisor_name}`}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => downloadSavedReport(latest.id)}
                            disabled={loadingPdf}
                            style={{
                              padding: '5px 14px', borderRadius: 8, border: 'none',
                              background: hasRisk ? '#dc2626' : '#16a34a',
                              color: '#fff', fontSize: '.75rem', fontWeight: 700,
                              cursor: loadingPdf ? 'not-allowed' : 'pointer',
                              opacity: loadingPdf ? 0.6 : 1,
                            }}
                          >
                            {loadingPdf ? '⏳' : '📥 PDF'}
                          </button>
                        </div>

                        {/* Inline summary body */}
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {/* Health */}
                          <div>
                            <div style={{ fontSize: '.7rem', fontWeight: 700, color: hasRisk ? '#991b1b' : '#166534', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                              🌿 Current Health
                            </div>
                            <div style={{ fontSize: '.83rem', color: '#111', lineHeight: 1.55 }}>
                              {latestContent.current_health || 'No health information recorded.'}
                            </div>
                          </div>

                          {/* Risks */}
                          {risks.length > 0 && (
                            <div>
                              <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                                ⚠️ Risks
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {risks.map((r, i) => (
                                  <li key={i} style={{ fontSize: '.82rem', color: '#7f1d1d', lineHeight: 1.5, marginBottom: 2 }}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Instructions summary */}
                          {(latestContent.supervisor_instructions || []).length > 0 && (
                            <div>
                              <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                                📋 Instructions
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {(latestContent.supervisor_instructions).map((s, i) => (
                                  <li key={i} style={{ fontSize: '.82rem', color: '#1e3a5f', lineHeight: 1.5, marginBottom: 2 }}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Older reports — compact rows with collapse toggle ───── */}
                      {older.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowOlder(s => !s)}
                            style={{
                              background: 'none', border: 'none',
                              color: 'var(--sup-muted)', fontSize: '.78rem', fontWeight: 600,
                              cursor: 'pointer', padding: '2px 0',
                              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5,
                            }}
                          >
                            <span style={{
                              display: 'inline-block',
                              transform: showOlder ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform .2s',
                              fontSize: '.7rem',
                            }}>▶</span>
                            {showOlder
                              ? `Hide ${older.length} older report${older.length > 1 ? 's' : ''}`
                              : `Show ${older.length} older report${older.length > 1 ? 's' : ''}`}
                          </button>

                          {showOlder && older.map(sr => (
                            <div
                              key={sr.id}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 14px', borderRadius: 10,
                                background: '#f9fafb', border: '1px solid #e5e7eb',
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--sup-text)' }}>
                                  Report #{sr.report_number}
                                </div>
                                <div style={{ fontSize: '.72rem', color: 'var(--sup-muted)', marginTop: 2 }}>
                                  {sr.visit_count} visit{sr.visit_count !== 1 ? 's' : ''} ·{' '}
                                  {new Date(sr.saved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  {sr.supervisor_name && ` · ${sr.supervisor_name}`}
                                </div>
                              </div>
                              <button
                                onClick={() => downloadSavedReport(sr.id)}
                                disabled={loadingPdf}
                                style={{
                                  padding: '5px 12px', borderRadius: 8,
                                  border: '1.5px solid var(--sage-300)',
                                  background: '#fff', color: 'var(--sage-700)',
                                  fontSize: '.75rem', fontWeight: 600,
                                  cursor: loadingPdf ? 'not-allowed' : 'pointer',
                                  opacity: loadingPdf ? 0.6 : 1,
                                }}
                              >
                                {loadingPdf ? '⏳' : '📥 PDF'}
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}

          </>
        )}
      </main>

      {/* ── Save Success Toast ───────────────────────────────────────── */}
      {saveSuccess && (
        <div
          style={{
            position: 'fixed', bottom: 28, right: 28,
            background: 'linear-gradient(135deg, #16a34a, #166534)',
            color: '#fff',
            padding: '14px 20px',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(22,163,74,.45)',
            display: 'flex', alignItems: 'center', gap: 12,
            zIndex: 1100,
            animation: 'slideInUp .3s ease',
            minWidth: 260,
          }}
        >
          <span style={{ fontSize: '1.3rem' }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>
              Report #{saveSuccess.report_number} Saved!
            </div>
            <div style={{ fontSize: '.75rem', opacity: 0.85, marginTop: 2 }}>
              Visible to farmer &amp; manager. See Report History below.
            </div>
          </div>
          <button
            onClick={() => setSaveSuccess(null)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', fontSize: '1rem', cursor: 'pointer', marginLeft: 'auto', padding: 0 }}
          >✕</button>
        </div>
      )}

      {/* ── Report Preview Modal ────────────────────────────────────── */}

      {showPreview && draftReport && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPreview(false); }}
        >
          <div style={{
            background: '#fff', borderRadius: 18,
            width: '100%', maxWidth: 600,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,.25)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px 14px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111' }}>📄 Report Preview</div>
                {draftMeta && (
                  <div style={{ fontSize: '.76rem', color: '#6b7280', marginTop: 4 }}>
                    {draftMeta.mode === 'incremental'
                      ? `Incremental — ${draftMeta.new_visit_count} new visit${draftMeta.new_visit_count !== 1 ? 's' : ''} since Report #${draftMeta.prior_report_number}`
                      : draftMeta.mode === 'unchanged'
                        ? 'No new visits since last report — showing current state'
                        : `First report — ${draftMeta.new_visit_count} visit${draftMeta.new_visit_count !== 1 ? 's' : ''} analyzed`}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowPreview(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#aaa' }}
              >✕</button>
            </div>

            {/* Report Content Preview */}
            <div style={{ padding: '20px 24px' }}>
              {/* Health Status */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                  🌿 Current Crop Health
                </div>
                <div style={{ fontSize: '.9rem', color: '#111', lineHeight: 1.6, padding: '12px 16px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #86efac' }}>
                  {draftReport.current_health || 'No health information recorded.'}
                </div>
              </div>

              {/* Risks */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                  ⚠️ Risks Identified
                </div>
                {draftReport.risks?.length > 0
                  ? <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {draftReport.risks.map((r, i) => (
                        <li key={i} style={{ fontSize: '.88rem', color: '#111', lineHeight: 1.6, marginBottom: 4 }}>{r}</li>
                      ))}
                    </ul>
                  : <div style={{ fontSize: '.85rem', color: '#9ca3af', fontStyle: 'italic' }}>No risks identified.</div>
                }
              </div>

              {/* Supervisor Instructions */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                  📋 Supervisor Instructions
                </div>
                {draftReport.supervisor_instructions?.length > 0
                  ? <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {draftReport.supervisor_instructions.map((s, i) => (
                        <li key={i} style={{ fontSize: '.88rem', color: '#111', lineHeight: 1.6, marginBottom: 4 }}>{s}</li>
                      ))}
                    </ul>
                  : <div style={{ fontSize: '.85rem', color: '#9ca3af', fontStyle: 'italic' }}>No instructions recorded.</div>
                }
              </div>

              {/* Disclaimer */}
              <div style={{ fontSize: '.72rem', color: '#6b7280', fontStyle: 'italic', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 16 }}>
                🔒 Strictly generated from supervisor transcripts only. No external data sources used.
              </div>

              {saveError && (
                <div style={{ background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', marginBottom: 12 }}>
                  ⚠️ {saveError}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div style={{
              padding: '14px 24px 20px',
              borderTop: '1px solid #f0f0f0',
              display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap',
            }}>
              <button
                onClick={() => openReportPdfInTab(
                  { saved_report: { ...draftReport, farm_name: farm?.name, location: farm?.location, crop_types: farm?.crop_types, farmer_name: farmer?.name, supervisor_name: 'Supervisor', report_number: (savedReports.length + 1), visit_count: draftMeta?.new_visit_count || 0, saved_at: new Date().toISOString() } },
                  'supervisor', aiAdvice
                )}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  border: '1.5px solid var(--sage-300)', background: '#fff',
                  fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', color: 'var(--sage-700)',
                }}
              >
                👁 Preview PDF
              </button>
              <button
                onClick={() => { setShowPreview(false); setDraftReport(null); setDraftMeta(null); }}
                disabled={saving}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  border: '1px solid #e5e7eb', background: '#fff',
                  fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', color: '#555',
                }}
              >
                Discard
              </button>
              <button
                onClick={saveDraft}
                disabled={saving}
                style={{
                  padding: '8px 24px', borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #16a34a, #166534)',
                  color: '#fff', fontSize: '.82rem', fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  boxShadow: '0 2px 8px rgba(22,163,74,.3)',
                }}
              >
                {saving ? '⏳ Saving…' : '💾 Save Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
