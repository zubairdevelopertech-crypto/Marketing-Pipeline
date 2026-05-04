export default function OverviewPage({ clients, activeClient, navigate }) {
  const total = clients.length;
  const totalCreatives = clients.reduce((s, c) => s + (c.creativesCount || 0), 0);

  const flowSteps = [
    { icon: '👤', label: 'Create client', active: true },
    { icon: '⬆', label: 'Upload docs', done: false },
    { icon: '🧠', label: 'Research', done: false },
    { icon: '📝', label: 'Briefs', done: false },
    { icon: '🎨', label: 'Images', done: false },
    { icon: '⭐', label: 'AI review', done: false },
    { icon: '📊', label: 'Meta', done: false },
    { icon: '↻', label: 'Feedback', done: false },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Overview</div>
        <div className="page-sub">Create a client, upload research files, run the pipeline — creatives and scores sync to your database</div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Clients</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{total}</div>
          <div className="stat-sub">Active campaigns</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Creatives Generated</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{totalCreatives}</div>
          <div className="stat-sub">Across all clients</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ad Formats</div>
          <div className="stat-value" style={{ color: '#FF9F47' }}>20</div>
          <div className="stat-sub">× 2 angles = 40 ads</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Image Model</div>
          <div className="stat-value" style={{ color: 'var(--green)', fontSize: 18, paddingTop: 8 }}>Nano Banana</div>
          <div className="stat-sub">Gemini 3.1 Flash Preview</div>
        </div>
      </div>

      {/* Flow diagram */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">Complete Pipeline Flow</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
            {flowSteps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80, textAlign: 'center' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, marginBottom: 8,
                    background: step.done ? 'var(--green-dim)' : step.active ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: `1px solid ${step.done ? 'rgba(0,229,160,0.3)' : step.active ? 'var(--accent-border)' : 'var(--border)'}`,
                  }}>{step.icon}</div>
                  <div style={{ fontSize: 9, color: step.active ? 'var(--accent)' : 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>{step.label}</div>
                </div>
                {i < flowSteps.length - 1 && (
                  <div style={{ color: 'var(--border2)', fontSize: 14, padding: '0 2px', marginBottom: 16, flexShrink: 0 }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* What to upload */}
        <div className="card">
          <div className="card-header"><div className="card-title">📄 Documents to Upload</div></div>
          <div className="card-body">
            <div className="callout callout-accent" style={{ marginBottom: 12 }}>
              Your Make.com automation generates these from Typeform. Download from Google Drive, then upload here.
            </div>
            {[
              '02-Market-Research',
              '03-Avatar-Sheet',
              '04-Offer-Brief',
              '05-Necessary-Beliefs',
              'Customer Voice Research (Reddit)',
              '06-Master-Summary (optional)',
              'Brandbook PDF (optional)',
            ].map((doc, i) => (
              <div key={i} className="file-item" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>{i < 5 ? '✅' : '💡'}</span>
                <span className="file-name">{doc}</span>
              </div>
            ))}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => navigate('upload')}>
              ⬆ Upload Documents
            </button>
          </div>
        </div>

        {/* Accounts needed */}
        <div className="card">
          <div className="card-header"><div className="card-title">🔑 Accounts Required</div></div>
          <div className="card-body">
            {[
              { icon: '🤖', name: 'Claude API', url: 'console.anthropic.com', tag: 'Research + Copy', tagClass: 'tag-accent' },
              { icon: '🍌', name: 'Gemini API', url: 'aistudio.google.com/apikey', tag: 'Image Gen', tagClass: 'tag-green' },
              { icon: '📊', name: 'Meta Ads Manager', url: 'business.facebook.com', tag: 'Manual upload', tagClass: 'tag-amber' },
            ].map((item, i) => (
              <div key={i} className="file-item" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{item.url}</div>
                </div>
                <span className={`tag ${item.tagClass}`}>{item.tag}</span>
              </div>
            ))}
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => navigate('settings')}>
              ⚙ Configure API Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
