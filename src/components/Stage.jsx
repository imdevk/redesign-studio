import { useCallback, useState } from 'react';
import { Download, ExternalLink, Image as ImageIcon, Monitor, Smartphone, Tablet, Trash2 } from 'lucide-react';
import Viewport, { DEVICES } from './Viewport.jsx';
import Theme from './Theme.jsx';

const ICONS = { desktop: Monitor, tablet: Tablet, phone: Smartphone };
const TABS = [{ id: 'design', label: 'Redesign' }, { id: 'original', label: 'Original' }, { id: 'compare', label: 'Side by side' }];
const number = value => (typeof value === 'number' ? value.toLocaleString() : null);

/** The first thing seen: a desktop and a phone drawn with the same hatching the picture placeholders use. */
function Empty() {
  const bar = 'rounded-full bg-[#d9dce5]';
  return (
    <div className="settle mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center gap-10 py-10 text-center">
      <div className="relative w-full max-w-md" aria-hidden="true">
        <div className="rounded-xl border border-[#cfd3de] bg-white p-4 shadow-[0_30px_60px_-34px_rgba(17,19,24,.35)]">
          <div className="mb-4 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d9dce5]" /><span className="h-2 w-2 rounded-full bg-[#d9dce5]" /><span className="h-2 w-2 rounded-full bg-[#d9dce5]" /><span className={`${bar} ml-auto h-2 w-24`} /></div>
          <div className="grid grid-cols-[1.1fr_1fr] gap-4">
            <div className="flex flex-col justify-center gap-2.5 py-2 text-left"><span className={`${bar} h-3.5 w-11/12`} /><span className={`${bar} h-3.5 w-2/3`} /><span className={`${bar} mt-1.5 h-2 w-full`} /><span className={`${bar} h-2 w-5/6`} /><span className="mt-2 h-7 w-24 rounded-md bg-ink" /></div>
            <div className="hatch aspect-[4/3] rounded-lg ring-1 ring-accent/15" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3"><div className="hatch aspect-[4/3] rounded-md ring-1 ring-accent/15" /><div className="hatch aspect-[4/3] rounded-md ring-1 ring-accent/15" /><div className="hatch aspect-[4/3] rounded-md ring-1 ring-accent/15" /></div>
        </div>
        <div className="absolute -bottom-6 -right-3 w-[27%] rounded-[1.1rem] border border-[#cfd3de] bg-white p-2 shadow-[0_24px_46px_-24px_rgba(17,19,24,.45)] sm:-right-8">
          <div className="hatch aspect-[3/2] rounded-lg ring-1 ring-accent/15" />
          <div className="mt-2 space-y-1.5"><span className={`${bar} block h-1.5 w-full`} /><span className={`${bar} block h-1.5 w-2/3`} /><span className="mt-1 block h-4 w-full rounded bg-ink" /></div>
        </div>
      </div>
      <div>
        <h2 className="font-display text-[2.6rem] font-normal leading-[1.05] tracking-tight sm:text-5xl">Start with a page that could be better.</h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted">Enter its address, or upload a screenshot if it will not open. You will see what the tool found, answer a few questions, and get a responsive redesign to preview and share.</p>
      </div>
    </div>
  );
}

function Message({ title, children, tone = 'plain' }) {
  const colors = tone === 'bad' ? 'border-[#f1c9c4] bg-bad-tint' : 'border-line bg-white';
  return (
    <div className={`flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed px-8 py-14 text-center ${colors}`} role={tone === 'bad' ? 'alert' : undefined}>
      <h2 className="font-display text-3xl font-normal tracking-tight">{title}</h2>
      <div className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

function Progress({ title, detail }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-line bg-white px-8 py-14 text-center" role="status">
      <h2 className="font-display text-3xl font-normal tracking-tight">{title}</h2>
      <p className="mt-3 text-[15px] text-muted">{detail}</p>
      <div className="progress mt-7 h-1 w-64 max-w-full overflow-hidden rounded bg-line" aria-hidden="true"><span className="block h-full w-1/3 rounded bg-accent" /></div>
    </div>
  );
}

function ExportBar({ run, version }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function picture(device) {
    setBusy(device); setError('');
    try {
      const response = await fetch(`/api/runs/${run.id}/export.png?device=${device}`);
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Could not create the picture.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${run.host}-redesign-${device}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  const base = `/api/runs/${run.id}/design.html`;
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <a className="btn btn-primary" href={`${base}?download=1`}><Download size={16} aria-hidden="true" />Download HTML</a>
        <button className="btn" type="button" onClick={() => picture('desktop')} disabled={Boolean(busy)}><ImageIcon size={16} aria-hidden="true" />{busy === 'desktop' ? 'Preparing…' : 'Picture, desktop'}</button>
        <button className="btn" type="button" onClick={() => picture('phone')} disabled={Boolean(busy)}><ImageIcon size={16} aria-hidden="true" />{busy === 'phone' ? 'Preparing…' : 'Picture, phone'}</button>
        <a className="btn" href={`${base}?v=${encodeURIComponent(version)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Open in new tab</a>
      </div>
      <p className="hint mt-3">The HTML file is one self-contained page: send it to anyone and it opens in any browser. The pictures are full-page images, handy for chat or email.</p>
      {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
    </div>
  );
}

export default function Stage({ run, site, hasDesign, labels, themeOptions, onDelete }) {
  const [themeStamp, setThemeStamp] = useState(0);
  const themeChanged = useCallback(() => setThemeStamp(Date.now()), []);
  const [tab, setTab] = useState('design');
  const [device, setDevice] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 700 ? 'phone' : 'desktop'));
  const [confirming, setConfirming] = useState(false);

  if (!run) return <Empty />;
  if (run.status === 'capturing') return <Progress title="Checking the page" detail={`${run.stage || 'Starting'}…`} />;
  if (run.status === 'generating') return <Progress title="Designing your page" detail="This usually takes 30 to 90 seconds. It keeps going if you refresh." />;
  if (run.status === 'failed' && !site) return <Message title="That page could not be checked." tone="bad">{run.error}<span className="mt-3 block text-sm">Some pages block automated visits or need a login. Use the <strong>Screenshot</strong> tab on the left and upload a picture of the page instead.</span></Message>;

  const version = `${run.updatedAt}-${themeStamp}`;
  const showDevice = (id) => (tab === 'compare' && id === 'tablet' ? false : true);
  const effectiveDevice = tab === 'compare' && device === 'tablet' ? 'desktop' : device;
  const activeTab = hasDesign ? tab : 'original';

  return (
    <div className="flex h-full flex-col gap-4">
      {run.status === 'failed' && <p className="rounded-xl border border-[#f1c9c4] bg-bad-tint px-4 py-3 text-sm text-bad" role="alert">{run.error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[1.9rem] font-normal leading-none tracking-tight">{run.host}</h2>
          <p className="hint">
            {hasDesign
              ? [labels.style(run.answers?.style), labels.category(run.answers?.category), number(run.usage?.output) && `${number(run.usage.input)} tokens in, ${number(run.usage.output)} out`, run.model].filter(Boolean).join(' · ')
              : 'The original page. Answer the questions to create the redesign.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasDesign && (
            <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-line" role="group" aria-label="View">
              {TABS.map(t => (
                <button key={t.id} type="button" aria-pressed={activeTab === t.id} onClick={() => setTab(t.id)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted aria-pressed:bg-ink aria-pressed:text-white">{t.label}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-line" role="group" aria-label="Screen size">
            {DEVICES.filter(d => (hasDesign ? showDevice(d.id) : d.id !== 'tablet')).map(d => {
              const Icon = ICONS[d.id];
              return (
                <button key={d.id} type="button" aria-pressed={effectiveDevice === d.id} onClick={() => setDevice(d.id)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted aria-pressed:bg-ink aria-pressed:text-white">
                  <Icon size={15} aria-hidden="true" />{d.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-[min(74vh,860px)] min-h-[420px]">
        {activeTab === 'design' && <Viewport kind="design" runId={run.id} version={version} device={effectiveDevice} label="Redesign preview" />}
        {activeTab === 'original' && <Viewport kind="original" runId={run.id} version={run.createdAt} device={effectiveDevice === 'tablet' ? 'desktop' : effectiveDevice} label="Original page" />}
        {activeTab === 'compare' && (
          <div className="grid h-full grid-cols-2 gap-3">
            <Viewport kind="original" runId={run.id} version={run.createdAt} device={effectiveDevice} label="Original page" />
            <Viewport kind="design" runId={run.id} version={version} device={effectiveDevice} label="Redesign preview" />
          </div>
        )}
      </div>

      {hasDesign && run.status !== 'generating' && <Theme key={run.id} runId={run.id} options={themeOptions} onChanged={themeChanged} />}
      {hasDesign && <ExportBar run={run} version={version} />}
      {hasDesign && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="hint max-w-xl">This concept uses another business&rsquo;s name and wording. Share it with them directly, and do not publish it as your own client work.</p>
          {confirming ? (
            <span className="inline-flex gap-2">
              <button className="btn btn-danger" type="button" onClick={() => { setConfirming(false); onDelete(run.id); }}>Delete for good</button>
              <button className="btn" type="button" onClick={() => setConfirming(false)}>Keep it</button>
            </span>
          ) : (
            <button className="btn" type="button" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />Delete this design</button>
          )}
        </div>
      )}
    </div>
  );
}
