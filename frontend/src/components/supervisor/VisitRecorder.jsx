import { useState, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════
   VisitRecorder — Audio capture + upload + transcription UI
   Props:
     farmId     {string}  — from URL params (no-mix-up lock)
     farmerId   {string}  — from URL params
     token      {string}  — JWT auth token
     onSuccess  {fn}      — called with the new/updated visit object on success
     onDelete   {fn}      — called with visitId when a visit is discarded/re-recorded
═══════════════════════════════════════════════════════════════ */

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ── Supported audio MIME types (browser compatibility order) ────
const PREFERRED_MIME = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
].find(t => {
  try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
}) || '';

/* ─────────────────────────────────────────────────────────────
   ConfirmDialog — inline confirmation modal (no browser dialog)
───────────────────────────────────────────────────────────────── */
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', confirmDanger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          animation: 'cfadeIn .15s ease',
        }}
      />
      {/* dialog card */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1001,
        background: '#fff',
        borderRadius: 16,
        padding: '28px 28px 22px',
        minWidth: 320, maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,.22), 0 4px 16px rgba(0,0,0,.1)',
        animation: 'cslideUp .18s cubic-bezier(.34,1.56,.64,1)',
      }}>
        {/* icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: '1.4rem' }}>
            {confirmDanger ? '⚠️' : 'ℹ️'}
          </span>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a1a1a' }}>
            {title}
          </div>
        </div>
        {/* message */}
        <p style={{ fontSize: '.875rem', color: '#555', lineHeight: 1.55, margin: '0 0 22px' }}>
          {message}
        </p>
        {/* buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e0e0e0',
              background: '#fff', color: '#555', fontWeight: 600, fontSize: '.85rem',
              cursor: 'pointer', transition: 'background .15s',
            }}
            onMouseEnter={e => e.target.style.background = '#f5f5f5'}
            onMouseLeave={e => e.target.style.background = '#fff'}
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            style={{
              padding: '9px 22px', borderRadius: 9,
              border: 'none',
              background: confirmDanger ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#22c55e,#16a34a)',
              color: '#fff', fontWeight: 700, fontSize: '.85rem',
              cursor: 'pointer',
              boxShadow: confirmDanger ? '0 3px 12px rgba(239,68,68,.35)' : '0 3px 12px rgba(34,197,94,.35)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes cfadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cslideUp { from { opacity: 0; transform: translate(-50%, calc(-50% + 14px)) } to { opacity: 1; transform: translate(-50%,-50%) } }
      `}</style>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main VisitRecorder component
───────────────────────────────────────────────────────────────── */
export default function VisitRecorder({ farmId, farmerId, token, onSuccess, onDelete }) {
  const [status,     setStatus]     = useState('idle');   // idle|recording|processing|success|error
  const [duration,   setDuration]   = useState(0);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [transcript, setTranscript] = useState('');
  const [category,   setCategory]   = useState('');  
  const [supervisorNotes, setSupervisorNotes] = useState('');
  const [savedVisitId,  setSavedVisitId]  = useState(null);
  const [pendingVisit,  setPendingVisit]  = useState(null);  // visit awaiting supervisor approval
  const [appendMode,    setAppendMode]    = useState(false);
  const [isDiscarding,  setIsDiscarding]  = useState(false);

  // ── Confirmation dialog state ────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState({
    open:         false,
    title:        '',
    message:      '',
    confirmLabel: 'Confirm',
    danger:       false,
    onConfirm:    null,
  });

  const showConfirm = useCallback(({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) => {
    setConfirmDialog({ open: true, title, message, confirmLabel, danger, onConfirm });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(d => ({ ...d, open: false, onConfirm: null }));
  }, []);

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const timerRef         = useRef(null);
  const fileInputRef     = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  /* ── Upload / append helper ─────────────────────────────────── */
  const uploadAudio = useCallback(async (blob, filename = 'recording.webm') => {
    setStatus('processing');
    setErrorMsg('');

    const form = new FormData();
    form.append('audio',         blob, filename);
    form.append('farm_id',       farmId);
    form.append('farmer_id',     farmerId);
    form.append('language_code', 'kn-IN');
    if (supervisorNotes.trim()) {
      form.append('supervisor_notes', supervisorNotes.trim());
    }

    const url = appendMode && savedVisitId
      ? `${API}/api/visits/${savedVisitId}/append-audio`
      : `${API}/api/visits/upload`;

    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

      setTranscript(data.transcript || '');
      setCategory(data.category || '');
      setStatus('success');
      // Store the visit but DON'T add to timeline yet.
      // onSuccess (which adds to history) is only called when supervisor clicks "Save & Close".
      if (!appendMode) {
        setSavedVisitId(data.visit.id);
        setPendingVisit(data.visit);
      } else {
        // On append, update the pending visit with the latest version
        setPendingVisit(data.visit);
      }
      setAppendMode(false);
    } catch (e) {
      setErrorMsg(e.message);
      setStatus('error');
    }
  }, [farmId, farmerId, token, onSuccess, supervisorNotes, appendMode, savedVisitId]);

  /* ── Start microphone recording ─────────────────────────────── */
  const startRecording = useCallback(async () => {
    setStatus('idle');
    setErrorMsg('');
    chunksRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg('Microphone access denied. Please allow microphone permission and try again.');
      setStatus('error');
      return;
    }

    const recorder = new MediaRecorder(stream, PREFERRED_MIME ? { mimeType: PREFERRED_MIME } : {});
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const ext  = recorder.mimeType.includes('ogg') ? 'ogg' : recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
      uploadAudio(blob, `field-recording.${ext}`);
    };

    recorder.start(1000);
    setStatus('recording');
    setDuration(0);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }, [uploadAudio]);

  /* ── Stop recording ─────────────────────────────────────────── */
  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  /* ── File upload via picker ─────────────────────────────────── */
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    uploadAudio(file, file.name || 'audio.mp3');
  }, [uploadAudio]);

  /* ── Drag-and-drop ──────────────────────────────────────────── */
  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true);  }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop      = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    uploadAudio(file, file.name || 'audio.mp3');
  }, [uploadAudio]);

  /* ── Reset to idle ──────────────────────────────────────────── */
  const resetRecorder = useCallback(() => {
    setStatus('idle');
    setTranscript('');
    setCategory('');
    setErrorMsg('');
    setSupervisorNotes('');
    setDuration(0);
    setSavedVisitId(null);
    setPendingVisit(null);
    setAppendMode(false);
  }, []);

  /* ── Delete helper ──────────────────────────────────────────── */
  const deleteVisit = useCallback(async (visitId) => {
    try {
      await fetch(`${API}/api/visits/${visitId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onDelete?.(visitId);
    } catch { /* silent */ }
  }, [token, onDelete]);

  /* ── Discard saved visit ─────────────────────────────────────── */
  const handleDiscard = useCallback(() => {
    if (!savedVisitId) { resetRecorder(); return; }
    showConfirm({
      title:        'Discard Visit?',
      message:      'This visit and its transcript will be permanently deleted. This cannot be undone.',
      confirmLabel: '🗑️ Yes, Discard',
      danger:        true,
      onConfirm:    async () => {
        closeConfirm();
        setIsDiscarding(true);
        await deleteVisit(savedVisitId);
        setIsDiscarding(false);
        resetRecorder();
      },
    });
  }, [savedVisitId, deleteVisit, resetRecorder, showConfirm, closeConfirm]);

  /* ── Re-record: delete current visit + restart mic ──────────── */
  const handleReRecord = useCallback(() => {
    if (!savedVisitId) {
      resetRecorder();
      setTimeout(() => startRecording(), 50);
      return;
    }
    showConfirm({
      title:        'Re-record Visit?',
      message:      'The current visit and transcript will be deleted, and you can record a new one. Continue?',
      confirmLabel: '🔄 Yes, Re-record',
      danger:        true,
      onConfirm:    async () => {
        closeConfirm();
        await deleteVisit(savedVisitId);
        resetRecorder();
        setTimeout(() => startRecording(), 50);
      },
    });
  }, [savedVisitId, deleteVisit, resetRecorder, startRecording, showConfirm, closeConfirm]);

  /* ── Add more audio to the same visit ───────────────────────── */
  const handleAddMore = useCallback(() => {
    setAppendMode(true);
    setStatus('idle');
    setErrorMsg('');
  }, []);

  /* ── Helpers ─────────────────────────────────────────────────── */
  const fmtDuration = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  const catCls = {
    Irrigation: 'sup-badge-irrigation', Pesticide: 'sup-badge-pesticide',
    'Crop Health': 'sup-badge-crop-health', Fertilizer: 'sup-badge-fertilizer',
    Disease: 'sup-badge-disease', Urgent: 'sup-badge-urgent', General: 'sup-badge-general',
  }[category] || 'sup-badge-general';

  /* ═══════════════════════ RENDER ════════════════════════════ */
  return (
    <>
      {/* ── In-app confirmation dialog ─────────────────────────── */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        confirmDanger={confirmDialog.danger}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Append-mode banner ──────────────────────────────── */}
        {appendMode && (status === 'idle' || status === 'recording') && (
          <div style={{
            background: '#eff6ff', border: '1.5px solid #93c5fd',
            borderRadius: 10, padding: '10px 14px',
            fontSize: '.8rem', color: '#1d4ed8', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>➕ Adding to existing visit — this recording will be appended to the transcript above</span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', fontSize: '.8rem', marginLeft: 12 }}
              onClick={() => { setAppendMode(false); setStatus('success'); }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Supervisor Notes + recording controls ────────────── */}
        {(status === 'idle' || status === 'recording') && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                htmlFor="supervisor-notes"
                style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--sup-text)', letterSpacing: '.02em' }}
              >
                📝 Supervisor Notes <span style={{ fontWeight: 400, color: 'var(--sup-muted)' }}>(optional)</span>
              </label>
              <textarea
                id="supervisor-notes"
                placeholder="Private observations — corrections, severity flags, things not said aloud…"
                value={supervisorNotes}
                onChange={e => setSupervisorNotes(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid var(--sage-200)', background: '#fff',
                  fontSize: '.84rem', color: 'var(--sup-text)', lineHeight: 1.55,
                  resize: 'vertical', fontFamily: 'inherit', transition: 'border-color .15s', outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--sage-400)'; }}
                onBlur={e  => { e.target.style.borderColor = 'var(--sage-200)'; }}
              />
            </div>

            <div className="sup-action-btns">
              {status === 'idle' ? (
                <button id="btn-record-audio" className="sup-btn sup-btn-primary" onClick={startRecording}>
                  🎙️ Record Audio
                </button>
              ) : (
                <button
                  id="btn-stop-recording"
                  className="sup-btn"
                  onClick={stopRecording}
                  style={{ background: '#ef4444', color: '#fff', boxShadow: '0 3px 12px rgba(239,68,68,.35)', display: 'flex', alignItems: 'center', gap: 9 }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fff', flexShrink: 0 }} />
                  Stop Recording
                </button>
              )}

              <div
                id="audio-drop-zone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => status !== 'recording' && fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  border: `2px dashed ${isDragOver ? 'var(--sage-500)' : 'var(--sage-300)'}`,
                  borderRadius: 12, padding: '14px 16px', textAlign: 'center',
                  cursor: status === 'recording' ? 'not-allowed' : 'pointer',
                  background: isDragOver ? 'var(--sage-50)' : '#fafafa',
                  transition: 'all .18s ease',
                  opacity: status === 'recording' ? 0.45 : 1,
                }}
              >
                <div style={{ fontSize: '1.2rem', marginBottom: 2 }}>📁</div>
                <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--sup-text)', marginBottom: 1 }}>
                  {isDragOver ? 'Drop your audio file here!' : 'Upload Audio File'}
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--sup-muted)' }}>
                  Drag & drop or click · MP3, WAV, M4A, AAC, OGG, FLAC and more
                </div>
              </div>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>

            {status === 'recording' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', background: '#fff5f5',
                border: '1px solid #fecaca', borderRadius: 10,
                fontSize: '.83rem', color: '#b91c1c', fontWeight: 600,
              }}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: '#ef4444', animation: 'livePulse 1s ease infinite', flexShrink: 0,
                }} />
                Recording… {fmtDuration(duration)}
                <span style={{ marginLeft: 'auto', fontWeight: 400, color: '#9d2020' }}>
                  Click "Stop Recording" when done
                </span>
              </div>
            )}
          </>
        )}

        {/* ── Processing / AI spinner ───────────────────────────── */}
        {status === 'processing' && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            padding: '28px 20px', background: 'var(--sage-50)',
            border: '1.5px solid var(--sage-200)', borderRadius: 14, textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: '3.5px solid var(--sage-200)', borderTopColor: 'var(--sage-500)',
              animation: 'recordSpin 0.85s linear infinite',
            }} />
            <div>
              <div style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--sup-text)', marginBottom: 4 }}>
                AI is transcribing…
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--sup-muted)' }}>
                Sending audio to Sarvam saaras:v3 · Longer recordings are split into chunks automatically · May take a few minutes
              </div>
            </div>
            <style>{`@keyframes recordSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────── */}
        {status === 'error' && (
          <div>
            <div className="sup-alert sup-alert-error" style={{ marginBottom: 10 }}>
              ⚠️ {errorMsg}
            </div>
            <button className="sup-btn sup-btn-ghost sup-btn-sm" onClick={resetRecorder}>
              ↩ Try Again
            </button>
          </div>
        )}

        {/* ── Success state ─────────────────────────────────────── */}
        {status === 'success' && (
          <div style={{
            background: '#f0fdf4', border: '1.5px solid #86efac',
            borderRadius: 14, padding: '18px 20px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%', background: '#22c55e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.9rem', flexShrink: 0, boxShadow: '0 2px 8px rgba(34,197,94,.35)',
              }}>✓</span>
              <span style={{ fontWeight: 700, color: '#14532d', fontSize: '.95rem' }}>
                Visit recorded successfully!
              </span>
              <span className={`sup-badge ${catCls}`} style={{ marginLeft: 'auto' }}>
                {category}
              </span>
            </div>

            {/* Transcript */}
            {transcript ? (
              <div style={{
                background: '#fff', border: '1px solid #bbf7d0',
                borderRadius: 9, padding: '12px 14px',
                fontSize: '.85rem', color: 'var(--sup-text)',
                lineHeight: 1.6, marginBottom: 14, whiteSpace: 'pre-wrap',
              }}>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  📝 Transcript
                </div>
                {transcript}
              </div>
            ) : (
              <div style={{ fontSize: '.82rem', color: '#4d6659', marginBottom: 14, fontStyle: 'italic' }}>
                No transcript text — audio may have been silent or too short.
              </div>
            )}

            {/* Supervisor notes — editable even after transcription */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
              <label
                htmlFor="supervisor-notes-review"
                style={{ fontSize: '.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '.06em' }}
              >
                📝 Supervisor Notes <span style={{ fontWeight: 400, textTransform: 'none', fontSize: '.72rem', color: 'var(--sup-muted)' }}>(private · optional)</span>
              </label>
              <textarea
                id="supervisor-notes-review"
                placeholder="Add private observations before saving — corrections, severity, anything not said aloud…"
                value={supervisorNotes}
                onChange={e => setSupervisorNotes(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 9,
                  border: '1.5px solid #bbf7d0', background: '#fff',
                  fontSize: '.84rem', color: 'var(--sup-text)', lineHeight: 1.5,
                  resize: 'vertical', fontFamily: 'inherit', transition: 'border-color .15s', outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = '#4ade80'; }}
                onBlur={e  => { e.target.style.borderColor = '#bbf7d0'; }}
              />
            </div>


            {/* Action buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <button
                id="btn-add-more-audio"
                className="sup-btn sup-btn-primary"
                onClick={handleAddMore}
              >
                ➕ Add More Audio
              </button>
              <button
                id="btn-re-record"
                className="sup-btn sup-btn-ghost"
                style={{ color: '#d97706', borderColor: '#fde68a' }}
                onClick={handleReRecord}
              >
                🔄 Re-record
              </button>
              <button
                id="btn-discard-visit"
                className="sup-btn sup-btn-ghost"
                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={handleDiscard}
                disabled={isDiscarding}
              >
                {isDiscarding ? '⏳ Discarding…' : '🗑️ Discard Visit'}
              </button>
              {/* Save & Close — persists any review-time notes then adds to timeline */}
              <button
                id="btn-save-done"
                className="sup-btn sup-btn-ghost"
                style={{ marginLeft: 'auto', color: '#15803d', borderColor: '#86efac', fontWeight: 700 }}
                onClick={async () => {
                  // If supervisor added/edited notes after transcription, PATCH them now
                  if (savedVisitId && supervisorNotes.trim()) {
                    try {
                      await fetch(`${API}/api/visits/${savedVisitId}`, {
                        method: 'PATCH',
                        headers: {
                          Authorization: `Bearer ${token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ supervisor_notes: supervisorNotes.trim() }),
                      });
                    } catch { /* non-blocking — proceed even if patch fails */ }
                  }
                  if (pendingVisit) onSuccess?.({ ...pendingVisit, supervisor_notes: supervisorNotes.trim() || pendingVisit.supervisor_notes });
                  resetRecorder();
                }}
              >
                ✅ Save & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
