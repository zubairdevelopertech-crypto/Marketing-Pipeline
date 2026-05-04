import { useState, useRef, useEffect } from 'react';

const NAV_ITEMS = [
  {
    id: 'overview', label: 'Overview',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
  },
  {
    id: 'upload', label: 'Upload Docs',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
  },
  {
    id: 'run', label: 'Run Pipeline',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg>
  },
  {
    id: 'creatives', label: 'Creatives',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  },
  {
    id: 'feedback', label: 'Feedback Loop',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
  },
  {
    id: 'formats', label: 'Ad Formats',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
  },
  {
    id: 'settings', label: 'Settings',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  },
];

function statusDot(status, isRunning) {
  if (isRunning) return 'running';
  if (status === 'review_done' || status === 'creatives_done') return 'ready';
  if (status === 'research_done' || status === 'docs_uploaded') return 'new';
  return 'new';
}

function statusTag(status, isRunning) {
  if (isRunning) return { label: 'Running', cls: 'tag-running' };
  if (status === 'review_done' || status === 'creatives_done') return { label: 'Done', cls: 'tag-done' };
  if (status === 'research_done') return { label: 'Brief', cls: 'tag-new' };
  if (status === 'docs_uploaded') return { label: 'Docs', cls: 'tag-new' };
  return { label: 'New', cls: 'tag-new' };
}

function initials(name = '') {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
}

export default function Sidebar({ activePage, onNavigate, clients, activeClient, onSelectClient, onNewClient, pipelineRunning, pipelineClientSlug }) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [search, setSearch] = useState('');
  const switcherRef = useRef();
  const searchRef = useRef();

  const totalCreatives = clients.reduce((s, c) => s + (c.creativesCount || 0), 0);

  useEffect(() => {
    if (!switcherOpen) return;
    setSearch('');
    setTimeout(() => searchRef.current?.focus(), 60);
    const handler = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [switcherOpen]);

  const filtered = search.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  const selectClient = (c) => {
    onSelectClient(c);
    setSwitcherOpen(false);
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="logo">
        <div className="logo-text">Creative Pipeline</div>
        <div className="logo-sub">AI Ad Generator</div>
        <div className="logo-version">v1.0</div>
      </div>

      {/* Client switcher */}
      <div className="sb-client-wrap" ref={switcherRef}>
        <button className="sb-client-btn" onClick={() => setSwitcherOpen(o => !o)}>
          <div className="sb-client-avatar">
            {activeClient ? initials(activeClient.name) : '?'}
          </div>
          <div className="sb-client-text">
            <div className="sb-client-name">{activeClient?.name || 'Select client'}</div>
            {activeClient && (
              <div className="sb-client-status">
                {pipelineRunning && pipelineClientSlug === activeClient?.slug
                  ? <><span className="sb-dot running" />Running…</>
                  : <><span className="sb-dot ready" />{statusTag(activeClient.status, false).label}</>
                }
              </div>
            )}
          </div>
          <svg className="sb-client-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: switcherOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {switcherOpen && (
          <div className="sb-switcher">
            <div className="sb-search-wrap">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sb-search-icon"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                ref={searchRef}
                className="sb-search-input"
                placeholder="Search clients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="sb-switcher-list">
              {filtered.length === 0 && (
                <div className="sb-switcher-empty">No clients found</div>
              )}
              {filtered.map(c => {
                const isActive = activeClient?.slug === c.slug || activeClient?.name === c.name;
                const isRunning = pipelineRunning && pipelineClientSlug === c.slug;
                const dot = statusDot(c.status, isRunning);
                const tag = statusTag(c.status, isRunning);
                return (
                  <button
                    key={c.slug || c.name}
                    className={`sb-switcher-item ${isActive ? 'active' : ''}`}
                    onClick={() => selectClient(c)}
                  >
                    <div className="sb-switcher-avatar">{initials(c.name)}</div>
                    <div className="sb-switcher-info">
                      <div className="sb-switcher-name">{c.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        <span className={`sb-dot ${dot}`} />
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3 }}>{tag.label}</span>
                        {c.creativesCount > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,0.22)', marginLeft: 4 }}>{c.creativesCount} ads</span>}
                      </div>
                    </div>
                    {isActive && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(165,180,252,0.8)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </button>
                );
              })}
            </div>
            <button className="sb-new-client-btn" onClick={() => { setSwitcherOpen(false); onNewClient(); }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Client
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="nav">
        <div className="nav-section-label">Workspace</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">
              {item.id === 'run' && pipelineRunning
                ? <span style={{ display: 'inline-block', color: '#818CF8', animation: 'pulse 1.3s infinite' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#818CF8" stroke="none"><circle cx="12" cy="12" r="5"/></svg>
                  </span>
                : item.icon}
            </span>
            {item.label}
            {item.id === 'run' && pipelineRunning && (
              <span className="nav-badge" style={{ background: 'rgba(129,140,248,0.18)', color: '#818CF8', borderColor: 'rgba(129,140,248,0.25)', border: '1px solid' }}>live</span>
            )}
            {item.id === 'creatives' && totalCreatives > 0 && !pipelineRunning && (
              <span className="nav-badge">{totalCreatives}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom: new client shortcut */}
      <div style={{ padding: '8px 10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button className="nav-item" onClick={onNewClient} style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12 }}>
          <span className="nav-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </span>
          New Client
        </button>
      </div>
    </aside>
  );
}
