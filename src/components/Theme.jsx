import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '../api';

const GENERIC = { sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, Menlo, monospace' };
const familyFor = font => (font.id.startsWith('system-') ? GENERIC[font.kind] : `"rsf-${font.id}", ${GENERIC[font.kind]}`);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** The tool's own copy of the bundled fonts, so each choice is shown in its own typeface. */
function FontFaces({ fonts }) {
  const css = fonts.filter(f => !f.id.startsWith('system-'))
    .flatMap(f => [400, 700].map(w => `@font-face{font-family:"rsf-${f.id}";font-weight:${w};font-display:swap;src:url(/api/fonts/${f.id}/${w}.woff2) format("woff2")}`)).join('');
  return <style>{css}</style>;
}

export default function Theme({ runId, options, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [chosen, setChosen] = useState({ colors: {}, fonts: {} });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);
  const sequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setDetail(null); setError('');
    api(`/runs/${runId}/theme`).then(d => { if (!cancelled) { setDetail(d); setChosen({ colors: d.chosen.colors || {}, fonts: d.chosen.fonts || {} }); } })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [runId]);

  const save = useCallback((next, delay = 0) => {
    setChosen(next);
    clearTimeout(timer.current);
    const mine = ++sequence.current;
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api(`/runs/${runId}/theme`, { method: 'PUT', body: next });
        if (mine === sequence.current) { setError(''); onChanged(); }
      } catch (e) { if (mine === sequence.current) setError(e.message); } finally { if (mine === sequence.current) setSaving(false); }
    }, delay);
  }, [runId, onChanged]);

  const colorIds = useMemo(() => new Set(detail?.colors.map(c => c.id) || []), [detail]);
  const setColor = (id, value) => save({ ...chosen, colors: { ...chosen.colors, [id]: value } }, 350);
  const clearColor = id => { const colors = { ...chosen.colors }; delete colors[id]; save({ ...chosen, colors }); };
  const setFont = (role, id) => {
    const fonts = { ...chosen.fonts };
    if (id) fonts[role] = id; else delete fonts[role];
    save({ ...chosen, fonts });
  };
  const usePalette = p => save({ ...chosen, colors: Object.fromEntries(['brand', 'bg', 'surface', 'text', 'muted'].filter(k => colorIds.has(k)).map(k => [k, p[k]])) });
  const changed = Object.keys(chosen.colors).length + Object.keys(chosen.fonts).length > 0;

  if (error && !detail) return null;
  if (!detail) return null;
  if (!detail.adjustable) {
    return (
      <div className="panel p-4">
        <h3 className="text-[15px] font-semibold tracking-tight">Colours and fonts</h3>
        <p className="hint mt-1">This design was not built with adjustable colours and fonts. Use Create again to get one that is.</p>
      </div>
    );
  }
  const palettes = options?.palettes || [];
  const fonts = options?.fonts || [];

  return (
    <details className="panel group" open>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
        <span>
          <span className="block font-display text-2xl font-normal leading-tight tracking-tight">Colours and fonts</span>
          <span className="hint">Changes show instantly. They do not use the AI, so they are free.</span>
        </span>
        <span className="flex items-center gap-3 text-sm text-muted" aria-live="polite">
          {saving ? 'Saving…' : ''}
          {changed && <button type="button" className="btn !h-9" onClick={e => { e.preventDefault(); save({ colors: {}, fonts: {} }); }}><RotateCcw size={15} aria-hidden="true" />Back to original</button>}
        </span>
      </summary>
      <FontFaces fonts={fonts} />
      <div className="grid gap-6 border-t border-line p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-5">
          {error && <p className="text-sm text-bad" role="alert">{error}</p>}
          {detail.colors.length > 0 && (
            <>
              <div>
                <h4 className="label">Ready-made palettes</h4>
                <div className="flex flex-wrap gap-2">
                  {palettes.map(p => (
                    <button key={p.id} type="button" onClick={() => usePalette(p)} title={p.label}
                      className="group/p flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1.5 text-sm hover:border-accent">
                      <span className="flex overflow-hidden rounded-md ring-1 ring-black/10" aria-hidden="true">
                        {[p.bg, p.surface, p.brand, p.text].map(c => <span key={c} className="h-5 w-3.5" style={{ background: c }} />)}
                      </span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="label">Colours in this design</h4>
                <ul className="flex flex-col gap-2">
                  {detail.colors.map(c => {
                    const value = chosen.colors[c.id] || c.value;
                    const edited = Boolean(chosen.colors[c.id]) && !same(chosen.colors[c.id], c.value);
                    return (
                      <li key={c.id} className="flex items-center gap-3">
                        <input type="color" aria-label={`${c.label} colour`} value={value} onChange={e => setColor(c.id, e.target.value)}
                          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-line bg-white p-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{c.label}</span>
                          <span className="hint block truncate">{c.uses}</span>
                        </span>
                        <code className="text-xs text-muted">{value}</code>
                        <button type="button" className="btn !h-8 !w-8 !px-0" aria-label={`Reset ${c.label}`} title="Back to the original" disabled={!edited} onClick={() => clearColor(c.id)}><RotateCcw size={14} aria-hidden="true" /></button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
          {detail.fixedColours >= 3 && (
            <p className="rounded-xl border border-[#f0dba5] bg-warn-tint px-3 py-2.5 text-sm text-[#6d4b00]">{detail.fixedColours} colours in this design are written directly into the page, so they will not change here. Create again to rebuild it with fully adjustable colours.</p>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {detail.fonts.map(role => {
            const current = chosen.fonts[role.id] || null;
            const originalLabel = role.current.label;
            return (
              <div key={role.id}>
                <h4 className="label">{role.label} <span className="font-normal text-muted">· {role.uses}</span></h4>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  <button type="button" aria-pressed={!current} onClick={() => setFont(role.id, null)}
                    className="rounded-lg border border-line bg-white px-3 py-2 text-left text-sm aria-pressed:border-accent aria-pressed:bg-accent-tint">
                    <span className="block text-xs text-muted">Original</span>
                    <span className="block truncate font-medium">{originalLabel}</span>
                  </button>
                  {fonts.filter(f => f.id !== role.current.id).map(f => (
                    <button key={f.id} type="button" aria-pressed={current === f.id} onClick={() => setFont(role.id, f.id)}
                      className="rounded-lg border border-line bg-white px-3 py-2 text-left text-sm aria-pressed:border-accent aria-pressed:bg-accent-tint"
                      style={{ fontFamily: familyFor(f) }}>
                      <span className="block text-lg leading-tight">Aa</span>
                      <span className="block truncate text-[13px]">{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="hint">Fonts are saved inside the HTML file, so they look the same on any computer you send it to.</p>
        </div>
      </div>
    </details>
  );
}
