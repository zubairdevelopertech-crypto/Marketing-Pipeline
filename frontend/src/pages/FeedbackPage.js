import { useState, useRef, useEffect } from 'react';

export default function FeedbackPage({
  activeClient, addToast,
  feedbackPipeline, startFeedback, stopFeedback, resetFeedback
}) {
  const [csvFile,     setCsvFile]     = useState(null);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [iteration,   setIteration]   = useState(2);
  const [selectedImg,    setSelectedImg]    = useState(null);
  const [pastReports,    setPastReports]    = useState([]);
  const [retryingImages, setRetryingImages] = useState({});
  const logsRef = useRef();

  const slug     = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');
  const running  = feedbackPipeline?.running || false;
  const logs     = feedbackPipeline?.logs    || [];
  const images   = feedbackPipeline?.images  || {};  // live image map { label → data }
  const report   = feedbackPipeline?.report  || null;
  const isMine   = feedbackPipeline?.clientSlug === slug;

  // Load past reports
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/feedback/${slug}/reports`)
      .then(r => r.json())
      .then(d => setPastReports(d.reports || []))
      .catch(() => {});
  }, [slug]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // Escape closes lightbox
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setSelectedImg(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const onFileSelected = async (file) => {
    if (!file) return;
    setCsvFile(file);
    setCsvUploaded(false);
    const fd = new FormData();
    fd.append('csv', file);
    try {
      const res = await fetch(`/api/feedback/${slug}/upload-csv`, { method: 'POST', body: fd });
      const d   = await res.json();
      if (d.success) { setCsvUploaded(true); addToast('CSV saved — click Run Analysis', 'success'); }
      else addToast(d.error || 'Upload failed', 'error');
    } catch { addToast('Upload error — check connection', 'error'); }
  };

  const run = () => {
    if (!csvUploaded) return addToast('Upload a CSV first', 'error');
    resetFeedback();
    startFeedback(slug, iteration);
  };

  const retryImage = (label) => {
    if (retryingImages[label]) return;
    setRetryingImages(prev => ({ ...prev, [label]: true }));
    const es = new EventSource(`/api/feedback/${slug}/retry-image/${iteration}/${encodeURIComponent(label)}`);
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === 'complete' && ev.status === 'success') {
        // Update App-level images state via the startFeedback mechanism isn't available here
        // Instead trigger a page refresh of the image by updating local state
        setRetryingImages(prev => ({ ...prev, [label]: false }));
        // Notify App-level state by dispatching a custom update
        addToast(`${label} — image ready!`, 'success');
        es.close();
        // Force a small state update to re-render
        window.dispatchEvent(new CustomEvent('feedbackImageRetried', { detail: { label, image_url: ev.image_url, headline: ev.headline, change_made: ev.change_made, source_ad: ev.source_ad } }));
      }
      if (ev.type === 'error') {
        setRetryingImages(prev => ({ ...prev, [label]: false }));
        addToast(`Retry failed: ${ev.message}`, 'error');
        es.close();
      }
    };
    es.onerror = () => { setRetryingImages(prev => ({ ...prev, [label]: false })); es.close(); };
  };

  const liveImages   = Object.entries(images);
  const successCount = liveImages.filter(([, d]) => d.status === 'success').length;
  const failedCount  = liveImages.filter(([, d]) => d.status === 'error').length;
  const imageCount   = liveImages.length;

  if (!activeClient) return (
    <div className="g-empty">
      <div className="g-empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </div>
      <div className="g-empty-title">No client selected</div>
      <div className="g-empty-sub">Select a client from the sidebar</div>
    </div>
  );

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="page-title">Feedback Loop</div>
            <div className="page-sub">Upload Meta CSV → Claude analyzes → new creatives generated</div>
          </div>
          {(running && isMine) && (
            <button className="btn btn-secondary btn-sm" onClick={stopFeedback}>Stop</button>
          )}
        </div>
      </div>

      {/* ── Live status banner (shows when running from any page) ────────── */}
      {running && isMine && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
            Feedback loop running — {successCount > 0 ? `${successCount} image${successCount > 1 ? 's' : ''} ready` : 'analyzing performance…'}
          {failedCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {failedCount} rate-limited (will retry)</span>}
          </div>
        </div>
      )}

      {/* ── Quick guide ─────────────────────────────────────────────────── */}
      {!running && !report && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {/* Option A */}
          <div style={{ padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>Option A — FORMAT ads</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Using pipeline-generated creatives</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>Upload your generated ads to Meta using the <strong>Meta Ad Name</strong> shown on each creative card (e.g. <code style={{ fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--surface3)', padding: '1px 4px', borderRadius: 3 }}>ray-ban-PAS-A</code>). After 5–7 days, export the CSV and upload here. Claude will cross-reference the original copy and improve underperformers.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {['Name ads in Meta using the Meta Ad Name from the creative card', 'Run for 5–7 days', 'Export CSV from Meta → upload here'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--text2)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>{i + 1}.</span>{s}
                </div>
              ))}
            </div>
          </div>

          {/* Option B */}
          <div style={{ padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 8 }}>Option B — Any existing ads</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Already running Meta campaigns</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>Export your current Meta campaign CSV — any ad names work. Claude identifies which concepts performed best and generates new FORMAT-based static image ads from those winning angles. Generates 4–8 new creatives.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {['Export CSV from Meta Ads Manager → any naming', 'Upload here', 'Receive new static ads based on top performers'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--text2)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', marginTop: 2 }}>{i + 1}.</span>{s}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Upload + Run card ────────────────────────────────────────────── */}
      {!running && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">
              {csvUploaded
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {csvFile?.name || 'CSV ready'}
                  </span>
                : 'Upload Meta CSV'}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => window.open('/api/feedback/csv-template', '_blank')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Template
            </button>
          </div>
          <div className="card-body">
            {/* Drop zone */}
            <div
              className={`upload-zone ${csvUploaded ? 'upload-zone-done' : ''}`}
              style={{ padding: '20px', marginBottom: 16, cursor: 'pointer' }}
              onClick={() => document.getElementById('fb-csv').click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && onFileSelected(e.dataTransfer.files[0]); }}
            >
              <input id="fb-csv" type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => e.target.files[0] && onFileSelected(e.target.files[0])} />
              {csvUploaded
                ? <><div style={{ marginBottom: 6 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg></div><div className="upload-zone-title" style={{ fontSize: 13, color: 'var(--green)' }}>CSV saved — ready to run</div><div className="upload-zone-sub">Click to replace</div></>
                : <><div style={{ marginBottom: 6 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div className="upload-zone-title" style={{ fontSize: 13 }}>{csvFile ? `Uploading ${csvFile.name}…` : 'Drop Meta CSV here or click to browse'}</div><div className="upload-zone-sub">Dutch or English column names · auto-saves on select</div></>
              }
            </div>

            {/* Iteration + Run */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Iteration</label>
                <select className="form-input" value={iteration} onChange={e => setIteration(Number(e.target.value))}>
                  <option value={2}>Iteration 2 — first feedback run</option>
                  <option value={3}>Iteration 3</option>
                  <option value={4}>Iteration 4</option>
                  <option value={5}>Iteration 5</option>
                </select>
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ minWidth: 200, justifyContent: 'center', flexShrink: 0 }}
                onClick={run}
                disabled={!csvUploaded}
              >
                Run Feedback Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live log ────────────────────────────────────────────────────── */}
      {logs.length > 0 && isMine && (
        <div className="terminal" style={{ marginBottom: 20 }}>
          <div className="terminal-bar">
            <div className="t-dot" style={{ background: '#FF5F57' }} />
            <div className="t-dot" style={{ background: '#FEBC2E' }} />
            <div className="t-dot" style={{ background: '#28C840' }} />
            <span className="terminal-label">Feedback Log</span>
            {running && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#818CF8' }}>● LIVE</span>}
          </div>
          <div className="terminal-body" ref={logsRef} style={{ maxHeight: 200 }}>
            {logs.map((l, i) => (
              <div key={i} className="log-line">
                <span className="log-time">{l.time}</span>
                <span className={`log-msg log-${l.type}`}>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Live image grid (appears as each image generates) ────────────── */}
      {isMine && liveImages.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>
                Generated Creatives
                {running && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text3)', fontFamily: 'var(--sans)', marginLeft: 10 }}>generating…</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {successCount > 0 && <span style={{ color: 'var(--green)' }}>{successCount} ready</span>}
                {failedCount  > 0 && <span style={{ color: 'var(--red)',   marginLeft: successCount > 0 ? 8 : 0 }}>{failedCount} failed — click Retry on each card</span>}
                {successCount > 0 && ' · click to view full size'}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {liveImages.map(([label, data]) => {
              const failed   = data.status === 'error';
              const retrying = retryingImages[label];
              return (
                <div
                  key={label}
                  onClick={() => !failed && setSelectedImg({ label, ...data })}
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${failed ? 'rgba(220,38,38,0.25)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                    cursor: failed ? 'default' : 'pointer',
                    transition: 'all 0.15s', boxShadow: 'var(--shadow-sm)'
                  }}
                  onMouseEnter={e => { if (!failed) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                >
                  <div style={{ aspectRatio: '4/5', background: failed ? 'var(--red-dim)' : 'var(--surface3)', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {data.image_url && !failed
                      ? <img src={data.image_url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : failed
                        ? <div style={{ textAlign: 'center', padding: 16 }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" style={{ marginBottom: 8 }}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
                            <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 10 }}>Image failed</div>
                            <button
                              className="btn btn-sm"
                              style={{ background: 'var(--red)', color: '#fff', border: 'none', fontSize: 10 }}
                              onClick={e => { e.stopPropagation(); retryImage(label); }}
                              disabled={retrying}
                            >
                              {retrying
                                ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', marginRight: 4 }}><path d="M12 2v4"/></svg>Retrying…</>
                                : 'Retry'
                              }
                            </button>
                          </div>
                        : <div style={{ color: 'var(--text3)', fontSize: 11, fontFamily: 'var(--mono)' }}>Generating…</div>
                    }
                    {!failed && data.image_url && (
                      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(79,70,229,0.9)', color: '#fff', fontFamily: 'var(--mono)', fontSize: 8, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.3 }}>NEW</div>
                    )}
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: failed ? 'var(--red)' : 'var(--accent)', marginBottom: 3, letterSpacing: 0.3 }}>{label}</div>
                    {data.source_ad && <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Based on: {data.source_ad}</div>}
                    {data.headline && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4, lineHeight: 1.3 }}>"{data.headline}"</div>}
                    {data.change_made && !failed && <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.4 }}>{data.change_made.slice(0, 70)}{data.change_made.length > 70 ? '…' : ''}</div>}
                    {failed && <div style={{ fontSize: 10, color: 'var(--red)', lineHeight: 1.4 }}>Gemini rate limit — click Retry above</div>}
                  </div>
                </div>
              );
            })}

            {/* Placeholder for in-progress images */}
            {running && (
              <div style={{ background: 'var(--surface2)', border: '2px dashed var(--border2)', borderRadius: 'var(--radius-lg)', aspectRatio: '4/5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ animation: 'spin 1.5s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>Generating…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Analysis report ──────────────────────────────────────────────── */}
      {report && isMine && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Performance Analysis</div>
            <span className={`tag ${report.mode === 'format' ? 'tag-accent' : 'tag-amber'}`}>
              {report.mode === 'format' ? 'FORMAT mode' : 'Free-form mode'}
            </span>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
              {report.performance_summary}
            </div>

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

            <div className="grid-2" style={{ gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Winners</div>
                {(report.winning_creatives || []).map((w, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--green-dim)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600 }}>{w.ad_name}</span>
                      {w.cpl_eur > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>€{w.cpl_eur} CPL</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>{w.why_winning}</div>
                    {w.scale_recommendation && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4, fontWeight: 500 }}>→ {w.scale_recommendation}</div>}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Underperformers</div>
                {(report.losing_creatives || []).map((l, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, marginBottom: 3 }}>{l.ad_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>{l.why_losing}</div>
                    {l.fix && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>Fix: {l.fix}</div>}
                  </div>
                ))}
              </div>
            </div>

            {report.next_7_days_recommendation && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', fontSize: 12.5 }}>
                <strong style={{ color: 'var(--accent)' }}>Next 7 days:</strong>{' '}{report.next_7_days_recommendation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Past reports ─────────────────────────────────────────────────── */}
      {pastReports.length > 0 && !report && !running && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Previous Runs</div>
            <span className="tag tag-muted">{pastReports.length}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {pastReports.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: i < pastReports.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Iteration {r.iteration_num}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {new Date(r.generated_at).toLocaleDateString()} · {r.iterations?.length || 0} creatives · {r.csv_row_count || 0} ads analyzed
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  // Load past report images into view
                  const imgs = {};
                  (r.iterations || []).filter(it => it.image_url).forEach(it => {
                    imgs[it.label] = { image_url: it.image_url, headline: it.headline, change_made: it.change_made, source_ad: it.source_ad };
                  });
                  // We can't set App state from here, but show report inline
                  setPastReports(prev => prev.map((rr, ii) => ii === i ? { ...rr, _expanded: !rr._expanded } : rr));
                }}>
                  {r._expanded ? 'Hide' : 'View'}
                </button>
              </div>
            ))}
          </div>
          {/* Show expanded past report images */}
          {pastReports.filter(r => r._expanded).map(r => (
            <div key={r.iteration_num} style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {(r.iterations || []).filter(it => it.image_url).map(it => (
                  <div key={it.label} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer' }}
                    onClick={() => setSelectedImg(it)}>
                    <div style={{ aspectRatio: '4/5', overflow: 'hidden' }}>
                      <img src={it.image_url} alt={it.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>{it.label}</div>
                      {it.headline && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>"{it.headline}"</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Image lightbox ──────────────────────────────────────────────── */}
      {selectedImg && (
        <div className="g-modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedImg(null)}>
          <div className="g-modal" style={{ maxWidth: 700 }}>
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
              <div className="g-modal-layout" style={{ gridTemplateColumns: '280px 1fr' }}>
                <div>
                  <img src={selectedImg.image_url} alt={selectedImg.label} style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
                  <a href={selectedImg.image_url} download={`${selectedImg.label}.jpg`} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                  </a>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedImg.change_made && <div className="g-copy-field"><div className="g-copy-label">What Changed</div><div className="g-copy-value">{selectedImg.change_made}</div></div>}
                  {selectedImg.headline    && <div className="g-copy-field"><div className="g-copy-label">Headline</div><div className="g-copy-value" style={{ fontWeight: 600 }}>{selectedImg.headline}</div></div>}
                  {selectedImg.subheadline && <div className="g-copy-field"><div className="g-copy-label">Subheadline</div><div className="g-copy-value">{selectedImg.subheadline}</div></div>}
                  {selectedImg.body_copy   && <div className="g-copy-field"><div className="g-copy-label">Body Copy</div><div className="g-copy-value">{selectedImg.body_copy}</div></div>}
                  {selectedImg.cta_text    && <div className="g-copy-field"><div className="g-copy-label">CTA</div><div className="g-copy-value">{selectedImg.cta_text}</div></div>}
                  {selectedImg.winning_angle && <div className="g-copy-field" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent-border)' }}><div className="g-copy-label" style={{ color: 'var(--accent)' }}>Winning Angle</div><div className="g-copy-value">{selectedImg.winning_angle}</div></div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
