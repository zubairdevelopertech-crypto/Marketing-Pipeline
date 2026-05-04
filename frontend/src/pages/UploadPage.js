import { useState, useRef, useEffect, useCallback } from 'react';

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

export default function UploadPage({ activeClient, addToast, navigate }) {
  const [existingDocs, setExistingDocs] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef();

  const slug = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');

  const loadExistingDocs = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/clients/${slug}/docs`);
      const data = await res.json();
      setExistingDocs(data.docs || []);
    } catch (_) {}
  }, [slug]);

  useEffect(() => {
    setExistingDocs([]);
    setPendingFiles([]);
    loadExistingDocs();
  }, [loadExistingDocs]);

  const addFiles = (newFiles) => {
    const arr = Array.from(newFiles).filter(f =>
      ['.docx', '.pdf', '.txt', '.md'].some(ext => f.name.toLowerCase().endsWith(ext))
    );
    setPendingFiles(prev => {
      const names = new Set([...prev.map(f => f.name), ...existingDocs.map(d => d.name)]);
      return [...prev, ...arr.filter(f => !names.has(f.name))];
    });
  };

  const upload = async () => {
    if (!activeClient) return addToast('Select a client first', 'error');
    if (pendingFiles.length === 0) return addToast('Add at least one document', 'error');
    setUploading(true);

    const formData = new FormData();
    pendingFiles.forEach(f => formData.append('documents', f));

    try {
      const res = await fetch(`/api/clients/${slug}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        addToast(`${data.count} document${data.count > 1 ? 's' : ''} saved — you can run the pipeline`, 'success');
        setPendingFiles([]);
        await loadExistingDocs();
      } else {
        addToast(data.error || 'Upload failed', 'error');
      }
    } catch (e) {
      addToast('Upload error: ' + e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (filename) => {
    try {
      const res = await fetch(`/api/clients/${slug}/docs/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setExistingDocs(prev => prev.filter(d => d.name !== filename));
        addToast(`Removed ${filename}`, 'info');
      } else {
        addToast(data.error || 'Delete failed', 'error');
      }
    } catch (e) {
      addToast('Delete error: ' + e.message, 'error');
    }
  };

  if (!activeClient) return (
    <div className="empty-state">
      <div className="empty-icon">📂</div>
      <div className="empty-title">No client selected</div>
      <div className="empty-sub">Create a client in the sidebar first, then return here to upload documents.</div>
    </div>
  );

  const extIcon = { docx: '📄', pdf: '📕', txt: '📝', md: '📋' };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Upload research documents</div>
        <div className="page-sub">Step 2 of 3 — after this, open Run Pipeline</div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">What to upload</div>
        </div>
        <div className="card-body" style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55 }}>
          <p style={{ marginTop: 0 }}>
            Upload <strong>Word (.docx)</strong>, <strong>PDF</strong>, or plain text files that describe the offer, market, and customer.
            The pipeline reads <strong>all</strong> uploaded files together to build a master context, then writes copy and images.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Typical set (names vary):</strong> market research, avatar / ICP sheet, offer brief, beliefs / objections,
            and customer voice or verbatim quotes. You do not need exactly five files — include everything material; more context usually helps.
          </p>
        </div>
      </div>

      <div className="callout callout-green" style={{ marginBottom: 20 }}>
        <strong>✅ After upload</strong>
        <div style={{ marginTop: 6, fontSize: 13 }}>
          Files are stored for this client. When you are ready, go to <strong>Run Pipeline</strong> (step 3). Research takes about 30–90 seconds;
          full pipeline with images can take several minutes. You can leave the page — progress continues in the background.
        </div>
      </div>

      {existingDocs.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Uploaded documents ({existingDocs.length})</div>
            <span className="tag tag-green">Ready for pipeline</span>
          </div>
          <div className="card-body" style={{ padding: '12px 20px' }}>
            <div className="file-list" style={{ marginTop: 0 }}>
              {existingDocs.map((doc) => {
                const ext = doc.name.split('.').pop().toLowerCase();
                return (
                  <div key={doc.name} className="file-item">
                    <span style={{ fontSize: 18 }}>{extIcon[ext] || '📄'}</span>
                    <span className="file-name">{doc.name}</span>
                    <span className="file-size">{formatSize(doc.size)}</span>
                    <button
                      className="file-remove"
                      title="Remove document"
                      onClick={() => deleteDoc(doc.name)}
                    >✕</button>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('run')}>
                ▶ Run pipeline (step 3)
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()}>
                + Add more files
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={e => { e.preventDefault(); setDragover(false); addFiles(e.dataTransfer.files); }}
      >
        <input
          type="file" ref={inputRef} multiple accept=".docx,.pdf,.txt,.md"
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
        <div className="upload-zone-icon">📂</div>
        <div className="upload-zone-title">
          {existingDocs.length > 0 ? 'Drop more files here' : 'Drop files here or click to browse'}
        </div>
        <div className="upload-zone-sub">Accepted: .docx, .pdf, .txt, .md — up to 50 MB each</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          {['.docx', '.pdf', '.txt', '.md'].map(ext => (
            <span key={ext} className="tag tag-muted">{ext}</span>
          ))}
        </div>
      </div>

      {pendingFiles.length > 0 && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, textTransform: 'uppercase' }}>
            Ready to upload ({pendingFiles.length})
          </div>
          <div className="file-list">
            {pendingFiles.map((f, i) => {
              const ext = f.name.split('.').pop().toLowerCase();
              return (
                <div key={i} className="file-item">
                  <span style={{ fontSize: 18 }}>{extIcon[ext] || '📄'}</span>
                  <span className="file-name">{f.name}</span>
                  <span className="file-size">{formatSize(f.size)}</span>
                  <button className="file-remove" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={upload}
              disabled={uploading}
            >
              {uploading ? '⏳ Saving…' : `⬆ Save ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}`}
            </button>
            <button className="btn btn-ghost" onClick={() => setPendingFiles([])}>Clear</button>
          </div>
        </>
      )}
    </div>
  );
}
