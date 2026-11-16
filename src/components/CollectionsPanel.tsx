import { useMemo, useState } from 'react';
import { ArrowLeft, Eye, MapPin, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { DynamicAlbum, PhotoItem } from '../types/gallery';
import { formatBytes, shortDate } from '../utils/compression';
import { matchAlbumQuery, suggestSmartAlbums } from '../utils/smartAlbums';

export type PanelTab = 'tools' | 'stats' | 'map' | null;

interface CollectionsPanelProps {
  tab: PanelTab;
  photos: PhotoItem[];
  albums: DynamicAlbum[];
  onClose: () => void;
  onSwitchTab: (tab: Exclude<PanelTab, null>) => void;
  onStartSelect: () => void;
  onAddAlbum: (album: DynamicAlbum) => void;
  onDeleteAlbum: (index: number) => void;
  onApplyAlbum: (album: DynamicAlbum) => void;
  onStartSlideshow: () => void;
  onOpenPhoto: (photoId: number) => void;
  onAnalyzeLibrary?: () => void;
}

export function CollectionsPanel({
  tab,
  photos,
  albums,
  onClose,
  onSwitchTab,
  onStartSelect,
  onAddAlbum,
  onDeleteAlbum,
  onApplyAlbum,
  onStartSlideshow,
  onOpenPhoto,
  onAnalyzeLibrary,
}: CollectionsPanelProps) {
  const [albumName, setAlbumName] = useState('');
  const [albumQuery, setAlbumQuery] = useState('');

  const live = useMemo(() => photos.filter((p) => !p.del), [photos]);
  const smartSuggestions = useMemo(
    () => suggestSmartAlbums(live, albums),
    [live, albums]
  );

  if (!tab) return null;

  const unanalyzedCount = live.filter((p) => !p.ai).length;
  const total = live.length;
  const origBytes = live.reduce((n, p) => n + (p.originalSize || 0), 0);
  const compBytes = live.reduce((n, p) => n + (p.compressedSize || 0), 0);
  const savedBytes = Math.max(0, origBytes - compBytes);
  const favCount = live.filter((p) => p.fav).length;
  const located = live.filter((p) => p.place);

  const byType: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  const byFolder: Record<string, number> = {};
  for (const p of live) {
    const ext = p.format || 'IMAGE';
    byType[ext] = (byType[ext] || 0) + 1;
    const yr = p.date.slice(0, 4);
    byYear[yr] = (byYear[yr] || 0) + 1;
    byFolder[p.folder] = (byFolder[p.folder] || 0) + 1;
  }
  const maxYear = Math.max(1, ...Object.values(byYear));
  const topFolders = Object.entries(byFolder).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-[var(--bg)] px-4 pt-[max(14px,env(safe-area-inset-top))] pb-24 text-[var(--tx)]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--sf)]"
            aria-label="Back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h2 className="font-display flex-1 text-2xl font-semibold capitalize">{tab}</h2>
          <div className="flex items-center gap-1 rounded-2xl bg-[var(--sf)] p-1">
            {(['tools', 'stats', 'map'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onSwitchTab(t)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-medium capitalize transition ${
                  tab === t ? 'bg-[var(--ac)] text-slate-950' : 'text-[var(--tx2)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === 'tools' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  onClose();
                  onStartSelect();
                }}
                className="rounded-full border border-[var(--ln)]/50 bg-[var(--sf)] px-4 py-2 text-xs font-medium"
              >
                Select Photos
              </button>
              <button
                onClick={() => {
                  onClose();
                  onStartSlideshow();
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ac)] px-4 py-2 text-xs font-semibold text-slate-950"
              >
                <Play className="h-3.5 w-3.5" />
                Start Slideshow
              </button>
            </div>

            {/* Suggested Smart Albums (AI Tag Pattern Mining) */}
            <section className="rounded-[24px] border border-[var(--ac)]/25 bg-[var(--sf)] p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--ac)]" />
                    <h3 className="font-display text-base font-semibold">
                      Suggested Smart Albums
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--tx2)]">
                    Automatically suggested from frequent AI tag patterns (e.g., Vacation, Food, Pets, Architecture).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {unanalyzedCount > 0 && onAnalyzeLibrary && (
                    <button
                      onClick={() => {
                        onClose();
                        onAnalyzeLibrary();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)]/60 px-3 py-1.5 text-xs font-medium text-[var(--tx)] transition hover:border-[var(--ac)]"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[var(--ac)]" />
                      Scan AI Tags ({unanalyzedCount})
                    </button>
                  )}
                  {smartSuggestions.length > 1 && (
                    <button
                      onClick={() => {
                        smartSuggestions.forEach((s) =>
                          onAddAlbum({ name: s.name, query: s.query })
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-[var(--acb)] px-3 py-1.5 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--ac)] hover:text-slate-950"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Save All ({smartSuggestions.length})
                    </button>
                  )}
                </div>
              </div>

              {smartSuggestions.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {smartSuggestions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-[var(--bg)]/55 p-3 transition hover:border-[var(--ac)]/40"
                    >
                      {/* Mini thumbnail stack preview */}
                      <button
                        onClick={() => {
                          onApplyAlbum({ name: s.name, query: s.query });
                          onClose();
                        }}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--sf)]"
                        title={`Preview ${s.name}`}
                      >
                        {s.previewPhotos[0] && (
                          <img
                            src={s.previewPhotos[0].thumbSrc || s.previewPhotos[0].src}
                            alt={s.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                        <span className="font-mono-num absolute right-1 bottom-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {s.count}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-[var(--tx)]">
                            {s.name}
                          </span>
                          {s.isAiPattern && (
                            <span className="rounded-md bg-[var(--acb)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ac)]">
                              AI
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--tx2)]">
                          {s.reason}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              onApplyAlbum({ name: s.name, query: s.query });
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[var(--sf)] px-2.5 py-1 text-[11px] font-medium text-[var(--tx)] transition hover:border-[var(--ac)]"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                          <button
                            onClick={() => onAddAlbum({ name: s.name, query: s.query })}
                            className="inline-flex items-center gap-1 rounded-lg bg-[var(--ac)] px-2.5 py-1 text-[11px] font-semibold text-slate-950 transition hover:opacity-90"
                          >
                            <Plus className="h-3 w-3" />
                            Save Album
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-[var(--bg)]/45 p-3.5 text-xs text-[var(--tx2)]">
                  All detected Smart Album patterns are already saved to your Dynamic Albums below, or import/analyze more photos to discover new clusters.
                </div>
              )}
            </section>

            {/* Dynamic Albums */}
            <section className="rounded-[24px] bg-[var(--sf)] p-4 sm:p-5">
              <h3 className="font-display mb-1 text-base font-semibold">Saved Dynamic &amp; Smart Albums</h3>
              <p className="mb-3 text-xs text-[var(--tx2)]">
                Automatically group photos matching tags, folders, dates, or places.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!albumName.trim() || !albumQuery.trim()) return;
                  onAddAlbum({ name: albumName.trim(), query: albumQuery.trim() });
                  setAlbumName('');
                  setAlbumQuery('');
                }}
                className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input
                  type="text"
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  placeholder="Album title (e.g. Coastal Dusk)"
                  className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3 py-2 text-sm text-[var(--tx)] outline-none"
                />
                <input
                  type="text"
                  value={albumQuery}
                  onChange={(e) => setAlbumQuery(e.target.value)}
                  placeholder="Match keyword (e.g. sunset, vacation 2024)"
                  className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3 py-2 text-sm text-[var(--tx)] outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-[var(--ac)] px-4 py-2 text-xs font-semibold text-slate-950"
                >
                  <Plus className="h-4 w-4" />
                  Create
                </button>
              </form>

              <div className="space-y-2">
                {albums.map((a, i) => {
                  const matchCount = live.filter((p) => matchAlbumQuery(p, a.query)).length;
                  return (
                    <div
                      key={`${a.name}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg)]/50 px-3.5 py-2.5"
                    >
                      <button
                        onClick={() => {
                          onApplyAlbum(a);
                          onClose();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium hover:text-[var(--ac)]"
                      >
                        <span className="truncate">{a.name}</span>
                        <span className="font-mono-num shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 text-[11px] text-[var(--tx2)]">
                          {matchCount}
                        </span>
                        <span className="truncate text-xs text-[var(--tx2)]">
                          · matches “{a.query}”
                        </span>
                      </button>
                      <button
                        onClick={() => onDeleteAlbum(i)}
                        className="text-[var(--tx2)] hover:text-rose-400"
                        aria-label="Delete dynamic album"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                {!albums.length && (
                  <p className="text-xs text-[var(--tx2)]">No saved dynamic albums yet — save a suggestion above or create your own.</p>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <div className="text-xs text-[var(--tx2)]">High-Res Photos</div>
                <div className="font-mono-num mt-1 text-2xl font-semibold">
                  {total.toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <div className="text-xs text-[var(--tx2)]">Original Size</div>
                <div className="font-mono-num mt-1 text-2xl font-semibold">
                  {formatBytes(origBytes)}
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <div className="text-xs text-[var(--tx2)]">Compressed Display</div>
                <div className="font-mono-num mt-1 text-2xl font-semibold text-[var(--ac)]">
                  {formatBytes(compBytes)}
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <div className="text-xs text-[var(--tx2)]">Bandwidth Saved</div>
                <div className="font-mono-num mt-1 text-2xl font-semibold text-emerald-400">
                  {formatBytes(savedBytes)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-medium">
                  <span>Favourites</span>
                  <span className="font-mono-num">{favCount}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--acb)]">
                  <div
                    className="h-full rounded-full bg-[var(--ac)]"
                    style={{ width: `${total ? (favCount / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-medium">
                  <span>Items with Location</span>
                  <span className="font-mono-num">
                    {located.length} / {total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--acb)]">
                  <div
                    className="h-full rounded-full bg-[var(--ac)]"
                    style={{ width: `${total ? (located.length / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <h3 className="font-display mb-3 text-sm font-semibold">File Formats</h3>
                <div className="space-y-2 text-sm">
                  {Object.entries(byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-[var(--tx2)]">{k}</span>
                        <span className="font-mono-num font-medium">{n}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--sf)] p-4">
                <h3 className="font-display mb-3 text-sm font-semibold">Top Albums</h3>
                <div className="space-y-2 text-sm">
                  {topFolders.map(([k, n]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-[var(--tx2)]">{k}</span>
                      <span className="font-mono-num font-medium">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--sf)] p-4">
              <h3 className="font-display mb-3 text-sm font-semibold">Library by Year</h3>
              <div className="flex h-32 items-end gap-2 border-b border-[var(--ln)]/40 pt-4">
                {Object.entries(byYear)
                  .sort()
                  .map(([yr, n]) => (
                    <div key={yr} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full max-w-[44px] rounded-t-md bg-[var(--ac)]"
                        style={{ height: `${Math.max(8, (n / maxYear) * 96)}px` }}
                      />
                      <span className="font-mono-num text-[11px] text-[var(--tx2)]">{yr}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'map' && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--tx2)]">
              Places recorded in your photo details. Tap any entry to inspect the photo in the Main
              Photo Opener.
            </p>
            {located.length ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {located.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onClose();
                      onOpenPhoto(p.id);
                    }}
                    className="flex items-center gap-3 rounded-2xl bg-[var(--sf)] p-3 text-left transition hover:bg-[var(--acb)]/40"
                  >
                    <img
                      src={p.thumbSrc || p.src}
                      alt={p.name}
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--ac)]" />
                        <span className="truncate">{p.place}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--tx2)]">
                        {shortDate(p.date)} · {p.folder}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--sf)] p-10 text-center text-sm text-[var(--tx2)]">
                No photos have a saved place yet. Open any photo, tap the date header, and add a
                place.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
