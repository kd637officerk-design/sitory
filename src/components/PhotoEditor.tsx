import { useEffect, useRef, useState } from 'react';
import { FlipHorizontal, RotateCw, Sparkles, X } from 'lucide-react';
import type { EditState, PhotoItem } from '../types/gallery';
import { RainBackdrop } from './RainBackdrop';

interface PhotoEditorProps {
  photo: PhotoItem;
  onClose: () => void;
  onSave: (photo: PhotoItem, blob: Blob, editState: EditState, asCopy: boolean) => Promise<void>;
  onRevert: (photo: PhotoItem) => Promise<void>;
}

const PRESETS: Record<string, Partial<EditState>> = {
  None: {},
  Vivid: { b: 105, c: 115, s: 140 },
  Warm: { b: 104, s: 112, w: 32 },
  Cool: { s: 105, w: -32 },
  'B&W': { s: 0, c: 118 },
  Fade: { b: 110, c: 84, s: 84 },
  Noir: { s: 0, c: 145, b: 88 },
};

const DEFAULT_EDIT: EditState = {
  b: 100,
  c: 100,
  s: 100,
  w: 0,
  rot: 0,
  fl: 0,
  ar: 0,
  f: 'None',
};

function bakeToCanvas(img: HTMLImageElement, E: EditState, maxDim: number, cv: HTMLCanvasElement) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const oddRot = E.rot % 2 === 1;
  const tw = oddRot ? h : w;
  const th = oddRot ? w : h;

  const tmp = document.createElement('canvas');
  tmp.width = tw;
  tmp.height = th;
  const tx = tmp.getContext('2d')!;
  tx.translate(tw / 2, th / 2);
  tx.rotate((E.rot * Math.PI) / 2);
  tx.scale(E.fl ? -1 : 1, 1);
  tx.drawImage(img, -w / 2, -h / 2);

  let cw = tw;
  let ch = th;
  if (E.ar > 0) {
    if (tw / th > E.ar) cw = th * E.ar;
    else ch = tw / E.ar;
  }

  const k = Math.min(1, maxDim / Math.max(cw, ch));
  cv.width = Math.max(1, Math.round(cw * k));
  cv.height = Math.max(1, Math.round(ch * k));

  const ctx = cv.getContext('2d')!;
  ctx.drawImage(tmp, (tw - cw) / 2, (th - ch) / 2, cw, ch, 0, 0, cv.width, cv.height);

  const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
  const a = imgData.data;
  const B = E.b / 100;
  const Cn = E.c / 100;
  const Sa = E.s / 100;
  const W = E.w * 0.6;
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

  for (let i = 0; i < a.length; i += 4) {
    const r = ((a[i] - 128) * Cn + 128) * B;
    const g = ((a[i + 1] - 128) * Cn + 128) * B;
    const b = ((a[i + 2] - 128) * Cn + 128) * B;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    a[i] = clamp(y + (r - y) * Sa + W);
    a[i + 1] = clamp(y + (g - y) * Sa);
    a[i + 2] = clamp(y + (b - y) * Sa - W);
  }
  ctx.putImageData(imgData, 0, 0);
}

export function PhotoEditor({ photo, onClose, onSave, onRevert }: PhotoEditorProps) {
  const [edit, setEdit] = useState<EditState>({ ...DEFAULT_EDIT, ...(photo.E || {}) });
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      if (canvasRef.current) {
        bakeToCanvas(img, edit, 1000, canvasRef.current);
      }
    };
    img.src = photo.origSrc || photo.src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);

  useEffect(() => {
    if (imgRef.current && canvasRef.current) {
      bakeToCanvas(imgRef.current, edit, 1000, canvasRef.current);
    }
  }, [edit]);

  const handleAutoEnhance = async () => {
    if (!imgRef.current) return;
    setAiLoading(true);
    try {
      const c = document.createElement('canvas');
      bakeToCanvas(imgRef.current, DEFAULT_EDIT, 500, c);
      const imageDataUrl = c.toDataURL('image/jpeg', 0.8);
      const resp = await fetch('/api/ai/auto-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl }),
      });
      if (resp.ok) {
        const j = (await resp.json()) as Partial<EditState>;
        setEdit((prev) => ({
          ...prev,
          b: typeof j.b === 'number' ? Math.max(50, Math.min(150, j.b)) : 104,
          c: typeof j.c === 'number' ? Math.max(50, Math.min(150, j.c)) : 112,
          s: typeof j.s === 'number' ? Math.max(0, Math.min(200, j.s)) : 118,
          w: typeof j.w === 'number' ? Math.max(-50, Math.min(50, j.w)) : 0,
          f: 'custom',
        }));
        return;
      }
    } catch {
      // fallback below
    } finally {
      setAiLoading(false);
    }
    setEdit((prev) => ({ ...prev, b: 105, c: 112, s: 116, w: 4, f: 'custom' }));
  };

  const commit = async (asCopy: boolean) => {
    if (!imgRef.current) return;
    setBusy(true);
    try {
      const outCanvas = document.createElement('canvas');
      bakeToCanvas(imgRef.current, edit, 2400, outCanvas);
      const blob = await new Promise<Blob>((resolve) =>
        outCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.92)
      );
      await onSave(photo, blob, edit, asCopy);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg)] pt-[env(safe-area-inset-top)] text-[var(--tx)]">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ln)]/25 px-3 py-2.5">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--sf)]"
          aria-label="Close editor"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="font-display text-base font-semibold">Edit Photo</span>
        <div className="flex-1" />
        <button
          disabled={busy}
          onClick={() => void onRevert(photo)}
          className="rounded-full border border-[var(--ln)]/40 px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--sf)]"
        >
          Revert
        </button>
        <button
          disabled={busy}
          onClick={() => void commit(true)}
          className="rounded-full border border-[var(--ln)]/40 px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--sf)]"
        >
          Save copy
        </button>
        <button
          disabled={busy}
          onClick={() => void commit(false)}
          className="rounded-full bg-[var(--ac)] px-4 py-1.5 text-xs font-semibold text-slate-950"
        >
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Canvas Preview */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#07080b] p-4">
        <RainBackdrop variant="subtle" className="pointer-events-none absolute inset-0 z-0" />
        <canvas ref={canvasRef} className="relative z-10 max-h-full max-w-full rounded-lg object-contain shadow-[0_24px_70px_rgba(0,0,0,0.85)]" />
      </div>

      {/* Controls */}
      <div className="max-h-[46vh] overflow-y-auto border-t border-[var(--ln)]/30 bg-[var(--bg)] px-4 py-3 pb-[max(14px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => void handleAutoEnhance()}
              disabled={aiLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--acb)] px-3.5 py-1.5 text-xs font-medium text-[var(--tx)]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--ac)]" />
              {aiLoading ? 'Analyzing...' : 'Auto-enhance'}
            </button>
            <button
              onClick={() => setEdit((p) => ({ ...p, rot: (p.rot + 1) % 4 }))}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--ln)]/40 px-3 py-1.5 text-xs"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Rotate
            </button>
            <button
              onClick={() => setEdit((p) => ({ ...p, fl: p.fl ? 0 : 1 }))}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--ln)]/40 px-3 py-1.5 text-xs"
            >
              <FlipHorizontal className="h-3.5 w-3.5" />
              Flip
            </button>
            {[
              ['Original', 0],
              ['1:1', 1],
              ['4:3', 4 / 3],
              ['3:4', 0.75],
              ['16:9', 16 / 9],
            ].map(([label, val]) => (
              <button
                key={String(label)}
                onClick={() => setEdit((p) => ({ ...p, ar: Number(val) }))}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
                  edit.ar === Number(val)
                    ? 'bg-[var(--acb)] font-medium text-[var(--tx)]'
                    : 'border border-[var(--ln)]/40 text-[var(--tx2)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            {Object.keys(PRESETS).map((presetKey) => (
              <button
                key={presetKey}
                onClick={() =>
                  setEdit((p) => ({
                    ...p,
                    b: 100,
                    c: 100,
                    s: 100,
                    w: 0,
                    ...PRESETS[presetKey],
                    f: presetKey,
                  }))
                }
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
                  edit.f === presetKey
                    ? 'bg-[var(--acb)] font-medium text-[var(--tx)]'
                    : 'border border-[var(--ln)]/40 text-[var(--tx2)]'
                }`}
              >
                {presetKey}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ['b', 'Brightness', 50, 150],
                ['c', 'Contrast', 50, 150],
                ['s', 'Saturation', 0, 200],
                ['w', 'Warmth', -50, 50],
              ] as const
            ).map(([k, label, min, max]) => (
              <label key={k} className="grid grid-cols-[90px_1fr_36px] items-center gap-2 text-xs">
                <span className="text-[var(--tx2)]">{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={edit[k]}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, [k]: Number(e.target.value), f: 'custom' }))
                  }
                  className="accent-[var(--ac)]"
                />
                <span className="font-mono-num text-right text-[var(--tx2)]">{edit[k]}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
