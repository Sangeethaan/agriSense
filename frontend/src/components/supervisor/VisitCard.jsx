import { useState } from 'react';
import '../../supervisor.css';

const CATEGORY_META = {
  'Irrigation':   { emoji: '', cls: 'sup-badge-irrigation'  },
  'Pesticide':    { emoji: '', cls: 'sup-badge-pesticide'   },
  'Crop Health':  { emoji: '', cls: 'sup-badge-crop-health' },
  'Fertilizer':   { emoji: '', cls: 'sup-badge-fertilizer'  },
  'General':      { emoji: '', cls: 'sup-badge-general'     },
  'Farmer Note':  { emoji: '', cls: 'sup-badge-farmer-note' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Inline SVG trash icon — no external dependency needed */
function TrashIcon({ size = 15 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

/**
 * VisitCard — one entry in the timeline.
 * Props:
 *   visit:    { id, visit_date, category, notes, supervisor_notes,
 *               staff_name, transcript_text }
 *   token:    JWT string — required for the delete API call
 *   onDelete: fn(visitId) — called after successful deletion
 *   readOnly: if true, hides the delete button (used for manager view)
 */
export default function VisitCard({ visit, token, onDelete, readOnly = false }) {
  const cat  = visit.category || 'General';
  const meta = CATEGORY_META[cat] || CATEGORY_META['General'];
  const isFarmerNote = cat === 'Farmer Note';

  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [expanded,   setExpanded]   = useState(false);

  const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Use transcript_text if available, otherwise fall back to notes
  const fullTranscript = visit.transcript_text || visit.notes || '';
  const SNIPPET_LEN = 280;
  const isLong = fullTranscript.length > SNIPPET_LEN;

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API}/api/visits/${visit.id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      onDelete?.(visit.id);
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div
      className="sup-timeline-item"
      id={`visit-${visit.id}`}
    >
      <div className="sup-timeline-dot" />
      <div className="sup-tl-card" style={{ position: 'relative' }}>

        {/* ── Trash button (hidden in readOnly / manager view) ── */}
        {!readOnly && !confirming && (
          <button
            id={`btn-delete-visit-${visit.id}`}
            title="Delete this visit"
            aria-label="Delete visit"
            onClick={() => setConfirming(true)}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 6,
              padding: '4px 6px',
              cursor: 'pointer',
              color: 'var(--sup-muted)',
              display: 'flex', alignItems: 'center',
              transition: 'color .15s, background .15s, border-color .15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#dc2626';
              e.currentTarget.style.background = '#fff1f1';
              e.currentTarget.style.borderColor = '#fecaca';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--sup-muted)';
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            <TrashIcon size={14} />
          </button>
        )}

        {/* ── Inline confirm dialog ──────────────────────────── */}
        {confirming && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: '#fff',
            border: '1px solid #fecaca',
            borderRadius: 9,
            padding: '8px 12px',
            boxShadow: '0 4px 16px rgba(0,0,0,.1)',
            display: 'flex', flexDirection: 'column', gap: 6,
            zIndex: 10, minWidth: 180,
          }}>
            <span style={{ fontSize: '.75rem', fontWeight: 600, color: '#b91c1c' }}>
              Delete this visit?
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                id={`btn-confirm-delete-${visit.id}`}
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  flex: 1,
                  background: '#dc2626', color: '#fff',
                  border: 'none', borderRadius: 6,
                  padding: '4px 0', fontSize: '.73rem', fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                id={`btn-cancel-delete-${visit.id}`}
                onClick={() => { setConfirming(false); setDeleteError(''); }}
                disabled={deleting}
                style={{
                  flex: 1,
                  background: 'var(--sage-50)', color: 'var(--sup-text)',
                  border: '1px solid var(--sage-200)', borderRadius: 6,
                  padding: '4px 0', fontSize: '.73rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
            {deleteError && (
              <span style={{ fontSize: '.7rem', color: '#dc2626' }}>{deleteError}</span>
            )}
          </div>
        )}

        {/* ── Header row ──────────────────────────────────────── */}
        <div className="sup-tl-header" style={{ paddingRight: 32 }}>
          <span className={`sup-badge ${meta.cls}`}>
            {meta.emoji} {cat}
          </span>
          <span className="sup-tl-date">{formatDate(visit.visit_date)}</span>
          {visit.staff_name && (
            <span className="sup-tl-staff">
              {visit.staff_name}
            </span>
          )}
        </div>

        {/* ── Farmer Note callout ──────────────────────────────── */}
        {isFarmerNote && (
          <div style={{
            marginTop: 8,
            padding: '10px 14px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            fontSize: '.82rem',
            color: '#92400e',
            lineHeight: 1.55,
          }}>
            <strong>Farmer-Reported Issue:</strong> {visit.notes}
          </div>
        )}

        {/* ── Supervisor notes ─────────────────────────────────── */}
        {visit.supervisor_notes && (
          <div style={{
            marginTop: 8,
            padding: '10px 14px',
            background: '#f0f4ff',
            border: '1px solid #c7d2fe',
            borderRadius: 8,
            fontSize: '.78rem',
            color: '#3730a3',
            lineHeight: 1.55,
          }}>
            <strong>Supervisor Note:</strong> {visit.supervisor_notes}
          </div>
        )}

        {/* ── Transcript with expand/collapse ──────────────────── */}
        {!isFarmerNote && fullTranscript && (
          <div style={{
            marginTop: 10,
            padding: '10px 14px',
            background: 'var(--sage-50)',
            border: '1px solid var(--sage-100)',
            borderRadius: 8,
            fontSize: '.78rem',
            color: 'var(--sup-muted)',
            lineHeight: 1.55,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <strong style={{ color: 'var(--sup-text)' }}>
                Transcript
              </strong>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: '.68rem',
                fontWeight: 600,
                color: '#2563eb',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 999,
                padding: '1px 7px',
                letterSpacing: '.01em',
              }}>
                AI Translated
              </span>
            </div>
            {expanded || !isLong
              ? fullTranscript
              : `${fullTranscript.slice(0, SNIPPET_LEN)}…`
            }
            {isLong && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{
                  display: 'block',
                  marginTop: 6,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '.74rem',
                  fontWeight: 600,
                  color: '#2563eb',
                  cursor: 'pointer',
                  letterSpacing: '.01em',
                }}
              >
                {expanded ? '▲ Collapse' : '▼ Show full transcript'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
