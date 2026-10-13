import { useEffect } from 'react';
import { X } from 'lucide-react';

const STATUS = { capturing: 'Checking', captured: 'Checked', generating: 'Designing', done: 'Ready', failed: 'Failed' };
const when = value => new Date(value).toLocaleString();

export default function History({ open, runs, currentId, labels, onClose, onOpen }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Past designs" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl font-normal tracking-tight">Past designs</h2>
          <button className="btn !h-9 !w-9 !px-0" type="button" onClick={onClose} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {runs.length === 0 ? <p className="p-2 text-sm text-muted">Nothing yet. Designs you create are saved on this computer and appear here.</p> : (
            <ul className="flex flex-col gap-2">
              {runs.map(r => (
                <li key={r.id}>
                  <button type="button" onClick={() => { onOpen(r.id); onClose(); }}
                    className={`w-full rounded-xl border p-3.5 text-left hover:bg-[#f7f8fb] ${currentId === r.id ? 'border-accent bg-accent-tint' : 'border-line'}`}>
                    <span className="flex items-center justify-between gap-3">
                      <strong className="truncate text-sm font-semibold">{r.host || r.url}</strong>
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${r.status === 'done' ? 'bg-good-tint text-good' : r.status === 'failed' ? 'bg-bad-tint text-bad' : 'bg-canvas text-muted'}`}>{STATUS[r.status] || r.status}</span>
                    </span>
                    {r.title && <span className="mt-1 block truncate text-sm text-muted">{r.title}</span>}
                    <span className="hint mt-1 block">{[r.answers && labels.style(r.answers.style), r.answers && labels.category(r.answers.category), when(r.createdAt)].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
