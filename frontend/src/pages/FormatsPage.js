import { useState, useEffect, useCallback } from 'react';
import FORMATS from '../data/formats.json';

const RATIO_LABELS = { '4:5': '4:5', '1:1': '1:1', '9:16': '9:16' };

function CreativeThumb({ c, size = 80 }) {
  const [err, setErr] = useState(false);
  if (!c?.image_url || err) return null;
  return (
    <img
      src={c.image_url}
      alt={c.label}
      onError={() => setErr(true)}
      style={{
        width: size, height: size, objectFit: 'cover', borderRadius: 6,
        border: '1px solid var(--border)', display: 'block', background: 'var(--surface2)'
      }}
    />
  );
}

function FormatModal({ fmt, creatives, onClose }) {
  const [ratioFilter, setRatioFilter] = useState('all');
  const [selectedImg, setSelectedImg] = useState(null);

  const ratios = [...new Set(creatives.map(c => c.ratio || '4:5'))].sort();
  const filtered = ratioFilter === 'all' ? creatives : creatives.filter(c => (c.ratio || '4:5') === ratioFilter);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
        width: '100%', maxWidth: 820, padding: 28, position: 'relative',
        boxShadow: 'var(--shadow-xl)'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16, background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32,
            cursor: 'pointer', fontSize: 16, color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >✕</button>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: 1 }}>{fmt.id}</span>
            <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>{fmt.name}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{fmt.structure}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {fmt.awareness_fit.map(l => (
              <span key={l} className="tag tag-muted">Level {l}</span>
            ))}
          </div>
        </div>

        {creatives.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 14 }}>
            No creatives generated for this format yet.<br />
            <span style={{ fontSize: 12 }}>Run the pipeline to generate ads for this format.</span>
          </div>
        ) : (
          <>
            {ratios.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm ${ratioFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setRatioFilter('all')}
                >All ({creatives.length})</button>
                {ratios.map(r => (
                  <button
                    key={r}
                    className={`btn btn-sm ${ratioFilter === r ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setRatioFilter(r)}
                  >{RATIO_LABELS[r] || r} ({creatives.filter(c => (c.ratio || '4:5') === r).length})</button>
                ))}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12
            }}>
              {filtered.map(c => (
                <div
                  key={c.label}
                  onClick={() => setSelectedImg(c)}
                  style={{
                    borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)',
                    background: 'var(--surface2)', cursor: 'pointer', position: 'relative',
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                >
                  <div style={{ aspectRatio: c.ratio === '9:16' ? '9/16' : c.ratio === '1:1' ? '1/1' : '4/5', overflow: 'hidden', background: 'var(--surface2)' }}>
                    <img
                      src={c.image_url}
                      alt={c.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.parentElement.style.background = 'var(--surface2)'; e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 0.5, marginBottom: 2 }}>
                      {c.label}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {c.ratio && c.ratio !== '4:5' && (
                        <span className="tag tag-muted" style={{ fontSize: 9, padding: '1px 5px' }}>{c.ratio}</span>
                      )}
                      {c.is_iteration && (
                        <span className="tag tag-amber" style={{ fontSize: 9, padding: '1px 5px' }}>V{c.iteration_num}</span>
                      )}
                      {c.is_top10 && (
                        <span className="tag tag-green" style={{ fontSize: 9, padding: '1px 5px' }}>Top 10</span>
                      )}
                      {c.score != null && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', fontWeight: 700 }}>{c.score}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Full-size lightbox */}
      {selectedImg && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.92)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 24
          }}
          onClick={() => setSelectedImg(null)}
        >
          <img
            src={selectedImg.image_url}
            alt={selectedImg.label}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10 }}
          />
          <button
            onClick={() => setSelectedImg(null)}
            style={{
              position: 'fixed', top: 20, right: 20, background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36,
              cursor: 'pointer', fontSize: 18, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >✕</button>
        </div>
      )}
    </div>
  );
}

export function FormatsPage({ activeClient }) {
  const [creativesByFormat, setCreativesByFormat] = useState({});
  const [loadingCreatives, setLoadingCreatives] = useState(false);
  const [openFormat, setOpenFormat] = useState(null);

  const slug = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');

  const loadCreatives = useCallback(async () => {
    if (!slug) return;
    setLoadingCreatives(true);
    try {
      const res = await fetch(`/api/creatives/${slug}`);
      const data = await res.json();
      const byFormat = {};
      for (const c of (data.creatives || [])) {
        if (!c.format_id) continue;
        if (!byFormat[c.format_id]) byFormat[c.format_id] = [];
        byFormat[c.format_id].push(c);
      }
      // Sort each format's creatives: top10 first, then by score desc, then iterations last
      Object.values(byFormat).forEach(arr => {
        arr.sort((a, b) => {
          if (a.is_top10 !== b.is_top10) return a.is_top10 ? -1 : 1;
          if (a.is_iteration !== b.is_iteration) return a.is_iteration ? 1 : -1;
          return (b.score || 0) - (a.score || 0);
        });
      });
      setCreativesByFormat(byFormat);
    } catch (_) {}
    setLoadingCreatives(false);
  }, [slug]);

  useEffect(() => {
    setCreativesByFormat({});
    loadCreatives();
  }, [loadCreatives]);

  const openModal = (fmt) => setOpenFormat(fmt);
  const closeModal = () => setOpenFormat(null);

  const totalFormatsWithCreatives = FORMATS.filter(f => creativesByFormat[f.id]?.length > 0).length;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Ad Formats Library</div>
        <div className="page-sub">
          {activeClient
            ? `${totalFormatsWithCreatives} of ${FORMATS.length} formats have creatives — click any card to view`
            : `${FORMATS.length} proven formats — select a client to see your winning ads`}
        </div>
      </div>

      {activeClient && !loadingCreatives && totalFormatsWithCreatives === 0 && (
        <div className="callout callout-accent" style={{ marginBottom: 20 }}>
          <strong>No creatives yet for {activeClient.name}.</strong> Run the pipeline to generate ads — they'll appear here per format.
        </div>
      )}

      {!activeClient && (
        <div className="callout callout-accent" style={{ marginBottom: 20 }}>
          <strong>Based on the Mark Builds Brands framework.</strong> Each format is matched to a Schwartz awareness level (L1–L5).
          Select a client in the sidebar to see your winning ads on each format card.
        </div>
      )}

      <div className="format-grid">
        {FORMATS.map(fmt => {
          const fmtCreatives = creativesByFormat[fmt.id] || [];
          const bestCreative = fmtCreatives[0] || null;
          const hasCreatives = fmtCreatives.length > 0;
          const top10Count = fmtCreatives.filter(c => c.is_top10).length;

          return (
            <div
              key={fmt.id}
              className="format-card"
              onClick={() => openModal(fmt)}
              style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
            >
              {/* Thumbnail strip if creatives exist */}
              {hasCreatives && bestCreative && (
                <div style={{
                  width: '100%', aspectRatio: '4/3', overflow: 'hidden',
                  borderRadius: 8, marginBottom: 10, background: 'var(--surface2)',
                  position: 'relative'
                }}>
                  <img
                    src={bestCreative.image_url}
                    alt={bestCreative.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  {/* Count badge */}
                  <div style={{
                    position: 'absolute', bottom: 6, right: 6,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    color: '#fff', fontFamily: 'var(--mono)', fontSize: 9,
                    padding: '2px 7px', borderRadius: 4, fontWeight: 700
                  }}>
                    {fmtCreatives.length} ads
                  </div>
                  {top10Count > 0 && (
                    <div style={{
                      position: 'absolute', top: 6, left: 6,
                      background: 'rgba(16,185,129,0.85)', backdropFilter: 'blur(4px)',
                      color: '#fff', fontFamily: 'var(--mono)', fontSize: 9,
                      padding: '2px 7px', borderRadius: 4, fontWeight: 700
                    }}>
                      ★ Top 10
                    </div>
                  )}
                </div>
              )}

              {/* Placeholder if no creatives yet */}
              {!hasCreatives && activeClient && !loadingCreatives && (
                <div style={{
                  width: '100%', aspectRatio: '4/3', borderRadius: 8, marginBottom: 10,
                  background: 'var(--surface2)', border: '1px dashed var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text3)', fontSize: 11
                }}>
                  No ads yet
                </div>
              )}

              {loadingCreatives && (
                <div style={{
                  width: '100%', aspectRatio: '4/3', borderRadius: 8, marginBottom: 10,
                  background: 'linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.4s infinite'
                }} />
              )}

              <div className="format-id">{fmt.id}</div>
              <div className="format-name">{fmt.name}</div>
              <div className="format-desc">{fmt.structure}</div>
              <div className="format-awareness" style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {fmt.awareness_fit.map(l => (
                  <span key={l} className="tag tag-muted">Level {l}</span>
                ))}
                {hasCreatives && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
                    View {fmtCreatives.length} →
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openFormat && (
        <FormatModal
          fmt={openFormat}
          creatives={creativesByFormat[openFormat.id] || []}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

export default FormatsPage;
