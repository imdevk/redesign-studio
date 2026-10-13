import { useEffect, useRef, useState } from 'react';

export const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 820 },
  { id: 'phone', label: 'Phone', width: 390 }
];

function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    // Measure the box itself and ignore sub-pixel changes, so a scrollbar appearing
    // or disappearing can never feed back into the scale (that caused the shaking).
    const measure = () => setSize(old => {
      const width = Math.floor(node.clientWidth), height = Math.floor(node.clientHeight);
      return Math.abs(old.width - width) < 2 && Math.abs(old.height - height) < 2 ? old : { width, height };
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/**
 * Shows either the redesign (a sandboxed frame, scaled to fit) or the screenshot of the original page.
 * The design is served by the local server with its own sandbox policy, and the frame adds sandbox="" on top.
 */
export default function Viewport({ kind, runId, version, device, label }) {
  const [ref, size] = useSize();
  const frameWidth = DEVICES.find(d => d.id === device).width;
  const scale = size.width ? Math.min(1, Math.floor((size.width / frameWidth) * 1000) / 1000) : 1;
  const src = `/api/runs/${runId}/${kind === 'design' ? 'design.html' : `shot/${device === 'phone' ? 'phone' : 'desktop'}`}?v=${encodeURIComponent(version)}`;

  return (
    <div ref={ref} className={`h-full min-h-[420px] rounded-xl bg-canvas ring-1 ring-line ${kind === 'design' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`} aria-label={label}>
      {kind === 'design' ? (
        <div className="mx-auto overflow-hidden bg-white shadow-[0_18px_50px_-24px_rgba(20,22,43,.35)]" style={{ width: Math.floor(frameWidth * scale), height: size.height }}>
          <iframe
            key={src}
            title={label}
            src={src}
            sandbox=""
            referrerPolicy="no-referrer"
            className="block border-0 bg-white"
            style={{ width: frameWidth, height: Math.ceil(size.height / scale), transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
        </div>
      ) : (
        <img
          key={src}
          src={src}
          alt={`${label}: screenshot of the original page`}
          className="mx-auto block bg-white shadow-[0_18px_50px_-24px_rgba(20,22,43,.35)]"
          style={{ width: device === 'phone' ? 390 : '100%', maxWidth: '100%' }}
        />
      )}
    </div>
  );
}
