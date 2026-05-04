import { useState, useEffect } from 'react';

export default function SettingsPage({ addToast }) {
  const [claudeKey, setClaudeKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showClaude, setShowClaude] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  const save = async () => {
    // In production, these would be sent to the backend to update .env
    // For now we show instructions
    addToast('Update your .env file with the new keys and restart the server', 'info');
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-sub">API keys and pipeline configuration</div>
      </div>

      {/* Server health */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">Server Status</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="file-item" style={{ flex: 1 }}>
              <span style={{ fontSize: 18 }}>{health?.status === 'ok' ? '✅' : '❌'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Backend Server</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>localhost:3001</div>
              </div>
              <span className={`tag ${health?.status === 'ok' ? 'tag-green' : 'tag-red'}`}>
                {health?.status === 'ok' ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="file-item" style={{ flex: 1 }}>
              <span style={{ fontSize: 18 }}>{health?.claude ? '✅' : '❌'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Claude API</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Anthropic</div>
              </div>
              <span className={`tag ${health?.claude ? 'tag-green' : 'tag-red'}`}>
                {health?.claude ? 'Configured' : 'Missing'}
              </span>
            </div>
            <div className="file-item" style={{ flex: 1 }}>
              <span style={{ fontSize: 18 }}>{health?.gemini ? '✅' : '❌'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Gemini API</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Nano Banana Pro</div>
              </div>
              <span className={`tag ${health?.gemini ? 'tag-green' : 'tag-red'}`}>
                {health?.gemini ? 'Configured' : 'Missing'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">API Keys</div></div>
        <div className="card-body">
          <div className="callout callout-amber" style={{ marginBottom: 16 }}>
            <strong>Security:</strong> Keys are stored in the <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>.env</code> file on your server.
            Never share or commit your .env file. Set keys in the .env file and restart the server.
          </div>

          <div className="grid-2">
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🤖</span>
                <div>
                  <div style={{ fontWeight: 600 }}>Claude API Key</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>console.anthropic.com → API Keys</div>
                </div>
              </div>
              <div className="key-wrap">
                <input className="form-input key-input" type={showClaude ? 'text' : 'password'}
                  value={claudeKey} onChange={e => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-api03-..." />
                <button className="key-toggle" onClick={() => setShowClaude(!showClaude)}>👁</button>
              </div>
              <div className={`key-status ${health?.claude ? 'key-ok' : 'key-missing'}`}>
                <div className="key-dot" />
                <span>{health?.claude ? 'Currently configured in .env' : 'Add CLAUDE_API_KEY to .env file'}</span>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🍌</span>
                <div>
                  <div style={{ fontWeight: 600 }}>Gemini API Key</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>aistudio.google.com/apikey</div>
                </div>
              </div>
              <div className="key-wrap">
                <input className="form-input key-input" type={showGemini ? 'text' : 'password'}
                  value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..." />
                <button className="key-toggle" onClick={() => setShowGemini(!showGemini)}>👁</button>
              </div>
              <div className={`key-status ${health?.gemini ? 'key-ok' : 'key-missing'}`}>
                <div className="key-dot" />
                <span>{health?.gemini ? 'Currently configured in .env' : 'Add GEMINI_API_KEY to .env file'}</span>
              </div>
            </div>
          </div>

          <div className="divider" />

          <div style={{ background: 'var(--surface2)', padding: 16, borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
            <div style={{ color: 'var(--text3)', marginBottom: 8 }}>backend/.env</div>
            <div style={{ color: 'var(--green)' }}>CLAUDE_API_KEY=sk-ant-api03-...</div>
            <div style={{ color: 'var(--green)' }}>GEMINI_API_KEY=AIzaSy...</div>
            <div style={{ color: 'var(--text3)' }}>PORT=3001</div>
          </div>
        </div>
      </div>

      {/* Deployment */}
      <div className="card">
        <div className="card-header"><div className="card-title">Deployment</div></div>
        <div className="card-body">
          <div className="callout callout-accent" style={{ marginBottom: 16 }}>
            <strong>Running locally:</strong> Best quality — Claude Code + full context. Works right now.
            <br /><strong>Deploy to Vercel:</strong> Always available in browser without opening Claude Code.
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="form-label">Deploy to Vercel (3 commands)</div>
            <div style={{ background: '#040408', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontFamily: 'var(--mono)', fontSize: 12 }}>
              <div style={{ color: 'var(--text3)' }}># From the project root:</div>
              <div style={{ color: 'var(--green)' }}>npm install -g vercel</div>
              <div style={{ color: 'var(--green)' }}>cd frontend && npm run build</div>
              <div style={{ color: 'var(--green)' }}>vercel --prod</div>
              <div style={{ color: 'var(--text3)', marginTop: 8 }}># Add env vars in Vercel dashboard</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
