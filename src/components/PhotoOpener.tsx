import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudCheck,
  Download,
  Eye,
  EyeOff,
  FolderPlus,
  Image as ImageIcon,
  Info,
  Lock,
  Maximize2,
  MoreVertical,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  UserCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PhotoItem, UserProfile } from '../types/gallery';
import { formatBytes, longDate, shortDate } from '../utils/compression';
import { RainBackdrop } from './RainBackdrop';

interface PhotoOpenerProps {
  photos: PhotoItem[];
  currentIndex: number;
  profiles: UserProfile[];
  activeProfile: UserProfile;
  folders: string[];
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onToggleFav: (photoId: number) => void;
  onToggleTrash: (photoId: number) => void;
  onToggleBackup: (photoId: number) => void;
  onUpdatePhoto: (photoId: number, patch: Partial<PhotoItem>) => void;
  onUpdateDateTime: (photoId: number, date?: string, time?: string) => void;
  onOpenEditor: (photo: PhotoItem) => void;
  onDescribeWithAi: (photo: PhotoItem) => Promise<void>;
  onSearchTag: (tag: string) => void;
  onSetProfileAvatar: (profileId: string, photoId: number) => void;
  onSetProfileCover: (profileId: string, photoId: number) => void;
  slideshowActive?: boolean;
  onToggleSlideshow?: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export function PhotoOpener({
  photos,
  currentIndex,
  profiles,
  activeProfile,
  folders,
  onClose,
  onIndexChange,
  onToggleFav,
  onToggleTrash,
  onToggleBackup,
  onUpdatePhoto,
  onUpdateDateTime,
  onOpenEditor,
  onDescribeWithAi,
  onSearchTag,
  onSetProfileAvatar,
  onSetProfileCover,
  slideshowActive = false,
  onToggleSlideshow,
}: PhotoOpenerProps) {
  const photo = photos[currentIndex];
  const prevPhoto = currentIndex > 0 ? photos[currentIndex - 1] : null;
  const nextPhoto = currentIndex < photos.length - 1 ? photos[currentIndex + 1] : null;

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [swipeDx, setSwipeDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showAddTo, setShowAddTo] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [newFolderDraft, setNewFolderDraft] = useState('');
  const [historyStack, setHistoryStack] = useState<number[]>(() => [currentIndex]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const originIndexRef = useRef<number>(currentIndex);
  const skipHistoryPushRef = useRef<boolean>(false);
  const pointerState = useRef<{
    mode: 'none' | 'pan' | 'swipe' | 'pinch';
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    pinchStartDist: number;
    pinchStartScale: number;
    lastTap: number;
    moved: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    pinchStartDist: 0,
    pinchStartScale: 1,
    lastTap: 0,
    moved: false,
  });

  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const showToastMsg = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2400);
  }, []);

  const clampPan = useCallback((x: number, y: number, s: number) => {
    if (s <= 1.01) return { x: 0, y: 0 };
    const rect = stageRef.current?.getBoundingClientRect();
    const maxX = rect ? (rect.width * (s - 1)) / 2 + 40 : 400 * s;
    const maxY = rect ? (rect.height * (s - 1)) / 2 + 40 : 400 * s;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const applyZoom = useCallback(
    (nextScale: number, focusClientX?: number, focusClientY?: number) => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(nextScale.toFixed(2))));
      setScale((prevScale) => {
        if (clamped <= 1.01) {
          setPan({ x: 0, y: 0 });
          return 1;
        }
        if (focusClientX !== undefined && focusClientY !== undefined && stageRef.current) {
          const rect = stageRef.current.getBoundingClientRect();
          const cx = focusClientX - (rect.left + rect.width / 2);
          const cy = focusClientY - (rect.top + rect.height / 2);
          const ratio = clamped / prevScale;
          setPan((prevPan) =>
            clampPan(cx - (cx - prevPan.x) * ratio, cy - (cy - prevPan.y) * ratio, clamped)
          );
        } else {
          setPan((prevPan) => clampPan(prevPan.x, prevPan.y, clamped));
        }
        return clamped;
      });
    },
    [clampPan]
  );

  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setSwipeDx(0);
  }, []);

  // Auto-focus viewer so Left/Right arrow keys work immediately
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  // Track navigation history so user can step back to where they were
  useEffect(() => {
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false;
      return;
    }
    setHistoryStack((prev) =>
      prev[prev.length - 1] === currentIndex ? prev : [...prev, currentIndex]
    );
  }, [currentIndex]);

  const goToIndex = useCallback(
    (targetIdx: number) => {
      if (photos.length <= 1) return;
      const wrapped = ((targetIdx % photos.length) + photos.length) % photos.length;
      if (wrapped !== currentIndex) {
        onIndexChange(wrapped);
      }
    },
    [currentIndex, onIndexChange, photos.length]
  );

  const goPrev = useCallback(() => {
    if (photos.length <= 1) return;
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    } else if (slideshowActive) {
      onIndexChange(photos.length - 1);
    }
  }, [currentIndex, onIndexChange, photos.length, slideshowActive]);

  const goNext = useCallback(() => {
    if (photos.length <= 1) return;
    if (currentIndex < photos.length - 1) {
      onIndexChange(currentIndex + 1);
    } else if (slideshowActive) {
      onIndexChange(0);
    }
  }, [currentIndex, onIndexChange, photos.length, slideshowActive]);

  const goBackHistory = useCallback(() => {
    setHistoryStack((prev) => {
      if (prev.length <= 1) return prev;
      const nextStack = prev.slice(0, -1);
      const prevIdx = nextStack[nextStack.length - 1];
      skipHistoryPushRef.current = true;
      onIndexChange(prevIdx);
      return nextStack;
    });
  }, [onIndexChange]);

  // Reset zoom/pan when changing photos
  useEffect(() => {
    resetZoom();
    setShowAddTo(false);
    setShowMenu(false);
  }, [photo?.id, resetZoom]);

  // Keyboard navigation & zoom shortcuts (ArrowLeft / ArrowRight work in slideshow & gallery)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape') {
        if (showInfo) setShowInfo(false);
        else if (showAddTo) setShowAddTo(false);
        else if (showMenu) setShowMenu(false);
        else if (scale > 1) resetZoom();
        else onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.altKey) {
          goBackHistory();
        } else if (scale > 1.05 && !slideshowActive && !e.shiftKey) {
          setPan((p) => clampPan(p.x + 60, p.y, scale));
        } else {
          goPrev();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (scale > 1.05 && !slideshowActive && !e.shiftKey) {
          setPan((p) => clampPan(p.x - 60, p.y, scale));
        } else {
          goNext();
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (historyStack.length > 1) goBackHistory();
        else onClose();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToIndex(photos.length - 1);
      } else if (e.key === 'ArrowUp' && scale > 1) {
        e.preventDefault();
        setPan((p) => clampPan(p.x, p.y + 60, scale));
      } else if (e.key === 'ArrowDown' && scale > 1) {
        e.preventDefault();
        setPan((p) => clampPan(p.x, p.y - 60, scale));
      } else if (e.key === '+' || e.key === '=') {
        applyZoom(scale + 0.6);
      } else if (e.key === '-') {
        applyZoom(scale - 0.6);
      } else if (e.key === '0') {
        resetZoom();
      } else if (e.key.toLowerCase() === 'i') {
        setShowInfo((v) => !v);
      } else if (e.key.toLowerCase() === 'f' && photo) {
        onToggleFav(photo.id);
      } else if ((e.key === ' ' || e.key.toLowerCase() === 's') && onToggleSlideshow) {
        e.preventDefault();
        onToggleSlideshow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    applyZoom,
    clampPan,
    goBackHistory,
    goNext,
    goPrev,
    goToIndex,
    historyStack.length,
    onClose,
    onToggleFav,
    onToggleSlideshow,
    photo,
    photos.length,
    resetZoom,
    scale,
    showAddTo,
    showInfo,
    showMenu,
    slideshowActive,
  ]);

  if (!photo) return null;

  const isCurrentAvatar = activeProfile.avatarPhotoId === photo.id;
  const isCurrentCover = activeProfile.coverPhotoId === photo.id;
  const activeImgSrc = scale > 1.15 ? photo.origSrc || photo.src : photo.src;
  const megapixels = ((photo.width * photo.height) / 1_000_000).toFixed(1);
  const savingsPct = Math.round((photo.compressionRatio || 0) * 100);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 0.85;
    applyZoom(scale * factor, e.clientX, e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, aside')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = Array.from(activePointers.current.values());
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pointerState.current.mode = 'pinch';
      pointerState.current.pinchStartDist = dist;
      pointerState.current.pinchStartScale = scale;
      setIsDragging(true);
      return;
    }

    pointerState.current.startX = e.clientX;
    pointerState.current.startY = e.clientY;
    pointerState.current.origPanX = pan.x;
    pointerState.current.origPanY = pan.y;
    pointerState.current.moved = false;
    pointerState.current.mode = scale > 1.01 ? 'pan' : 'swipe';
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = Array.from(activePointers.current.values());
    if (pts.length === 2 && pointerState.current.mode === 'pinch') {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      if (pointerState.current.pinchStartDist > 0) {
        const nextS =
          pointerState.current.pinchStartScale * (dist / pointerState.current.pinchStartDist);
        applyZoom(nextS, midX, midY);
      }
      pointerState.current.moved = true;
      return;
    }

    const dx = e.clientX - pointerState.current.startX;
    const dy = e.clientY - pointerState.current.startY;
    if (Math.hypot(dx, dy) > 6) pointerState.current.moved = true;

    if (pointerState.current.mode === 'pan') {
      setPan(
        clampPan(
          pointerState.current.origPanX + dx,
          pointerState.current.origPanY + dy,
          scale
        )
      );
    } else if (pointerState.current.mode === 'swipe') {
      // Allow horizontal swipe peek when at 1x zoom
      const resistance =
        (dx > 0 && !prevPhoto) || (dx < 0 && !nextPhoto) ? 0.25 : 1;
      setSwipeDx(dx * resistance);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2 && pointerState.current.mode === 'pinch') {
      pointerState.current.mode = 'none';
      setIsDragging(false);
      return;
    }

    if (pointerState.current.mode === 'swipe') {
      const threshold = Math.min(110, window.innerWidth * 0.22);
      if (swipeDx < -threshold && nextPhoto) {
        onIndexChange(currentIndex + 1);
      } else if (swipeDx > threshold && prevPhoto) {
        onIndexChange(currentIndex - 1);
      }
      setSwipeDx(0);
    }

    // Double-tap / double-click zoom toggle or single tap HUD toggle
    if (!pointerState.current.moved && activePointers.current.size === 0) {
      const now = Date.now();
      if (now - pointerState.current.lastTap < 280) {
        if (scale > 1.1) {
          resetZoom();
        } else {
          applyZoom(2.6, e.clientX, e.clientY);
        }
        pointerState.current.lastTap = 0;
      } else {
        pointerState.current.lastTap = now;
        if (showInfo || showMenu || showAddTo) {
          setShowInfo(false);
          setShowMenu(false);
          setShowAddTo(false);
        }
      }
    }

    pointerState.current.mode = 'none';
    setIsDragging(false);
  };

  const handleShare = async () => {
    try {
      const blob = photo.ob || photo.blob;
      const file = new File([blob], photo.name || 'symphony-8th-photo.jpg', {
        type: blob.type || 'image/jpeg',
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: photo.name });
        return;
      }
    } catch {
      // fallback to download
    }
    handleDownloadOriginal();
  };

  const handleDownloadOriginal = () => {
    const a = document.createElement('a');
    a.href = photo.origSrc || photo.src;
    a.download = photo.name || `symphony-8th-${photo.id}.jpg`;
    a.click();
    showToastMsg(`Downloaded original (${formatBytes(photo.originalSize)})`);
  };

  const handleAiDescribe = async () => {
    setAiBusy(true);
    try {
      await onDescribeWithAi(photo);
    } finally {
      setAiBusy(false);
    }
  };

  const ownerProfile = profiles.find((p) => p.id === photo.profileId) || activeProfile;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-[#07080b] text-[#e8e3d9] outline-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Main Photo Opener"
    >
      <RainBackdrop
        variant="player"
        hidden={hudHidden && !slideshowActive}
        thunderActive={slideshowActive}
        className="pointer-events-none absolute inset-0 z-0"
      />

      {/* Top Bar */}
      <header
        className={`relative z-20 flex items-center justify-between gap-2 border-b border-[#c8a464]/15 bg-[#090b10]/78 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 backdrop-blur-xl transition-opacity duration-200 ${
          hudHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#e8e3d9] transition hover:bg-white/10"
            aria-label="Back to gallery"
            title="Back to where you were (Esc)"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <button
            onClick={() => setShowInfo((v) => !v)}
            className="min-w-0 rounded-xl px-2 py-1 text-left transition hover:bg-white/10"
            aria-label="Toggle photo details"
          >
            <div className="font-display flex items-center gap-1 text-[16px] font-semibold leading-tight text-[#e8e3d9]">
              <span className="truncate">{shortDate(photo.date)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#969188]" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#969188]">
              <span>{photo.time || '12:00 PM'}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{ownerProfile.name}</span>
            </div>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {currentIndex !== originIndexRef.current && (
            <button
              onClick={() => goToIndex(originIndexRef.current)}
              className="flex h-10 items-center gap-1.5 rounded-full border border-[#c8a464]/25 bg-[#12141a]/85 px-3 text-xs font-medium text-[#e8e3d9] transition hover:border-[#c8a464]/60"
              aria-label="Return to starting photo"
              title={`Return to photo #${originIndexRef.current + 1}`}
            >
              <Undo2 className="h-3.5 w-3.5 text-[var(--ac)]" />
              <span className="hidden sm:inline">Back to #{originIndexRef.current + 1}</span>
            </button>
          )}

          {onToggleSlideshow && photos.length > 1 && (
            <button
              onClick={onToggleSlideshow}
              className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                slideshowActive
                  ? 'bg-[var(--ac)] text-[#0a0907]'
                  : 'border border-white/10 bg-[#12141a]/85 text-[#e8e3d9] hover:border-[#c8a464]/45'
              }`}
              aria-label={slideshowActive ? 'Pause slideshow' : 'Start slideshow'}
              title="Toggle Slideshow (Space / S)"
            >
              {slideshowActive ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Playing</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Slideshow</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => setHudHidden((v) => !v)}
            className="hidden h-11 w-11 items-center justify-center rounded-full text-neutral-200 transition hover:bg-white/10 sm:flex"
            aria-label="Toggle clean inspection mode"
            title="Toggle HUD"
          >
            <EyeOff className="h-5 w-5" />
          </button>

          <button
            onClick={() => onToggleFav(photo.id)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/10"
            aria-label={photo.fav ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Star
              className={`h-6 w-6 transition ${
                photo.fav ? 'fill-amber-400 text-amber-400' : 'text-white'
              }`}
            />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10"
              aria-label="More options"
            >
              <MoreVertical className="h-6 w-6" />
            </button>

            {showMenu && (
              <div className="absolute top-12 right-0 z-40 w-64 rounded-2xl border border-[#c8a464]/20 bg-[#101218]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowInfo(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <Info className="h-4 w-4 text-neutral-400" />
                  Details &amp; Compression Info
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowInfo(true);
                    void handleAiDescribe();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <Sparkles className="h-4 w-4 text-[var(--ac)]" />
                  Describe with AI
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  onClick={() => {
                    onSetProfileAvatar(activeProfile.id, photo.id);
                    setShowMenu(false);
                    showToastMsg(`Set as ${activeProfile.name}'s profile avatar`);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <UserCheck className="h-4 w-4 text-[var(--ac)]" />
                  Set as Profile Avatar
                </button>
                <button
                  onClick={() => {
                    onSetProfileCover(activeProfile.id, photo.id);
                    setShowMenu(false);
                    showToastMsg(`Set as ${activeProfile.name}'s profile cover`);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <ImageIcon className="h-4 w-4 text-[var(--ac)]" />
                  Set as Profile Cover
                </button>
                <button
                  onClick={() => {
                    onUpdatePhoto(photo.id, { archived: !photo.archived });
                    setShowMenu(false);
                    showToastMsg(photo.archived ? 'Removed from Archive' : 'Moved to Archive');
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <Archive className="h-4 w-4 text-neutral-400" />
                  {photo.archived ? 'Unarchive Photo' : 'Move to Archive'}
                </button>
                <button
                  onClick={() => {
                    onUpdatePhoto(photo.id, { locked: !photo.locked });
                    setShowMenu(false);
                    showToastMsg(photo.locked ? 'Unlocked Photo' : 'Moved to Locked Folder');
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <Lock className="h-4 w-4 text-neutral-400" />
                  {photo.locked ? 'Remove from Locked' : 'Move to Locked'}
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleDownloadOriginal();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <Download className="h-4 w-4 text-neutral-400" />
                  Download Original ({formatBytes(photo.originalSize)})
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setHudHidden((v) => !v);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-neutral-100 hover:bg-white/10"
                >
                  <Eye className="h-4 w-4 text-neutral-400" />
                  {hudHidden ? 'Show Controls' : 'Hide Controls'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area: Viewport + Optional Desktop Side Inspector */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Interactive Zoom/Pan & Swipe Stage */}
        <div
          ref={stageRef}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative flex min-w-0 flex-1 touch-none items-center justify-center overflow-hidden"
        >
          {/* Floating "Back up now" / Compression Pill (from screenshot) */}
          {!hudHidden && (
            <div className="pointer-events-none absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
              <button
                onClick={() => {
                  onToggleBackup(photo.id);
                  showToastMsg(
                    photo.backedUp
                      ? 'Removed from cloud backup'
                      : `Backed up · Compressed ${savingsPct}% (${formatBytes(photo.compressedSize)})`
                  );
                }}
                className="pointer-events-auto inline-flex min-h-[38px] items-center gap-2 rounded-full border border-white/12 bg-[#1e1d1a]/90 px-4 py-1.5 text-sm font-medium text-[#f2d680] shadow-lg backdrop-blur-md transition hover:bg-[#2a2824]"
              >
                {photo.backedUp ? (
                  <>
                    <CloudCheck className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-200">Backed up</span>
                  </>
                ) : (
                  <>
                    <Cloud className="h-4 w-4 text-[#f2d680]" />
                    <span>Back up now</span>
                  </>
                )}
              </button>

              {scale > 1.15 && (
                <span className="font-mono-num rounded-full border border-white/15 bg-black/75 px-3 py-1 text-xs text-neutral-200 backdrop-blur-md">
                  HD Original · {scale.toFixed(1)}×
                </span>
              )}
            </div>
          )}

          {/* Previous photo peek (visible when swiping right at 1x zoom) */}
          {prevPhoto && swipeDx > 4 && scale <= 1.01 && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{
                transform: `translate3d(calc(-100% + ${swipeDx - 16}px), 0, 0)`,
              }}
            >
              <img
                src={prevPhoto.src}
                alt={prevPhoto.name}
                className="max-h-full max-w-full object-contain opacity-95"
                draggable={false}
              />
            </div>
          )}

          {/* Active Photo with Smooth Zoom & Pan */}
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              transform:
                scale > 1.01
                  ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`
                  : `translate3d(${swipeDx}px, 0, 0)`,
              transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              cursor: scale > 1.01 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            }}
          >
            <img
              src={activeImgSrc}
              alt={photo.desc || photo.name}
              className="max-h-full max-w-full object-contain shadow-[0_24px_80px_rgba(0,0,0,0.88)]"
              draggable={false}
            />
          </div>

          {/* Next photo peek (matches screenshot right-edge peek) */}
          {nextPhoto && (swipeDx < -4 || (scale <= 1.01 && !hudHidden)) && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{
                transform:
                  swipeDx < -4
                    ? `translate3d(calc(100% + ${swipeDx + 16}px), 0, 0)`
                    : 'translate3d(calc(100% - 10px), 0, 0)',
                opacity: swipeDx < -4 ? 0.95 : 0.35,
                transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <img
                src={nextPhoto.src}
                alt={nextPhoto.name}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            </div>
          )}

          {/* Prev / Next Navigation Arrows (always visible across all screen sizes when HUD is shown) */}
          {!hudHidden && photos.length > 1 && (
            <>
              {(prevPhoto || slideshowActive) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  className="absolute top-1/2 left-2.5 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/80 sm:left-4 sm:h-12 sm:w-12"
                  aria-label="Previous photo"
                  title="Previous photo (Left Arrow)"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {(nextPhoto || slideshowActive) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  className="absolute top-1/2 right-2.5 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-black/80 sm:right-4 sm:h-12 sm:w-12"
                  aria-label="Next photo"
                  title="Next photo (Right Arrow)"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </>
          )}

          {/* Floating Navigation + Zoom & Pan Control Bar */}
          {!hudHidden && (
            <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 rounded-full border border-[#c8a464]/20 bg-[#0b0d12]/82 px-2 py-1 shadow-2xl backdrop-blur-xl">
              {photos.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    disabled={!prevPhoto && !slideshowActive}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-200 transition hover:bg-white/15 disabled:opacity-35"
                    aria-label="Previous image"
                    title="Previous (Left Arrow)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-mono-num px-1 text-xs font-medium text-neutral-300">
                    {currentIndex + 1}/{photos.length}
                  </span>
                  <button
                    onClick={goNext}
                    disabled={!nextPhoto && !slideshowActive}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-200 transition hover:bg-white/15 disabled:opacity-35"
                    aria-label="Next image"
                    title="Next (Right Arrow)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  {historyStack.length > 1 && (
                    <button
                      onClick={goBackHistory}
                      className="flex h-9 items-center gap-1 rounded-full px-2 text-xs font-medium text-[var(--ac)] transition hover:bg-white/10"
                      aria-label="Go back to previous viewed photo"
                      title="Back to where you were (Backspace / Alt+Left)"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Back</span>
                    </button>
                  )}
                  <span className="h-4 w-px bg-white/15" />
                </>
              )}

              <button
                onClick={() => applyZoom(scale - 0.5)}
                disabled={scale <= MIN_ZOOM}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-200 transition hover:bg-white/15 disabled:opacity-35"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                onClick={scale > 1.05 ? resetZoom : () => applyZoom(2.5)}
                className="font-mono-num min-w-[52px] rounded-full px-2 py-1 text-center text-xs font-medium text-white transition hover:bg-white/10"
                title="Click to toggle 2.5× or reset"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                onClick={() => applyZoom(scale + 0.5)}
                disabled={scale >= MAX_ZOOM}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-200 transition hover:bg-white/15 disabled:opacity-35"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              {scale > 1.05 && (
                <button
                  onClick={resetZoom}
                  className="flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--ac)] transition hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Fit
                </button>
              )}
              <span className="hidden h-4 w-px bg-white/15 sm:inline-block" />
              <span className="font-mono-num hidden px-2 text-[11px] text-neutral-300 sm:inline">
                {photo.width}×{photo.height} · {savingsPct > 0 ? `-${savingsPct}%` : photo.format}
              </span>
            </div>
          )}

          {/* Restore HUD pill when hidden */}
          {hudHidden && (
            <button
              onClick={() => setHudHidden(false)}
              className="absolute right-4 bottom-4 z-20 flex h-10 items-center gap-2 rounded-full bg-black/70 px-3.5 text-xs font-medium text-white backdrop-blur-md hover:bg-black/90"
            >
              <Eye className="h-4 w-4" />
              Show Controls
            </button>
          )}
        </div>

        {/* Responsive Inspector / Details Drawer (Side panel on lg desktop, Bottom sheet on mobile) */}
        {showInfo && (
          <aside
            key={photo.id}
            className="absolute inset-x-0 bottom-0 z-30 max-h-[72vh] overflow-y-auto rounded-t-3xl border-t border-white/12 bg-[var(--bg)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--tx)] shadow-2xl lg:static lg:max-h-none lg:w-[390px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l"
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h4 className="font-display text-lg font-semibold">{longDate(photo.date)}</h4>
                <p className="text-xs text-[var(--tx2)]">
                  {photo.name} · {photo.dsrc}
                </p>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--tx2)] hover:bg-[var(--sf)]"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            {/* Profile & Main Opener Quick Assignment */}
            <div className="mb-4 rounded-2xl bg-[var(--sf)] p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-[var(--tx2)]">
                  User Profile &amp; Main Opener
                </span>
                <span className="text-xs font-medium text-[var(--ac)]">{activeProfile.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onSetProfileAvatar(activeProfile.id, photo.id);
                    showToastMsg(`Updated ${activeProfile.name}'s avatar`);
                  }}
                  className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    isCurrentAvatar
                      ? 'border-[var(--ac)] bg-[var(--acb)] text-[var(--tx)]'
                      : 'border-[var(--ln)]/40 hover:bg-white/5'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  {isCurrentAvatar ? 'Active Avatar' : 'Set as Avatar'}
                </button>
                <button
                  onClick={() => {
                    onSetProfileCover(activeProfile.id, photo.id);
                    showToastMsg(`Updated ${activeProfile.name}'s cover`);
                  }}
                  className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    isCurrentCover
                      ? 'border-[var(--ac)] bg-[var(--acb)] text-[var(--tx)]'
                      : 'border-[var(--ln)]/40 hover:bg-white/5'
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {isCurrentCover ? 'Active Cover' : 'Set as Cover'}
                </button>
              </div>
            </div>

            {/* Resolution & Seamless Compression Telemetry */}
            <div className="mb-4 rounded-2xl bg-[var(--sf)] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--tx2)]">
                  Resolution &amp; Compression
                </span>
                <span className="font-mono-num text-xs font-semibold text-emerald-400">
                  {savingsPct > 0 ? `${savingsPct}% faster load` : 'Lossless'}
                </span>
              </div>
              <div className="font-mono-num grid grid-cols-2 gap-y-1.5 text-xs">
                <span className="text-[var(--tx2)]">Dimensions</span>
                <span className="text-right font-medium">
                  {photo.width} × {photo.height} ({megapixels} MP)
                </span>
                <span className="text-[var(--tx2)]">Original File</span>
                <span className="text-right">
                  {formatBytes(photo.originalSize)} ({photo.format})
                </span>
                <span className="text-[var(--tx2)]">Compressed Display</span>
                <span className="text-right text-[var(--ac)]">
                  {formatBytes(photo.compressedSize)} ({photo.compressedFormat})
                </span>
                <span className="text-[var(--tx2)]">Encode Latency</span>
                <span className="text-right">{photo.compressionMs} ms</span>
              </div>
            </div>

            {/* Preserved Original File & EXIF/XMP Metadata */}
            <div className="mb-4 rounded-2xl bg-[var(--sf)] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--tx2)]">
                  Original File Metadata
                </span>
                <span className="text-[11px] font-medium text-emerald-400">
                  Original preserved
                </span>
              </div>
              <div className="font-mono-num space-y-1 text-xs text-[var(--tx)]">
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--tx2)]">File</span>
                  <span className="truncate text-right">
                    {photo.exif?.originalFileName || photo.name}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--tx2)]">Date Source</span>
                  <span className="text-right">{photo.dsrc}</span>
                </div>
                {photo.exif?.dateTimeOriginal && (
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--tx2)]">EXIF Captured</span>
                    <span className="text-right">
                      {photo.exif.dateTimeOriginal}
                      {photo.exif.subSec ? `.${photo.exif.subSec}` : ''}
                    </span>
                  </div>
                )}
                {(photo.lastModified || photo.exif?.originalLastModified) && (
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--tx2)]">File Modified</span>
                    <span className="text-right">
                      {new Date(
                        photo.lastModified || photo.exif?.originalLastModified || photo.ts
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {photo.exif && (photo.exif.make || photo.exif.model || photo.exif.iso || photo.exif.aperture) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--ln)]/20 pt-1.5">
                    {photo.exif.model && (
                      <span>
                        {photo.exif.make ? `${photo.exif.make} ` : ''}
                        {photo.exif.model}
                      </span>
                    )}
                    {photo.exif.lens && <span>· {photo.exif.lens}</span>}
                    {photo.exif.focalLength && <span>· {photo.exif.focalLength}</span>}
                    {photo.exif.aperture && <span>· {photo.exif.aperture}</span>}
                    {photo.exif.shutter && <span>· {photo.exif.shutter}</span>}
                    {photo.exif.iso && <span>· ISO {photo.exif.iso}</span>}
                  </div>
                )}
                {photo.exif?.lat !== undefined && photo.exif?.lng !== undefined && (
                  <div className="flex justify-between gap-2 pt-1 text-[var(--ac)]">
                    <span className="text-[var(--tx2)]">GPS</span>
                    <span>
                      {photo.exif.lat}, {photo.exif.lng}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Editable Date, Time, Place, Folder */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={photo.date}
                  onChange={(e) => e.target.value && onUpdateDateTime(photo.id, e.target.value)}
                  className="rounded-xl border border-[var(--ln)]/50 bg-[var(--sf)] px-3 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
                />
                <input
                  type="time"
                  value={photo.ts ? new Date(photo.ts).toTimeString().slice(0, 5) : '12:00'}
                  onChange={(e) => e.target.value && onUpdateDateTime(photo.id, undefined, e.target.value)}
                  className="rounded-xl border border-[var(--ln)]/50 bg-[var(--sf)] px-3 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
                />
              </div>

              <input
                type="text"
                placeholder="Add place or city..."
                defaultValue={photo.place || ''}
                onBlur={(e) => onUpdatePhoto(photo.id, { place: e.target.value.trim() })}
                className="w-full rounded-xl border border-[var(--ln)]/50 bg-[var(--sf)] px-3 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
              />

              <input
                type="text"
                list="bw-folder-list"
                placeholder="Folder name"
                defaultValue={photo.folder}
                onBlur={(e) => onUpdatePhoto(photo.id, { folder: e.target.value.trim() || 'Camera' })}
                className="w-full rounded-xl border border-[var(--ln)]/50 bg-[var(--sf)] px-3 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
              />
              <datalist id="bw-folder-list">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>

            {/* Interactive Tags */}
            <div className="mt-4">
              {(photo.preTags?.length || photo.ai) && (
                <div className="mb-1.5 text-[11px] text-[var(--tx2)]">
                  {photo.preTags?.length ? `Local pre-tags: ${photo.preTags.join(', ')}` : ''}
                  {photo.preTags?.length && photo.ai ? ' · ' : ''}
                  {photo.ai ? 'Gemini vision analyzed' : ''}
                </div>
              )}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {photo.tags.slice(0, 14).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setShowInfo(false);
                      onClose();
                      onSearchTag(tag);
                    }}
                    className="rounded-full border border-[var(--ln)]/50 px-2.5 py-1 text-xs text-[var(--tx2)] transition hover:border-[var(--ac)] hover:text-[var(--tx)]"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = tagDraft.trim().toLowerCase();
                  if (clean && !photo.tags.includes(clean)) {
                    onUpdatePhoto(photo.id, { tags: [...photo.tags, clean] });
                  }
                  setTagDraft('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="Add tag..."
                  className="min-w-0 flex-1 rounded-xl border border-[var(--ln)]/50 bg-[var(--sf)] px-3 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--acb)] px-3.5 py-2 text-xs font-medium text-[var(--tx)]"
                >
                  Add
                </button>
              </form>
            </div>

            {/* AI Caption Box */}
            <div className="mt-4 rounded-2xl bg-[var(--sf)] p-3.5 text-sm leading-relaxed">
              {photo.desc ? (
                <p className="m-0 text-[var(--tx)]">{photo.desc}</p>
              ) : (
                <button
                  onClick={() => void handleAiDescribe()}
                  disabled={aiBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--acb)] px-3.5 py-1.5 text-xs font-medium text-[var(--tx)]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[var(--ac)]" />
                  {aiBusy ? 'Generating caption...' : 'Describe with AI'}
                </button>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* "Add to" Quick Popover (Folder / Profile Avatar / Profile Cover) */}
      {showAddTo && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto w-[min(420px,calc(100%-24px))] rounded-2xl border border-[#c8a464]/20 bg-[#101218]/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Add or Assign Photo</span>
            <button
              onClick={() => setShowAddTo(false)}
              className="text-xs text-neutral-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onSetProfileAvatar(activeProfile.id, photo.id);
                setShowAddTo(false);
                showToastMsg(`Set as ${activeProfile.name}'s Avatar`);
              }}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-medium text-white hover:bg-white/15"
            >
              <UserCheck className="h-4 w-4 text-[var(--ac)]" />
              Profile Avatar
            </button>
            <button
              onClick={() => {
                onSetProfileCover(activeProfile.id, photo.id);
                setShowAddTo(false);
                showToastMsg(`Set as ${activeProfile.name}'s Cover`);
              }}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-medium text-white hover:bg-white/15"
            >
              <ImageIcon className="h-4 w-4 text-[var(--ac)]" />
              Profile Cover
            </button>
          </div>

          <div className="mb-2 text-xs text-neutral-400">Move to Folder</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {folders.map((f) => (
              <button
                key={f}
                onClick={() => {
                  onUpdatePhoto(photo.id, { folder: f });
                  setShowAddTo(false);
                  showToastMsg(`Moved to ${f}`);
                }}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  photo.folder === f
                    ? 'bg-[var(--ac)] font-medium text-slate-950'
                    : 'border border-white/15 text-neutral-200 hover:bg-white/10'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = newFolderDraft.trim();
              if (!clean) return;
              onUpdatePhoto(photo.id, { folder: clean });
              setNewFolderDraft('');
              setShowAddTo(false);
              showToastMsg(`Moved to ${clean}`);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newFolderDraft}
              onChange={(e) => setNewFolderDraft(e.target.value)}
              placeholder="New folder name..."
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-[var(--ac)] px-3 py-2 text-xs font-semibold text-slate-950"
            >
              Move
            </button>
          </form>
        </div>
      )}

      {/* Bottom Action Bar */}
      <footer
        className={`relative z-20 border-t border-[#c8a464]/15 bg-[#090b10]/82 px-2 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl transition-opacity duration-200 ${
          hudHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          <button
            onClick={() => void handleShare()}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-neutral-200 transition hover:bg-white/10"
          >
            <Share2 className="h-5 w-5" />
            <span className="text-xs">Share</span>
          </button>

          <button
            onClick={() => onOpenEditor(photo)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-neutral-200 transition hover:bg-white/10"
          >
            <SlidersHorizontal className="h-5 w-5" />
            <span className="text-xs">Edit</span>
          </button>

          <button
            onClick={() => setShowAddTo((v) => !v)}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl transition hover:bg-white/10 ${
              showAddTo ? 'text-[var(--ac)]' : 'text-neutral-200'
            }`}
          >
            <FolderPlus className="h-5 w-5" />
            <span className="text-xs">Add to</span>
          </button>

          <button
            onClick={() => onToggleTrash(photo.id)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-neutral-200 transition hover:bg-white/10"
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-xs">{photo.del ? 'Restore' : 'Trash'}</span>
          </button>
        </div>
      </footer>

      {/* Subtle Transient Feedback Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-[#1f2024]/95 px-4 py-2 text-xs font-medium text-white shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}
    </div>
  );
}
