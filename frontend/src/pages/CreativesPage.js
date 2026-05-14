import { useState, useEffect, useRef, useCallback } from 'react';

export default function CreativesPage({ activeClient, addToast, navigate }) {
  const [creatives, setCreatives] = useState([]);
  const [top10, setTop10] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryLogs, setRetryLogs] = useState([]);
  const [retryingImages, setRetryingImages] = useState({});
  const [deleting, setDeleting] = useState({});
  const [metaCopy, setMetaCopy] = useState({}); // { [label]: { variant_a, variant_b } | 'loading' | 'error' }
  const [metaVariant, setMetaVariant] = useState({}); // { [label]: 'a' | 'b' }

  const slug = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');

  const loadCreatives = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/creatives/${slug}`)
      .then(r => r.json())
      .then(data => { setCreatives(data.creatives || []); setTop10(data.top10 || []); })
      .catch(() => addToast('Failed to load creatives', 'error'))
      .finally(() => setLoading(false));
  }, [slug, addToast]);

  useEffect(() => { loadCreatives(); }, [loadCreatives]);

  // Close modal on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const getRatio = (c) => c.ratio || (c.label?.includes('-1x1') ? '1:1' : c.label?.includes('-9x16') ? '9:16' : '4:5');

  const iterationCount = creatives.filter(c => c.is_iteration).length;

  const filtered = creatives.filter(c => {
    if (filter === 'top10')      return c.is_top10;
    if (filter === 'high')       return c.ctr_tier === 'high';
    if (filter === 'failed')     return c.status === 'error';
    if (filter === 'version-a')  return c.version === 'A';
    if (filter === 'version-b')  return c.version === 'B';
    if (filter === 'ratio-4x5')  return getRatio(c) === '4:5';
    if (filter === 'ratio-1x1')  return getRatio(c) === '1:1';
    if (filter === 'ratio-9x16') return getRatio(c) === '9:16';
    if (filter === 'iterations') return c.is_iteration === true;
    if (filter === 'pipeline')   return !c.is_iteration;
    return true;
  });

  const failedCount = creatives.filter(c => c.status === 'error').length;
  const successCount = creatives.filter(c => c.status === 'success').length;

  const download = (ep) => window.open(`/api/creatives/${slug}/${ep}`, '_blank');
  const exportData = (ep) => window.open(`/api/creatives/${slug}/export/${ep}`, '_blank');

  const retryFailed = () => {
    if (!slug || retrying) return;
    setRetrying(true); setRetryLogs([]);
    const es = new EventSource(`/api/pipeline/${slug}/retry-images`);
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      setRetryLogs(prev => [...prev, ev.message]);
      if (ev.type === 'complete' || ev.type === 'error') {
        es.close(); setRetrying(false);
        addToast(ev.message, ev.type === 'complete' ? 'success' : 'error');
        setTimeout(loadCreatives, 500);
      }
    };
    es.onerror = () => { es.close(); setRetrying(false); setTimeout(loadCreatives, 500); };
  };

  const deleteCreative = async (label, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${label}? This removes it from the database and storage.`)) return;
    setDeleting(prev => ({ ...prev, [label]: true }));
    try {
      const res = await fetch(`/api/creatives/${slug}/${encodeURIComponent(label)}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        setCreatives(prev => prev.filter(c => c.label !== label));
        if (selected?.label === label) setSelected(null);
        addToast(`Deleted ${label}`, 'info');
      } else addToast(d.error || 'Delete failed', 'error');
    } catch { addToast('Delete failed', 'error'); }
    setDeleting(prev => ({ ...prev, [label]: false }));
  };

  const retryImage = (label) => {
    if (!slug || retryingImages[label] === 'retrying') return;
    setRetryingImages(prev => ({ ...prev, [label]: 'retrying' }));
    const es = new EventSource(`/api/pipeline/${slug}/retry-image/${encodeURIComponent(label)}`);
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === 'complete') {
        es.close();
        setRetryingImages(prev => ({ ...prev, [label]: ev.status === 'success' ? 'done' : 'failed' }));
        addToast(ev.message, ev.status === 'success' ? 'success' : 'error');
        if (ev.status === 'success') setTimeout(loadCreatives, 300);
      }
      if (ev.type === 'error') { es.close(); setRetryingImages(prev => ({ ...prev, [label]: 'failed' })); }
    };
    es.onerror = () => { es.close(); setRetryingImages(prev => ({ ...prev, [label]: 'failed' })); setTimeout(loadCreatives, 300); };
  };

  const generateMetaCopy = async (label, refresh = false) => {
    setMetaCopy(prev => ({ ...prev, [label]: 'loading' }));
    try {
      const res  = await fetch(`/api/creatives/${slug}/meta-copy/${encodeURIComponent(label)}${refresh ? '?refresh=1' : ''}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMetaCopy(prev => ({ ...prev, [label]: data }));
      setMetaVariant(prev => ({ ...prev, [label]: 'a' }));
    } catch (e) {
      setMetaCopy(prev => ({ ...prev, [label]: 'error' }));
      addToast('Copy generation failed: ' + e.message, 'error');
    }
  };

  if (!activeClient) return (
    <div className="g-empty">
      <div className="g-empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 9 6 6m0-6-6 6"/></svg>
      </div>
      <div className="g-empty-title">No client selected</div>
      <div className="g-empty-sub">Select a client from the sidebar to view creatives</div>
    </div>
  );

  if (loading) return (
    <div className="g-empty">
      <div className="g-empty-icon" style={{ animation: 'pulse 1.5s infinite' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      </div>
      <div className="g-empty-title">Loading creatives…</div>
    </div>
  );

  if (creatives.length === 0) return (
    <div className="g-empty">
      <div className="g-empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      </div>
      <div className="g-empty-title">No creatives yet</div>
      <div className="g-empty-sub">Run the pipeline to generate your first ad creatives</div>
      <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate('run')}>
        Run Pipeline
      </button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title gradient-text" style={{ display: 'inline-block' }}>Creatives</div>
            <div className="page-sub" style={{ marginTop: 4 }}>
              <span style={{ color: 'var(--green)', fontWeight: 500 }}>{successCount}</span> generated
              {top10.length > 0 && <> · <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{top10.length}</span> top-rated</>}
              {failedCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>· {failedCount} failed</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {top10.length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => download('download-top10')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Top {top10.length}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => download('download')}>Download All</button>
          </div>
        </div>
      </div>

      {/* Failed alert */}
      {failedCount > 0 && (
        <div className="g-alert g-alert-warn" style={{ marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{failedCount} image{failedCount > 1 ? 's' : ''} failed to generate</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Gemini was busy. Retry when ready — it only regenerates failed images.</div>
            {retryLogs.length > 0 && (
              <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', maxHeight: 80, overflowY: 'auto' }}>
                {retryLogs.slice(-5).map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={retryFailed} disabled={retrying}>
            {retrying ? 'Retrying…' : `Retry ${failedCount} Failed`}
          </button>
        </div>
      )}

      {/* Top-rated info banner — info only, no button */}
      {top10.length > 0 && (
        <div className="g-alert g-alert-success" style={{ marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              Top {top10.length} selected for Meta Ads
              <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 8, fontSize: 11 }}>
                — click "Export Top {top10.length}" above to download
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3 }}>
              {top10.slice(0, 5).join(' · ')}{top10.length > 5 ? ` · +${top10.length - 5} more` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Research downloads — clearly labelled as separate from image export */}
      <div className="export-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Research & Report Downloads</div>
        <div className="export-row">
          {[
            { label: 'Market Context', ep: 'context', desc: 'Research & audience insights (JSON)' },
            { label: 'Content Briefs', ep: 'briefs',  desc: 'All format briefs Claude wrote (JSON)' },
            { label: 'Image Prompts',  ep: 'prompts', desc: 'Gemini prompts per creative (ZIP)' },
            { label: 'Review Report',  ep: 'review',  desc: 'AI scores & rankings (JSON)' },
          ].map(e => (
            <button key={e.ep} className="export-item" onClick={() => exportData(e.ep)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{e.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{e.desc}</div>
              </div>
            </button>
          ))}
          <button className="export-item export-item-primary" onClick={() => exportData('full')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>Full Export</div>
              <div style={{ fontSize: 10, opacity: 0.75, marginTop: 1 }}>All JSONs + images + prompts (ZIP)</div>
            </div>
          </button>
        </div>
      </div>

      {/* Next step — no duplicate export, just guidance */}
      {top10.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(79,70,229,0.04)', border: '1px solid var(--accent-border)',
          fontSize: 12.5, color: 'var(--text2)'
        }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <span>
            <strong style={{ color: 'var(--text)' }}>Next step:</strong> export your top {top10.length} ads, upload to Meta Ads Manager, then return here after 5–7 days to run the <button onClick={() => navigate('feedback')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 12.5 }}>Feedback Loop</button> for performance-based improvements.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="g-filters">
        {[
          { id: 'all',       label: `All (${creatives.length})` },
          { id: 'top10',     label: `Top Rated (${top10.length})` },
          { id: 'high',      label: 'High CTR' },
          { id: 'version-a', label: 'Version A' },
          { id: 'version-b', label: 'Version B' },
          // Ratio filters — only show if multiple ratios present
          ...(creatives.some(c => getRatio(c) === '4:5')  ? [{ id: 'ratio-4x5',  label: '4:5 Feed'    }] : []),
          ...(creatives.some(c => getRatio(c) === '1:1')  ? [{ id: 'ratio-1x1',  label: '1:1 Square'  }] : []),
          ...(creatives.some(c => getRatio(c) === '9:16') ? [{ id: 'ratio-9x16', label: '9:16 Reels'  }] : []),
          // Source filters
          ...(iterationCount > 0 ? [{ id: 'iterations', label: `Iterations (${iterationCount})` }] : []),
          ...(iterationCount > 0 ? [{ id: 'pipeline',   label: 'Pipeline Only' }] : []),
          ...(failedCount > 0 ? [{ id: 'failed', label: `Failed (${failedCount})` }] : [])
        ].map(f => (
          <button key={f.id} className={`g-filter-btn ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Gallery grid */}
      <div className="g-grid">
        {filtered.map(c => (
          <div
            key={c.label}
            className={`g-card ${c.is_top10 ? 'g-card-top' : ''} ${c.status === 'error' || (!c.image_url && c.status !== 'prompt_only') ? 'g-card-failed' : ''}`}
            onClick={() => setSelected(c)}
          >
            <div className="g-thumb">
              {c.image_url ? (
                <img src={c.image_url} alt={c.brief?.format_name || c.label} draggable={false} />
              ) : (
                <div className="g-thumb-empty">
                  {retryingImages[c.label] === 'retrying' ? (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ animation: 'pulse 1.2s infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                      <span>Generating…</span>
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
                      <span>{c.status === 'prompt_only' ? 'No image' : 'Failed'}</span>
                      {c.status === 'error' && retryingImages[c.label] !== 'retrying' && (
                        <button className="g-retry-btn" onClick={e => { e.stopPropagation(); retryImage(c.label); }}>Retry</button>
                      )}
                    </>
                  )}
                </div>
              )}
              {c.is_top10      && <div className="g-badge g-badge-top">Top</div>}
              {c.score         && <div className="g-badge g-badge-score">{c.score}</div>}
              {c.is_iteration  && (
                <div style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(217,119,6,0.85)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                  V{c.iteration_num}
                </div>
              )}
              {/* Ratio badge — only show when multiple ratios exist in gallery */}
              {creatives.some(x => getRatio(x) !== '4:5') && (
                <div style={{ position: 'absolute', bottom: 8, right: 8, fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                  {getRatio(c)}
                </div>
              )}
              {/* Delete button — top-left on hover */}
              <button
                className="g-card-delete"
                title="Delete this creative"
                onClick={e => deleteCreative(c.label, e)}
                disabled={deleting[c.label]}
              >
                {deleting[c.label]
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83"/></svg>
                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                }
              </button>
            </div>
            <div className="g-info">
              <div className="g-format-name">{c.brief?.format_name || 'Format'}</div>
              <div className="g-label">{c.label}</div>
              {c.meta_name && <div style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--accent)', marginBottom: 4, letterSpacing: 0.3 }}>Meta: {c.meta_name}</div>}
              {c.headline && <div className="g-headline">"{c.headline}"</div>}
              <div className="g-tags">
                {c.ctr_tier && <span className={`g-tag ${c.ctr_tier === 'high' ? 'g-tag-green' : c.ctr_tier === 'medium' ? 'g-tag-blue' : 'g-tag-gray'}`}>{c.ctr_tier}</span>}
                {c.status === 'error' && <span className="g-tag g-tag-red">Failed</span>}
                {!c.image_url && c.status !== 'error' && c.status !== 'prompt_only' && <span className="g-tag g-tag-red">No image</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="g-modal">
            {/* Sticky header */}
            <div className="g-modal-header">
              <div>
                <div className="g-modal-title">{selected.brief?.format_name || selected.label}</div>
                <div className="g-modal-sub">Version {selected.version} · {selected.label}</div>
              </div>
              <button className="g-modal-close" onClick={() => setSelected(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="g-modal-body">
              {/* Two-column: image left, details right */}
              <div className="g-modal-layout">
                {/* Image pane */}
                <div className="g-modal-img-pane">
                  {selected.image_url ? (
                    <img src={selected.image_url} alt={selected.label} className="g-modal-img" />
                  ) : (
                    <div className="g-modal-img-empty">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 9 6 6M9 15l6-6"/></svg>
                      <span>{selected.status === 'error' ? 'Image failed' : 'No image'}</span>
                    </div>
                  )}
                  {selected.image_url && (
                    <a href={selected.image_url} download={`${selected.label}.jpg`} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
                      Download Image
                    </a>
                  )}
                  {selected.status === 'error' && (
                    <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                      onClick={() => retryImage(selected.label)}>
                      Retry Generation
                    </button>
                  )}
                </div>

                {/* Details pane */}
                <div className="g-modal-details">
                  {/* Safe zone badge */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span className="safe-zone-badge">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      Safe zones applied
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
                      4:5 · 1080×1350px
                    </span>
                  </div>

                  {/* Meta ad name — prominently shown */}
                  {selected.meta_name && (
                    <div style={{ padding: '10px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3 }}>Meta Ad Name — copy this when uploading to Meta</div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)', letterSpacing: 0.3 }}>{selected.meta_name}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { navigator.clipboard.writeText(selected.meta_name); addToast('Copied!', 'success'); }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy
                      </button>
                    </div>
                  )}
                  {/* Scores */}
                  {(selected.score || selected.ctr_tier) && (
                    <>
                      <div className="g-modal-scores">
                        {selected.score && (
                          <div className="g-score-box">
                            <div className="g-score-label">AI Score</div>
                            <div className="g-score-value" style={{ color: selected.score >= 80 ? 'var(--green)' : selected.score >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                              {selected.score}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)' }}>/100</span>
                            </div>
                          </div>
                        )}
                        {selected.ctr_tier && (
                          <div className="g-score-box" style={{ position: 'relative' }}>
                            <div className="g-score-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              Predicted CTR
                              <span title="High = estimated CTR above 1.5% for cold audiences. Medium = 0.8–1.5%. Low = below 0.8%. Based on format, hook strength, and copy clarity." style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', background: 'var(--surface3)', border: '1px solid var(--border2)', fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--sans)', fontWeight: 700 }}>?</span>
                            </div>
                            <div className="g-score-value" style={{ fontSize: 16, color: selected.ctr_tier === 'high' ? 'var(--green)' : selected.ctr_tier === 'medium' ? 'var(--amber)' : 'var(--text)' }}>
                              {selected.ctr_tier.charAt(0).toUpperCase() + selected.ctr_tier.slice(1)}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                              {selected.ctr_tier === 'high' ? '>1.5%' : selected.ctr_tier === 'medium' ? '0.8–1.5%' : '<0.8%'} est.
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 7-criteria breakdown */}
                      {selected.criteria_scores && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Score Breakdown</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {[
                              { key: 'hook_strength',       label: 'Hook Strength' },
                              { key: 'argument_clarity',    label: 'Argument Clarity' },
                              { key: 'emotional_resonance', label: 'Emotional Resonance' },
                              { key: 'belief_alignment',    label: 'Belief Alignment' },
                              { key: 'cta_strength',        label: 'CTA Strength' },
                              { key: 'brand_alignment',     label: 'Brand Alignment' },
                              { key: 'meta_compliance',     label: 'Meta Compliance' },
                            ].map(({ key, label }) => {
                              const val = selected.criteria_scores[key];
                              if (val == null) return null;
                              const pct = (val / 10) * 100;
                              const col = val >= 8 ? 'var(--green)' : val >= 6 ? 'var(--accent)' : val >= 4 ? 'var(--amber)' : 'var(--red)';
                              return (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 120, fontSize: 10, color: 'var(--text2)', flexShrink: 0 }}>{label}</div>
                                  <div style={{ flex: 1, height: 5, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 0.6s ease' }} />
                                  </div>
                                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: col, width: 22, textAlign: 'right', flexShrink: 0 }}>{val}</div>
                                </div>
                              );
                            })}
                          </div>
                          {selected.hook_note && (
                            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 6, fontSize: 11.5, color: 'var(--text2)', fontStyle: 'italic' }}>
                              {selected.hook_note}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Copy fields */}
                  {[
                    { label: 'Hook', value: selected.brief?.hook_line },
                    { label: 'Headline', value: selected.headline, bold: true },
                    { label: 'Subheadline', value: selected.subheadline },
                    { label: 'Body Copy', value: selected.body_copy },
                    { label: 'CTA', value: selected.cta_text },
                    { label: 'Winning Argument', value: selected.brief?.winning_argument },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="g-copy-field">
                      <div className="g-copy-label">{f.label}</div>
                      <div className="g-copy-value" style={{ fontWeight: f.bold ? 600 : 400 }}>{f.value}</div>
                    </div>
                  ))}

                  {/* Strengths */}
                  {selected.strengths?.length > 0 && (
                    <div className="g-copy-field">
                      <div className="g-copy-label">Strengths</div>
                      {selected.strengths.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}><path d="M20 6 9 17l-5-5"/></svg>
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Improvement */}
                  {selected.improvement && (
                    <div className="g-copy-field" style={{ background: 'var(--amber-dim)', borderColor: 'rgba(217,119,6,0.2)' }}>
                      <div className="g-copy-label" style={{ color: 'var(--amber)' }}>Suggested Improvement</div>
                      <div className="g-copy-value">{selected.improvement}</div>
                    </div>
                  )}

                  {/* ── Copywriter Agent — Meta Ad Copy ── */}
                  {selected.status === 'success' && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)' }}>
                          Meta Ads Manager Copy
                        </div>
                        {metaCopy[selected.label] && metaCopy[selected.label] !== 'loading' && metaCopy[selected.label] !== 'error' && (
                          <button onClick={() => generateMetaCopy(selected.label, true)} style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--text3)', cursor: 'pointer', textDecoration: 'underline' }}>
                            Regenerate
                          </button>
                        )}
                      </div>

                      {!metaCopy[selected.label] && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={() => generateMetaCopy(selected.label)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10" strokeDasharray="3 3"/></svg>
                          Generate Meta Copy (A/B)
                        </button>
                      )}

                      {metaCopy[selected.label] === 'loading' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, color: 'var(--text3)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                          Claude is writing Meta copy…
                        </div>
                      )}

                      {metaCopy[selected.label] && metaCopy[selected.label] !== 'loading' && metaCopy[selected.label] !== 'error' && (() => {
                        const copy   = metaCopy[selected.label];
                        const vKey   = `variant_${metaVariant[selected.label] || 'a'}`;
                        const v      = copy[vKey] || {};
                        const fields = [
                          { label: 'Primary Text', key: 'primary_text', limit: 125, desc: 'Main body copy — shown in feed' },
                          { label: 'Headline',     key: 'headline',     limit: 40,  desc: 'Bold text below the image' },
                          { label: 'Description',  key: 'description',  limit: 30,  desc: 'Optional supporting line' },
                        ];
                        return (
                          <div>
                            {/* A/B toggle */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                              {['a', 'b'].map(vv => (
                                <button key={vv} onClick={() => setMetaVariant(prev => ({ ...prev, [selected.label]: vv }))}
                                  style={{ padding: '5px 14px', borderRadius: 20, fontSize: 11.5, cursor: 'pointer', border: '1px solid', fontWeight: (metaVariant[selected.label] || 'a') === vv ? 600 : 400, background: (metaVariant[selected.label] || 'a') === vv ? 'var(--accent)' : 'var(--surface2)', borderColor: (metaVariant[selected.label] || 'a') === vv ? 'var(--accent)' : 'var(--border)', color: (metaVariant[selected.label] || 'a') === vv ? '#fff' : 'var(--text2)' }}>
                                  Variant {vv.toUpperCase()} — {copy[`variant_${vv}`]?.angle || ''}
                                </button>
                              ))}
                            </div>
                            {fields.map(f => {
                              const text    = v[f.key] || '';
                              const charLen = text.length;
                              const over    = charLen > f.limit;
                              return (
                                <div key={f.key} style={{ marginBottom: 8, padding: '10px 12px', background: 'var(--surface2)', border: `1px solid ${over ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`, borderRadius: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <div>
                                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)' }}>{f.label}</span>
                                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 8 }}>{f.desc}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: over ? 'var(--red)' : charLen > f.limit * 0.85 ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>
                                        {charLen}/{f.limit}
                                      </span>
                                      <button onClick={() => { navigator.clipboard.writeText(text); addToast(`${f.label} copied!`, 'success'); }}
                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 10, color: 'var(--text2)' }}>
                                        Copy
                                      </button>
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{text || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Not generated</span>}</div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
