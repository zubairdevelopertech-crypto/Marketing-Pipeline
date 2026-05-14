import { useState, useRef, useEffect, useCallback } from 'react';

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

export default function UploadPage({ activeClient, addToast, navigate }) {
  const [existingDocs,   setExistingDocs]   = useState([]);
  const [pendingFiles,   setPendingFiles]   = useState([]);
  const [uploading,      setUploading]      = useState(false);
  const [dragover,       setDragover]       = useState(false);
  // Brand assets
  const [brandAssets,    setBrandAssets]    = useState([]);
  const [brandDragover,  setBrandDragover]  = useState(false);
  const [brandUploading, setBrandUploading] = useState(false);
  const inputRef      = useRef();
  const brandInputRef = useRef();

  const slug = activeClient?.slug || activeClient?.name?.toLowerCase().replace(/\s+/g, '-');

  const loadExistingDocs = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/clients/${slug}/docs`);
      const data = await res.json();
      setExistingDocs(data.docs || []);
    } catch (_) {}
  }, [slug]);

  const loadBrandAssets = useCallback(async () => {
    if (!slug) return;
    try {
      const res  = await fetch(`/api/clients/${slug}/brand-assets`);
      const data = await res.json();
      setBrandAssets(data.assets || []);
    } catch (_) {}
  }, [slug]);

  useEffect(() => {
    setExistingDocs([]);
    setPendingFiles([]);
    setBrandAssets([]);
    loadExistingDocs();
    loadBrandAssets();
  }, [loadExistingDocs, loadBrandAssets]);

  const uploadBrandAssets = async (files) => {
    const imgs = Array.from(files).filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (!imgs.length) return addToast('Only image files (.jpg .png .webp) are accepted', 'error');
    if (brandAssets.length + imgs.length > 10) return addToast('Maximum 10 brand assets per client', 'error');
    setBrandUploading(true);
    const fd = new FormData();
    imgs.forEach(f => fd.append('assets', f));
    try {
      const res  = await fetch(`/api/clients/${slug}/brand-assets`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        addToast(`${data.count} brand image${data.count > 1 ? 's' : ''} saved`, 'success');
        await loadBrandAssets();
      } else addToast(data.error || 'Upload failed', 'error');
    } catch (e) { addToast('Upload error: ' + e.message, 'error'); }
    setBrandUploading(false);
  };

  const deleteBrandAsset = async (name) => {
    try {
      await fetch(`/api/clients/${slug}/brand-assets/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setBrandAssets(prev => prev.filter(a => a.name !== name));
      addToast(`Removed ${name}`, 'info');
    } catch (e) { addToast('Delete failed', 'error'); }
  };

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
        <div className="page-title">Upload Research Documents</div>
        <div className="page-sub">Step 2 of 3 — upload your research files, then run the pipeline</div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">What to upload</div>
        </div>
        <div className="card-body" style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            Upload <strong>Word (.docx)</strong>, <strong>PDF</strong>, or plain text files containing your market research, audience profile, offer details, and customer insights.
            The pipeline reads all uploaded files together to build a strategic brief, then writes copy and generates images.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Recommended files:</strong> Market Analysis, Target Audience Profile, Offer & Positioning, Necessary Beliefs, and Customer Voice research.
            You don't need exactly five — include everything relevant. More context produces better creatives.
          </p>
        </div>
      </div>

      <div className="callout callout-green" style={{ marginBottom: 20 }}>
        <strong>After upload:</strong> go to <strong>Run Pipeline</strong> (step 3). Research takes about 30–90 seconds; the full pipeline with images takes several minutes. You can leave the page — progress continues automatically in the background.
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

      {/* ── Brand Assets ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Brand Assets <span className="tag tag-muted" style={{ marginLeft: 6, verticalAlign: 'middle' }}>Optional</span></div>
          </div>
          {brandAssets.length > 0 && <span className="tag tag-green">{brandAssets.length} uploaded</span>}
        </div>
        <div className="card-body" style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, paddingBottom: 16 }}>
          <p style={{ marginTop: 0 }}>
            Upload <strong>product photos, brand photos, or your logo</strong> here. Gemini will use your actual images as visual references when generating ads — your real product appears in the creative instead of a generic version. You can upload up to 10 images.
          </p>
          <p style={{ marginBottom: 16 }}>
            <strong>Good to upload:</strong> product shots, lifestyle photos from your brand, team photos, logo files (.png with transparent background works best). <strong>If you skip this, ads are created from scratch</strong> — both approaches work.
          </p>

          {/* Existing brand assets grid */}
          {brandAssets.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 16 }}>
              {brandAssets.map(a => (
                <div key={a.name} style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <img
                    src={a.url}
                    alt={a.name}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  <button
                    onClick={() => deleteBrandAsset(a.name)}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
                    title="Remove"
                  >✕</button>
                  <div style={{ padding: '4px 6px', fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name.length > 14 ? a.name.slice(0, 12) + '…' : a.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Brand asset drop zone */}
          {brandAssets.length < 10 && (
            <div
              className={`upload-zone ${brandDragover ? 'dragover' : ''}`}
              style={{ padding: 28 }}
              onClick={() => brandInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setBrandDragover(true); }}
              onDragLeave={() => setBrandDragover(false)}
              onDrop={e => { e.preventDefault(); setBrandDragover(false); uploadBrandAssets(e.dataTransfer.files); }}
            >
              <input
                type="file" ref={brandInputRef} multiple accept=".jpg,.jpeg,.png,.webp,.gif"
                style={{ display: 'none' }}
                onChange={e => uploadBrandAssets(e.target.files)}
              />
              <div style={{ marginBottom: 10 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m3 14 5-5 4 4 3-3 4 4"/></svg>
              </div>
              <div className="upload-zone-title" style={{ fontSize: 13 }}>
                {brandUploading ? 'Uploading…' : 'Drop product photos or logo here'}
              </div>
              <div className="upload-zone-sub">
                .jpg .png .webp · Up to {10 - brandAssets.length} more image{10 - brandAssets.length !== 1 ? 's' : ''} · Max 30 MB each
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                {['.jpg', '.png', '.webp', '.gif'].map(ext => (
                  <span key={ext} className="tag tag-muted">{ext}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
