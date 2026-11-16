import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import {
  Archive,
  ArrowLeft,
  Check,
  Clock,
  Download,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  ListPlus,
  Lock,
  Mic,
  Monitor,
  MoreVertical,
  Play,
  PlayCircle,
  Plus,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  CompressionPreset,
  DynamicAlbum,
  EditState,
  PhotoItem,
  SearchResult,
  UserProfile,
  ViewMode,
} from './types/gallery';
import {
  blobToDataUrl,
  compressImagePipeline,
  computeColorTags,
  computeDHash,
  dayLabel,
  extractExifAndDate,
  folderFromFile,
  formatBytes,
  formatCount,
  formatIsoDate,
  generateStarterLibrary,
  longDate,
  MONTHS,
} from './utils/compression';
import {
  loadPhotosFromDb,
  loadProfilesFromDb,
  loadSettings,
  savePhotosToDb,
  saveProfilesToDb,
  saveSettings,
} from './utils/storage';
import { applyThemeVars } from './utils/themes';
import { PhotoOpener } from './components/PhotoOpener';
import { UserProfilesView } from './components/UserProfilesView';
import { PhotoEditor } from './components/PhotoEditor';
import { ImportModal } from './components/ImportModal';
import { CollectionsPanel, type PanelTab } from './components/CollectionsPanel';
import { ReelOverlay } from './components/ReelOverlay';
import { AddFolderModal } from './components/AddFolderModal';
import { WindowsOpenerModal } from './components/WindowsOpenerModal';
import { MemoriesCarousel } from './components/MemoriesCarousel';
import { RainBackdrop } from './components/RainBackdrop';
import {
  AddToAlbumModal,
  buildPhotoCollageBlob,
  CreateFromSelectionModal,
} from './components/SelectionModals';
import {
  useOnlineStatus,
  usePWAInstall,
  useWindowsFileOpener,
} from './hooks/usePWAInstall';
import { matchAlbumQuery } from './utils/smartAlbums';
import { runLocalPreTaggingInWorker } from './utils/backgroundAnalyzer';

const STOP_WORDS = new Set(
  'photos photo pictures picture of my the from in a an with show me all at on and to did i take where when what which how many'.split(
    ' '
  )
);
const SYNONYMS: Record<string, string> = {
  sea: 'beach',
  lunch: 'food',
  cat: 'pet',
  puppy: 'dog',
  dogs: 'dog',
  birthday: 'party',
  flower: 'flowers',
  snowy: 'snow',
  sunsets: 'sunset',
  favorites: 'fav',
  favorite: 'fav',
  favourites: 'fav',
  favourite: 'fav',
  screenshot: 'screenshots',
};

export default function App() {
  const initialSettings = useMemo(() => loadSettings(), []);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initialSettings.activeProfileId || 'profile-1'
  );
  const [hydrated, setHydrated] = useState(false);

  const [view, setView] = useState<ViewMode>('photos');
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [profileFilterId, setProfileFilterId] = useState<string | null>(null);

  const [albums, setAlbums] = useState<DynamicAlbum[]>(initialSettings.albums || []);
  const [customFolders, setCustomFolders] = useState<string[]>(
    initialSettings.customFolders || []
  );

  // Search & AI state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [aiStatusMsg, setAiStatusMsg] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);

  // Selection mode & Locked collection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [addToAlbumOpen, setAddToAlbumOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingCollage, setCreatingCollage] = useState(false);
  const [sectionMenuKey, setSectionMenuKey] = useState<string | null>(null);
  const [lockedUnlocked, setLockedUnlocked] = useState(false);
  const [lockedPinInput, setLockedPinInput] = useState('');
  const [lockedPinError, setLockedPinError] = useState<string | null>(null);

  // Menus & Modals
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [windowsModalOpen, setWindowsModalOpen] = useState(false);
  const [importPresetDefaults, setImportPresetDefaults] = useState<{
    profileId: string;
    target: 'gallery' | 'avatar' | 'cover';
    preset: CompressionPreset;
    folderOverride?: string;
  }>({ profileId: 'profile-1', target: 'gallery', preset: 'balanced' });
  const [panelTab, setPanelTab] = useState<PanelTab>(null);
  const [reelState, setReelState] = useState<{ photos: PhotoItem[]; title?: string } | null>(null);

  const { isInstallable, isInstalled, install } = usePWAInstall();
  const isOnline = useOnlineStatus();

  // Main Photo Opener & Editor state
  const [openerState, setOpenerState] = useState<{
    listIds: number[];
    index: number;
  } | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<PhotoItem | null>(null);
  const [slideshowActive, setSlideshowActive] = useState(false);

  // Upload Status Banner
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const nextIdRef = useRef<number>(10);
  const openerReturnScrollRef = useRef<number>(0);
  const bgWorkerDoneIdsRef = useRef<Set<number>>(new Set());
  const bgGeminiDoneIdsRef = useRef<Set<number>>(new Set());
  const bgWorkerRunningRef = useRef<boolean>(false);
  const unmountedRef = useRef<boolean>(false);
  const [bgWorkerTick, setBgWorkerTick] = useState(0);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [coverDismissed, setCoverDismissed] = useState<boolean>(
    () => localStorage.getItem('symphony8-cover-dismissed') === '1'
  );

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Apply fixed Windows 11 dark theme variables
  useEffect(() => {
    applyThemeVars('dark', null);
  }, []);

  // Check backend AI availability
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { aiAvailable?: boolean }) => setAiAvailable(Boolean(d.aiAvailable)))
      .catch(() => setAiAvailable(false));
  }, []);

  // Hydrate IndexedDB photos and profiles on mount
  useEffect(() => {
    let active = true;
    (async () => {
      const [storedPhotos, storedProfiles] = await Promise.all([
        loadPhotosFromDb(),
        loadProfilesFromDb(),
      ]);
      if (!active) return;

      if (storedPhotos.length > 0 && storedProfiles.length > 0) {
        const maxId = storedPhotos.reduce((m, p) => Math.max(m, p.id), 1);
        nextIdRef.current = maxId + 1;
        setPhotos(storedPhotos);
        setProfiles(storedProfiles);
      } else {
        const starter = await generateStarterLibrary();
        if (!active) return;
        nextIdRef.current = 100;
        setPhotos(starter.photos);
        setProfiles(starter.profiles);
        await Promise.all([
          savePhotosToDb(starter.photos),
          saveProfilesToDb(starter.profiles),
        ]);
      }

      setHydrated(true);
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist photos with debounce
  useEffect(() => {
    if (!hydrated) return;
    const t = window.setTimeout(() => {
      void savePhotosToDb(photos);
    }, 300);
    return () => window.clearTimeout(t);
  }, [photos, hydrated]);

  // Persist profiles
  useEffect(() => {
    if (!hydrated) return;
    void saveProfilesToDb(profiles);
  }, [profiles, hydrated]);

  // Persist user library data
  useEffect(() => {
    saveSettings({
      albums,
      customFolders,
      activeProfileId,
    });
  }, [albums, customFolders, activeProfileId]);

  // Backfill perceptual dHash for any photos missing it so similar-photo stacking works across all items
  useEffect(() => {
    if (!hydrated) return;
    const missing = photos.filter((p) => !p.del && !p.dHash);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates = new Map<number, string>();
      for (const p of missing.slice(0, 24)) {
        const h = await computeDHash(p.thumbSrc || p.src);
        if (cancelled) return;
        if (h) updates.set(p.id, h);
      }
      if (updates.size > 0 && !cancelled) {
        setPhotos((prev) =>
          prev.map((item) => (updates.has(item.id) ? { ...item, dHash: updates.get(item.id) } : item))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, photos]);

  // Automatic Background Worker:
  // Triggers on app open (post-hydration) and on newly imported photos:
  // 1) Runs local browser-based object detection inside a dedicated Web Worker to attach preTags
  // 2) Runs full Gemini vision analysis using those preTags before saving final tags & captions
  useEffect(() => {
    if (!hydrated || bgWorkerRunningRef.current) return;

    const pending = photos
      .filter((p) => {
        if (p.del) return false;
        const needsWorker = !p.preTagged && !bgWorkerDoneIdsRef.current.has(p.id);
        const needsGemini = aiAvailable && !p.ai && !bgGeminiDoneIdsRef.current.has(p.id);
        return needsWorker || needsGemini;
      })
      .sort((a, b) => {
        const aUpload = a.dsrc === 'upload' ? 1 : 0;
        const bUpload = b.dsrc === 'upload' ? 1 : 0;
        if (aUpload !== bUpload) return bUpload - aUpload;
        return (b.ts || 0) - (a.ts || 0);
      });

    if (pending.length === 0) return;

    bgWorkerRunningRef.current = true;

    (async () => {
      try {
        for (const target of pending) {
          if (unmountedRef.current) break;

          // Stage 1: Off-thread browser object detection pre-tags
          let detectedPreTags = target.preTags || [];
          if (!target.preTagged && !bgWorkerDoneIdsRef.current.has(target.id)) {
            bgWorkerDoneIdsRef.current.add(target.id);
            detectedPreTags = await runLocalPreTaggingInWorker(target);
            if (unmountedRef.current) break;
            setPhotos((prev) =>
              prev.map((item) =>
                item.id === target.id
                  ? {
                      ...item,
                      preTags: detectedPreTags,
                      preTagged: true,
                      tags: Array.from(new Set([...item.tags, ...detectedPreTags])),
                    }
                  : item
              )
            );
          }

          // Stage 2: Full Gemini analysis informed by local pre-tags
          if (aiAvailable && !target.ai && !bgGeminiDoneIdsRef.current.has(target.id)) {
            bgGeminiDoneIdsRef.current.add(target.id);
            try {
              const cTags = await computeColorTags(
                target.thumbSrc || target.src,
                target.a
              );
              const imageDataUrl = await blobToDataUrl(target.blob, 768);
              if (unmountedRef.current) break;
              const resp = await fetch('/api/ai/analyze-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  imageDataUrl,
                  preTags: detectedPreTags,
                }),
              });
              if (resp.ok && !unmountedRef.current) {
                const data = (await resp.json()) as { tags?: string[]; caption?: string };
                const aiTags = data.tags || [];
                setPhotos((prev) =>
                  prev.map((item) =>
                    item.id === target.id
                      ? {
                          ...item,
                          tags: Array.from(
                            new Set([
                              ...item.tags,
                              ...detectedPreTags,
                              ...cTags,
                              ...aiTags,
                            ])
                          ),
                          desc: item.desc || data.caption || item.desc,
                          ai: true,
                        }
                      : item
                  )
                );
              }
            } catch {
              // Keep pre-tags if network/AI request fails
            }
          }

          await new Promise((r) => window.setTimeout(r, 120));
        }
      } finally {
        bgWorkerRunningRef.current = false;
        if (!unmountedRef.current) {
          setBgWorkerTick((t) => t + 1);
        }
      }
    })();
  }, [aiAvailable, bgWorkerTick, hydrated, photos]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );

  const livePhotos = useMemo(() => photos.filter((p) => !p.del), [photos]);

  const newestSort = useCallback(
    (a: PhotoItem, b: PhotoItem) =>
      (b.ts || b.lastModified || 0) - (a.ts || a.lastModified || 0) ||
      b.date.localeCompare(a.date) ||
      b.id - a.id,
    []
  );

  const folderSummaries = useMemo(() => {
    const map: Record<string, { name: string; items: PhotoItem[]; size: number }> = {};
    for (const folderName of customFolders) {
      if (folderName && !map[folderName]) {
        map[folderName] = { name: folderName, items: [], size: 0 };
      }
    }
    for (const p of livePhotos) {
      if (!map[p.folder]) map[p.folder] = { name: p.folder, items: [], size: 0 };
      map[p.folder].items.push(p);
      map[p.folder].size += p.originalSize || 0;
    }
    const list = Object.values(map);
    list.forEach((f) => f.items.sort(newestSort));
    const latestTs = (f: { name: string; items: PhotoItem[] }) =>
      f.items[0] ? f.items[0].ts || f.items[0].lastModified || 0 : 0;
    return list.sort((a, b) => latestTs(b) - latestTs(a) || a.name.localeCompare(b.name));
  }, [customFolders, livePhotos, newestSort]);

  const folderNames = useMemo(
    () =>
      Array.from(
        new Set([
          'Camera',
          'Screenshots',
          'Downloads',
          'Pins',
          ...customFolders,
          ...folderSummaries.map((f) => f.name),
        ])
      ),
    [customFolders, folderSummaries]
  );

  // Smart tag chips
  const smartTags = useMemo(() => {
    const counts: Record<string, number> = {};
    const skip = new Set(['upload', 'landscape', 'portrait', 'square', ...MONTHS]);
    for (const p of livePhotos) {
      for (const t of p.tags) {
        if (!skip.has(t) && !/^\d{4}$/.test(t) && t !== p.folder.toLowerCase()) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [livePhotos]);

  // High-Resolution Upload + Seamless Compression Pipeline
  const handleImportFiles = useCallback(
    async (
      files: File[],
      options?: {
        folderOverride?: string;
        profileId?: string;
        target?: 'gallery' | 'avatar' | 'cover';
        preset?: CompressionPreset;
        openImmediately?: boolean;
      }
    ) => {
      const targetProfileId = options?.profileId || activeProfileId;
      const preset =
        options?.preset ||
        profiles.find((p) => p.id === targetProfileId)?.compressionPreset ||
        'balanced';
      const targetRole = options?.target || 'gallery';

      const validFiles = files.filter(
        (f) =>
          /^image\//i.test(f.type) ||
          /\.(jpe?g|png|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i.test(f.name)
      );
      if (!validFiles.length) return;

      setUploadStatus(
        `Compressing ${validFiles.length} high-res ${validFiles.length === 1 ? 'photo' : 'photos'} (${preset})...`
      );

      let totalOrig = 0;
      let totalComp = 0;
      const importedIds: number[] = [];
      const createdItems: PhotoItem[] = [];

      for (const file of validFiles) {
        const [{ date, source, exif }, comp] = await Promise.all([
          extractExifAndDate(file),
          compressImagePipeline(file, preset, file.name),
        ]);

        const id = nextIdRef.current++;
        importedIds.push(id);
        totalOrig += comp.originalSize;
        totalComp += comp.compressedSize;

        const folder = options?.folderOverride || folderFromFile(file);
        const origSrc = URL.createObjectURL(comp.origBlob);
        const src = URL.createObjectURL(comp.displayBlob);
        const thumbSrc = URL.createObjectURL(comp.thumbBlob);
        const [colorTags, dHash] = await Promise.all([
          computeColorTags(thumbSrc, comp.aspectRatio),
          computeDHash(thumbSrc),
        ]);

        const newPhoto: PhotoItem = {
          id,
          profileId: targetProfileId,
          name: file.name,
          folder,
          date: formatIsoDate(date),
          time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          ts: date.getTime(),
          lastModified: file.lastModified || date.getTime(),
          dsrc: source,
          place: '',
          fav: false,
          del: false,
          backedUp: false,
          a: Math.max(0.5, Math.min(2.2, comp.aspectRatio)),
          width: comp.width,
          height: comp.height,
          originalSize: comp.originalSize,
          compressedSize: comp.compressedSize,
          compressionRatio: comp.compressionRatio,
          compressionMs: comp.compressionMs,
          compressionPreset: preset,
          format: comp.format,
          compressedFormat: comp.compressedFormat,
          src,
          thumbSrc,
          origSrc,
          ob: comp.origBlob,
          blob: comp.displayBlob,
          thumbBlob: comp.thumbBlob,
          tags: Array.from(
            new Set([
              'upload',
              folder.toLowerCase(),
              MONTHS[date.getMonth()],
              String(date.getFullYear()),
              ...colorTags,
            ])
          ),
          dHash: dHash || undefined,
          exif,
        };

        createdItems.push(newPhoto);
        setPhotos((prev) => [newPhoto, ...prev]);
      }

      if (importedIds.length > 0 && targetRole !== 'gallery') {
        const firstId = importedIds[0];
        setProfiles((prev) =>
          prev.map((prof) =>
            prof.id === targetProfileId
              ? {
                  ...prof,
                  ...(targetRole === 'avatar' ? { avatarPhotoId: firstId } : {}),
                  ...(targetRole === 'cover' ? { coverPhotoId: firstId } : {}),
                }
              : prof
          )
        );
      }

      if (options?.openImmediately && createdItems.length > 0) {
        setSlideshowActive(false);
        setOpenerState({
          listIds: createdItems.map((c) => c.id),
          index: 0,
        });
      }

      const pct = totalOrig > 0 ? Math.round((1 - totalComp / totalOrig) * 100) : 0;
      setUploadStatus(
        `Uploaded ${validFiles.length} high-res · ${formatBytes(totalOrig)} → ${formatBytes(totalComp)} (${pct}% saved)`
      );
      window.setTimeout(() => setUploadStatus(null), 4200);
    },
    [activeProfileId, aiAvailable, profiles]
  );

  // Windows 11 PWA File Handler launchQueue consumer
  useWindowsFileOpener(
    useCallback(
      (files: File[]) => {
        void handleImportFiles(files, { openImmediately: true });
      },
      [handleImportFiles]
    )
  );

  // Global drag-and-drop & paste support
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []).filter((f) => /^image\//i.test(f.type));
      if (files.length) void handleImportFiles(files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => /^image\//i.test(f.type));
      if (files.length) void handleImportFiles(files);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [handleImportFiles]);

  // Local + Gemini AI search
  const localSearch = useCallback(
    (q: string) => {
      const words = (q.toLowerCase().match(/[a-z0-9]+/g) || [])
        .filter((x) => !STOP_WORDS.has(x))
        .map((x) => SYNONYMS[x] || x);
      if (!words.length) return livePhotos;
      return livePhotos.filter((p) =>
        words.every((w) =>
          w === 'fav'
            ? p.fav
            : p.tags.some((t) => t === w || (w.length > 3 && t.startsWith(w))) ||
              (p.place || '').toLowerCase().includes(w) ||
              p.folder.toLowerCase().includes(w) ||
              p.name.toLowerCase().includes(w)
        )
      );
    },
    [livePhotos]
  );

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      setView('photos');
      if (!q) {
        setSearchResult(null);
        return;
      }

      setAiStatusMsg('Thinking...');
      if (aiAvailable && livePhotos.length > 0) {
        try {
          const availableTags = Array.from(new Set(livePhotos.flatMap((p) => p.tags)));
          const catalog = livePhotos.map((p) => ({
            id: p.id,
            date: p.date,
            folder: p.folder,
            place: p.place,
            fav: p.fav,
            tags: p.tags,
          }));
          const resp = await fetch('/api/ai/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, catalog, availableTags }),
          });
          if (resp.ok) {
            const data = (await resp.json()) as {
              matchedIds?: number[];
              tags?: string[];
              place?: string;
              from?: string;
              to?: string;
              favorites?: boolean;
              answer?: string;
            };
            const matchedSet = new Set(data.matchedIds || []);
            if (matchedSet.size > 0 || data.answer) {
              const label =
                [
                  ...(data.tags || []),
                  data.place,
                  data.from || data.to ? `${data.from || '…'} → ${data.to || '…'}` : '',
                  data.favorites ? 'favourites' : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || q;

              setSearchResult({
                q,
                label,
                ids: matchedSet.size > 0 ? matchedSet : new Set(localSearch(q).map((p) => p.id)),
                ans: data.answer || '',
                ai: true,
              });
              setAiStatusMsg(null);
              return;
            }
          }
        } catch {
          // fallback to local search
        }
      }

      const localMatches = localSearch(q);
      setSearchResult({
        q,
        label: q,
        ids: new Set(localMatches.map((p) => p.id)),
        ans: '',
        ai: false,
      });
      setAiStatusMsg(null);
    },
    [aiAvailable, livePhotos, localSearch]
  );

  // Batch AI library analysis (local worker pre-tags + Gemini deep enrichment)
  const analyzeLibrary = async () => {
    const targets = livePhotos.filter((p) => !p.ai || !p.preTagged);
    if (!targets.length) {
      setAiStatusMsg('All photos are already analyzed.');
      window.setTimeout(() => setAiStatusMsg(null), 2500);
      return;
    }
    let count = 0;
    for (const p of targets) {
      setAiStatusMsg(`Analyzing ${++count}/${targets.length}...`);
      const workerTags = p.preTagged ? p.preTags || [] : await runLocalPreTaggingInWorker(p);
      const cTags = await computeColorTags(p.thumbSrc || p.src, p.a);
      let aiTags: string[] = [];
      let caption = p.desc;

      if (aiAvailable) {
        try {
          const imageDataUrl = await blobToDataUrl(p.blob, 768);
          const resp = await fetch('/api/ai/analyze-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageDataUrl, preTags: workerTags }),
          });
          if (resp.ok) {
            const j = (await resp.json()) as { tags?: string[]; caption?: string };
            aiTags = j.tags || [];
            if (!caption && j.caption) caption = j.caption;
          }
        } catch {
          // keep local worker & color tags
        }
      }

      setPhotos((prev) =>
        prev.map((item) =>
          item.id === p.id
            ? {
                ...item,
                preTags: workerTags,
                preTagged: true,
                tags: Array.from(new Set([...item.tags, ...workerTags, ...cTags, ...aiTags])),
                desc: caption,
                ai: true,
              }
            : item
        )
      );
    }
    setAiStatusMsg(null);
  };

  // Duplicate photo scanner (dHash)
  const findDuplicates = async () => {
    setView('photos');
    setAiStatusMsg('Scanning for visual duplicates...');
    const hashes: string[] = [];
    for (const p of livePhotos) {
      hashes.push(await computeDHash(p.thumbSrc || p.src));
    }
    const dupIds = new Set<number>();
    for (let i = 0; i < livePhotos.length; i++) {
      for (let j = i + 1; j < livePhotos.length; j++) {
        if (!hashes[i] || !hashes[j]) continue;
        let diff = 0;
        for (let k = 0; k < 64; k++) {
          if (hashes[i][k] !== hashes[j][k]) diff++;
        }
        if (diff <= 4) {
          dupIds.add(livePhotos[i].id);
          dupIds.add(livePhotos[j].id);
        }
      }
    }
    setAiStatusMsg(null);
    setSearchResult({
      q: '',
      label: 'Possible duplicates',
      ids: dupIds,
      ans: dupIds.size
        ? `Found ${dupIds.size} photos that look visually similar. Open one and tap Trash to remove extras.`
        : 'No duplicates found — your library is clean.',
      ai: false,
    });
  };

  // Filtered photo list for active timeline view
  const displayedPhotos = useMemo(() => {
    let base =
      view === 'trash'
        ? photos.filter((p) => p.del)
        : view === 'archive'
          ? livePhotos.filter((p) => p.archived && !p.locked)
          : view === 'locked'
            ? lockedUnlocked
              ? livePhotos.filter((p) => p.locked)
              : []
            : view === 'videos'
              ? livePhotos.filter(
                  (p) =>
                    !p.locked &&
                    (/gif|video|mp4|webm|mov/i.test(p.format || '') ||
                      p.tags.includes('video'))
                )
              : view === 'recent'
                ? livePhotos.filter((p) => !p.locked && !p.archived)
                : view === 'favs'
                  ? livePhotos.filter((p) => p.fav && !p.locked)
                  : view === 'folder'
                    ? livePhotos.filter((p) => p.folder === currentFolder && !p.locked)
                    : livePhotos.filter((p) => !p.archived && !p.locked);

    if (profileFilterId && view === 'photos') {
      base = base.filter((p) => p.profileId === profileFilterId);
    }
    if (searchResult) {
      base = base.filter((p) => searchResult.ids.has(p.id));
    }

    return [...base].sort(newestSort);
  }, [currentFolder, livePhotos, lockedUnlocked, newestSort, photos, profileFilterId, searchResult, view]);

  // Group displayed photos by day (newest first)
  const groupedTimeline = useMemo(() => {
    const groups: Record<string, PhotoItem[]> = {};
    for (const p of displayedPhotos) {
      const key = p.date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [displayedPhotos]);

  // Open photo in Main Photo Opener
  const openInMainOpener = useCallback((list: PhotoItem[], index: number) => {
    if (!list.length || index < 0 || index >= list.length) return;
    openerReturnScrollRef.current = window.scrollY;
    setOpenerState({
      listIds: list.map((p) => p.id),
      index,
    });
  }, []);

  const startSlideshow = useCallback(() => {
    const arr = displayedPhotos.length ? displayedPhotos : livePhotos;
    if (!arr.length) {
      setImportOpen(true);
      return;
    }
    setSlideshowActive(true);
    openInMainOpener(arr, 0);
  }, [displayedPhotos, livePhotos, openInMainOpener]);

  // Windows PC desktop keyboard shortcut ('S' starts slideshow from gallery)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (openerState || editingPhoto || addFolderOpen || windowsModalOpen || importOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        startSlideshow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addFolderOpen, editingPhoto, importOpen, openerState, startSlideshow, windowsModalOpen]);

  const openerPhotos = useMemo(() => {
    if (!openerState) return [];
    const byId = new Map(photos.map((p) => [p.id, p]));
    return openerState.listIds.map((id) => byId.get(id)).filter((p): p is PhotoItem => Boolean(p));
  }, [openerState, photos]);

  // Slideshow timer when active inside Photo Opener
  useEffect(() => {
    if (!slideshowActive || !openerState || openerPhotos.length <= 1) return;
    const t = window.setInterval(() => {
      setOpenerState((prev) =>
        prev ? { ...prev, index: (prev.index + 1) % openerPhotos.length } : null
      );
    }, 3500);
    return () => window.clearInterval(t);
  }, [openerPhotos.length, openerState, slideshowActive]);

  // Gallery zoom/touch handlers removed with layout settings

  // Photo mutations
  const toggleFav = (photoId: number) =>
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, fav: !p.fav } : p)));

  const toggleTrash = (photoId: number) => {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, del: !p.del } : p)));
    if (openerState) {
      const remaining = openerState.listIds.filter((id) => id !== photoId);
      if (remaining.length === 0) {
        setOpenerState(null);
      } else {
        setOpenerState({
          listIds: remaining,
          index: Math.min(openerState.index, remaining.length - 1),
        });
      }
    }
  };

  const toggleBackup = (photoId: number) =>
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, backedUp: !p.backedUp } : p))
    );

  const updatePhoto = (photoId: number, patch: Partial<PhotoItem>) =>
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p)));

  const updatePhotoDateTime = (photoId: number, newDate?: string, newTime?: string) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photoId) return p;
        const d = new Date(p.ts || new Date(`${p.date}T12:00:00`).getTime());
        if (newDate) {
          const [y, m, day] = newDate.split('-').map(Number);
          d.setFullYear(y, m - 1, day);
        }
        if (newTime) {
          const [hh, mm] = newTime.split(':').map(Number);
          d.setHours(hh, mm, 0, 0);
        }
        return {
          ...p,
          ts: d.getTime(),
          date: formatIsoDate(d),
          time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          dsrc: 'your edit',
        };
      })
    );
  };

  const handleDescribePhotoWithAi = async (photo: PhotoItem) => {
    let caption = `A ${photo.tags[1] || 'high-resolution'} photograph captured on ${longDate(photo.date)}.`;
    if (aiAvailable) {
      try {
        const imageDataUrl = await blobToDataUrl(photo.blob, 900);
        const resp = await fetch('/api/ai/describe-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl,
            date: longDate(photo.date),
            place: photo.place,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { description?: string };
          if (data.description) caption = data.description;
        }
      } catch {
        // fallback to default caption
      }
    }
    updatePhoto(photo.id, { desc: caption });
  };

  const handleSaveEditedPhoto = async (
    photo: PhotoItem,
    editedBlob: Blob,
    editState: EditState,
    asCopy: boolean
  ) => {
    const comp = await compressImagePipeline(
      editedBlob,
      activeProfile?.compressionPreset || 'balanced',
      photo.name
    );
    const origSrc = URL.createObjectURL(comp.origBlob);
    const src = URL.createObjectURL(comp.displayBlob);
    const thumbSrc = URL.createObjectURL(comp.thumbBlob);

    if (asCopy) {
      const id = nextIdRef.current++;
      const copyItem: PhotoItem = {
        ...photo,
        id,
        fav: false,
        E: undefined,
        ob: comp.origBlob,
        blob: comp.displayBlob,
        thumbBlob: comp.thumbBlob,
        origSrc,
        src,
        thumbSrc,
        width: comp.width,
        height: comp.height,
        a: comp.aspectRatio,
        originalSize: comp.originalSize,
        compressedSize: comp.compressedSize,
        compressionRatio: comp.compressionRatio,
        compressionMs: comp.compressionMs,
        tags: [...photo.tags],
      };
      setPhotos((prev) => [copyItem, ...prev]);
      setEditingPhoto(null);
      setOpenerState((prev) =>
        prev ? { listIds: [id, ...prev.listIds], index: 0 } : { listIds: [id], index: 0 }
      );
    } else {
      updatePhoto(photo.id, {
        E: editState,
        blob: comp.displayBlob,
        thumbBlob: comp.thumbBlob,
        src,
        thumbSrc,
        width: comp.width,
        height: comp.height,
        a: comp.aspectRatio,
        compressedSize: comp.compressedSize,
        compressionRatio: comp.compressionRatio,
        compressionMs: comp.compressionMs,
      });
      setEditingPhoto(null);
    }
  };

  const handleRevertPhoto = async (photo: PhotoItem) => {
    const comp = await compressImagePipeline(
      photo.ob,
      photo.compressionPreset || 'balanced',
      photo.name
    );
    const src = URL.createObjectURL(comp.displayBlob);
    const thumbSrc = URL.createObjectURL(comp.thumbBlob);
    updatePhoto(photo.id, {
      E: undefined,
      blob: comp.displayBlob,
      thumbBlob: comp.thumbBlob,
      src,
      thumbSrc,
      width: comp.width,
      height: comp.height,
      a: comp.aspectRatio,
      compressedSize: comp.compressedSize,
      compressionRatio: comp.compressionRatio,
      compressionMs: comp.compressionMs,
    });
    setEditingPhoto(null);
  };

  const selectedPhotos = useMemo(
    () => photos.filter((p) => selectedIds.has(p.id)),
    [photos, selectedIds]
  );

  const handleDownloadSelected = () => {
    if (!selectedPhotos.length) return;
    selectedPhotos.forEach((p, idx) => {
      window.setTimeout(() => {
        const blob = p.ob || p.blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = p.name || `photo-${p.id}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, idx * 180);
    });
    setAiStatusMsg(`Downloading ${selectedPhotos.length} ${selectedPhotos.length === 1 ? 'photo' : 'photos'}...`);
    window.setTimeout(() => setAiStatusMsg(null), 2600);
  };

  const handleShareSelected = async () => {
    if (!selectedPhotos.length) return;
    const files = selectedPhotos.slice(0, 10).map((p) => {
      const b = p.blob || p.ob;
      return new File([b], p.name || `photo-${p.id}.jpg`, {
        type: b.type || 'image/jpeg',
      });
    });

    const navShare = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };

    try {
      if (navShare.share && (!navShare.canShare || navShare.canShare({ files }))) {
        await navShare.share({
          files,
          title: `${files.length} ${files.length === 1 ? 'photo' : 'photos'} from SYMPHONY 8TH`,
        });
        return;
      }
    } catch {
      // Fall back to clean local download / clipboard summary
    }

    try {
      await navigator.clipboard?.writeText(
        selectedPhotos.map((p) => `${p.name} (${p.date})`).join('\n')
      );
    } catch {
      // ignore clipboard errors
    }
    handleDownloadSelected();
    setAiStatusMsg(`Prepared ${selectedPhotos.length} ${selectedPhotos.length === 1 ? 'photo' : 'photos'} for sharing`);
    window.setTimeout(() => setAiStatusMsg(null), 2800);
  };

  const handleAddSelectedToAlbum = (folderName: string) => {
    const dest = folderName.trim() || 'Camera';
    setCustomFolders((prev) => (prev.includes(dest) ? prev : [...prev, dest]));
    setPhotos((prev) =>
      prev.map((p) => (selectedIds.has(p.id) ? { ...p, folder: dest } : p))
    );
    const count = selectedIds.size;
    setAddToAlbumOpen(false);
    setSelectedIds(new Set());
    setSelectMode(false);
    setAiStatusMsg(`Added ${count} ${count === 1 ? 'photo' : 'photos'} to ${dest}`);
    window.setTimeout(() => setAiStatusMsg(null), 2600);
  };

  const handleCreateCollageFromSelected = async () => {
    if (!selectedPhotos.length) return;
    setCreatingCollage(true);
    try {
      const collageBlob = await buildPhotoCollageBlob(selectedPhotos);
      const now = new Date();
      const targetFolder = view === 'folder' ? currentFolder : 'Camera';
      const fileName = `Collage_${formatIsoDate(now)}_${now.getTime().toString().slice(-4)}.jpg`;
      const comp = await compressImagePipeline(
        collageBlob,
        activeProfile?.compressionPreset || 'balanced',
        fileName
      );
      const id = nextIdRef.current++;
      const newItem: PhotoItem = {
        id,
        profileId: activeProfileId,
        name: fileName,
        folder: targetFolder,
        date: formatIsoDate(now),
        time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        ts: now.getTime(),
        lastModified: now.getTime(),
        dsrc: 'collage',
        place: '',
        desc: `Photo collage created from ${Math.min(selectedPhotos.length, 9)} selected photos`,
        fav: false,
        del: false,
        backedUp: true,
        a: comp.aspectRatio,
        width: comp.width,
        height: comp.height,
        originalSize: comp.originalSize,
        compressedSize: comp.compressedSize,
        compressionRatio: comp.compressionRatio,
        compressionMs: comp.compressionMs,
        compressionPreset: activeProfile?.compressionPreset || 'balanced',
        format: 'JPEG',
        compressedFormat: comp.compressedFormat,
        src: URL.createObjectURL(comp.displayBlob),
        thumbSrc: URL.createObjectURL(comp.thumbBlob),
        origSrc: URL.createObjectURL(comp.origBlob),
        ob: comp.origBlob,
        blob: comp.displayBlob,
        thumbBlob: comp.thumbBlob,
        tags: ['collage', 'highlights', targetFolder.toLowerCase()],
      };
      setPhotos((prev) => [newItem, ...prev]);
      setCreateModalOpen(false);
      setSelectMode(false);
      setSelectedIds(new Set());
      openInMainOpener([newItem, ...displayedPhotos], 0);
    } finally {
      setCreatingCollage(false);
    }
  };

  const gridColumnsClass = 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5';

  const activeProfileAvatar = useMemo(() => {
    if (!activeProfile) return null;
    return (
      livePhotos.find((p) => p.id === activeProfile.avatarPhotoId) ||
      livePhotos.find((p) => p.profileId === activeProfile.id)
    );
  }, [activeProfile, livePhotos]);

  const startVoiceSearch = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec() as {
      lang: string;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      start: () => void;
    };
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (e) => {
      const val = e.results[0][0].transcript;
      setSearchText(val);
      void runSearch(val);
    };
    rec.onend = () => setIsRecording(false);
    setIsRecording(true);
    try {
      rec.start();
    } catch {
      setIsRecording(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen text-[var(--tx)]">
      {/* Dark Fantasy Rain Atmosphere */}
      <RainBackdrop
        variant="ambient"
        hidden={Boolean(openerState || editingPhoto || reelState)}
        className="pointer-events-none fixed inset-0 z-0"
      />
      <RainBackdrop
        variant="subtle"
        hidden={Boolean(openerState || editingPhoto || reelState)}
        className="pointer-events-none fixed inset-0 z-[15] opacity-45"
      />

      {/* Main Responsive App Shell (Windows 11 PC Comfortable + Mobile Ready) */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-36 sm:px-6 lg:px-8">
        {/* Sticky Top Header */}
        <header className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 flex h-[68px] items-center justify-between gap-3 border-b border-[#c8a464]/12 bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="relative flex items-center gap-1.5">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl transition hover:bg-[var(--sf)]"
              aria-label="Search library"
              title="Search & AI query"
            >
              <Search className="h-5 w-5" />
            </button>

            <button
              onClick={() => setAddFolderOpen(true)}
              className="hidden h-10 items-center gap-1.5 rounded-2xl border border-[#c8a464]/15 bg-[var(--sf)]/85 px-3 text-xs font-medium text-[var(--tx)] transition hover:border-[var(--ac)]/60 md:inline-flex"
              title="Create folder or open Windows PC folder"
            >
              <FolderPlus className="h-4 w-4 text-[var(--ac)]" />
              <span>Add folder</span>
            </button>
          </div>

          <button
            onClick={() => {
              setView('photos');
              setProfileFilterId(null);
              setSearchResult(null);
            }}
            className="flex items-center gap-2.5 text-center"
          >
            <img
              src="/pwa-192x192.png"
              alt="SYMPHONY 8TH"
              className="h-9 w-9 rounded-2xl border border-[#c8a464]/35 object-cover shadow-sm"
            />
            <span className="font-display text-xl font-semibold tracking-wide sm:text-2xl">
              SYMPHONY 8TH
            </span>
          </button>

          <div className="relative flex items-center gap-1.5">
            {/* Windows 11 Desktop Opener / PWA Install Trigger */}
            {isInstallable ? (
              <button
                onClick={() => void install()}
                className="hidden h-10 items-center gap-1.5 rounded-2xl border border-[var(--ac)]/45 bg-[var(--acb)] px-3 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--ac)] hover:text-slate-950 sm:inline-flex"
                title="Install SYMPHONY 8TH as Windows 11 Main Photos Opener"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Install App</span>
              </button>
            ) : (
              <button
                onClick={() => setWindowsModalOpen(true)}
                className="hidden h-10 items-center gap-1.5 rounded-2xl border border-white/10 bg-[var(--sf)]/80 px-3 text-xs font-medium text-[var(--tx)] transition hover:border-[var(--ac)]/60 sm:inline-flex"
                title="Windows 11 Main Photos Opener & Keyboard Shortcuts"
              >
                <Monitor className="h-3.5 w-3.5 text-[var(--ac)]" />
                <span>{isInstalled ? 'Win11 Opener' : 'Desktop Opener'}</span>
              </button>
            )}

            {/* Active Profile Avatar Button -> Opens Profile Photo in Main Photo Opener */}
            {activeProfile && (
              <button
                onClick={() => {
                  if (activeProfileAvatar) {
                    const idx = livePhotos.findIndex((p) => p.id === activeProfileAvatar.id);
                    if (idx >= 0) {
                      openInMainOpener(livePhotos, idx);
                      return;
                    }
                  }
                  setView('profiles');
                }}
                className="flex h-10 items-center gap-2 rounded-2xl border border-[var(--ln)]/35 bg-[var(--sf)]/90 p-1 pr-3 transition hover:border-[var(--ac)]"
                title={`Open ${activeProfile.name}'s photo in Main Photo Opener`}
              >
                {activeProfileAvatar ? (
                  <img
                    src={activeProfileAvatar.thumbSrc || activeProfileAvatar.src}
                    alt={activeProfile.name}
                    className="h-7 w-7 rounded-xl object-cover"
                  />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-[var(--acb)] text-xs font-bold">
                    {activeProfile.name.slice(0, 1)}
                  </span>
                )}
                <span className="hidden max-w-[100px] truncate text-xs font-medium sm:inline">
                  {activeProfile.name.split(' ')[0]}
                </span>
              </button>
            )}

            <button
              onClick={() => {
                setImportPresetDefaults({
                  profileId: activeProfileId,
                  target: 'gallery',
                  preset: activeProfile?.compressionPreset || 'balanced',
                  folderOverride: view === 'folder' ? currentFolder : undefined,
                });
                setImportOpen(true);
              }}
              className="hidden h-10 items-center gap-1.5 rounded-2xl bg-[var(--ac)] px-3.5 text-xs font-semibold text-slate-950 shadow-sm transition hover:opacity-90 sm:inline-flex"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-[var(--sf)]"
              aria-label="More menu"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {menuOpen && (
              <div
                className="absolute top-12 right-0 z-40 w-56 rounded-2xl border border-[var(--ln)]/30 bg-[var(--sf)] p-1.5 shadow-2xl backdrop-blur-xl"
                onMouseLeave={() => setMenuOpen(false)}
              >
                {[
                  {
                    label: 'Import high-res photos',
                    action: () => {
                      setImportPresetDefaults({
                        profileId: activeProfileId,
                        target: 'gallery',
                        preset: activeProfile?.compressionPreset || 'balanced',
                      });
                      setImportOpen(true);
                    },
                  },
                  { label: 'Add or open PC folder', action: () => setAddFolderOpen(true) },
                  { label: 'Windows 11 Main Opener', action: () => setWindowsModalOpen(true) },
                  { label: 'User Profiles & Opener', action: () => setView('profiles') },
                  { label: 'Search with AI', action: () => setSearchOpen(true) },
                  {
                    label: 'Play highlights reel',
                    action: () =>
                      setReelState({
                        photos: displayedPhotos.length ? displayedPhotos : livePhotos,
                        title: 'Highlights',
                      }),
                  },
                  { label: 'Analyze library', action: () => void analyzeLibrary() },
                  { label: 'Find duplicates', action: () => void findDuplicates() },
                  { label: 'Smart Albums & Tools', action: () => setPanelTab('tools') },
                  { label: 'Library Stats', action: () => setPanelTab('stats') },
                  { label: 'Places map', action: () => setPanelTab('map') },
                  {
                    label: 'Slideshow',
                    action: () => {
                      const arr = displayedPhotos.length ? displayedPhotos : livePhotos;
                      if (arr.length) {
                        setSlideshowActive(true);
                        openInMainOpener(arr, 0);
                      }
                    },
                  },
                  {
                    label: 'Empty trash',
                    action: () => setPhotos((prev) => prev.filter((p) => !p.del)),
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setMenuOpen(false);
                      item.action();
                    }}
                    className="block w-full rounded-xl px-3.5 py-2.5 text-left text-sm transition hover:bg-[var(--acb)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Upload / Compression Status Notification */}
        {(uploadStatus || aiStatusMsg) && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[var(--ac)]/35 bg-[var(--acb)]/65 px-4 py-2.5 text-xs font-medium text-[var(--tx)] backdrop-blur-md">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--ac)]" />
            <span>{uploadStatus || aiStatusMsg}</span>
          </div>
        )}

        {/* Search Input Bar */}
        {searchOpen && (
          <div className="mb-3 space-y-2.5">
            <div className="flex h-12 items-center gap-2 rounded-full border border-[var(--ln)]/35 bg-[var(--sf)] px-4">
              <Sparkles className="h-4 w-4 shrink-0 text-[var(--ac)]" />
              <input
                type="text"
                autoFocus
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch(searchText)}
                placeholder="Search or ask — “sunset”, “lisbon”, “macro”"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--tx)] outline-none placeholder:text-[var(--tx2)]"
              />
              <button
                onClick={startVoiceSearch}
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  isRecording ? 'text-rose-400' : 'text-[var(--tx2)] hover:text-[var(--tx)]'
                }`}
                aria-label="Voice search"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                onClick={() => void runSearch(searchText)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ac)]"
                aria-label="Run search"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            {!searchResult && (
              <div className="flex flex-wrap items-center gap-2">
                {['Sunset coastal photos', 'Macro hardware shots', 'Favourite photos'].map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setSearchText(h);
                      void runSearch(h);
                    }}
                    className="rounded-full border border-[var(--ln)]/45 px-3 py-1 text-xs text-[var(--tx2)] transition hover:border-[var(--ac)] hover:text-[var(--tx)]"
                  >
                    {h}
                  </button>
                ))}
                <span className="text-xs text-[var(--tx2)]">
                  · {aiAvailable ? 'AI: Gemini' : 'On-device smart search'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Active Search Result Chip */}
        {searchResult && (
          <div className="mb-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--acb)] px-3.5 py-1.5 text-xs font-medium text-[var(--tx)]">
                {searchResult.ai ? 'AI Understood' : 'Matched'}: {searchResult.label}
              </span>
              <button
                onClick={() => {
                  setSearchResult(null);
                  setSearchText('');
                }}
                className="rounded-full border border-[var(--ln)]/50 px-3 py-1 text-xs text-[var(--tx2)] hover:text-[var(--tx)]"
              >
                Clear
              </button>
            </div>
            {searchResult.ans && (
              <div className="rounded-2xl bg-[var(--sf)] p-4 text-sm leading-relaxed">
                {searchResult.ans}
              </div>
            )}
          </div>
        )}

        {/* VIEW: USER PROFILES */}
        {view === 'profiles' && (
          <UserProfilesView
            profiles={profiles}
            activeProfileId={activeProfileId}
            photos={photos}
            onSelectProfile={(id) => setActiveProfileId(id)}
            onCreateProfile={(data) => {
              const created: UserProfile = {
                ...data,
                id: `profile-${Date.now()}`,
                createdAt: Date.now(),
              };
              setProfiles((prev) => [...prev, created]);
              setActiveProfileId(created.id);
            }}
            onOpenPhotoInMainOpener={openInMainOpener}
            onUploadForProfile={(profileId, target, preset) => {
              setImportPresetDefaults({ profileId, target, preset });
              setImportOpen(true);
            }}
            onViewProfileGallery={(profileId) => {
              setProfileFilterId(profileId);
              setView('photos');
            }}
          />
        )}

        {/* VIEW: FOLDERS */}
        {view === 'folders' && !searchResult && (
          <div className="space-y-5">

            {/* Favourites & Trash Quick Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                onClick={() => setView('favs')}
                className="flex h-14 items-center gap-3.5 rounded-2xl border border-[var(--ln)]/35 bg-[var(--sf)]/70 px-4 text-left text-base font-medium backdrop-blur-md transition hover:border-[var(--ac)]/60"
              >
                <Star className="h-5 w-5 text-[var(--ac)]" />
                <span>Favourites</span>
              </button>
              <button
                onClick={() => setView('trash')}
                className="flex h-14 items-center gap-3.5 rounded-2xl border border-[var(--ln)]/35 bg-[var(--sf)]/70 px-4 text-left text-base font-medium backdrop-blur-md transition hover:border-[var(--ac)]/60"
              >
                <Trash2 className="h-5 w-5 text-[var(--ac)]" />
                <span>Trash</span>
              </button>
            </div>

            {/* Clean Minimalist Utility List (Screenshots, Videos, Recently Added, Archive, Locked) */}
            <div className="divide-y divide-[var(--ln)]/25 overflow-hidden rounded-2xl border border-[var(--ln)]/20 bg-[var(--sf)]/40 backdrop-blur-md">
              {[
                {
                  label: 'Screenshots',
                  icon: Smartphone,
                  count: livePhotos.filter((p) => p.folder === 'Screenshots' && !p.locked).length,
                  onClick: () => {
                    setCurrentFolder('Screenshots');
                    setView('folder');
                  },
                },
                {
                  label: 'Videos',
                  icon: PlayCircle,
                  count: livePhotos.filter(
                    (p) =>
                      !p.locked &&
                      (/gif|video|mp4|webm|mov/i.test(p.format || '') ||
                        p.tags.includes('video'))
                  ).length,
                  onClick: () => setView('videos'),
                },
                {
                  label: 'Recently Added',
                  icon: Clock,
                  count: livePhotos.filter((p) => !p.locked && !p.archived).length,
                  onClick: () => setView('recent'),
                },
                {
                  label: 'Archive',
                  icon: Archive,
                  count: livePhotos.filter((p) => p.archived && !p.locked).length,
                  onClick: () => setView('archive'),
                },
                {
                  label: 'Locked',
                  icon: Lock,
                  count: livePhotos.filter((p) => p.locked).length,
                  onClick: () => {
                    setLockedPinError(null);
                    setLockedPinInput('');
                    setView('locked');
                  },
                },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <button
                    key={row.label}
                    onClick={row.onClick}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-white/5"
                  >
                    <span className="flex items-center gap-4">
                      <Icon className="h-5 w-5 text-[var(--tx2)]" />
                      <span className="text-[15px] font-medium text-[var(--tx)]">{row.label}</span>
                    </span>
                    <span className="font-mono-num text-xs text-[var(--tx2)]">
                      {row.count > 0 ? row.count : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Smart Tags Scroller */}
            {smartTags.length > 0 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
                {smartTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setSearchText(tag);
                      void runSearch(tag);
                    }}
                    className="shrink-0 rounded-full border border-[var(--ln)]/40 bg-[var(--sf)]/65 px-3.5 py-1.5 text-xs font-medium backdrop-blur-md transition hover:border-[var(--ac)]"
                  >
                    {tag} <span className="ml-1 opacity-60">{count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Sort & Add Folder Row (Aves-style collection bar) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[var(--tx2)]">
                {folderSummaries.length} collections · {livePhotos.length} high-res items
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setPanelTab('tools')}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[var(--sf)] px-3.5 py-1.5 text-xs font-medium text-[var(--tx)] transition hover:border-[var(--ac)]/50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[var(--ac)]" />
                  <span>Smart Albums</span>
                </button>
                <button
                  onClick={() => setAddFolderOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--ac)]/45 bg-[var(--acb)] px-3.5 py-1.5 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--ac)] hover:text-slate-950"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  <span>Add folder</span>
                </button>
              </div>
            </div>

            {/* Folders Grid (Aves-inspired squircle cover cards) */}
            {folderSummaries.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {folderSummaries.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => {
                        setCurrentFolder(f.name);
                        setView('folder');
                      }}
                      className="group rounded-[26px] border border-white/8 bg-[var(--sf)]/55 p-2.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[var(--ac)]/45 hover:bg-[var(--sf)]"
                    >
                      <div className="aspect-square overflow-hidden rounded-[20px] bg-[var(--bg)]/60 shadow-inner">
                        {f.items[0] ? (
                          <img
                            src={f.items[0].thumbSrc || f.items[0].src}
                            alt={f.name}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--tx2)]">
                            <FolderPlus className="h-8 w-8 text-[var(--ac)]/80" />
                            <span className="text-[11px] font-medium">Empty folder</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2.5 truncate px-1 text-sm font-semibold text-[var(--tx)]">
                        {f.name}
                      </div>
                      <div className="font-mono-num px-1 pb-0.5 text-[11px] text-[var(--tx2)]">
                        {formatCount(f.items.length)} · {formatBytes(f.size)}
                      </div>
                    </button>
                  ))}
              </div>
            ) : (
              <div className="rounded-3xl bg-[var(--sf)]/50 py-16 text-center text-sm text-[var(--tx2)]">
                No photos yet. Import high-resolution photos or add a folder to get started.
              </div>
            )}
          </div>
        )}

        {/* VIEW: PHOTOS / FOLDER / FAVS / TRASH TIMELINE */}
        {view !== 'folders' && view !== 'profiles' && (
          <div>
            {/* Sub-view header / toolbar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {selectMode ? (
                  <button
                    onClick={() => {
                      setSelectMode(false);
                      setSelectedIds(new Set());
                      setSectionMenuKey(null);
                    }}
                    className="inline-flex h-10 items-center gap-3 rounded-full bg-[var(--sf)] px-4 text-sm font-semibold text-[var(--tx)] shadow-md ring-1 ring-white/12 transition hover:bg-[var(--acb)]"
                    aria-label="Clear selection"
                  >
                    <X className="h-4 w-4" />
                    <span className="font-mono-num">{selectedIds.size}</span>
                  </button>
                ) : (
                  <>
                    {view !== 'photos' && (
                      <button
                        onClick={() => setView('folders')}
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--sf)]"
                        aria-label="Back to folders"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                    )}
                    <h2 className="font-display text-xl font-semibold">
                      {view === 'favs'
                        ? 'Favourites'
                        : view === 'trash'
                          ? 'Trash'
                          : view === 'videos'
                            ? 'Videos'
                            : view === 'recent'
                              ? 'Recently Added'
                              : view === 'archive'
                                ? 'Archive'
                                : view === 'locked'
                                  ? 'Locked'
                                  : view === 'folder'
                                    ? currentFolder
                                    : 'Photos'}
                    </h2>
                  </>
                )}

                {view === 'locked' && lockedUnlocked && !selectMode && (
                  <button
                    onClick={() => setLockedUnlocked(false)}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--ln)]/40 bg-[var(--sf)] px-2.5 py-1 text-xs text-[var(--tx2)] hover:text-[var(--tx)]"
                  >
                    <Lock className="h-3 w-3" />
                    Lock
                  </button>
                )}

                {profileFilterId && view === 'photos' && !selectMode && (
                  <button
                    onClick={() => setProfileFilterId(null)}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--acb)] px-3 py-1 text-xs font-medium"
                  >
                    {profiles.find((p) => p.id === profileFilterId)?.name}
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Select Action */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    if (selectMode && selectedIds.size < displayedPhotos.length) {
                      setSelectedIds(new Set(displayedPhotos.map((p) => p.id)));
                    } else {
                      setSelectMode((v) => !v);
                      setSelectedIds(new Set());
                    }
                  }}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    selectMode
                      ? 'border-[var(--ac)] bg-[var(--acb)] text-[var(--tx)]'
                      : 'border-[var(--ln)]/40 text-[var(--tx2)] hover:text-[var(--tx)]'
                  }`}
                >
                  {selectMode
                    ? selectedIds.size < displayedPhotos.length
                      ? 'Select all'
                      : 'Clear'
                    : 'Select'}
                </button>
              </div>
            </div>

            {/* Windows 11 App Cover Showcase */}
            {view === 'photos' && !searchResult && !selectMode && !coverDismissed && (
              <section
                aria-label="SYMPHONY 8TH App Cover"
                className="relative mb-5 overflow-hidden rounded-[26px] border border-[#c8a464]/20 bg-[var(--sf)] shadow-2xl"
              >
                <div className="relative h-36 w-full sm:h-44">
                  <img
                    src="/assets/aistudio/eb6c85fb580911c756919c40c7518ec8__1__58d7dd4f.jpg"
                    alt="SYMPHONY 8TH App Cover"
                    className="h-full w-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#06070a]/92 via-[#090b10]/55 to-[#090b10]/20" />
                  <button
                    onClick={() => {
                      setCoverDismissed(true);
                      localStorage.setItem('symphony8-cover-dismissed', '1');
                    }}
                    className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/80 backdrop-blur-md transition hover:bg-black/80 hover:text-white"
                    aria-label="Hide app cover"
                    title="Hide cover banner"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute inset-y-0 left-0 flex flex-col justify-center px-5 sm:px-6">
                    <div className="flex items-center gap-3">
                      <img
                        src="/pwa-192x192.png"
                        alt=""
                        aria-hidden="true"
                        className="h-12 w-12 rounded-2xl border border-[#c8a464]/35 object-cover shadow-lg sm:h-14 sm:w-14"
                      />
                      <div>
                        <h3 className="font-display text-lg font-semibold text-white sm:text-xl">
                          SYMPHONY 8TH
                        </h3>
                        <p className="text-xs text-neutral-200/90 sm:text-sm">
                          Windows 11 Main Photos Opener · Local Vision + Gemini Gallery
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {isInstallable ? (
                        <button
                          onClick={() => void install()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ac)] px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow transition hover:brightness-105"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Install Windows 11 App
                        </button>
                      ) : (
                        <button
                          onClick={() => setWindowsModalOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ac)] px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow transition hover:brightness-105"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                          Windows 11 Opener
                        </button>
                      )}
                      <button
                        onClick={() => setAddFolderOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/65"
                      >
                        <FolderPlus className="h-3.5 w-3.5 text-[var(--ac)]" />
                        Open PC Folder
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Memories / Highlights Carousel (Best of Month, Featured, Favourites — photo-only) */}
            {view === 'photos' && !searchResult && (
              <MemoriesCarousel
                photos={livePhotos}
                onOpenMemory={(mem) =>
                  setReelState({ photos: mem.photos, title: mem.title })
                }
              />
            )}

            {/* Locked Folder Passcode Gate */}
            {view === 'locked' && !lockedUnlocked ? (
              <div className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-[var(--sf)]/70 p-6 text-center backdrop-blur-md">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--acb)] text-[var(--ac)]">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="font-display text-lg font-semibold">Locked Folder</h3>
                <p className="mt-1 text-xs text-[var(--tx2)]">
                  Enter passcode to view locked photos (default PIN: <span className="font-mono-num text-[var(--tx)]">0000</span>)
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const savedPin = localStorage.getItem('bw-locked-pin') || '0000';
                    if (lockedPinInput === savedPin || lockedPinInput === '0000') {
                      setLockedUnlocked(true);
                      setLockedPinError(null);
                    } else {
                      setLockedPinError('Incorrect passcode. Default is 0000.');
                    }
                  }}
                  className="mt-4 space-y-2.5"
                >
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={lockedPinInput}
                    onChange={(e) => {
                      setLockedPinInput(e.target.value);
                      if (lockedPinError) setLockedPinError(null);
                    }}
                    placeholder="Enter PIN (0000)"
                    className="font-mono-num w-full rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-4 py-2.5 text-center text-sm tracking-widest text-[var(--tx)] outline-none focus:border-[var(--ac)]"
                  />
                  {lockedPinError && <p className="text-xs text-rose-400">{lockedPinError}</p>}
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ac)] py-2.5 text-xs font-semibold text-slate-950 transition hover:opacity-90"
                  >
                    <Unlock className="h-4 w-4" />
                    Unlock Folder
                  </button>
                </form>
              </div>
            ) : groupedTimeline.length > 0 ? (
              <LayoutGroup>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${view}-${currentFolder}`}
                    initial={{ opacity: 0, scale: 0.985, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 1.015, y: -6 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-6"
                  >
                    {groupedTimeline.map(([groupKey, groupPhotos]) => {
                      const heading = dayLabel(groupKey);

                      const groupIds = groupPhotos.map((x) => x.id);
                      const allGroupSelected =
                        groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
                      const someGroupSelected =
                        !allGroupSelected && groupIds.some((id) => selectedIds.has(id));

                      return (
                        <motion.section
                          key={groupKey}
                          layout="position"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className="sticky top-[68px] z-10 mb-2 flex items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] py-1.5 backdrop-blur-sm">
                            <div className="flex items-baseline gap-2.5">
                              <h3 className="font-display text-base font-medium text-[var(--tx)] sm:text-lg">
                                {heading}
                              </h3>
                              <span className="font-mono-num text-xs text-[var(--tx2)]">
                                {groupPhotos.length}
                              </span>
                            </div>

                            <div className="relative flex items-center gap-1">
                              <button
                                onClick={() => {
                                  if (!selectMode) setSelectMode(true);
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (allGroupSelected) {
                                      groupIds.forEach((id) => next.delete(id));
                                    } else {
                                      groupIds.forEach((id) => next.add(id));
                                    }
                                    return next;
                                  });
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[var(--sf)]"
                                aria-label={
                                  allGroupSelected
                                    ? `Deselect all in ${heading}`
                                    : `Select all in ${heading}`
                                }
                                title={
                                  allGroupSelected
                                    ? `Deselect all in ${heading}`
                                    : `Select all in ${heading}`
                                }
                              >
                                <span
                                  className={`grid h-5 w-5 place-items-center rounded-full border-2 transition ${
                                    allGroupSelected
                                      ? 'border-[var(--ac)] bg-[var(--ac)] text-slate-950'
                                      : someGroupSelected
                                        ? 'border-[var(--ac)] bg-[var(--acb)] text-[var(--ac)]'
                                        : 'border-[var(--tx2)]/65 hover:border-[var(--tx)]'
                                  }`}
                                >
                                  {allGroupSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                  {someGroupSelected && (
                                    <span className="h-2 w-2 rounded-full bg-[var(--ac)]" />
                                  )}
                                </span>
                              </button>

                              <button
                                onClick={() =>
                                  setSectionMenuKey((prev) =>
                                    prev === groupKey ? null : groupKey
                                  )
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--tx2)] transition hover:bg-[var(--sf)] hover:text-[var(--tx)]"
                                aria-label={`Options for ${heading}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              {sectionMenuKey === groupKey && (
                                <div
                                  className="absolute top-9 right-0 z-30 w-52 rounded-2xl border border-white/10 bg-[var(--sf)] p-1.5 shadow-2xl backdrop-blur-xl"
                                  onMouseLeave={() => setSectionMenuKey(null)}
                                >
                                  <button
                                    onClick={() => {
                                      setSectionMenuKey(null);
                                      setSelectMode(true);
                                      setSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (allGroupSelected) {
                                          groupIds.forEach((id) => next.delete(id));
                                        } else {
                                          groupIds.forEach((id) => next.add(id));
                                        }
                                        return next;
                                      });
                                    }}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-[var(--acb)]"
                                  >
                                    {allGroupSelected
                                      ? `Deselect ${heading}`
                                      : `Select all in ${heading}`}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSectionMenuKey(null);
                                      setReelState({ photos: groupPhotos, title: heading });
                                    }}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-[var(--acb)]"
                                  >
                                    Play highlights reel
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSectionMenuKey(null);
                                      setSlideshowActive(true);
                                      openInMainOpener(groupPhotos, 0);
                                    }}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-[var(--acb)]"
                                  >
                                    Start slideshow
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSectionMenuKey(null);
                                      setSelectMode(true);
                                      setSelectedIds(new Set(groupIds));
                                      setAddToAlbumOpen(true);
                                    }}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium hover:bg-[var(--acb)]"
                                  >
                                    Add group to album
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <motion.div
                            layout
                            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                            className={`grid gap-1.5 sm:gap-2 ${gridColumnsClass}`}
                          >
                            {(() => {
                              const canStack = true;
                              const stacks: PhotoItem[][] = [];
                              const hashDiff = (h1?: string, h2?: string): number | null => {
                                if (!h1 || !h2 || h1.length !== 64 || h2.length !== 64) return null;
                                let diff = 0;
                                for (let k = 0; k < 64; k++) {
                                  if (h1[k] !== h2[k]) diff++;
                                }
                                return diff;
                              };

                              for (const item of groupPhotos) {
                                const lastStack = stacks[stacks.length - 1];
                                if (canStack && lastStack) {
                                  const prev = lastStack[lastStack.length - 1];
                                  const tPrev = prev.ts || prev.lastModified || 0;
                                  const tCurr = item.ts || item.lastModified || 0;
                                  const timeDiff = Math.abs(tPrev - tCurr);
                                  const dDiff = hashDiff(prev.dHash, item.dHash);
                                  const isBurst = timeDiff <= 180_000;
                                  const isVisuallySimilar =
                                    dDiff !== null && dDiff <= 10 && timeDiff <= 43_200_000;
                                  if (isBurst || isVisuallySimilar) {
                                    lastStack.push(item);
                                    continue;
                                  }
                                }
                                stacks.push([item]);
                              }

                              return stacks.map((stack) => {
                                const p = stack[0];
                                const isStack = stack.length > 1;
                                const stackIds = stack.map((x) => x.id);
                                const isSelected = stackIds.some((id) => selectedIds.has(id));
                                const savings = Math.round((p.compressionRatio || 0) * 100);
                                return (
                                  <motion.figure
                                    key={p.id}
                                    layout="position"
                                    initial={{ opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                    onPointerDown={() => {
                                      if (selectMode) return;
                                      longPressTriggeredRef.current = false;
                                      longPressTimerRef.current = window.setTimeout(() => {
                                        longPressTriggeredRef.current = true;
                                        setSelectMode(true);
                                        setSelectedIds((prev) => {
                                          const next = new Set(prev);
                                          stackIds.forEach((id) => next.add(id));
                                          return next;
                                        });
                                      }, 450);
                                    }}
                                    onPointerUp={() => {
                                      if (longPressTimerRef.current) {
                                        window.clearTimeout(longPressTimerRef.current);
                                        longPressTimerRef.current = null;
                                      }
                                    }}
                                    onPointerCancel={() => {
                                      if (longPressTimerRef.current) {
                                        window.clearTimeout(longPressTimerRef.current);
                                        longPressTimerRef.current = null;
                                      }
                                    }}
                                    onPointerLeave={() => {
                                      if (longPressTimerRef.current) {
                                        window.clearTimeout(longPressTimerRef.current);
                                        longPressTimerRef.current = null;
                                      }
                                    }}
                                    onClick={(e) => {
                                      if (longPressTriggeredRef.current) {
                                        longPressTriggeredRef.current = false;
                                        return;
                                      }
                                      if (selectMode || e.shiftKey) {
                                        if (!selectMode) setSelectMode(true);
                                        setSelectedIds((prev) => {
                                          const next = new Set(prev);
                                          const allSelected = stackIds.every((id) => next.has(id));
                                          if (allSelected) {
                                            stackIds.forEach((id) => next.delete(id));
                                          } else {
                                            stackIds.forEach((id) => next.add(id));
                                          }
                                          return next;
                                        });
                                      } else {
                                        const idx = displayedPhotos.findIndex((x) => x.id === p.id);
                                        openInMainOpener(displayedPhotos, idx);
                                      }
                                    }}
                                    className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-[var(--sf)] ring-1 ring-white/[0.06] transition hover:ring-[#c8a464]/45"
                                  >
                                    <img
                                      loading="lazy"
                                      src={p.thumbSrc || p.src}
                                      alt={p.name}
                                      className={`h-full w-full object-cover transition duration-300 ${
                                        selectMode && isSelected
                                          ? 'scale-[0.82] rounded-xl'
                                          : 'group-hover:scale-105'
                                      }`}
                                    />

                                    {isStack && !selectMode && (
                                      <span
                                        className="font-mono-num pointer-events-none absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm"
                                        title={`${stack.length} similar photos stacked`}
                                      >
                                        <Layers className="h-3 w-3 text-[var(--ac)]" />
                                        {stack.length}
                                      </span>
                                    )}

                                    {selectMode && (
                                      <span
                                        className={`absolute top-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-bold shadow transition ${
                                          isSelected
                                            ? 'border-[var(--ac)] bg-[var(--ac)] text-slate-950'
                                            : 'border-white/85 bg-black/30 text-white'
                                        }`}
                                      >
                                        {isSelected ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : ''}
                                      </span>
                                    )}

                                    {!selectMode && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleFav(p.id);
                                        }}
                                        className={`absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm transition ${
                                          p.fav
                                            ? 'opacity-100'
                                            : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                        aria-label={p.fav ? 'Unfavourite' : 'Favourite'}
                                      >
                                        <Star
                                          className={`h-4 w-4 ${
                                            p.fav ? 'fill-amber-400 text-amber-400' : 'text-white'
                                          }`}
                                        />
                                      </button>
                                    )}

                                    {/* Subtle resolution / compression readout on hover */}
                                    {!selectMode && (
                                      <div className="font-mono-num pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pt-4 pb-1.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                                        {p.width}×{p.height}
                                        {savings > 0 ? ` · -${savings}%` : ''}
                                        {isStack ? ` · ${stack.length} in stack` : ''}
                                      </div>
                                    )}
                                  </motion.figure>
                                );
                              });
                            })()}
                          </motion.div>
                        </motion.section>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </LayoutGroup>
            ) : (
              <div className="rounded-3xl bg-[var(--sf)]/50 py-16 text-center text-sm text-[var(--tx2)]">
                {view === 'favs'
                  ? 'No favourites yet — tap the star on any photo.'
                  : view === 'trash'
                    ? 'Trash is empty.'
                    : view === 'videos'
                      ? 'No videos or motion clips yet. Play a cinematic reel or import video/GIF clips.'
                      : view === 'archive'
                        ? 'Archive is empty. Select photos or open the menu inside Main Photo Opener to archive.'
                        : view === 'locked'
                          ? 'No locked photos yet.'
                          : 'No photos found.'}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {view === 'videos' && livePhotos.length > 0 && (
                    <button
                      onClick={() => setReelState({ photos: livePhotos, title: 'Highlights' })}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[var(--ac)]/45 bg-[var(--acb)] px-5 py-2.5 text-xs font-semibold text-[var(--tx)]"
                    >
                      <Play className="h-4 w-4" />
                      Play Highlights Reel
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setImportPresetDefaults({
                        profileId: activeProfileId,
                        target: 'gallery',
                        preset: activeProfile?.compressionPreset || 'balanced',
                        folderOverride: view === 'folder' ? currentFolder : undefined,
                      });
                      setImportOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[var(--ac)] px-5 py-2.5 text-xs font-semibold text-slate-950"
                  >
                    <Plus className="h-4 w-4" />
                    {view === 'folder'
                      ? `Import photos into ${currentFolder}`
                      : 'Import high-res photos'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom Selection Action Sheet */}
        {selectMode && (
          <>

            <div
              className="fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] border-t border-white/12 bg-[color-mix(in_srgb,var(--sf)_96%,#000)] shadow-[0_-14px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
              role="region"
              aria-label="Selection actions"
            >
              <div className="mx-auto flex max-w-2xl flex-col items-center">
                <button
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="mt-2.5 mb-1.5 flex w-full justify-center py-1"
                  aria-label="Close selection sheet"
                >
                  <span className="h-1 w-9 rounded-full bg-white/25" />
                </button>

                <div className="no-scrollbar flex w-full items-center justify-start gap-1 overflow-x-auto px-3 pt-1 pb-[max(14px,env(safe-area-inset-bottom))] sm:justify-center sm:gap-4">
                  <button
                    onClick={() => void handleShareSelected()}
                    disabled={selectedIds.size === 0}
                    className="flex min-w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium text-[var(--tx)] transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <Share2 className="h-5 w-5" />
                    <span>Share</span>
                  </button>

                  <button
                    onClick={() => setAddToAlbumOpen(true)}
                    disabled={selectedIds.size === 0}
                    className="flex min-w-[82px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium text-[var(--tx)] transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <ListPlus className="h-5 w-5" />
                    <span className="text-center leading-tight">Add to album</span>
                  </button>

                  <button
                    onClick={() => setCreateModalOpen(true)}
                    disabled={selectedIds.size === 0}
                    className="flex min-w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium text-[var(--tx)] transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <Plus className="h-5 w-5" />
                    <span>Create</span>
                  </button>

                  <button
                    onClick={() => {
                      const restore = view === 'trash';
                      setPhotos((prev) =>
                        prev.map((p) => (selectedIds.has(p.id) ? { ...p, del: !restore } : p))
                      );
                      setSelectedIds(new Set());
                      setSelectMode(false);
                    }}
                    disabled={selectedIds.size === 0}
                    className="flex min-w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium text-[var(--tx)] transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <Trash2 className="h-5 w-5" />
                    <span>{view === 'trash' ? 'Restore' : 'Trash'}</span>
                  </button>

                  <button
                    onClick={handleDownloadSelected}
                    disabled={selectedIds.size === 0}
                    className="flex min-w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium text-[var(--tx)] transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <Download className="h-5 w-5" />
                    <span>Download</span>
                  </button>

                  <button
                    onClick={() => {
                      setPhotos((prev) =>
                        prev.map((p) =>
                          selectedIds.has(p.id) ? { ...p, archived: view !== 'archive' } : p
                        )
                      );
                      setSelectedIds(new Set());
                      setSelectMode(false);
                    }}
                    disabled={selectedIds.size === 0}
                    className="flex min-w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium text-[var(--tx)] transition hover:bg-white/8 disabled:opacity-40"
                  >
                    <Archive className="h-5 w-5" />
                    <span>{view === 'archive' ? 'Unarchive' : 'Archive'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setPhotos((prev) =>
                        prev.map((p) =>
                          selectedIds.has(p.id) ? { ...p, locked: view !== 'locked' } : p
                        )
                      );
                      setSelectedIds(new Set());
                      setSelectMode(false);
                    }}
                    disabled={selectedIds.size === 0}
                    className="flex min-w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium text-[var(--tx)] transition hover:bg-white/8 disabled:opacity-40"
                  >
                    {view === 'locked' ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                    <span>{view === 'locked' ? 'Unlock' : 'Lock'}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Aves-Style Floating Bottom Navigation Bar + Dedicated Start Slideshow FAB (hidden while selection sheet is active) */}
      {!selectMode && (
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-30 flex items-center justify-center gap-2.5 px-3">
        <nav
          aria-label="Primary Navigation"
          className="pointer-events-auto flex w-full max-w-[390px] items-center gap-1 rounded-[26px] border border-[#c8a464]/20 bg-[#0d0f14]/88 p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
        >
          <button
            onClick={() => {
              setView('photos');
              setSearchResult(null);
            }}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[20px] text-sm font-medium transition ${
              view === 'photos'
                ? 'bg-[color-mix(in_srgb,var(--ac)_24%,transparent)] text-[var(--tx)] ring-1 ring-[color-mix(in_srgb,var(--ac)_55%,transparent)]'
                : 'text-[var(--tx2)] hover:text-[var(--tx)]'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>Photos</span>
          </button>

          <button
            onClick={() => {
              setView('folders');
              setSearchResult(null);
            }}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[20px] text-sm font-medium transition ${
              view === 'folders' ||
              view === 'folder' ||
              view === 'favs' ||
              view === 'trash' ||
              view === 'videos' ||
              view === 'recent' ||
              view === 'archive' ||
              view === 'locked'
                ? 'bg-[color-mix(in_srgb,var(--ac)_24%,transparent)] text-[var(--tx)] ring-1 ring-[color-mix(in_srgb,var(--ac)_55%,transparent)]'
                : 'text-[var(--tx2)] hover:text-[var(--tx)]'
            }`}
          >
            <Folder className="h-4 w-4" />
            <span>Folders</span>
          </button>

          <button
            onClick={() => {
              setView('profiles');
              setSearchResult(null);
            }}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[20px] text-sm font-medium transition ${
              view === 'profiles'
                ? 'bg-[color-mix(in_srgb,var(--ac)_24%,transparent)] text-[var(--tx)] ring-1 ring-[color-mix(in_srgb,var(--ac)_55%,transparent)]'
                : 'text-[var(--tx2)] hover:text-[var(--tx)]'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Profiles</span>
          </button>

          <button
            onClick={() => {
              setImportPresetDefaults({
                profileId: activeProfileId,
                target: 'gallery',
                preset: activeProfile?.compressionPreset || 'balanced',
                folderOverride: view === 'folder' ? currentFolder : undefined,
              });
              setImportOpen(true);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] bg-white/10 text-[var(--tx)] transition hover:bg-white/20 sm:hidden"
            aria-label="Import high-res photos"
            title="Import photos"
          >
            <Plus className="h-5 w-5" />
          </button>
        </nav>

        {/* Dedicated Aves-Style Floating Action Button for Start Slideshow */}
        <button
          onClick={startSlideshow}
          className="pointer-events-auto flex h-[56px] shrink-0 items-center gap-2 rounded-[20px] bg-[var(--ac)] px-4 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/25 transition duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 sm:px-5"
          aria-label="Start Slideshow"
          title="Start Slideshow (Shortcut: S)"
        >
          <Play className="h-4 w-4 fill-slate-950" />
          <span className="hidden sm:inline">Start Slideshow</span>
        </button>
      </div>
      )}

      {/* Offline Status Indicator */}
      {!isOnline && (
        <div className="fixed top-20 left-4 z-50 flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-lg backdrop-blur-md">
          <span className="h-2 w-2 animate-pulse rounded-full bg-slate-950" />
          Offline Mode — Local gallery active
        </div>
      )}

      {/* Main Photo Opener (Lightbox + Zoom/Pan + Swipe Peek + Profile Controls) */}
      {openerState && openerPhotos.length > 0 && activeProfile && (
        <PhotoOpener
          photos={openerPhotos}
          currentIndex={Math.min(openerState.index, openerPhotos.length - 1)}
          profiles={profiles}
          activeProfile={activeProfile}
          folders={folderNames}
          onClose={() => {
            const savedY = openerReturnScrollRef.current;
            setOpenerState(null);
            setSlideshowActive(false);
            window.requestAnimationFrame(() => {
              window.scrollTo({ top: savedY, behavior: 'auto' });
            });
          }}
          onIndexChange={(idx) =>
            setOpenerState((prev) => (prev ? { ...prev, index: idx } : null))
          }
          onToggleFav={toggleFav}
          onToggleTrash={toggleTrash}
          onToggleBackup={toggleBackup}
          onUpdatePhoto={updatePhoto}
          onUpdateDateTime={updatePhotoDateTime}
          onOpenEditor={(p) => setEditingPhoto(p)}
          onDescribeWithAi={handleDescribePhotoWithAi}
          onSearchTag={(tag) => {
            setSearchOpen(true);
            setSearchText(tag);
            void runSearch(tag);
          }}
          onSetProfileAvatar={(profileId, photoId) =>
            setProfiles((prev) =>
              prev.map((p) => (p.id === profileId ? { ...p, avatarPhotoId: photoId } : p))
            )
          }
          onSetProfileCover={(profileId, photoId) =>
            setProfiles((prev) =>
              prev.map((p) => (p.id === profileId ? { ...p, coverPhotoId: photoId } : p))
            )
          }
          slideshowActive={slideshowActive}
          onToggleSlideshow={() => setSlideshowActive((v) => !v)}
        />
      )}

      {/* Photo Editor */}
      {editingPhoto && (
        <PhotoEditor
          photo={editingPhoto}
          onClose={() => setEditingPhoto(null)}
          onSave={handleSaveEditedPhoto}
          onRevert={handleRevertPhoto}
        />
      )}

      {/* High-Res Import & Compression Modal */}
      <ImportModal
        open={importOpen}
        profiles={profiles}
        activeProfileId={importPresetDefaults.profileId}
        initialTarget={importPresetDefaults.target}
        initialPreset={importPresetDefaults.preset}
        onClose={() => setImportOpen(false)}
        onImportFiles={(files, opts) =>
          void handleImportFiles(files, {
            ...opts,
            folderOverride: opts.folderOverride || importPresetDefaults.folderOverride,
          })
        }
      />

      {/* Add Folder / Open Windows PC Folder Modal */}
      <AddFolderModal
        open={addFolderOpen}
        existingFolders={folderNames}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onClose={() => setAddFolderOpen(false)}
        onCreateFolder={(name, files, preset) => {
          setCustomFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
          if (files && files.length > 0) {
            void handleImportFiles(files, {
              folderOverride: name,
              preset: preset || activeProfile?.compressionPreset || 'balanced',
            });
          }
          setCurrentFolder(name);
          setView('folder');
        }}
        onImportPcFolder={(files, name, preset) => {
          setCustomFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
          void handleImportFiles(files, {
            folderOverride: name,
            preset,
          });
          setCurrentFolder(name);
          setView('folder');
        }}
      />

      {/* Windows 11 Main Photos Opener & Keyboard Comfort Modal */}
      <WindowsOpenerModal
        open={windowsModalOpen}
        onClose={() => setWindowsModalOpen(false)}
        onOpenLocalFiles={(files) =>
          void handleImportFiles(files, { openImmediately: true })
        }
        onOpenAddFolder={() => setAddFolderOpen(true)}
        onStartSlideshow={startSlideshow}
      />

      {/* Smart Albums, Library Stats & Places Map Panel */}
      <CollectionsPanel
        tab={panelTab}
        photos={photos}
        albums={albums}
        onClose={() => setPanelTab(null)}
        onSwitchTab={(t) => setPanelTab(t)}
        onStartSelect={() => setSelectMode(true)}
        onAddAlbum={(a) => setAlbums((prev) => [...prev, a])}
        onDeleteAlbum={(idx) => setAlbums((prev) => prev.filter((_, i) => i !== idx))}
        onApplyAlbum={(a) => {
          const matches = livePhotos.filter((p) => matchAlbumQuery(p, a.query));
          setSearchResult({
            q: a.query,
            label: a.name,
            ids: new Set(matches.map((p) => p.id)),
            ans: '',
            ai: false,
          });
          setView('photos');
        }}
        onStartSlideshow={() => {
          const arr = displayedPhotos.length ? displayedPhotos : livePhotos;
          if (arr.length) {
            setSlideshowActive(true);
            openInMainOpener(arr, 0);
          }
        }}
        onOpenPhoto={(photoId) => {
          const idx = livePhotos.findIndex((p) => p.id === photoId);
          if (idx >= 0) openInMainOpener(livePhotos, idx);
        }}
        onAnalyzeLibrary={() => void analyzeLibrary()}
      />

      {/* Add to Album & Create from Selection Sheets */}
      <AddToAlbumModal
        open={addToAlbumOpen}
        selectedCount={selectedIds.size}
        folders={folderNames}
        onClose={() => setAddToAlbumOpen(false)}
        onSelectFolder={handleAddSelectedToAlbum}
      />

      <CreateFromSelectionModal
        open={createModalOpen}
        selectedCount={selectedIds.size}
        creatingCollage={creatingCollage}
        onClose={() => setCreateModalOpen(false)}
        onCreateCollage={() => void handleCreateCollageFromSelected()}
        onStartReel={() => {
          if (selectedPhotos.length) {
            setReelState({ photos: selectedPhotos, title: 'Selected Highlights' });
          }
        }}
        onStartSlideshow={() => {
          if (selectedPhotos.length) {
            setSlideshowActive(true);
            openInMainOpener(selectedPhotos, 0);
          }
        }}
        onAddToAlbum={() => setAddToAlbumOpen(true)}
      />

      {/* Highlights Reel Overlay */}
      {reelState && (
        <ReelOverlay
          photos={reelState.photos}
          title={reelState.title}
          onClose={() => setReelState(null)}
          onOpenInOpener={(list, idx) => openInMainOpener(list, idx)}
        />
      )}
      </div>
    </MotionConfig>
  );
}
