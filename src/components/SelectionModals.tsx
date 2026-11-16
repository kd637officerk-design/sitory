import { useState } from 'react';
import { FolderPlus, Grid2x2, Images, Play, Sparkles, X } from 'lucide-react';
import type { PhotoItem } from '../types/gallery';

export async function buildPhotoCollageBlob(items: PhotoItem[]): Promise<Blob> {
  const picked = items.slice(0, 9);
  const count = picked.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);

  const canvasW = 1800;
  const gap = 18;
  const pad = 28;
  const cellW = Math.floor((canvasW - pad * 2 - gap * (cols - 1)) / cols);
  const cellH = count === 2 ? Math.floor(cellW * 1.25) : cellW;
  const canvasH = pad * 2 + rows * cellH + gap * (rows - 1);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#090a0d';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  for (let i = 0; i < picked.length; i++) {
    const p = picked[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const isLastOdd = count === 3 && i === 2;
    const x = pad + col * (cellW + gap);
    const y = pad + row * (cellH + gap);
    const targetW = isLastOdd ? canvasW - pad * 2 : cellW;
    const targetH = cellH;

    try {
      const img = await loadImage(p.src || p.thumbSrc);
      const scale = Math.max(targetW / img.width, targetH / img.height);
      const sw = targetW / scale;
      const sh = targetH / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, targetW, targetH, 20);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, x, y, targetW, targetH);
      ctx.restore();
    } catch {
      ctx.fillStyle = '#24221a';
      ctx.beginPath();
      ctx.roundRect(x, y, targetW, targetH, 20);
      ctx.fill();
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Collage export failed'))),
      'image/jpeg',
      0.94
    );
  });
}

interface AddToAlbumModalProps {
  open: boolean;
  selectedCount: number;
  folders: string[];
  onClose: () => void;
  onSelectFolder: (folderName: string) => void;
}

export function AddToAlbumModal({
  open,
  selectedCount,
  folders,
  onClose,
  onSelectFolder,
}: AddToAlbumModalProps) {
  const [newName, setNewName] = useState('');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[var(--sf)] p-5 text-[var(--tx)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Add to album</h3>
            <p className="text-xs text-[var(--tx2)]">
              Move {selectedCount} selected {selectedCount === 1 ? 'photo' : 'photos'} into a collection
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newName.trim();
            if (!trimmed) return;
            setNewName('');
            onSelectFolder(trimmed);
          }}
          className="mb-4 flex gap-2"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New album name..."
            className="min-w-0 flex-1 rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ac)] px-4 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-45"
          >
            <FolderPlus className="h-4 w-4" />
            Create
          </button>
        </form>

        <div className="max-h-60 divide-y divide-white/8 overflow-y-auto rounded-2xl border border-white/8 bg-[var(--bg)]/50">
          {folders.map((folder) => (
            <button
              key={folder}
              onClick={() => onSelectFolder(folder)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition hover:bg-white/5"
            >
              <span className="flex items-center gap-3">
                <Images className="h-4 w-4 text-[var(--ac)]" />
                <span>{folder}</span>
              </span>
              <span className="text-xs text-[var(--tx2)]">Move</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CreateFromSelectionModalProps {
  open: boolean;
  selectedCount: number;
  creatingCollage: boolean;
  onClose: () => void;
  onCreateCollage: () => void;
  onStartReel: () => void;
  onStartSlideshow: () => void;
  onAddToAlbum: () => void;
}

export function CreateFromSelectionModal({
  open,
  selectedCount,
  creatingCollage,
  onClose,
  onCreateCollage,
  onStartReel,
  onStartSlideshow,
  onAddToAlbum,
}: CreateFromSelectionModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[var(--sf)] p-5 text-[var(--tx)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Create</h3>
            <p className="text-xs text-[var(--tx2)]">
              Using {selectedCount} selected {selectedCount === 1 ? 'photo' : 'photos'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/8 bg-[var(--bg)]/50">
          <button
            onClick={onCreateCollage}
            disabled={creatingCollage}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/5 disabled:opacity-50"
          >
            <Grid2x2 className="h-5 w-5 text-[var(--ac)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {creatingCollage ? 'Generating collage...' : 'Collage'}
              </div>
              <div className="text-xs text-[var(--tx2)]">
                Combine up to 9 photos into a high-resolution grid
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onStartReel();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/5"
          >
            <Sparkles className="h-5 w-5 text-[var(--ac)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Highlight reel</div>
              <div className="text-xs text-[var(--tx2)]">
                Play an animated Ken Burns photo showcase
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onStartSlideshow();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/5"
          >
            <Play className="h-5 w-5 text-[var(--ac)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Slideshow</div>
              <div className="text-xs text-[var(--tx2)]">
                Start full-screen slideshow in Main Photo Opener
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onAddToAlbum();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/5"
          >
            <FolderPlus className="h-5 w-5 text-[var(--ac)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Album</div>
              <div className="text-xs text-[var(--tx2)]">
                Group selected photos into a new or existing folder
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
