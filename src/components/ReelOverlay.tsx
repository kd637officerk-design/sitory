import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play, X } from 'lucide-react';
import type { PhotoItem } from '../types/gallery';
import { shortDate } from '../utils/compression';
import { RainBackdrop } from './RainBackdrop';

interface ReelOverlayProps {
  photos: PhotoItem[];
  title?: string;
  onClose: () => void;
  onOpenInOpener?: (photos: PhotoItem[], index: number) => void;
}

export function ReelOverlay({ photos, title, onClose, onOpenInOpener }: ReelOverlayProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
    setPaused(false);
  }, [photos, title]);

  useEffect(() => {
    if (!photos.length || paused || photos.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % photos.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [paused, photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && photos.length > 1) {
        setIndex((i) => (i + 1) % photos.length);
      } else if (e.key === 'ArrowLeft' && photos.length > 1) {
        setIndex((i) => (i - 1 + photos.length) % photos.length);
      } else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, photos.length]);

  if (!photos.length) return null;
  const safeIndex = index % photos.length;
  const current = photos[safeIndex];

  return (
    <div
      className="fixed inset-0 z-[80] overflow-hidden bg-[#06070a] select-none"
      role="dialog"
      aria-label={title || 'Photo Highlights Reel'}
    >
      {/* Background blurred fill for portrait/landscape harmony */}
      <img
        src={current.thumbSrc || current.src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-3xl"
      />

      {/* Main animated Ken Burns photo */}
      <img
        key={current.id}
        src={current.src}
        alt={current.name}
        className="animate-kenburns relative h-full w-full object-contain sm:object-cover"
      />

      {/* Atmospheric Dark Fantasy Rain & Slideshow Thunder */}
      <RainBackdrop
        variant="player"
        thunderActive={!paused}
        className="pointer-events-none absolute inset-0 z-10 opacity-85"
      />

      {/* Story Progress Indicators */}
      <div className="pointer-events-none absolute inset-x-4 top-[max(14px,env(safe-area-inset-top))] z-20 flex gap-1.5">
        {photos.map((p, idx) => (
          <div key={p.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              className={`h-full rounded-full bg-[#c8a464] transition-all duration-300 ${
                idx < safeIndex ? 'w-full' : idx === safeIndex ? 'w-full opacity-95' : 'w-0'
              }`}
            />
          </div>
        ))}
      </div>

      {/* Top Overlay Header */}
      <div className="absolute inset-x-4 top-[max(28px,calc(env(safe-area-inset-top)+14px))] z-20 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {title && (
            <h2 className="font-display truncate text-lg font-semibold text-white drop-shadow-md">
              {title}
            </h2>
          )}
          <p className="font-mono-num text-xs text-white/80 drop-shadow">
            {safeIndex + 1} / {photos.length} · {shortDate(current.date)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenInOpener && (
            <button
              onClick={() => {
                onClose();
                onOpenInOpener(photos, safeIndex);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-black/55 px-3.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/80"
              title="Inspect in Main Photo Opener"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Inspect</span>
            </button>
          )}
          <button
            onClick={() => setPaused((p) => !p)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80"
            aria-label={paused ? 'Resume highlight reel' : 'Pause highlight reel'}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80"
            aria-label="Close highlight reel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Tap / Click Navigation Zones */}
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
            className="group absolute inset-y-20 left-0 z-10 flex w-1/4 items-center justify-start pl-3 text-white/0 transition hover:text-white/90"
            aria-label="Previous highlight"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
              <ChevronLeft className="h-5 w-5" />
            </span>
          </button>
          <button
            onClick={() => setIndex((i) => (i + 1) % photos.length)}
            className="group absolute inset-y-20 right-0 z-10 flex w-1/4 items-center justify-end pr-3 text-white/0 transition hover:text-white/90"
            aria-label="Next highlight"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
              <ChevronRight className="h-5 w-5" />
            </span>
          </button>
        </>
      )}

      {/* Bottom Scrim & Metadata */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-6 bottom-[max(24px,env(safe-area-inset-bottom))] z-20">
        <div className="text-xl font-semibold text-white drop-shadow-lg">
          {shortDate(current.date)}
          {current.place ? ` · ${current.place}` : ''}
        </div>
        {current.desc && (
          <p className="mt-1 line-clamp-2 max-w-xl text-sm text-white/80 drop-shadow">
            {current.desc}
          </p>
        )}
      </div>
    </div>
  );
}
