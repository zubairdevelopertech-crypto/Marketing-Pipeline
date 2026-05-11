import { useState, useEffect, useCallback, useRef } from 'react';
import FORMATS from '../data/formats.json';
import { getRefUrls } from '../data/formatRefs';

// ── FormatModal — shows reference images for any format ─────────────────────
function FormatModal({ fmt, refs, onClose, onDelete }) {
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { lightbox ? setLightbox(null) : onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px', overflowY: 'auto'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)', width: '100%', maxWidth: 780,
        maxHeight: '90vh', overflowY: 'auto', padding: 32, position: 'relative',
        boxShadow: 'var(--shadow-xl)'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16, background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32,
          cursor: 'pointer', fontSize: 16, color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>✕</button>

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)',
              letterSpacing: 1, background: 'var(--surface2)', padding: '2px 8px',
              borderRadius: 4, border: '1px solid var(--border)'
            }}>{fmt.id}</span>
            <span style={{ fontWeight: 700, fontSize: 22, color: 'var(--text)' }}>{fmt.name}</span>
            {fmt.custom && (
              <span className="tag tag-accent" style={{ fontSize: 10 }}>Custom</span>
            )}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 10 }}>{fmt.structure}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {(fmt.awareness_fit || []).map(l => (
              <span key={l} className="tag tag-muted">Awareness Level {l}</span>
            ))}
            {fmt.custom && onDelete && (
              <button
                onClick={() => { if (window.confirm(`Delete "${fmt.name}"? This cannot be undone.`)) { onDelete(fmt.id); onClose(); } }}
                style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--red, #ef4444)' }}
              >Delete format</button>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />
        <div style={{ marginBottom: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 1, textTransform: 'uppercase' }}>
          Winning Examples
        </div>

        {refs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 14 }}>
            No reference images yet.
            {fmt.custom && (
              <div style={{ marginTop: 8, fontSize: 12 }}>Edit this format to add example images.</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: refs.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {refs.map((url, i) => (
              <div key={i} onClick={() => setLightbox(url)} style={{
                borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in',
                border: '1px solid var(--border)', background: 'var(--surface2)',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease'
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <img src={url} alt={`${fmt.name} example ${i + 1}`}
                  style={{ width: '100%', display: 'block', objectFit: 'cover' }}
                  onError={e => { e.target.parentElement.style.display = 'none'; }} />
                <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  Example {i + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.93)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, cursor: 'zoom-out'
        }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Full size"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
          <button onClick={() => setLightbox(null)} style={{
            position: 'fixed', top: 20, right: 20, background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36,
            cursor: 'pointer', fontSize: 18, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── AddFormatModal ───────────────────────────────────────────────────────────
function AddFormatModal({ onClose, onSaved }) {
  const [name, setName]         = useState('');
  const [structure, setStructure] = useState('');
  const [awareness, setAwareness] = useState([]);
  const [hook, setHook]           = useState('');
  const [files, setFiles]         = useState([]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const fileRef = useRef();

  const toggleLevel = (l) =>
    setAwareness(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l].sort());

  const handleSubmit = async () => {
    if (!name.trim() || !structure.trim()) { setError('Name and structure are required.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, structure, awareness_fit: awareness, hook })
      });
      const fmt = await res.json();
      if (!res.ok) { setError(fmt.error || 'Failed to save'); setSaving(false); return; }

      // Upload reference images if any selected
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach(f => fd.append('refs', f));
        await fetch(`/api/formats/${fmt.id}/refs`, { method: 'POST', body: fd });
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px'
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
        width: '100%', maxWidth: 560, padding: 32, position: 'relative',
        boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16, background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32,
          cursor: 'pointer', fontSize: 16, color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>✕</button>

        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Add Custom Format</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>
          Define a new ad format with structure and example images.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Format Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Testimonial Collage"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontSize: 14, outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Structure / Description *</label>
            <textarea
              value={structure}
              onChange={e => setStructure(e.target.value)}
              placeholder="e.g. Grid of testimonial photos → brand claim → CTA"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Awareness Levels</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map(l => (
                <button
                  key={l}
                  onClick={() => toggleLevel(l)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                    border: '1px solid', fontWeight: awareness.includes(l) ? 600 : 400,
                    background: awareness.includes(l) ? 'var(--accent-dim)' : 'var(--surface2)',
                    borderColor: awareness.includes(l) ? 'var(--accent)' : 'var(--border)',
                    color: awareness.includes(l) ? 'var(--accent)' : 'var(--text2)'
                  }}
                >
                  Level {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Hook Type <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
            <input
              value={hook}
              onChange={e => setHook(e.target.value)}
              placeholder="e.g. pain, aspiration, proof, curiosity"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
              Example / Reference Images <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional, max 4)</span>
            </label>
            <div
              style={{
                border: '1px dashed var(--border)', borderRadius: 10, padding: '20px 16px',
                textAlign: 'center', cursor: 'pointer', background: 'var(--surface2)',
                transition: 'border-color 0.15s'
              }}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                onChange={e => {
                  const arr = Array.from(e.target.files).slice(0, 4);
                  setFiles(arr);
                }}
              />
              {files.length === 0 ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Drop images or click to browse</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>.jpg .png .webp · max 4 images</div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{
                      background: 'var(--accent-dim)', color: 'var(--accent)',
                      borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 500
                    }}>{f.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Format'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── FormatsPage ──────────────────────────────────────────────────────────────
export function FormatsPage() {
  const [customFormats, setCustomFormats]     = useState([]);
  const [customRefs, setCustomRefs]           = useState({});
  const [openFormat, setOpenFormat]           = useState(null);
  const [openRefs, setOpenRefs]               = useState([]);
  const [showAddModal, setShowAddModal]       = useState(false);
  const [loadingCustom, setLoadingCustom]     = useState(true);

  const loadCustomFormats = useCallback(async () => {
    try {
      const res  = await fetch('/api/formats');
      const data = await res.json();
      setCustomFormats(Array.isArray(data) ? data : []);

      // Load refs for each custom format in parallel
      const refsMap = {};
      await Promise.all(data.map(async (fmt) => {
        try {
          const r = await fetch(`/api/formats/${fmt.id}/refs`);
          const list = await r.json();
          refsMap[fmt.id] = list.map(f => f.url);
        } catch (_) { refsMap[fmt.id] = []; }
      }));
      setCustomRefs(refsMap);
    } catch (_) {
      setCustomFormats([]);
    }
    setLoadingCustom(false);
  }, []);

  useEffect(() => { loadCustomFormats(); }, [loadCustomFormats]);

  const openModal = (fmt) => {
    setOpenFormat(fmt);
    setOpenRefs(fmt.custom ? (customRefs[fmt.id] || []) : getRefUrls(fmt.id));
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/formats/${id}`, { method: 'DELETE' });
      setCustomFormats(prev => prev.filter(f => f.id !== id));
    } catch (_) {}
  };

  const allFormats = [...FORMATS, ...customFormats];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Ad Formats Library</div>
          <div className="page-sub">
            {allFormats.length} formats — click any card to see winning examples
            {customFormats.length > 0 && ` · ${customFormats.length} custom`}
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddModal(true)}
        >
          + Add Format
        </button>
      </div>

      <div className="callout callout-accent" style={{ marginBottom: 20 }}>
        <strong>Based on the Mark Builds Brands framework.</strong> Each format is matched to a Schwartz awareness level (L1–L5).
        Click any format to see winning ad examples — so you know exactly what each format looks like.
      </div>

      <div className="format-grid">
        {allFormats.map(fmt => {
          const refs = fmt.custom ? (customRefs[fmt.id] || []) : getRefUrls(fmt.id);
          const thumb = refs[0] || null;

          return (
            <div
              key={fmt.id}
              className="format-card"
              onClick={() => openModal(fmt)}
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              {/* Thumbnail */}
              {thumb ? (
                <div style={{
                  width: '100%', aspectRatio: '4/3', borderRadius: 8,
                  overflow: 'hidden', marginBottom: 10, background: 'var(--surface2)'
                }}>
                  <img src={thumb} alt={fmt.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.target.parentElement.style.display = 'none'; }} />
                </div>
              ) : loadingCustom && fmt.custom ? (
                <div style={{
                  width: '100%', aspectRatio: '4/3', borderRadius: 8, marginBottom: 10,
                  background: 'linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%)',
                  backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite'
                }} />
              ) : null}

              {/* Custom badge */}
              {fmt.custom && (
                <div style={{ marginBottom: 4 }}>
                  <span className="tag tag-accent" style={{ fontSize: 9, padding: '2px 7px' }}>Custom</span>
                </div>
              )}

              {/* Example count */}
              {refs.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)',
                    background: 'var(--accent-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700
                  }}>
                    {refs.length} example{refs.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              <div className="format-id">{fmt.id}</div>
              <div className="format-name">{fmt.name}</div>
              <div className="format-desc">{fmt.structure}</div>
              <div className="format-awareness" style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {(fmt.awareness_fit || []).map(l => (
                  <span key={l} className="tag tag-muted">Level {l}</span>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>View →</span>
              </div>
            </div>
          );
        })}
      </div>

      {openFormat && (
        <FormatModal
          fmt={openFormat}
          refs={openRefs}
          onClose={() => setOpenFormat(null)}
          onDelete={openFormat.custom ? handleDelete : null}
        />
      )}

      {showAddModal && (
        <AddFormatModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadCustomFormats}
        />
      )}
    </div>
  );
}

export default FormatsPage;
