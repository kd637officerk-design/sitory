import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { PhotoItem } from '../types/gallery';

export interface MemoryCollection {
  id: string;
  title: string;
  subtitle: string;
  coverPhoto: PhotoItem;
  photos: PhotoItem[];
}

export function buildMemories(photos: PhotoItem[]): MemoryCollection[] {
  const visible = photos.filter((p) => !p.del && !p.archived && !p.locked);
  if (visible.length === 0) return [];

  const byNewest = [...visible].sort(
    (a, b) =>
      (b.ts || b.lastModified || 0) - (a.ts || a.lastModified || 0) ||
      b.date.localeCompare(a.date)
  );

  const scorePhoto = (p: PhotoItem) =>
    (p.fav ? 100 : 0) +
    (p.ai ? 25 : 0) +
    (p.desc ? 15 : 0) +
    (p.width * p.height > 2_000_000 ? 15 : 0) +
    (p.place ? 10 : 0);

  const monthBuckets = new Map<string, PhotoItem[]>();
  for (const p of byNewest) {
    const ym = p.date.slice(0, 7);
    const arr = monthBuckets.get(ym);
    if (arr) arr.push(p);
    else monthBuckets.set(ym, [p]);
  }
  const sortedMonths = Array.from(monthBuckets.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  );

  const memories: MemoryCollection[] = [];
  const usedCovers = new Set<number>();

  const pickCover = (list: PhotoItem[]): PhotoItem => {
    const ranked = [...list].sort((a, b) => scorePhoto(b) - scorePhoto(a));
    return ranked.find((p) => !usedCovers.has(p.id)) || ranked[0];
  };

  const monthNameFromYm = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return ym;
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' });
  };

  // 1. Best of <Latest Month>
  if (sortedMonths.length > 0) {
    const [latestYm, items] = sortedMonths[0];
    const ranked = [...items].sort((a, b) => scorePhoto(b) - scorePhoto(a));
    const cover = pickCover(ranked);
    usedCovers.add(cover.id);
    memories.push({
      id: `best-${latestYm}`,
      title: `Best of ${monthNameFromYm(latestYm)}`,
      subtitle: `${items.length} ${items.length === 1 ? 'highlight' : 'highlights'}`,
      coverPhoto: cover,
      photos: ranked.slice(0, 14),
    });
  }

  // 2. Featured (strictly photo-only — no "video" label)
  const featuredRanked = [...byNewest].sort((a, b) => scorePhoto(b) - scorePhoto(a));
  if (featuredRanked.length > 0) {
    const cover = pickCover(featuredRanked);
    usedCovers.add(cover.id);
    memories.push({
      id: 'featured-highlights',
      title: 'Featured',
      subtitle: `${Math.min(featuredRanked.length, 16)} curated moments`,
      coverPhoto: cover,
      photos: featuredRanked.slice(0, 16),
    });
  }

  // 3. Favourites
  const favs = byNewest.filter((p) => p.fav);
  if (favs.length > 0) {
    const cover = pickCover(favs);
    usedCovers.add(cover.id);
    memories.push({
      id: 'memory-favourites',
      title: 'Favourites',
      subtitle: `${favs.length} starred ${favs.length === 1 ? 'photo' : 'photos'}`,
      coverPhoto: cover,
      photos: favs.slice(0, 16),
    });
  }

  // 4. Top Place
  const placeMap = new Map<string, PhotoItem[]>();
  for (const p of byNewest) {
    if (!p.place) continue;
    const arr = placeMap.get(p.place);
    if (arr) arr.push(p);
    else placeMap.set(p.place, [p]);
  }
  const topPlace = Array.from(placeMap.entries()).sort((a, b) => b[1].length - a[1].length)[0];
  if (topPlace && topPlace[1].length >= 1) {
    const [placeName, items] = topPlace;
    const cover = pickCover(items);
    usedCovers.add(cover.id);
    memories.push({
      id: `place-${placeName}`,
      title: placeName,
      subtitle: `${items.length} ${items.length === 1 ? 'shot' : 'shots'}`,
      coverPhoto: cover,
      photos: items.slice(0, 14),
    });
  }

  // 5. Previous Month Highlight (if available)
  if (sortedMonths.length > 1) {
    const [prevYm, items] = sortedMonths[1];
    const ranked = [...items].sort((a, b) => scorePhoto(b) - scorePhoto(a));
    const cover = pickCover(ranked);
    usedCovers.add(cover.id);
    memories.push({
      id: `best-${prevYm}`,
      title: `Best of ${monthNameFromYm(prevYm)}`,
      subtitle: `${items.length} ${items.length === 1 ? 'highlight' : 'highlights'}`,
      coverPhoto: cover,
      photos: ranked.slice(0, 14),
    });
  }

  // 6. Recent Moments
  if (memories.length < 3 && byNewest.length >= 2) {
    const recentSlice = byNewest.slice(0, 10);
    const cover = pickCover(recentSlice);
    memories.push({
      id: 'recent-moments',
      title: 'Recent Moments',
      subtitle: `${recentSlice.length} latest photos`,
      coverPhoto: cover,
      photos: recentSlice,
    });
  }

  return memories;
}

interface MemoriesCarouselProps {
  photos: PhotoItem[];
  onOpenMemory: (memory: MemoryCollection) => void;
}

export function MemoriesCarousel({ photos, onOpenMemory }: MemoriesCarouselProps) {
  const memories = useMemo(() => buildMemories(photos), [photos]);

  if (memories.length === 0) return null;

  return (
    <section aria-label="Highlights and Memories" className="mb-5">
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {memories.map((mem) => (
          <button
            key={mem.id}
            onClick={() => onOpenMemory(mem)}
            className="group relative aspect-[3/4] w-[152px] shrink-0 overflow-hidden rounded-[22px] bg-[var(--sf)] text-left shadow-xl ring-1 ring-[#c8a464]/20 transition duration-200 hover:-translate-y-0.5 hover:ring-[#c8a464]/65 sm:w-[176px]"
          >
            <img
              loading="lazy"
              src={mem.coverPhoto.thumbSrc || mem.coverPhoto.src}
              alt={mem.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050608]/95 via-[#090b10]/35 to-transparent" />
            <div className="pointer-events-none absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-[#e8e3d9] opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
              <Sparkles className="h-3 w-3 text-[var(--ac)]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5">
              <div className="font-display line-clamp-2 text-[16px] leading-tight font-semibold text-[#e8e3d9] drop-shadow-sm">
                {mem.title}
              </div>
              <div className="mt-1 text-[11px] font-medium text-[#c4bdb0] opacity-0 transition group-hover:opacity-100">
                {mem.subtitle}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
