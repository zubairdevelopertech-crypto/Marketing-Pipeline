const AWARENESS_PLAIN = {
  1: 'Cold — Problem Unaware',
  2: 'Cold — Problem Aware',
  3: 'Warm — Solution Aware',
  4: 'Warm — Product Aware',
  5: 'Hot — Ready to Buy',
};

const STATUS_RANK = { new: 0, docs_uploaded: 1, research_done: 2, creatives_done: 3, review_done: 4 };

export default function OverviewPage({ clients, activeClient, navigate }) {
  const total = clients.length;
  const totalCreatives = clients.reduce((s, c) => s + (c.creativesCount || 0), 0);

  const rank = STATUS_RANK[activeClient?.status] ?? -1;

  const flowSteps = [
    { icon: '👤', label: 'Create client',  done: true,        page: null },
    { icon: '⬆',  label: 'Upload docs',   done: rank >= 1,   page: 'upload' },
    { icon: '🧠', label: 'Research',       done: rank >= 2,   page: 'run' },
    { icon: '📝', label: 'Briefs',         done: rank >= 3,   page: 'run' },
    { icon: '🎨', label: 'Images',         done: rank >= 3,   page: 'run' },
    { icon: '⭐', label: 'AI Review',      done: rank >= 4,   page: 'creatives' },
    { icon: '📊', label: 'Meta',           done: false,       page: 'settings' },
    { icon: '↻',  label: 'Feedback',       done: false,       page: 'feedback' },
  ];

  const running = rank >= 1 && rank < 4;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Overview</div>
        <div className="page-sub">Create a client, upload research files, run the pipeline — creatives and scores are saved automatically</div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Clients</div>
          <div className="stat-value">{total}</div>
          <div className="stat-sub">Active workspaces</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Creatives Generated</div>
          <div className="stat-value">{totalCreatives}</div>
          <div className="stat-sub">Across all clients</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ad Formats</div>
          <div className="stat-value">22</div>
          <div className="stat-sub">× 2 angles = 44 ads max</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Image Model</div>
          <div className="stat-value" style={{ fontSize: 18, paddingTop: 8 }}>Nano Banana</div>
          <div className="stat-sub">Gemini 3.1 Flash Preview</div>
        </div>
      </div>

      {/* Flow diagram */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Pipeline Flow</div>
          {activeClient && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
              {activeClient.name} · click any step to navigate
            </span>
          )}
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
            {flowSteps.map((step, i) => {
              const isActive = !step.done && (i === 0 || flowSteps[i - 1].done);
              const clickable = step.page && activeClient;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    onClick={() => clickable && navigate(step.page)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      minWidth: 80, textAlign: 'center',
                      cursor: clickable ? 'pointer' : 'default',
                      opacity: !activeClient && i > 0 ? 0.45 : 1,
                      transition: 'opacity 0.15s'
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, marginBottom: 8,
                      background: step.done
                        ? 'var(--green-dim)'
                        : isActive ? 'var(--accent-dim)' : 'var(--surface2)',
                      border: `1.5px solid ${step.done
                        ? 'rgba(5,150,105,0.3)'
                        : isActive ? 'var(--accent-border)' : 'var(--border)'}`,
                      transition: 'all 0.15s',
                      boxShadow: isActive ? '0 0 0 3px rgba(79,70,229,0.08)' : 'none'
                    }}>
                      {step.done
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        : step.icon}
                    </div>
                    <div style={{
                      fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.5px',
                      color: step.done ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--text3)'
                    }}>{step.label}</div>
                    {step.done && (
                      <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--green)', marginTop: 2, opacity: 0.7 }}>Done</div>
                    )}
                  </div>
                  {i < flowSteps.length - 1 && (
                    <div style={{
                      color: flowSteps[i].done ? 'var(--green)' : 'var(--border2)',
                      fontSize: 14, padding: '0 2px', marginBottom: 20, flexShrink: 0,
                      transition: 'color 0.3s'
                    }}>→</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Documents to upload */}
        <div className="card">
          <div className="card-header"><div className="card-title">📄 Research Documents</div></div>
          <div className="card-body">
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.55 }}>
              Upload these five research files to give the pipeline full strategic context. More detail = better creatives.
            </div>
            {[
              { label: 'Market Analysis',           required: true  },
              { label: 'Target Audience Profile',   required: true  },
              { label: 'Offer & Positioning',       required: true  },
              { label: 'Necessary Beliefs',         required: true  },
              { label: 'Customer Voice Research',   required: true  },
              { label: 'Brand Summary',             required: false },
              { label: 'Brand Style Guide (PDF)',   required: false },
            ].map((doc, i) => (
              <div key={i} className="file-item" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>{doc.required ? '✅' : '💡'}</span>
                <span className="file-name">{doc.label}</span>
                {!doc.required && <span className="tag tag-muted" style={{ fontSize: 8 }}>Optional</span>}
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
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.55 }}>
              Connect your API keys in Settings. Claude handles research and copy; Gemini generates the images.
            </div>
            {[
              { icon: '🤖', name: 'Claude API',       url: 'console.anthropic.com',   tag: 'Research + Copy', tagClass: 'tag-accent', done: true },
              { icon: '🍌', name: 'Gemini API',        url: 'aistudio.google.com',     tag: 'Image Generation', tagClass: 'tag-green', done: true },
              { icon: '📊', name: 'Meta Ads Manager',  url: 'business.facebook.com',   tag: 'Coming soon', tagClass: 'tag-muted', done: false },
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
