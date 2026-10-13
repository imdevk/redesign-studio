import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { api } from './api';
import Panel from './components/Panel.jsx';
import Stage from './components/Stage.jsx';
import History from './components/History.jsx';

const GOAL_FOR = { restaurant: 'book', gym: 'book', clinic: 'book', local: 'book', ecommerce: 'buy', saas: 'signup', portfolio: 'portfolio', coaching: 'enquire', professional: 'enquire', realestate: 'enquire', other: 'learn' };
const WORKING = ['capturing', 'generating'];

function formFor(site, answers) {
  if (answers) return { ...answers, customColor: answers.customColor || '#4f46e5' };
  const category = site?.suggestedCategory || 'other';
  return {
    category, goal: GOAL_FOR[category] || 'enquire', style: 'minimal',
    colorMode: site?.colors?.accents?.length || site?.source === 'screenshot' ? 'keep' : 'fresh', customColor: '#4f46e5',
    sections: [], notes: ''
  };
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [site, setSite] = useState(null);
  const [hasDesign, setHasDesign] = useState(false);
  const [url, setUrl] = useState('');
  const [form, setForm] = useState(() => formFor(null, null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const formRun = useRef(null);

  const refreshRuns = useCallback(() => api('/runs').then(d => setRuns(d.items)).catch(() => {}), []);
  useEffect(() => { api('/status').then(setStatus).catch(e => setError(e.message)); refreshRuns(); }, [refreshRuns]);

  const apply = useCallback(detail => {
    setRun(detail.run); setSite(detail.site); setHasDesign(detail.hasDesign);
    // Fill in the questions once per design: from the saved answers, or from what the page looks like.
    if ((detail.site || detail.run.answers) && formRun.current !== detail.run.id) {
      formRun.current = detail.run.id;
      setForm(formFor(detail.site, detail.run.answers));
    }
  }, []);

  const working = Boolean(run && WORKING.includes(run.status));
  useEffect(() => {
    if (!working) return undefined;
    const id = run.id;
    const timer = setInterval(async () => {
      try {
        const detail = await api(`/runs/${id}`);
        apply(detail);
        if (!WORKING.includes(detail.run.status)) refreshRuns();
      } catch (e) { setError(e.message); }
    }, 1200);
    return () => clearInterval(timer);
  }, [working, run?.id, apply, refreshRuns]);

  async function open(id) {
    setError('');
    try { apply(await api(`/runs/${id}`)); setUrl(''); } catch (e) { setError(e.message); }
  }

  async function check(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { run: started } = await api('/runs', { method: 'POST', body: { url } });
      formRun.current = null;
      setRun(started); setSite(null); setHasDesign(false); setUrl('');
      refreshRuns();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function upload({ name, images }) {
    setError('');
    const { run: made } = await api('/runs/upload', { method: 'POST', body: { name, images } });
    formRun.current = null;
    apply(await api(`/runs/${made.id}`));
    setUrl('');
    refreshRuns();
  }

  async function generate(event) {
    event.preventDefault();
    setError('');
    try {
      const { run: started } = await api(`/runs/${run.id}/generate`, { method: 'POST', body: form });
      setRun(started);
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    setError('');
    try {
      await api(`/runs/${id}`, { method: 'DELETE' });
      if (run?.id === id) { setRun(null); setSite(null); setHasDesign(false); formRun.current = null; }
      refreshRuns();
    } catch (e) { setError(e.message); }
  }

  function reset() { setRun(null); setSite(null); setHasDesign(false); setError(''); formRun.current = null; }

  const labels = useMemo(() => {
    const find = (list, value) => list?.find(o => o.value === value)?.label || value;
    return { style: v => find(status?.options.styles, v), category: v => find(status?.options.categories, v) };
  }, [status]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-5">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[1.45rem] leading-none tracking-tight">Redesign Studio<span className="text-accent">.</span></span>
            <span className="hidden text-sm text-muted sm:inline">Runs on your computer</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-sm text-muted sm:inline-flex">
              <span className={`h-2 w-2 rounded-full ${status?.ready ? 'bg-good' : status ? 'bg-[#d9a21b]' : 'bg-line'}`} aria-hidden="true" />
              {status ? (status.ready ? `Ready · ${status.model}` : 'AI not set up') : 'Connecting…'}
            </span>
            <button className="btn" type="button" onClick={() => { refreshRuns(); setHistoryOpen(true); }}><HistoryIcon size={16} aria-hidden="true" />Past designs</button>
          </div>
        </div>
      </header>

      <main className="grid lg:grid-cols-[minmax(380px,430px)_minmax(0,1fr)]">
        <aside className="border-b border-line bg-white lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {error && <p className="m-5 mb-0 rounded-lg border border-[#f1c9c4] bg-bad-tint px-4 py-3 text-sm text-bad" role="alert">{error}</p>}
          <Panel status={status} onUpload={upload} run={run} site={site} hasDesign={hasDesign} form={form} setForm={setForm} url={url} setUrl={setUrl} onCheck={check} onGenerate={generate} onReset={reset} busy={busy} />
        </aside>
        <div className="min-w-0 p-4 sm:p-6 lg:p-8" aria-live="polite">
          <Stage run={run} site={site} hasDesign={hasDesign} labels={labels} themeOptions={status?.options.theme} onDelete={remove} />
        </div>
      </main>

      <History open={historyOpen} runs={runs} currentId={run?.id} labels={labels} onClose={() => setHistoryOpen(false)} onOpen={open} />
    </div>
  );
}
