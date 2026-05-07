import { useRef, useEffect, useState } from 'react';
const FORMATS = require('../data/formats.json');

/* ── Translate backend messages to plain English ── */
function humanize(msg) {
  if (!msg) return '';
  if (msg.includes('Reading uploaded')) return '📚 Reading your uploaded documents';
  if (msg.includes('Loaded') && msg.includes('documents')) {
    const m = msg.match(/Loaded (\d+) documents/);
    return m ? `✓ Found ${m[1]} documents — ready to analyse` : msg;
  }
  if (msg.includes('building master context') || msg.includes('Building master context')) return '🧠 Analysing your market research — this takes about 30 seconds';
  if (msg.includes('Still thinking') || msg.includes('Still working') || msg.includes('Processing customer') || msg.includes('Extracting pain') || msg.includes('Almost done') || msg.includes('heartbeat')) return '⏳ Still analysing — almost done';
  if (msg.includes('Master context built')) {
    const m = msg.match(/Awareness Level (\d+)/);
    return `✅ Market analysis complete${m ? ` — audience awareness level ${m[1]}` : ''}`;
  }
  if (msg.includes('Generating content strategy')) {
    const m = msg.match(/(\d+) briefs/);
    return m ? `📋 Writing ${m[1]} ad briefs — one per format × angle` : '📋 Writing ad content briefs';
  }
  if (msg.match(/Brief \d+\/\d+/)) {
    const m = msg.match(/Brief (\d+)\/(\d+): .+? — (.+?) — Version (.)/);
    return m ? `📝 Brief ${m[1]}/${m[2]}: ${m[3]} — Version ${m[4]}` : msg;
  }
  if (msg.includes('content briefs generated')) {
    const m = msg.match(/(\d+)\/(\d+)/);
    return m ? `✅ ${m[1]} briefs written` : '✅ Content briefs complete';
  }
  if (msg.includes('Generating') && msg.includes('creatives')) {
    const m = msg.match(/(\d+) creatives/);
    return m ? `🎨 Starting image generation — ${m[1]} images` : '🎨 Starting image generation';
  }
  if (msg.includes('Building image prompt')) {
    const m = msg.match(/\[(\d+)\/(\d+)\] (.+?) —/);
    return m ? `💡 ${m[1]}/${m[2]} Writing visual instructions for ${m[3]}` : '💡 Preparing image prompt';
  }
  if (msg.includes('winning reference') || msg.includes('format reference')) {
    const m = msg.match(/\[(\d+)\/(\d+)\]/);
    return m ? `📐 ${m[1]}/${m[2]} Loading format reference` : '📐 Loading format reference';
  }
  if ((msg.includes('Generating image') || msg.includes('🍌')) && !msg.includes('creatives')) {
    const m = msg.match(/\[(\d+)\/(\d+)\] (.+?) —/);
    return m ? `🎨 ${m[1]}/${m[2]} Generating image for ${m[3]}...` : '🎨 Generating image';
  }
  if (msg.includes('Gemini busy') || msg.includes('retrying') || msg.includes('retry')) {
    const m = msg.match(/retry(?:ing)? (\d+)\/3 in (\d+)s/);
    return m ? `⏳ Image service busy — retrying in ${m[2]}s (attempt ${m[1]}/3)` : '⏳ Image service busy — retrying';
  }
  if (msg.includes('Image saved') || (msg.includes('✅') && msg.includes('Image'))) {
    const m = msg.match(/\[(\d+)\/(\d+)\] (.+?) —/);
    return m ? `✅ ${m[1]}/${m[2]} Image ready — ${m[3]}` : '✅ Image ready';
  }
  if (msg.includes('Failed after all retries') || msg.includes('Still failed')) {
    const m = msg.match(/\[(\d+)\/(\d+)\] (.+?) —/);
    return m ? `❌ ${m[1]}/${m[2]} ${m[3]}: image failed (Gemini unavailable) — retry later` : '❌ Image failed — retry available in Creatives';
  }
  if (msg.includes('creatives generated successfully')) {
    const m = msg.match(/(\d+)\/(\d+)/);
    return m ? `🎨 Done — ${m[1]} of ${m[2]} images created` : '🎨 Image generation complete';
  }
  if (msg.includes('Scoring') && msg.includes('criteria')) {
    const m = msg.match(/Scoring (\d+)/);
    return m ? `⭐ Scoring ${m[1]} ads on 7 performance criteria` : '⭐ Scoring all creatives';
  }
  if (msg.includes('Scoring') && msg.match(/\[\d+\/\d+\]/)) {
    const m = msg.match(/\[(\d+)\/(\d+)\]/);
    return m ? `🔍 Scoring ad ${m[1]} of ${m[2]}` : '🔍 Scoring';
  }
  if (msg.includes('Review complete')) {
    const m = msg.match(/Top creative: (.+?) \((\d+)\/100\)/);
    return m ? `⭐ Done — Best ad: ${m[1]} scored ${m[2]}/100` : '✅ Review complete';
  }
  if (msg.includes('Pipeline started') || msg.includes('pipeline started')) return '🚀 Pipeline started — takes ~12 minutes. Navigate freely, progress is saved.';
  if (msg.includes('Pipeline complete') || msg.includes('pipeline complete')) return '🎉 Complete! Your ads are ready in the Creatives tab.';
  if (msg.includes('Pipeline error')) return '❌ Error: ' + (msg.split(': ').slice(1).join(': ') || 'unknown');
  if (msg.includes('skipped') && msg.includes('saved')) return '⏭ Step skipped — using previously saved results';
  return msg;
}

const STEPS = [
  { id: 'research', label: 'Research',   eta: '~1 min',    desc: 'Claude reads your documents and builds a market intelligence profile' },
  { id: 'strategy', label: 'Strategy',   eta: '~3 min',    desc: 'Claude writes copy briefs — one per format × 2 angles' },
  { id: 'creative', label: 'Creatives',  eta: '2–4 min/image', desc: 'Nano Banana generates each image — Gemini can be slow or need retries' },
  { id: 'review',   label: 'AI Review',  eta: '~1 min',    desc: 'Claude scores every ad on 7 criteria and ranks the best' },
];

export default function RunPage({ activeClient, addToast, navigate, pipeline, startPipeline, stopPipeline, resetPipeline }) {
  const logsEndRef = useRef(null);
  const { running, logs, progress, stepStatus, clientSlug, startTime } = pipeline;

  const [formatFilter,    setFormatFilter]    = useState('all');
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [selectedRatios,  setSelectedRatios]  = useState(['4:5']);

  const RATIO_OPTIONS = [
    { id: '4:5',  label: '4:5',  name: 'Feed portrait',    desc: '1080×1350 · Most common feed format' },
    { id: '1:1',  label: '1:1',  name: 'Feed square',      desc: '1080×1080 · Works on all placements' },
    { id: '9:16', label: '9:16', name: 'Reels / Stories',  desc: '1080×1920 · Vertical full-screen' },
  ];

  const toggleRatio = (id) =>
    setSelectedRatios(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(r => r !== id) : prev // keep at least 1
        : [...prev, id]
    );

  const slug = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs.length]);

  const toggleFormat = (id) =>
    setSelectedFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);

  const start = (opts = {}) => {
    if (!activeClient) return addToast('Select a client first', 'error');
    const steps    = opts.steps || STEPS.map(s => s.id);
    const skip     = opts.skipImages || false;
    const fmtParam = opts.formatFilter !== undefined
      ? opts.formatFilter
      : (formatFilter === 'custom' && selectedFormats.length > 0 ? selectedFormats.join(',') : 'all');
    const ratioParam = selectedRatios.join(',');
    startPipeline(slug, `/api/pipeline/${slug}/run?steps=${steps.join(',')}&skipImages=${skip}&formatFilter=${fmtParam}&ratios=${ratioParam}`);
  };

  const fmtCount      = formatFilter === 'custom' && selectedFormats.length > 0 ? selectedFormats.length : 22;
  const totalCreatives = fmtCount * 2 * selectedRatios.length; // formats × versions × ratios

  const elapsedSec = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const elapsed    = `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;
  const currentStep = STEPS.find(s => stepStatus[s.id] === 'running');
  const runningForOther = running && clientSlug && clientSlug !== slug;
  const creativesCount = formatFilter === 'custom' && selectedFormats.length > 0
    ? selectedFormats.length * 2 : 40;

  if (!activeClient) return (
    <div className="empty-state">
      <div className="empty-icon">🎯</div>
      <div className="empty-title">No client selected</div>
      <div className="empty-sub">Select or create a client from the sidebar to get started</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Run pipeline</div>
        <div className="page-sub">Step 3 of 3 — <strong>{activeClient.name}</strong></div>
      </div>

      {!running && (activeClient.docsCount === 0 || activeClient.docsCount == null) && (
        <div className="callout callout-amber" style={{ marginBottom: 16 }}>
          <strong>No documents uploaded yet.</strong> Go to <strong>Upload Documents</strong> (step 2) and add at least one .docx or .pdf so research has source material. The run will fail with “No documents” if this list is empty.
        </div>
      )}

      {!running && activeClient.docsCount > 0 && (
        <div className="callout callout-green" style={{ marginBottom: 16 }}>
          <strong>{activeClient.docsCount} document{activeClient.docsCount !== 1 ? 's' : ''} on file.</strong> When you start, the server reads them, builds context, writes briefs, generates images (slowest step), then scores results. If Claude or Gemini return “busy” or “overloaded”, the backend retries automatically.
        </div>
      )}

      {runningForOther && (
        <div className="callout callout-accent" style={{ marginBottom: 16 }}>
          <strong>Pipeline is running for {clientSlug}.</strong> Wait for it to finish before starting a new run.
        </div>
      )}

      {/* Time estimate — only before first run */}
      {!running && logs.length === 0 && (
        <div className="callout callout-amber" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>What to expect</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {STEPS.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span className="tag tag-muted" style={{ fontSize: 9, marginTop: 1, flexShrink: 0 }}>{s.eta}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.4 }}><strong style={{ color: 'var(--text)' }}>{s.label}</strong> — {s.desc}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--amber)', fontWeight: 500 }}>
            Total: <strong>20–40 min per ratio selected</strong>. Multiple ratios multiply the time. Navigate freely — progress is saved automatically.
          </div>
        </div>
      )}

      {/* ── Aspect ratio selection ── */}
      {!running && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Aspect Ratios</div>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              {selectedRatios.length} ratio{selectedRatios.length > 1 ? 's' : ''} × {fmtCount} formats × 2 versions = <strong>{totalCreatives} images</strong>
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
              {RATIO_OPTIONS.map(r => {
                const active = selectedRatios.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleRatio(r.id)}
                    style={{
                      padding: '14px 12px', borderRadius: 'var(--radius)',
                      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border2)'}`,
                      background: active ? 'var(--accent-dim)' : 'var(--surface2)',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                      position: 'relative'
                    }}
                  >
                    {active && (
                      <div style={{ position: 'absolute', top: 6, right: 8 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    )}
                    {/* Visual ratio preview */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                      <div style={{
                        background: active ? 'var(--accent)' : 'var(--border2)',
                        borderRadius: 3, transition: 'background 0.15s',
                        width:  r.id === '9:16' ? 18 : r.id === '1:1' ? 28 : 24,
                        height: r.id === '9:16' ? 32 : r.id === '1:1' ? 28 : 30,
                      }} />
                    </div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 800, color: active ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontWeight: 600, fontSize: 11, color: active ? 'var(--accent)' : 'var(--text)', marginBottom: 3 }}>{r.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{r.desc}</div>
                  </button>
                );
              })}
            </div>
            {selectedRatios.length > 1 && (
              <div style={{ fontSize: 11.5, color: 'var(--text2)', padding: '8px 12px', background: 'var(--amber-dim)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 'var(--radius)' }}>
                <strong>Multiple ratios selected:</strong> {selectedRatios.length} images will be generated per format variant — {selectedRatios.map(r => `${r} (Version A + B)`).join(', ')}. Total: {totalCreatives} images. Pipeline will take approximately {Math.round(totalCreatives * 3)} minutes.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Format selection ── */}
      {!running && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Format Selection</div>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              {formatFilter === 'all' ? `${fmtCount} formats × 2 angles × ${selectedRatios.length} ratio${selectedRatios.length > 1 ? 's' : ''} = ${totalCreatives} creatives` : selectedFormats.length > 0 ? `${selectedFormats.length} × 2 × ${selectedRatios.length} = ${totalCreatives} creatives` : 'select formats below'}
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 8, marginBottom: formatFilter === 'custom' ? 16 : 0 }}>
              <button className={`format-mode-btn ${formatFilter === 'all' ? 'active' : ''}`} onClick={() => setFormatFilter('all')}>
                All 20 Formats
              </button>
              <button className={`format-mode-btn ${formatFilter === 'custom' ? 'active' : ''}`} onClick={() => setFormatFilter('custom')}>
                Custom Selection {selectedFormats.length > 0 ? `(${selectedFormats.length})` : ''}
              </button>
            </div>
            {formatFilter === 'custom' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Click formats to select them. You need at least 1.</div>
                <div className="format-grid">
                  {FORMATS.map(fmt => (
                    <div
                      key={fmt.id}
                      className={`format-card ${selectedFormats.includes(fmt.id) ? 'selected' : ''}`}
                      onClick={() => toggleFormat(fmt.id)}
                    >
                      <div className="format-id">{fmt.id}</div>
                      <div className="format-name">{fmt.name}</div>
                      <div className="format-desc" style={{ fontSize: 10, marginTop: 2 }}>{fmt.structure}</div>
                      <div className="format-awareness" style={{ marginTop: 6 }}>
                        {fmt.awareness_fit.map(l => <span key={l} className="tag tag-muted" style={{ fontSize: 8 }}>L{l}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pipeline status steps ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">
            {running ? (currentStep ? `Running: ${currentStep.label}` : 'Starting…') : logs.length > 0 ? 'Last Run' : 'Pipeline Steps'}
          </div>
          {running && startTime && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{elapsed} elapsed</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {STEPS.map((step, i) => {
            const st     = stepStatus[step.id];
            const pct    = progress[step.id] || 0;
            const isRun  = st === 'running';
            const isDone = st === 'done' || st === 'skipped';
            return (
              <div key={step.id} style={{
                padding: '16px 20px',
                borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
                borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                background: isRun ? 'rgba(79,70,229,0.025)' : 'transparent',
                transition: 'background 0.4s'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: isDone ? 'var(--green)' : isRun ? 'var(--accent)' : 'var(--border2)',
                    animation: isRun ? 'pulse 1.4s infinite' : 'none'
                  }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: isDone ? 'var(--green)' : isRun ? 'var(--accent)' : 'var(--text2)' }}>
                    {step.label}
                  </span>
                  <span className="tag tag-muted" style={{ fontSize: 8, marginLeft: 'auto' }}>{step.eta}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.4 }}>
                  {isRun ? <strong style={{ color: 'var(--accent)', fontWeight: 500 }}>{step.desc}</strong> : step.desc}
                </div>
                <div style={{ height: 2, background: 'var(--surface3)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: isDone ? 'var(--green)' : isRun ? 'var(--accent)' : 'var(--border)',
                    borderRadius: 1, transition: 'width 0.6s ease'
                  }} />
                </div>
                {isDone && <div style={{ fontSize: 9, color: 'var(--green)', marginTop: 4, fontFamily: 'var(--mono)' }}>✓ complete</div>}
                {isRun && pct > 0 && <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 4, fontFamily: 'var(--mono)' }}>{pct}%</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {!running ? (
          <>
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => start()}
              disabled={runningForOther || (formatFilter === 'custom' && selectedFormats.length === 0)}
            >
              ▶ Start Pipeline for {activeClient.name}
              {formatFilter === 'custom' && selectedFormats.length > 0 && ` (${creativesCount} creatives)`}
            </button>
            {logs.length > 0 && <button className="btn btn-ghost btn-lg" onClick={resetPipeline}>Clear</button>}
          </>
        ) : (
          <>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              background: 'var(--accent-dim)', border: '1.5px solid var(--accent-border)',
              borderRadius: 'var(--radius)', padding: '11px 22px'
            }}>
              <span style={{ animation: 'pulse 1.2s infinite', color: 'var(--accent)', fontSize: 10 }}>●</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13.5 }}>Running — {elapsed}</span>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>You can navigate freely — progress is saved</span>
            </div>
            <button className="btn btn-ghost btn-lg" onClick={stopPipeline}>Stop</button>
          </>
        )}
      </div>

      {/* ── Quick re-run ── */}
      {!running && logs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Quick re-run:</span>
          <button className="btn btn-secondary btn-sm" onClick={() => start({ steps: ['creative', 'review'] })}>🎨 Images + Review</button>
          <button className="btn btn-secondary btn-sm" onClick={() => start({ steps: ['creative', 'review'], skipImages: true })}>📝 Test (no images)</button>
          <button className="btn btn-secondary btn-sm" onClick={() => start({ steps: ['review'] })}>⭐ Re-score only</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('creatives')}>View Creatives →</button>
        </div>
      )}

      {/* ── Live log terminal ── */}
      {(running || logs.length > 0) && (
        <div className="terminal">
          <div className="terminal-bar">
            <div className="t-dot" style={{ background: '#FF5F57' }} />
            <div className="t-dot" style={{ background: '#FEBC2E' }} />
            <div className="t-dot" style={{ background: '#28C840' }} />
            <span className="terminal-label">{activeClient.name} — Activity Log</span>
            {running && (
              <span style={{ marginLeft: 'auto', fontSize: 9, color: '#79C0FF', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ animation: 'pulse 1s infinite' }}>●</span> LIVE
              </span>
            )}
          </div>
          <div className="terminal-body">
            {logs.map((log, i) => (
              <div key={i} className={`log-line log-${log.type || 'default'}`}>
                <span className="log-time">{log.time}</span>
                <span className="log-msg">{humanize(log.msg)}</span>
              </div>
            ))}
            {running && (
              <div className="log-line">
                <span className="log-time">--:--</span>
                <span className="log-msg" style={{ opacity: 0.35 }}>▌</span>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* ── Done callout ── */}
      {!running && logs.some(l => l.type === 'success' && (l.msg?.includes('complete') || l.msg?.includes('done'))) && (
        <div className="callout callout-green" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong>Pipeline finished! Your ad creatives are ready.</strong>
          <button className="btn btn-green btn-sm" onClick={() => navigate('creatives')}>View Creatives →</button>
        </div>
      )}
    </div>
  );
}
