export default function Topbar({ title, activeClient, onNavigate, pipelineRunning, pipelineClientSlug }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-title">{title}</div>
        {activeClient && (
          <span className="topbar-client">{activeClient.name || activeClient.slug}</span>
        )}
        {pipelineRunning && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
            color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 10,
            padding: '3px 8px', borderRadius: 4, letterSpacing: 0.3
          }}>
            <span style={{ animation: 'pulse 1.2s infinite', display: 'inline-block' }}>●</span>
            Pipeline running{pipelineClientSlug ? ` — ${pipelineClientSlug}` : ''}
          </span>
        )}
      </div>

      <div className="topbar-right">
        {pipelineRunning ? (
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('run')}>
            View Progress
          </button>
        ) : activeClient && (
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('run')}>
            ▶ Run Pipeline
          </button>
        )}
      </div>
    </div>
  );
}
