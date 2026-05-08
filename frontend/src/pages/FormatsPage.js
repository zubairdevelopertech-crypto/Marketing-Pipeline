import { useState, useEffect } from 'react';
import FORMATS from '../data/formats.json';
import { getRefUrls } from '../data/formatRefs';

function FormatModal({ fmt, onClose }) {
  const refs = getRefUrls(fmt.id);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { lightbox ? setLightbox(null) : onClose(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, onClose]);

  const hookColors = {
    pain: 'tag-red', aspiration: 'tag-green', proof: 'tag-accent',
    fear: 'tag-red', curiosity: 'tag-amber', empathy: 'tag-accent',
    offer: 'tag-green', contrast: 'tag-amber', authority: 'tag-accent',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)', width: '100%', maxWidth: 780,
        maxHeight: '90vh', overflowY: 'auto', padding: 32, position: 'relative',
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

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)',
              letterSpacing: 1, background: 'var(--surface2)', padding: '2px 8px',
              borderRadius: 4, border: '1px solid var(--border)'
            }}>{fmt.id}</span>
            <span style={{ fontWeight: 700, fontSize: 22, color: 'var(--text)' }}>{fmt.name}</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 10 }}>{fmt.structure}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {fmt.awareness_fit.map(l => (
              <span key={l} className="tag tag-muted">Awareness Level {l}</span>
            ))}
          </div>
        </div>

        {/* Hook type & description if available */}
        {fmt.hook && (
          <div style={{ marginBottom: 20 }}>
            <span className={`tag ${hookColors[fmt.hook] || 'tag-muted'}`} style={{ textTransform: 'capitalize' }}>
              {fmt.hook} hook
            </span>
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

        {/* Reference images */}
        <div style={{ marginBottom: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 1, textTransform: 'uppercase' }}>
          Winning Examples
        </div>

        {refs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 14 }}>
            No reference images yet for this format.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: refs.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16
          }}>
            {refs.map((url, i) => (
              <div
                key={i}
                onClick={() => setLightbox(url)}
                style={{
                  borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in',
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                  boxShadow: 'none'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <img
                  src={url}
                  alt={`${fmt.name} example ${i + 1}`}
                  style={{ width: '100%', display: 'block', objectFit: 'cover' }}
                  onError={e => { e.target.parentElement.style.display = 'none'; }}
                />
                <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  Example {i + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.93)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'zoom-out'
          }}
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Full size"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'fixed', top: 20, right: 20,
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8, width: 36, height: 36, cursor: 'pointer',
              fontSize: 18, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >✕</button>
        </div>
      )}
    </div>
  );
}

export function FormatsPage() {
  const [openFormat, setOpenFormat] = useState(null);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Ad Formats Library</div>
        <div className="page-sub">22 proven formats — click any card to see winning examples for that format</div>
      </div>

      <div className="callout callout-accent" style={{ marginBottom: 20 }}>
        <strong>Based on the Mark Builds Brands framework.</strong> Each format is matched to a Schwartz awareness level (L1–L5).
        Click any format to see real winning ad examples — so you know exactly what each format looks like before you generate.
      </div>

      <div className="format-grid">
        {FORMATS.map(fmt => {
          const refs = getRefUrls(fmt.id);
          const thumb = refs[0] || null;

          return (
            <div
              key={fmt.id}
              className="format-card"
              onClick={() => setOpenFormat(fmt)}
              style={{ cursor: 'pointer' }}
            >
              {/* Thumbnail preview */}
              {thumb && (
                <div style={{
                  width: '100%', aspectRatio: '4/3', borderRadius: 8,
                  overflow: 'hidden', marginBottom: 10, background: 'var(--surface2)'
                }}>
                  <img
                    src={thumb}
                    alt={fmt.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.target.parentElement.style.display = 'none'; }}
                  />
                </div>
              )}

              {/* Count pill */}
              {refs.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)',
                    background: 'var(--accent-dim)', padding: '2px 7px', borderRadius: 4,
                    fontWeight: 700, letterSpacing: 0.5
                  }}>
                    {refs.length} example{refs.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              <div className="format-id">{fmt.id}</div>
              <div className="format-name">{fmt.name}</div>
              <div className="format-desc">{fmt.structure}</div>
              <div className="format-awareness" style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {fmt.awareness_fit.map(l => (
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
          onClose={() => setOpenFormat(null)}
        />
      )}
    </div>
  );
}

export default FormatsPage;
