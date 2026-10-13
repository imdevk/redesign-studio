import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

const MAX_BYTES = 6 * 1024 * 1024;
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const readAsBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('Could not read that file.'));
  reader.readAsDataURL(file);
});

/** Upload page screenshots instead of letting the tool open the address. */
export default function Upload({ disabled, maxImages = 4, onSubmit }) {
  const [files, setFiles] = useState([]); // { id, file, preview }
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const add = list => {
    const next = [...filesRef.current];
    let note = '';
    for (const file of list) {
      if (!OK_TYPES.includes(file.type)) { note = 'Only PNG, JPG or WebP pictures work.'; continue; }
      if (file.size > MAX_BYTES) { note = `${file.name || 'That picture'} is over ${MAX_BYTES / 1024 / 1024} MB. Save it as a JPG or make it smaller.`; continue; }
      if (next.length >= maxImages) { note = `Up to ${maxImages} screenshots.`; break; }
      next.push({ id: `${Date.now()}-${Math.random()}`, file, preview: URL.createObjectURL(file) });
    }
    setFiles(next); setMessage(note);
  };
  const remove = id => setFiles(current => { current.filter(f => f.id === id).forEach(f => URL.revokeObjectURL(f.preview)); return current.filter(f => f.id !== id); });

  // Pasting a screenshot straight from the clipboard works too.
  useEffect(() => {
    const onPaste = event => {
      const pictures = [...(event.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
      if (pictures.length && !disabled) { event.preventDefault(); add(pictures); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  useEffect(() => () => filesRef.current.forEach(f => URL.revokeObjectURL(f.preview)), []);

  async function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    setSending(true); setMessage('');
    try {
      const images = await Promise.all(files.map(async f => ({ data: await readAsBase64(f.file) })));
      await onSubmit({ name, images });
      files.forEach(f => URL.revokeObjectURL(f.preview));
      setFiles([]); setName('');
    } catch (e) { setMessage(e.message); } finally { setSending(false); }
  }

  return (
    <form onSubmit={submit}>
      <p className="hint mb-3">For pages that block automated visits or need a login. Take a full-page screenshot in your browser and add it here. The AI reads the text, layout and colours from the picture.</p>
      <div
        className={`flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${over ? 'border-accent bg-accent-tint' : 'border-line bg-[#fafbfd] hover:border-accent'}`}
        onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
        role="button" tabIndex={0} aria-label="Add screenshots"
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
      >
        <ImagePlus size={22} className="text-accent" aria-hidden="true" />
        <span className="text-sm font-medium">Drop screenshots here, click to choose, or paste</span>
        <span className="hint">PNG, JPG or WebP. Up to {maxImages}, 6 MB each. Add them in page order, top first.</span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { add([...e.target.files]); e.target.value = ''; }} />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <li key={f.id} className="relative overflow-hidden rounded-lg border border-line bg-white">
              <img src={f.preview} alt={`Screenshot ${i + 1}`} className="aspect-[3/4] w-full object-cover object-top" />
              <span className="absolute left-1 top-1 rounded bg-ink/80 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
              <button type="button" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 ring-1 ring-black/10" onClick={() => remove(f.id)} aria-label={`Remove screenshot ${i + 1}`}><X size={14} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}

      <label className="label mt-4" htmlFor="shot-name">Business or page name <span className="font-normal text-muted">(optional)</span></label>
      <input id="shot-name" className="field" value={name} onChange={e => setName(e.target.value)} placeholder="For example: Ember & Oak" maxLength={80} disabled={disabled || sending} />
      {message && <p className="mt-2 text-sm text-bad" role="alert">{message}</p>}
      <div className="mt-3">
        <button className="btn btn-primary" disabled={disabled || sending || files.length === 0}>{sending ? 'Adding…' : 'Use these screenshots'}</button>
      </div>
      <p className="hint mt-2">Screenshots are saved on this computer and sent to OpenAI when you create the design.</p>
    </form>
  );
}
