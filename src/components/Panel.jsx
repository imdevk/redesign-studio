import { useState } from 'react';
import Upload from './Upload.jsx';

function Step({ number, title, children }) {
  return (
    <section className="step">
      <h2 className="step-title"><span className="step-no" aria-hidden="true">{number}</span>{title}</h2>
      {children}
    </section>
  );
}

const Swatch = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
    <span className="h-5 w-5 rounded-md ring-1 ring-black/10" style={{ background: color }} aria-hidden="true" />
    <span className="sr-only">{label} </span>{color}
  </span>
);

function Found({ site }) {
  if (site.source === 'screenshot') {
    const n = site.uploadFiles?.length || 0;
    return (
      <Step number="2" title="What we have">
        <p className="text-sm font-semibold leading-snug">{site.title}</p>
        <p className="hint mt-1">{n === 1 ? 'Your screenshot' : 'Your screenshots'} will be sent to the AI along with your answers. It reads the wording, layout, colours and picture spots from {n === 1 ? 'it' : 'them'}, so nothing was read from a web page.</p>
      </Step>
    );
  }
  const spots = site.images || [];
  const byRole = ['logo', 'hero', 'content', 'avatar'].map(role => [role, spots.filter(s => s.role === role).length]).filter(([, n]) => n > 0);
  const plural = { logo: 'logo', hero: 'hero picture', content: 'content pictures', avatar: 'people photos' };
  return (
    <Step number="2" title="What we found">
      <p className="text-sm font-semibold leading-snug">{site.title || site.host}</p>
      {site.description && <p className="hint mt-1">{site.description}</p>}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-muted">Content</dt>
        <dd>{site.headings.length} headings, {site.paragraphs.length} text blocks, {site.sections.length} sections</dd>
        <dt className="text-muted">Pictures</dt>
        <dd>
          {spots.length === 0 ? 'None found' : `${spots.length} spots, which become placeholders in the same places`}
          {byRole.length > 0 && <span className="hint block">{byRole.map(([role, n]) => `${n} ${n === 1 && role !== 'content' && role !== 'avatar' ? plural[role] : plural[role]}`).join(', ')}</span>}
        </dd>
        <dt className="text-muted">Colours</dt>
        <dd className="flex flex-wrap gap-x-3 gap-y-1.5">
          {site.colors.accents.map(c => <Swatch key={c} color={c} label="Brand colour" />)}
          <Swatch color={site.colors.background} label="Background" />
          {site.colors.accents.length === 0 && <span className="hint">No brand colour stood out</span>}
        </dd>
        <dt className="text-muted">Fonts</dt>
        <dd>{[site.fonts.heading, site.fonts.body].filter((f, i, a) => f && a.indexOf(f) === i).join(', ') || 'Not detected'}</dd>
      </dl>
    </Step>
  );
}

export default function Panel({ status, onUpload, run, site, hasDesign, form, setForm, url, setUrl, onCheck, onGenerate, onReset, busy }) {
  const working = Boolean(run && (run.status === 'capturing' || run.status === 'generating'));
  const options = status?.options;
  const set = patch => setForm({ ...form, ...patch });
  const toggleSection = value => set({ sections: form.sections.includes(value) ? form.sections.filter(s => s !== value) : [...form.sections, value] });
  const canDesign = Boolean(site) && status?.ready && !working;
  const [mode, setMode] = useState('url');
  const fromShot = site?.source === 'screenshot';

  return (
    <div className="flex flex-col">
      <Step number="1" title="The page to redesign">
        <div className="mb-4 inline-flex rounded-lg bg-canvas p-1" role="group" aria-label="How to give the page">
          {[['url', 'Web address'], ['shot', 'Screenshot']].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} disabled={working}
              className="rounded-md px-3.5 py-1.5 text-sm font-medium text-muted aria-pressed:bg-white aria-pressed:text-ink aria-pressed:shadow-sm">{label}</button>
          ))}
        </div>
        {mode === 'url' ? (
          <form onSubmit={onCheck}>
            <label className="label" htmlFor="url">Which page should be redesigned?</label>
            <input id="url" className="field" value={url} onChange={e => setUrl(e.target.value)} placeholder="example.com/about" inputMode="url" autoComplete="off" spellCheck="false" maxLength={500} required disabled={working || busy} />
            <p className="hint mt-1.5">Only this page is read, not the whole site. If it will not open, use the Screenshot tab.</p>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn btn-primary" disabled={working || busy || !url.trim()}>{busy || run?.status === 'capturing' ? 'Checking…' : run ? 'Check another page' : 'Check page'}</button>
              {run && <button type="button" className="text-sm font-medium text-muted underline-offset-4 hover:underline" onClick={onReset} disabled={working}>Start over</button>}
            </div>
          </form>
        ) : (
          <>
            <Upload disabled={working || busy} maxImages={status?.limits?.maxImages} onSubmit={async data => { await onUpload(data); setMode('shot'); }} />
            {run && <button type="button" className="mt-3 text-sm font-medium text-muted underline-offset-4 hover:underline" onClick={onReset} disabled={working}>Start over</button>}
          </>
        )}
      </Step>

      {site && <Found site={site} />}
      {run?.warnings?.map(w => <p key={w} className="rounded-xl border border-[#f0dba5] bg-warn-tint px-4 py-3 text-sm text-[#6d4b00]">{w}</p>)}

      {site && options && (
        <Step number="3" title="A few questions">
          <form onSubmit={onGenerate} className="flex flex-col gap-5">
            <div>
              <label className="label" htmlFor="category">What kind of business is this?</label>
              <select id="category" className="field" value={form.category} onChange={e => set({ category: e.target.value })} disabled={working}>
                {options.categories.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="goal">What should visitors do?</label>
              <select id="goal" className="field" value={form.goal} onChange={e => set({ goal: e.target.value })} disabled={working}>
                {options.goals.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <fieldset disabled={working}>
              <legend className="label">What look do you want?</legend>
              <div className="-mx-1 flex flex-col gap-0.5">
                {options.styles.map(o => (
                  <label key={o.value} className="choice">
                    <input type="radio" name="style" value={o.value} checked={form.style === o.value} onChange={() => set({ style: o.value })} />
                    <span><span className="block text-sm font-medium">{o.label}</span><span className="hint">{o.hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={working}>
              <legend className="label">Colours</legend>
              <div className="-mx-1 flex flex-col gap-0.5">
                {options.colorModes.map(o => (
                  <label key={o.value} className="choice">
                    <input type="radio" name="colorMode" value={o.value} checked={form.colorMode === o.value} onChange={() => set({ colorMode: o.value })} />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{o.label}</span>
                      {o.value === 'keep' && <span className="hint">{fromShot ? 'Taken from your screenshots' : site.colors.accents.length ? site.colors.accents.join(', ') : 'No brand colour was detected'}</span>}
                      {o.value === 'fresh' && <span className="hint">Chosen to suit the business and the look</span>}
                      {o.value === 'custom' && form.colorMode === 'custom' && (
                        <span className="mt-2 flex items-center gap-2">
                          <input type="color" aria-label="Pick a colour" value={/^#[0-9a-f]{6}$/i.test(form.customColor) ? form.customColor : '#4f46e5'} onChange={e => set({ customColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-md border border-line bg-white p-0.5" />
                          <input aria-label="Colour as a hex code" className="field !h-9 !w-28" value={form.customColor} onChange={e => set({ customColor: e.target.value })} placeholder="#0f766e" maxLength={7} />
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={working}>
              <legend className="label">Add sections that are not on the page <span className="font-normal text-muted">(optional)</span></legend>
              <p className="hint mb-2">Leave all unticked to keep only what the original page has.</p>
              <div className="flex flex-wrap gap-2">
                {options.sections.map(o => (
                  <label key={o.value} className="chip relative">
                    <input type="checkbox" checked={form.sections.includes(o.value)} onChange={() => toggleSection(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="notes">Anything else? <span className="font-normal text-muted">(optional)</span></label>
              <textarea id="notes" className="field" rows={3} maxLength={500} value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="For example: emphasise the outdoor seating." disabled={working} />
            </div>
            {!status.ready && <p className="rounded-xl border border-[#f0dba5] bg-warn-tint px-4 py-3 text-sm text-[#6d4b00]">The AI is not set up. Add OPENAI_API_KEY and OPENAI_MODEL to the .env file and restart the tool. See the README.</p>}
            <div>
              <button className="btn btn-primary w-full" disabled={!canDesign}>{run?.status === 'generating' ? 'Designing…' : hasDesign ? 'Create again' : 'Create design'}</button>
              {hasDesign && <p className="hint mt-2">Creating again replaces the current design and uses more AI credits.</p>}
            </div>
          </form>
        </Step>
      )}
    </div>
  );
}
