import { useState, useEffect, useCallback, useRef } from 'react';
import './styles/globals.css';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Toast from './components/Toast';
import OverviewPage from './pages/OverviewPage';
import UploadPage from './pages/UploadPage';
import RunPage from './pages/RunPage';
import CreativesPage from './pages/CreativesPage';
import FeedbackPage from './pages/FeedbackPage';
import FormatsPage from './pages/FormatsPage';
import SettingsPage from './pages/SettingsPage';

const PAGE_TITLES = {
  overview: 'Overview',
  upload: 'Upload Documents',
  run: 'Run Pipeline',
  creatives: 'Creatives Gallery',
  feedback: 'Feedback Loop',
  formats: 'Ad Formats',
  settings: 'Settings'
};

const LS_CLIENT_KEY = 'adpipeline_active_client';
const LS_PAGE_KEY = 'adpipeline_active_page';

const INITIAL_PIPELINE = {
  running: false,
  logs: [],
  progress: { research: 0, strategy: 0, creative: 0, review: 0 },
  stepStatus: {},
  startTime: null,
  clientSlug: null
};

const INITIAL_FEEDBACK = {
  running: false,
  logs: [],
  images: {},      // { label: { image_url, headline, change_made, source_ad, status } }
  report: null,    // analysis summary (arrives via analysis_ready event)
  iterations: [],  // final list (arrives in complete event)
  clientSlug: null,
  startTime: null,
};

function getLogType(event) {
  if (event.type === 'complete') return 'success';
  if (event.type === 'error') return 'error';
  if (event.status === 'done') return 'success';
  if (event.status === 'running') return 'info';
  if (event.status === 'skipped') return 'warn';
  return 'default';
}

export default function App() {
  const [activePage, setActivePage] = useState(() => localStorage.getItem(LS_PAGE_KEY) || 'overview');
  const [activeClient, setActiveClientState] = useState(null);
  const [clients, setClients] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [newClientModal, setNewClientModal] = useState(false);

  // Pipeline state lives at App level — survives page navigation
  const [pipeline, setPipeline] = useState(INITIAL_PIPELINE);
  const pipelineESRef = useRef(null);

  // Feedback state — also App level so it survives navigation
  const [feedbackPipeline, setFeedbackPipeline] = useState(INITIAL_FEEDBACK);
  const feedbackESRef = useRef(null);

  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const setActiveClient = useCallback((client) => {
    setActiveClientState(client);
    if (client) localStorage.setItem(LS_CLIENT_KEY, JSON.stringify(client));
    else localStorage.removeItem(LS_CLIENT_KEY);
  }, []);

  const navigate = useCallback((page) => {
    setActivePage(page);
    localStorage.setItem(LS_PAGE_KEY, page);
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      const clientList = data.clients || [];
      setClients(clientList);

      const saved = localStorage.getItem(LS_CLIENT_KEY);
      if (saved) {
        try {
          const savedClient = JSON.parse(saved);
          const stillExists = clientList.find(c => c.slug === savedClient.slug);
          if (stillExists) { setActiveClientState(stillExists); return; }
        } catch (_) {}
      }
      if (clientList.length > 0) setActiveClient(clientList[0]);
    } catch (e) {
      addToast('Could not connect to backend. Is the server running?', 'error');
    }
  }, [addToast, setActiveClient]);

  useEffect(() => { loadClients(); }, []);

  // App-level pipeline start — keeps running even when user navigates away
  const startPipeline = useCallback((slug, url) => {
    pipelineESRef.current?.close();
    const startTime = Date.now();

    setPipeline({
      ...INITIAL_PIPELINE,
      running: true,
      startTime,
      clientSlug: slug,
      logs: [{ time: '00:00', msg: '🚀 Pipeline started — this will take several minutes. You can navigate around while it runs.', type: 'info' }]
    });

    const es = new EventSource(url);
    pipelineESRef.current = es;

    es.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }

      const now = Math.floor((Date.now() - startTime) / 1000);
      const timeStr = `${String(Math.floor(now / 60)).padStart(2, '0')}:${String(now % 60).padStart(2, '0')}`;

      setPipeline(prev => {
        const newLogs = event.message
          ? [...prev.logs, { time: timeStr, msg: event.message, type: getLogType(event) }]
          : prev.logs;

        let newProgress = { ...prev.progress };
        let newStepStatus = { ...prev.stepStatus };
        let newRunning = prev.running;

        if (event.type === 'complete') {
          newRunning = false;
          es.close();
        }
        if (event.type === 'error') {
          newRunning = false;
          es.close();
        }

        if (event.step) {
          if (event.status === 'done') {
            newStepStatus[event.step] = 'done';
            newProgress[event.step] = 100;
          } else if (event.status === 'running') {
            newStepStatus[event.step] = 'running';
          } else if (event.status === 'skipped') {
            newStepStatus[event.step] = 'skipped';
            newProgress[event.step] = 100;
          }
          if (event.progress) {
            newProgress[event.step] = Math.round((event.progress.current / event.progress.total) * 100);
          }
        }

        return { ...prev, running: newRunning, logs: newLogs, progress: newProgress, stepStatus: newStepStatus };
      });

      if (event.type === 'complete') {
        addToast('Pipeline complete! Check the Creatives tab.', 'success');
        loadClients();
      }
      if (event.type === 'error') {
        addToast('Pipeline error: ' + (event.error || 'Unknown'), 'error');
      }
    };

    es.onerror = () => {
      setPipeline(prev => {
        if (!prev.running) return prev;
        const timeStr = `${String(Math.floor((Date.now() - startTime) / 1000 / 60)).padStart(2, '0')}:${String(Math.floor((Date.now() - startTime) / 1000) % 60).padStart(2, '0')}`;
        return {
          ...prev,
          running: false,
          logs: [...prev.logs, { time: timeStr, msg: '⚠️ Connection lost — pipeline may still be running on the server. Refresh Creatives when done.', type: 'warn' }]
        };
      });
    };
  }, [addToast, loadClients]);

  const stopPipeline = useCallback(() => {
    pipelineESRef.current?.close();
    setPipeline(prev => ({
      ...prev,
      running: false,
      logs: [...prev.logs, { time: '--:--', msg: '⏹ Stopped by user', type: 'warn' }]
    }));
  }, []);

  const resetPipeline = useCallback(() => {
    pipelineESRef.current?.close();
    setPipeline(INITIAL_PIPELINE);
  }, []);

  const startFeedback = useCallback((slug, iteration) => {
    feedbackESRef.current?.close();
    const startTime = Date.now();
    setFeedbackPipeline({ ...INITIAL_FEEDBACK, running: true, clientSlug: slug, startTime });

    const es = new EventSource(`/api/feedback/${slug}/run?iteration=${iteration}`);
    feedbackESRef.current = es;

    es.onmessage = (ev) => {
      let event;
      try { event = JSON.parse(ev.data); } catch { return; }

      const now = Math.floor((Date.now() - startTime) / 1000);
      const timeStr = `${String(Math.floor(now / 60)).padStart(2,'0')}:${String(now % 60).padStart(2,'0')}`;

      setFeedbackPipeline(prev => {
        const logEntry = event.message ? { time: timeStr, msg: event.message, type: event.type === 'error' ? 'error' : event.type === 'complete' || event.type === 'image_ready' ? 'success' : 'info' } : null;
        const newLogs = logEntry ? [...prev.logs, logEntry] : prev.logs;

        let newImages = prev.images;
        if (event.type === 'image_ready') {
          newImages = { ...prev.images, [event.label]: { image_url: event.image_url, headline: event.headline, subheadline: event.subheadline, body_copy: event.body_copy, cta_text: event.cta_text, change_made: event.change_made, source_ad: event.source_ad, winning_angle: event.winning_angle, status: 'success' } };
        }

        let newReport = prev.report;
        if (event.type === 'analysis_ready' && event.analysis_data) newReport = event.analysis_data;

        let newRunning = prev.running;
        let newIterations = prev.iterations;
        if (event.type === 'complete') {
          newRunning = false; es.close();
          if (event.data)       newReport = event.data;
          if (event.iterations) newIterations = event.iterations;
        }
        if (event.type === 'error') { newRunning = false; es.close(); }

        return { ...prev, running: newRunning, logs: newLogs, images: newImages, report: newReport, iterations: newIterations };
      });

      if (event.type === 'complete') addToast('Feedback complete — new creatives ready!', 'success');
      if (event.type === 'error')    addToast('Feedback error: ' + event.message, 'error');
    };

    es.onerror = () => {
      setFeedbackPipeline(prev => ({
        ...prev, running: false,
        logs: [...prev.logs, { time: '--:--', msg: '⚠️ Connection lost — feedback may still be running. Check back in a few minutes.', type: 'warn' }]
      }));
    };
  }, [addToast]);

  const stopFeedback = useCallback(() => {
    feedbackESRef.current?.close();
    setFeedbackPipeline(prev => ({ ...prev, running: false }));
  }, []);

  const resetFeedback = useCallback(() => {
    feedbackESRef.current?.close();
    setFeedbackPipeline(INITIAL_FEEDBACK);
  }, []);

  const pageProps = { activeClient, setActiveClient, clients, addToast, navigate, loadClients };
  const pipelineProps = { pipeline, startPipeline, stopPipeline, resetPipeline };
  const feedbackProps = { feedbackPipeline, startFeedback, stopFeedback, resetFeedback };

  return (
    <div className="app">
      <Sidebar
        activePage={activePage}
        onNavigate={navigate}
        clients={clients}
        activeClient={activeClient}
        onSelectClient={setActiveClient}
        onNewClient={() => setNewClientModal(true)}
        pipelineRunning={pipeline.running}
        pipelineClientSlug={pipeline.clientSlug}
      />
      <div className="main">
        <Topbar
          title={PAGE_TITLES[activePage]}
          activeClient={activeClient}
          onNavigate={navigate}
          pipelineRunning={pipeline.running}
          pipelineClientSlug={pipeline.clientSlug}
        />
        <div className="page">
          {activePage === 'overview' && <OverviewPage {...pageProps} />}
          {activePage === 'upload' && <UploadPage {...pageProps} />}
          {activePage === 'run' && <RunPage {...pageProps} {...pipelineProps} />}
          {activePage === 'creatives' && <CreativesPage {...pageProps} />}
          {activePage === 'feedback' && <FeedbackPage {...pageProps} {...feedbackProps} />}
          {activePage === 'formats' && <FormatsPage {...pageProps} />}
          {activePage === 'settings' && <SettingsPage {...pageProps} />}
        </div>
      </div>
      <Toast toasts={toasts} />
      {newClientModal && (
        <NewClientModal
          onClose={() => setNewClientModal(false)}
          onCreated={(client) => {
            loadClients();
            setActiveClient(client);
            setNewClientModal(false);
            addToast(`Client "${client.name}" created`, 'success');
            navigate('upload');
          }}
          addToast={addToast}
        />
      )}
    </div>
  );
}

function NewClientModal({ onClose, onCreated, addToast }) {
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [market, setMarket] = useState('Netherlands');

  const create = async () => {
    if (!name.trim()) return addToast('Enter a client name', 'error');
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), product, market })
      });
      const data = await res.json();
      if (data.success) onCreated({ name: name.trim(), slug: data.slug, status: 'new' });
      else addToast(data.error || 'Failed to create client', 'error');
    } catch (e) {
      addToast('Server error', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-title">New Client</div>
        <div className="modal-sub">Create a new campaign folder</div>
        <div className="form-group">
          <label className="form-label">Client Name</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bespokescalling" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Product / Service</label>
          <input className="form-input" value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. Sales Training Program" />
        </div>
        <div className="form-group">
          <label className="form-label">Target Market</label>
          <input className="form-input" value={market} onChange={e => setMarket(e.target.value)} placeholder="e.g. Netherlands" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={create}>Create Client</button>
        </div>
      </div>
    </div>
  );
}
