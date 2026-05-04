import { useState, useRef, useCallback } from 'react';

export default function FeedbackPage({ activeClient, addToast }) {
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [iteration, setIteration] = useState(2);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [report, setReport] = useState(null);
  const logsRef = useRef();
  const eventSource = useRef();
  const startTime = useRef();

  const slug = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');

  const addLog = useCallback((msg, type = 'default') => {
    const now = startTime.current ? Math.floor((Date.now() - startTime.current) / 1000) : 0;
    const t = `${String(Math.floor(now/60)).padStart(2,'0')}:${String(now%60).padStart(2,'0')}`;
    setLogs(prev => [...prev, { time: t, msg, type }]);
    setTimeout(() => logsRef.current?.scrollTo(0, logsRef.current.scrollHeight), 50);
  }, []);

  const uploadCSV = async () => {
    if (!csvFile) return addToast('Select a CSV file first', 'error');
    const formData = new FormData();
    formData.append('csv', csvFile);
    try {
      const res = await fetch(`/api/feedback/${slug}/upload-csv`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { setCsvUploaded(true); addToast('Meta data uploaded', 'success'); }
      else addToast(data.error || 'Upload failed', 'error');
    } catch (e) { addToast('Upload error', 'error'); }
  };

  const runFeedback = () => {
    if (!csvUploaded) return addToast('Upload Meta CSV first', 'error');
    setRunning(true);
    setLogs([]);
    startTime.current = Date.now();

    eventSource.current = new EventSource(`/api/feedback/${slug}/run?iteration=${iteration}`);
    eventSource.current.onmessage = (e) => {
      const event = JSON.parse(e.data);
      const type = event.type === 'complete' ? 'success' : event.type === 'error' ? 'error' : 'info';
      addLog(event.message, type);

      if (event.type === 'complete') {
        setRunning(false);
        eventSource.current.close();
        if (event.data) setReport(event.data);
        addToast(`Iteration ${iteration} complete!`, 'success');
      }
      if (event.type === 'error') {
        setRunning(false);
        eventSource.current.close();
        addToast(event.message, 'error');
      }
    };
    eventSource.current.onerror = () => {
      setRunning(false);
      eventSource.current?.close();
    };
  };

  if (!activeClient) return (
    <div className="g-empty">
      <div className="g-empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </div>
      <div className="g-empty-title">No client selected</div>
      <div className="g-empty-sub">Select a client from the sidebar to use the feedback loop</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Feedback Loop</div>
        <div className="page-sub">Analyze Meta performance data and generate improved creatives</div>
      </div>

      {/* How to test — step guide */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">How to test this</div>
          <span className="tag tag-accent">Step-by-step</span>
        </div>
        <div className="card-body" style={{ padding: '0 0 4px' }}>
          {[
            {
              n: 1,
              title: 'Upload your creatives to Meta Ads Manager',
              body: 'After the pipeline finishes, go to Meta Ads Manager and create ads. Name each ad exactly: FORMAT-01-VERSION-A, FORMAT-01-VERSION-B, etc.'
            },
            {
              n: 2,
              title: 'Run ads for 5–7 days',
              body: 'Use a test budget (€5–20/day). Let each format get at least 500 impressions before judging performance.'
            },
            {
              n: 3,
              title: 'Export performance CSV from Meta',
              body: 'Meta Ads Manager → Reports → Customise columns → include: Impressions, Clicks, CTR, CPC, Spend, Conversions, CPR. The "Ad Name" column must show the FORMAT-XX-VERSION-X labels.'
            },
            {
              n: 4,
              title: 'Upload that CSV here and run feedback',
              body: 'Claude reads the original creative decisions (hooks, copy, visual direction) alongside the real Meta numbers. It identifies what worked, what failed, and why — then generates improved V2 creatives via Gemini.'
            },
            {
              n: 5,
              title: 'Repeat every week',
              body: 'Each iteration builds on the last. Iteration 2 improves V1. Iteration 3 improves V2. The system compounds knowledge over time.'
            }
          ].map((s, i, arr) => (
            <div key={s.n} style={{ display: 'flex', gap: 14, padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>{s.n}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Testing without real Meta data */}
      <div className="card" style={{ marginBottom: 20, borderColor: 'var(--accent-border)', background: 'var(--accent-dim)' }}>
        <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', marginBottom: 4 }}>Testing without real Meta data?</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              Download the CSV template below, fill in fictional CTR and spend numbers with different performance levels per format (some high, some low), upload it here, and run the feedback analysis. Claude will treat it as real performance data and generate improvements based on the patterns you set.
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => window.open('/api/feedback/csv-template', '_blank')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download CSV Template
            </button>
          </div>
        </div>
      </div>

      {/* Upload CSV */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Upload Meta Performance CSV</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {csvUploaded && <span className="tag tag-green">Uploaded</span>}
          </div>
        </div>
        <div className="card-body">
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
            Required columns: <code style={{ background: 'var(--surface3)', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>ad_name</code>, <code style={{ background: 'var(--surface3)', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>impressions</code>, <code style={{ background: 'var(--surface3)', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>clicks</code>, <code style={{ background: 'var(--surface3)', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>ctr</code>, <code style={{ background: 'var(--surface3)', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>spend</code>, <code style={{ background: 'var(--surface3)', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 10 }}>conversions</code>
          </div>

          <div
            className="upload-zone"
            style={{ padding: 24 }}
            onClick={() => document.getElementById('csv-input').click()}
          >
            <input id="csv-input" type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => setCsvFile(e.target.files[0])} />
            <div style={{ marginBottom: 10 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div className="upload-zone-title" style={{ fontSize: 14 }}>Drop Meta CSV here or click to browse</div>
            <div className="upload-zone-sub">Exported from Meta Ads Manager</div>
          </div>

          {csvFile && (
            <div className="file-item" style={{ marginTop: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span className="file-name">{csvFile.name}</span>
              <button className="btn btn-primary btn-sm" onClick={uploadCSV}>Upload</button>
            </div>
          )}

          {csvUploaded && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'var(--green-dim)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--green)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Meta data uploaded — ready for analysis
            </div>
          )}
        </div>
      </div>

      {/* Run feedback */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Run Analysis + Generate Improved Creatives</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Iteration Number</label>
              <select className="form-input" value={iteration} onChange={e => setIteration(Number(e.target.value))} disabled={running}>
                <option value={2}>Iteration 2 — first feedback run</option>
                <option value={3}>Iteration 3</option>
                <option value={4}>Iteration 4</option>
                <option value={5}>Iteration 5</option>
              </select>
            </div>
          </div>

          <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}
            onClick={runFeedback} disabled={running || !csvUploaded}>
            {running
              ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'pulse 1.2s infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg> Analyzing…</>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Run Feedback Analysis</>
            }
          </button>
          {!csvUploaded && <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>Upload Meta CSV above to enable</div>}
        </div>
      </div>

      {/* Log */}
      {logs.length > 0 && (
        <div className="terminal" style={{ marginBottom: 20 }}>
          <div className="terminal-bar">
            <div className="t-dot" style={{ background: '#FF5F57' }} />
            <div className="t-dot" style={{ background: '#FEBC2E' }} />
            <div className="t-dot" style={{ background: '#28C840' }} />
            <span className="terminal-label">Feedback Loop Log</span>
            {running && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)' }}>● LIVE</span>}
          </div>
          <div className="terminal-body" ref={logsRef}>
            {logs.map((log, i) => (
              <div key={i} className="log-line">
                <span className="log-time">{log.time}</span>
                <span className={`log-msg log-${log.type}`}>{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Analysis Report — Iteration {iteration}</div>
            <span className="tag tag-green">Complete</span>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 16 }}>
              {report.performance_summary}
            </div>
            <div className="grid-2">
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Winners</div>
                {(report.winning_creatives || []).map((w, i) => (
                  <div key={i} className="perf-row">
                    <span className="perf-rank">{i + 1}</span>
                    <span className="perf-label">{w.label}</span>
                    <span className="perf-score" style={{ background: 'var(--green-dim)', color: 'var(--green)', borderRadius: 3 }}>CTR {w.ctr}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Underperformers</div>
                {(report.losing_creatives || []).map((l, i) => (
                  <div key={i} className="perf-row">
                    <span className="perf-rank">{i + 1}</span>
                    <span className="perf-label">{l.label}</span>
                    <span className="perf-score" style={{ background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 3 }}>Low</span>
                  </div>
                ))}
              </div>
            </div>
            {report.next_7_days_recommendation && (
              <>
                <div className="divider" />
                <div style={{ fontSize: 12, color: 'var(--text2)' }}><strong>Recommended next 7 days:</strong> {report.next_7_days_recommendation}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
