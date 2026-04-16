import '../../supervisor.css';

const CATEGORY_META = {
  'Irrigation':   { emoji: '💧', cls: 'sup-badge-irrigation'  },
  'Pesticide':    { emoji: '🧪', cls: 'sup-badge-pesticide'   },
  'Crop Health':  { emoji: '🌿', cls: 'sup-badge-crop-health' },
  'Fertilizer':   { emoji: '🌱', cls: 'sup-badge-fertilizer'  },
  'General':      { emoji: '📋', cls: 'sup-badge-general'     },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * VisitCard — one entry in the timeline.
 * Props:
 *   visit: {
 *     id, visit_date, category, notes, latitude, longitude,
 *     staff_name, transcript_text, summary_report
 *   }
 */
export default function VisitCard({ visit }) {
  const cat  = visit.category || 'General';
  const meta = CATEGORY_META[cat] || CATEGORY_META['General'];

  return (
    <div
      className="sup-timeline-item"
      id={`visit-${visit.id}`}
    >
      <div className="sup-timeline-dot" />
      <div className="sup-tl-card">
        {/* Header row */}
        <div className="sup-tl-header">
          <span className={`sup-badge ${meta.cls}`}>
            {meta.emoji} {cat}
          </span>
          <span className="sup-tl-date">{formatDate(visit.visit_date)}</span>
          {visit.staff_name && (
            <span className="sup-tl-staff">
              👤 {visit.staff_name}
            </span>
          )}
        </div>

        {/* Notes */}
        {visit.notes ? (
          <p className="sup-tl-notes">{visit.notes}</p>
        ) : (
          <p className="sup-tl-notes" style={{ opacity: 0.45, fontStyle: 'italic' }}>
            No notes recorded for this visit.
          </p>
        )}

        {/* Transcript snippet */}
        {visit.transcript_text && (
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
            <strong style={{ color: 'var(--sup-text)', display: 'block', marginBottom: 4 }}>
              📝 Transcript
            </strong>
            {visit.transcript_text.slice(0, 280)}
            {visit.transcript_text.length > 280 ? '…' : ''}
          </div>
        )}

        {/* GPS coordinates */}
        {visit.latitude && visit.longitude && (
          <div className="sup-tl-gps">
            📍 {parseFloat(visit.latitude).toFixed(5)}, {parseFloat(visit.longitude).toFixed(5)}
          </div>
        )}
      </div>
    </div>
  );
}
