import { useState, useRef, useCallback, useEffect } from 'react';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconUpload   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IconDownload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconCheck    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
const IconSpin     = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>;
const IconInfo     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>;
const IconFile     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

export default function FeedbackPage({ activeClient, addToast }) {
  const [csvFile,      setCsvFile]      = useState(null);
  const [csvUploaded,  setCsvUploaded]  = useState(false);
  const [iteration,    setIteration]    = useState(2);
  const [running,      setRunning]      = useState(false);
  const [logs,         setLogs]         = useState([]);
  const [report,       setReport]       = useState(null);
  const [iterations,   setIterations]   = useState([]);
  const [pastReports,  setPastReports]  = useState([]);
  const [selectedImg,  setSelectedImg]  = useState(null);
  const logsRef   = useRef();
  const esRef     = useRef();
  const t0        = useRef();

  const slug = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');

  const log = useCallback((msg, type = 'default') => {
    const secs = t0.current ? Math.floor((Date.now() - t0.current) / 1000) : 0;
    const t = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    setLogs(prev => [...prev, { t, msg, type }]);
    setTimeout(() => logsRef.current?.scrollTo(0, logsRef.current.scrollHeight), 50);
  }, []);

  // Load past reports
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/feedback/${slug}/reports`)
      .then(r => r.json())
      .then(d => setPastReports(d.reports || []))
      .catch(() => {});
  }, [slug]);

  // Escape key closes image modal
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setSelectedImg(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const uploadCSV = async () => {
    if (!csvFile) return addToast('Select a CSV file first', 'error');
    const fd = new FormData();
    fd.append('csv', csvFile);
    try {
      const res = await fetch(`/api/feedback/${slug}/upload-csv`, { method: 'POST', body: fd });
      const d   = await res.json();
      if (d.success) { setCsvUploaded(true); addToast('CSV uploaded', 'success'); }
      else addToast(d.error || 'Upload failed', 'error');
    } catch { addToast('Upload error', 'error'); }
  };

  const runFeedback = () => {
    if (!csvUploaded) return addToast('Upload Meta CSV first', 'error');
    setRunning(true); setLogs([]); setReport(null); setIterations([]);
    t0.current = Date.now();

    const es = new EventSource(`/api/feedback/${slug}/run?iteration=${iteration}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      const type = ev.type === 'complete' ? 'success' : ev.type === 'error' ? 'error' : 'info';
      if (ev.message) log(ev.message, type);

      if (ev.type === 'complete') {
        es.close(); setRunning(false);
        if (ev.data)       setReport(ev.data);
        if (ev.iterations) setIterations(ev.iterations);
        addToast(`Iteration ${iteration} complete!`, 'success');
        // Refresh past reports
        fetch(`/api/feedback/${slug}/reports`).then(r => r.json()).then(d => setPastReports(d.reports || [])).catch(() => {});
      }
      if (ev.type === 'error') { es.close(); setRunning(false); addToast(ev.message, 'error'); }
    };
    es.onerror = () => { es.close(); setRunning(false); };
  };

  if (!activeClient) return (
    <div className="g-empty">
      <div className="g-empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </div>
      <div className="g-empty-title">No client selected</div>
      <div className="g-empty-sub">Select a client from the sidebar</div>
    </div>
  );

  const modeTag = report
    ? report.mode === 'format'
      ? <span className="tag tag-accent">FORMAT mode</span>
      : <span className="tag tag-amber">Free-form mode</span>
    : null;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Feedback Loop</div>
        <div className="page-sub">Upload Meta performance data → Claude analyzes → generates improved creatives</div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Two ways to use this</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          <div style={{ padding: '16px 20px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>Option A — Pipeline creatives</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Your FORMAT-labeled ads</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>
              After running the pipeline, upload the generated ads to Meta and <strong>name them exactly</strong> as the pipeline labels them: <code style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>FORMAT-01-VERSION-A</code>, <code style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>FORMAT-01-VERSION-B</code>, etc. Then export the CSV and upload here.
              Claude will cross-reference the exact original headlines, hooks, and visual directions to make targeted improvements.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['Upload pipeline creatives to Meta with exact FORMAT labels', 'Run for 5-7 days', 'Export CSV from Meta', 'Upload here → get improved V2 creatives'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text2)', alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', minWidth: 14, marginTop: 1 }}>{i + 1}.</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 8 }}>Option B — Existing campaigns</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Your existing Meta ads (any names)</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>
              Already running Meta campaigns with your own ad names? Upload that CSV directly.
              Claude analyzes which creative <strong>concepts and angles</strong> drove results, then generates new <strong>FORMAT-based static image ads</strong> built on those winning patterns.
              Perfect for your first feedback run.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['Export CSV from Meta — any naming convention', 'Upload here', 'Claude maps winning angles to FORMAT library', 'Receive new static image ads based on what worked'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text2)', alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', minWidth: 14, marginTop: 1 }}>{i + 1}.</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Meta export instructions ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, borderColor: 'var(--accent-border)', background: 'var(--accent-dim)' }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <IconInfo />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', marginBottom: 6 }}>How to export from Meta Ads Manager</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.65 }}>
              <strong>Step 1:</strong> Meta Ads Manager → Reports → Customise Columns<br/>
              <strong>Step 2:</strong> Make sure these columns are included: <em>Ad Name, Impressions, Reach, Amount Spent, Results, Result Indicator, Cost per Result, CTR (Link click), CPC (Link click), Link Clicks, Frequency</em><br/>
              <strong>Step 3:</strong> Set the date range to your test period → Export as CSV<br/>
              <strong>Note:</strong> Dutch exports work perfectly — no need to change the language settings.
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => window.open('/api/feedback/csv-template', '_blank')}>
              <IconDownload /> Download English template CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── CSV upload ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Upload Meta Performance CSV</div>
          {csvUploaded && <span className="tag tag-green"><IconCheck /> Ready</span>}
        </div>
        <div className="card-body">
          <div
            className="upload-zone"
            style={{ padding: 24, marginBottom: 12 }}
            onClick={() => document.getElementById('fb-csv-input').click()}
          >
            <input id="fb-csv-input" type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { setCsvFile(e.target.files[0]); setCsvUploaded(false); }} />
            <div style={{ marginBottom: 8 }}><IconFile /></div>
            <div className="upload-zone-title" style={{ fontSize: 13 }}>
              {csvFile ? csvFile.name : 'Drop Meta CSV here or click to browse'}
            </div>
            <div className="upload-zone-sub">Dutch or English column names both accepted</div>
          </div>

          {csvFile && !csvUploaded && (
            <button className="btn btn-primary btn-sm" onClick={uploadCSV}>
              <IconUpload /> Upload {csvFile.name}
            </button>
          )}

          {csvUploaded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--green)', padding: '8px 12px', background: 'var(--green-dim)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 8 }}>
              <IconCheck /> CSV uploaded and ready for analysis
            </div>
          )}
        </div>
      </div>

      {/* ── Run ─────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">Run Analysis + Generate Improved Creatives</div></div>
        <div className="card-body">
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Iteration Number</label>
            <select className="form-input" value={iteration} onChange={e => setIteration(Number(e.target.value))} disabled={running}
              style={{ maxWidth: 320 }}>
              <option value={2}>Iteration 2 — first feedback run</option>
              <option value={3}>Iteration 3</option>
              <option value={4}>Iteration 4</option>
              <option value={5}>Iteration 5</option>
            </select>
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}
            onClick={runFeedback} disabled={running || !csvUploaded}>
            {running ? <><IconSpin /> Analyzing…</> : <>Run Feedback Analysis</>}
          </button>
          {!csvUploaded && <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 6 }}>Upload CSV above first</div>}
        </div>
      </div>

      {/* ── Live log ────────────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="terminal" style={{ marginBottom: 20 }}>
          <div className="terminal-bar">
            <div className="t-dot" style={{ background: '#FF5F57' }} />
            <div className="t-dot" style={{ background: '#FEBC2E' }} />
            <div className="t-dot" style={{ background: '#28C840' }} />
            <span className="terminal-label">Feedback Log</span>
            {running && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#818CF8' }}>● LIVE</span>}
          </div>
          <div className="terminal-body" ref={logsRef}>
            {logs.map((l, i) => (
              <div key={i} className="log-line">
                <span className="log-time">{l.t}</span>
                <span className={`log-msg log-${l.type}`}>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Analysis results ─────────────────────────────────────────────── */}
      {report && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-title">Analysis — Iteration {iteration}</div>
              {modeTag}
            </div>
            <div className="card-body">
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginBottom: 16, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                {report.performance_summary}
              </div>

              {/* Key insights */}
              {report.key_insights?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Key Insights</div>
                  {report.key_insights.map((ins, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      {ins}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid-2" style={{ gap: 16 }}>
                {/* Winners */}
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Winners</div>
                  {(report.winning_creatives || []).map((w, i) => (
                    <div key={i} style={{ padding: '10px 12px', background: 'var(--green-dim)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--text)' }}>{w.ad_name}</span>
                        {w.cpl_eur > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', background: 'white', padding: '1px 6px', borderRadius: 3 }}>€{w.cpl_eur} CPL</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>{w.why_winning}</div>
                      {w.scale_recommendation && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4, fontWeight: 500 }}>→ {w.scale_recommendation}</div>}
                    </div>
                  ))}
                </div>
                {/* Losers */}
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Underperformers</div>
                  {(report.losing_creatives || []).map((l, i) => (
                    <div key={i} style={{ padding: '10px 12px', background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{l.ad_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>{l.why_losing}</div>
                      {l.fix && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>Fix: {l.fix}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {report.next_7_days_recommendation && (
                <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', fontSize: 12.5, color: 'var(--text)' }}>
                  <strong style={{ color: 'var(--accent)' }}>Next 7 days:</strong> {report.next_7_days_recommendation}
                </div>
              )}
            </div>
          </div>

          {/* ── Generated iterations ───────────────────────────────────── */}
          {iterations.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">Generated Creatives — {iterations.length} new ads</div>
                <span className="tag tag-green">{iterations.filter(i => i.status === 'success').length} succeeded</span>
              </div>
              <div className="card-body" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                  {iterations.map((it, i) => (
                    <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: it.image_url ? 'pointer' : 'default' }}
                      onClick={() => it.image_url && setSelectedImg(it)}>
                      <div style={{ aspectRatio: '4/5', background: 'var(--surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {it.image_url
                          ? <img src={it.image_url} alt={it.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 11, padding: 12 }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
                              <div style={{ marginTop: 4 }}>Failed</div>
                            </div>
                        }
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginBottom: 2 }}>{it.label}</div>
                        {it.source_ad && <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Based on: {it.source_ad}</div>}
                        {it.headline && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>"{it.headline}"</div>}
                        {it.change_made && <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.4 }}>{it.change_made.slice(0, 80)}{it.change_made.length > 80 ? '…' : ''}</div>}
                        {it.image_url && (
                          <a href={it.image_url} download={`${it.label}.jpg`} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}
                            onClick={e => e.stopPropagation()}>
                            <IconDownload /> Download
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Past reports ─────────────────────────────────────────────────── */}
      {pastReports.length > 0 && !report && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Previous Feedback Runs</div>
            <span className="tag tag-muted">{pastReports.length} saved</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {pastReports.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: i < pastReports.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Iteration {r.iteration_num}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{new Date(r.generated_at).toLocaleDateString()} · {r.iterations?.length || 0} creatives · {r.csv_row_count || 0} ads analyzed</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setReport(r); setIterations(r.iterations || []); }}>
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Image lightbox ──────────────────────────────────────────────── */}
      {selectedImg && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedImg(null)}>
          <div className="g-modal" style={{ maxWidth: 600 }}>
            <div className="g-modal-header">
              <div>
                <div className="g-modal-title">{selectedImg.label}</div>
                {selectedImg.source_ad && <div className="g-modal-sub">Based on: {selectedImg.source_ad}</div>}
              </div>
              <button className="g-modal-close" onClick={() => setSelectedImg(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="g-modal-body">
              <img src={selectedImg.image_url} alt={selectedImg.label} style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 12 }} />
              {selectedImg.change_made && (
                <div className="g-copy-field"><div className="g-copy-label">What Changed</div><div className="g-copy-value">{selectedImg.change_made}</div></div>
              )}
              {selectedImg.headline && (
                <div className="g-copy-field"><div className="g-copy-label">Headline</div><div className="g-copy-value" style={{ fontWeight: 600 }}>{selectedImg.headline}</div></div>
              )}
              {selectedImg.body_copy && (
                <div className="g-copy-field"><div className="g-copy-label">Body Copy</div><div className="g-copy-value">{selectedImg.body_copy}</div></div>
              )}
              {selectedImg.cta_text && (
                <div className="g-copy-field"><div className="g-copy-label">CTA</div><div className="g-copy-value">{selectedImg.cta_text}</div></div>
              )}
              <a href={selectedImg.image_url} download={`${selectedImg.label}.jpg`} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                <IconDownload /> Download Image
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
