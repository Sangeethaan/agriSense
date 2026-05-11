import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { SupervisorNav } from './FarmerDirectory';
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

/* ── Register Farm Modal ─────────────────────────────────────── */
function RegisterFarmModal({ farmerId, farmerName, token, onClose, onCreated }) {
  const [farmName,  setFarmName]  = useState('');
  const [location,  setLocation]  = useState('');
  const [cropInput, setCropInput] = useState('');
  const [cropTypes, setCropTypes] = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const nameRef = useRef(null);

  // Auto-focus farm name on mount
  useEffect(() => { nameRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const addCrop = () => {
    const v = cropInput.trim();
    if (v && !cropTypes.includes(v)) setCropTypes(prev => [...prev, v]);
    setCropInput('');
  };

  const removeCrop = (crop) => setCropTypes(prev => prev.filter(c => c !== crop));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!farmName.trim()) { setError('Farm name is required.'); return; }
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`${API}/api/farms`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          farmer_id:  farmerId,
          name:       farmName.trim(),
          location:   location.trim() || null,
          crop_types: cropTypes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create farm');

      onCreated(data.farm);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div
      className="sup-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="sup-modal">
        {/* Header */}
        <div className="sup-modal-header">
          <div className="sup-modal-icon">🌾</div>
          <div>
            <div className="sup-modal-title" id="modal-title">Register New Farm</div>
            <div className="sup-modal-sub">Adding a plot for <strong>{farmerName}</strong></div>
          </div>
          <button className="sup-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="sup-modal-body">
            {error && (
              <div className="sup-alert sup-alert-error" style={{ marginBottom: 16 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Farm Name */}
            <div className="sup-field">
              <label className="sup-field-label" htmlFor="modal-farm-name">
                Farm / Plot Name *
              </label>
              <input
                ref={nameRef}
                id="modal-farm-name"
                type="text"
                className="sup-field-input"
                placeholder="e.g. Rose Garden, Plot A, North Field"
                value={farmName}
                onChange={e => setFarmName(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Location */}
            <div className="sup-field">
              <label className="sup-field-label" htmlFor="modal-farm-location">
                Location / Village
              </label>
              <input
                id="modal-farm-location"
                type="text"
                className="sup-field-input"
                placeholder="e.g. Hebbal, Kanakapura Road"
                value={location}
                onChange={e => setLocation(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Crop Types */}
            <div className="sup-field">
              <label className="sup-field-label">
                Flower Varieties
              </label>
              <div className="sup-crop-input-row">
                <input
                  id="modal-crop-input"
                  type="text"
                  className="sup-field-input"
                  placeholder="e.g. Marigold, Gerbera, Carnation…"
                  value={cropInput}
                  onChange={e => setCropInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addCrop(); }
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="sup-btn sup-btn-ghost"
                  onClick={addCrop}
                  disabled={!cropInput.trim()}
                  style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}
                >
                  + Add
                </button>
              </div>
              {cropTypes.length > 0 && (
                <div className="sup-chip-list">
                  {cropTypes.map(c => (
                    <span key={c} className="sup-chip">
                      🌱 {c}
                      <button
                        type="button"
                        className="sup-chip-remove"
                        onClick={() => removeCrop(c)}
                        aria-label={`Remove ${c}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sup-modal-footer">
            <button
              type="button"
              className="sup-btn sup-btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              id="btn-modal-register-farm"
              type="submit"
              className="sup-btn sup-btn-primary"
              disabled={saving || !farmName.trim()}
            >
              {saving
                ? <><span style={{ animation: 'recordSpin .7s linear infinite', display: 'inline-block' }}>⏳</span> Saving…</>
                : '🌾 Register Farm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Delete Farmer Confirmation Dialog
═══════════════════════════════════════════════════════════════ */
function DeleteFarmerDialog({ farmerName, onConfirm, onCancel, deleting }) {
  return (
    <div
      className="sup-modal-overlay"
      onClick={e => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div className="sup-modal" style={{ maxWidth: 420 }}>
        <div className="sup-modal-header">
          <div className="sup-modal-icon" style={{ background: 'linear-gradient(135deg,#fca5a5,#ef4444)' }}>🗑️</div>
          <div>
            <div className="sup-modal-title">Delete Farmer</div>
            <div className="sup-modal-sub">This action cannot be undone</div>
          </div>
          <button className="sup-modal-close" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="sup-modal-body">
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 10, padding: '14px 16px',
            color: '#991b1b', fontSize: '.88rem', lineHeight: 1.6,
          }}>
            ⚠️ You are about to permanently delete <strong>{farmerName}</strong>.<br />
            All their <strong>farms, visit records, transcripts and reports</strong> will also be deleted.
          </div>
        </div>
        <div className="sup-modal-footer">
          <button className="sup-btn sup-btn-ghost" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button
            id="btn-confirm-delete-farmer"
            className="sup-btn sup-btn-primary"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: 'none' }}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? '⏳ Deleting…' : '🗑️ Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FarmerProfilePage
═══════════════════════════════════════════════════════════════ */
export default function FarmerProfilePage() {
  const { farmerId }          = useParams();
  const { token, logout }     = useAuth();
  const navigate              = useNavigate();

  const [farmer,  setFarmer]  = useState(null);
  const [farms,   setFarms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingFarmId, setDeletingFarmId]       = useState(null);
  const [showDeleteDialog, setShowDeleteDialog]   = useState(false);
  const [deletingFarmer,  setDeletingFarmer]      = useState(false);

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

  const goToFarm = (farmId) =>
    navigate(`/supervisor/farmer/${farmerId}/farm/${farmId}`);

  // Called by modal on success — prepend to list and navigate
  const handleFarmCreated = useCallback((newFarm) => {
    setFarms(prev => [{ ...newFarm, visit_count: 0, last_visit_date: null }, ...prev]);
    setShowModal(false);
    // Navigate immediately to the new farm's detail page
    navigate(`/supervisor/farmer/${farmerId}/farm/${newFarm.id}`);
  }, [farmerId, navigate]);

  // Delete a farm after confirmation
  const handleDeleteFarm = useCallback(async (e, farmId, farmName) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${farmName}"?\n\nThis will permanently remove the farm and all its visit records.`)) return;
    setDeletingFarmId(farmId);
    try {
      const res = await fetch(`${API}/api/farms/${farmId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete farm');
      }
      setFarms(prev => prev.filter(f => f.id !== farmId));
    } catch (err) {
      alert(`Could not delete farm: ${err.message}`);
    } finally {
      setDeletingFarmId(null);
    }
  }, [token]);

  // Delete the farmer account (with all their data)
  const handleDeleteFarmer = useCallback(async () => {
    setDeletingFarmer(true);
    try {
      const res = await fetch(`${API}/api/supervisor/farmers/${farmerId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete farmer');
      }
      navigate('/supervisor', { replace: true });
    } catch (err) {
      alert(`Could not delete farmer: ${err.message}`);
      setDeletingFarmer(false);
      setShowDeleteDialog(false);
    }
  }, [farmerId, token, navigate]);

  return (
    <div className="sup-shell">
      <SupervisorNav
        crumbs={[
          { label: 'Dashboard', href: '/supervisor' },
          { label: farmer?.name || 'Farmer Profile' },
        ]}
      />

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
              <div style={{ flex: 1 }}>
                <div className="sup-profile-name">{farmer.name}</div>
                <div className="sup-profile-meta">
                  {farmer.village && <span>📍 {farmer.village}</span>}
                  {farmer.phone   && <span>📞 {farmer.phone}</span>}
                  <span>✉️ {farmer.email}</span>
                </div>
              </div>
              {/* Delete Farmer */}
              <button
                id="btn-delete-farmer"
                className="sup-btn sup-btn-ghost"
                style={{
                  color: '#dc2626', borderColor: '#fca5a5',
                  flexShrink: 0, alignSelf: 'flex-start',
                }}
                onClick={() => setShowDeleteDialog(true)}
                title="Delete this farmer"
              >
                🗑️ Delete Farmer
              </button>
            </div>

            {/* ── Farm grid header ─────────────────────── */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 10,
              marginBottom: 6,
            }}>
              <h2 className="sup-section-title" style={{ margin: 0 }}>
                Farm Plots
                <span style={{ fontSize: '.82rem', fontWeight: 500, color: 'var(--sup-muted)', marginLeft: 10 }}>
                  ({farms.length})
                </span>
              </h2>

              {/* Register Farm button */}
              <button
                id="btn-register-farm"
                className="sup-btn sup-btn-primary"
                onClick={() => setShowModal(true)}
              >
                + Register Farm
              </button>
            </div>
            <p className="sup-section-sub">
              Select a plot to view its full history and start a new visit.
            </p>

            {/* ── Farm grid ───────────────────────────────── */}
            {farms.length === 0 ? (
              <div className="sup-empty">
                <div className="sup-empty-icon">🌿</div>
                <div className="sup-empty-title">No farms registered</div>
                <div className="sup-empty-sub">
                  Use the <strong>+ Register Farm</strong> button above to add this farmer's first plot.
                </div>
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

                    {/* Task progress — only shown when AI report has tasks */}
                    {farm.total_tasks > 0 && (
                      <div className="sup-task-progress">
                        <div className="sup-task-progress-header">
                          <span>Farmer Tasks</span>
                          <span className={
                            farm.completed_task_count >= farm.total_tasks
                              ? 'sup-task-badge sup-task-badge-done'
                              : 'sup-task-badge'
                          }>
                            {farm.completed_task_count}/{farm.total_tasks} Done
                          </span>
                        </div>
                        <div className="sup-task-bar-track">
                          <div
                            className="sup-task-bar-fill"
                            style={{
                              width: `${Math.round((farm.completed_task_count / farm.total_tasks) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}


                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        className="sup-btn sup-btn-primary"
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={e => { e.stopPropagation(); goToFarm(farm.id); }}
                        tabIndex={-1}
                      >
                        View Farm →
                      </button>
                      <button
                        id={`btn-delete-farm-${farm.id}`}
                        className="sup-btn sup-btn-ghost"
                        style={{ color: '#dc2626', borderColor: '#fca5a5', flexShrink: 0, padding: '0 12px' }}
                        onClick={e => handleDeleteFarm(e, farm.id, farm.name)}
                        disabled={deletingFarmId === farm.id}
                        tabIndex={-1}
                        aria-label={`Delete ${farm.name}`}
                        title="Delete farm"
                      >
                        {deletingFarmId === farm.id ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Register Farm Modal ── */}
      {showModal && farmer && (
        <RegisterFarmModal
          farmerId={farmerId}
          farmerName={farmer.name}
          token={token}
          onClose={() => setShowModal(false)}
          onCreated={handleFarmCreated}
        />
      )}

      {/* ── Delete Farmer Confirmation ── */}
      {showDeleteDialog && farmer && (
        <DeleteFarmerDialog
          farmerName={farmer.name}
          onConfirm={handleDeleteFarmer}
          onCancel={() => setShowDeleteDialog(false)}
          deleting={deletingFarmer}
        />
      )}
    </div>
  );
}
