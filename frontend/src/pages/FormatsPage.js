import FORMATS from '../data/formats.json';

export function FormatsPage() {
  const hookColors = {
    pain: 'tag-red', aspiration: 'tag-green', proof: 'tag-accent',
    fear: 'tag-red', curiosity: 'tag-amber', empathy: 'tag-accent',
    offer: 'tag-green', contrast: 'tag-amber', authority: 'tag-accent',
    pattern_interrupt: 'tag-red', urgency: 'tag-amber', clarity: 'tag-muted'
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Ad Formats Library</div>
        <div className="page-sub">20 proven formats — each generates 2 versions (A + B) = 40 total creatives per client</div>
      </div>

      <div className="callout callout-accent" style={{ marginBottom: 20 }}>
        <strong>Based on the Mark Builds Brands framework.</strong> Each format is matched to a Schwartz awareness level (L1–L5).
        The pipeline automatically selects all matching formats based on the client's research, or you can filter in the Run tab.
      </div>

      <div className="format-grid">
        {FORMATS.map(fmt => (
          <div key={fmt.id} className="format-card">
            <div className="format-id">{fmt.id}</div>
            <div className="format-name">{fmt.name}</div>
            <div className="format-desc">{fmt.structure}</div>
            <div className="format-awareness" style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {fmt.awareness_fit.map(l => (
                <span key={l} className="tag tag-muted">Level {l}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FormatsPage;
