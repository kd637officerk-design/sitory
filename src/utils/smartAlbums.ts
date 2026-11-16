import type { DynamicAlbum, PhotoItem } from '../types/gallery';
import { MONTHS } from './compression';

export interface SmartAlbumSuggestion {
  id: string;
  name: string;
  query: string;
  reason: string;
  matchedTags: string[];
  count: number;
  previewPhotos: PhotoItem[];
  isAiPattern: boolean;
}

const IGNORED_GENERIC_TAGS = new Set([
  'upload',
  'landscape',
  'portrait',
  'square',
  'dark',
  'bright',
  'monochrome',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  ...MONTHS,
]);

function photoSearchCorpus(p: PhotoItem): string {
  return [
    ...p.tags,
    p.folder,
    p.place,
    p.date,
    p.name,
    p.desc || '',
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Matches a photo against a Dynamic/Smart Album query.
 * Supports:
 *  - Space-separated AND tokens: "vacation 2024"
 *  - Pipe-separated OR clauses: "food|lunch|dinner" or "beach 2024|coastal 2024"
 */
export function matchAlbumQuery(photo: PhotoItem, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return false;
  const corpus = photoSearchCorpus(photo);
  const orClauses = q
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);

  return orClauses.some((clause) => {
    const tokens = clause.split(/\s+/).filter(Boolean);
    return tokens.every((tok) => corpus.includes(tok));
  });
}

interface PatternDefinition {
  id: string;
  title: string;
  keywords: string[];
  groupByYear?: boolean;
}

const CURATED_PATTERNS: PatternDefinition[] = [
  {
    id: 'food',
    title: 'Food & Dining',
    keywords: ['food', 'lunch', 'dinner', 'breakfast', 'coffee', 'meal', 'dish', 'dessert', 'restaurant', 'cafe', 'kitchen'],
  },
  {
    id: 'pets',
    title: 'Pets & Animals',
    keywords: ['pet', 'pets', 'dog', 'dogs', 'puppy', 'cat', 'cats', 'kitten', 'animal', 'bird', 'wildlife'],
  },
  {
    id: 'vacation',
    title: 'Vacation',
    keywords: ['vacation', 'travel', 'trip', 'holiday', 'beach', 'coastal', 'expedition', 'mountain', 'mountains', 'alpine', 'resort', 'island'],
    groupByYear: true,
  },
  {
    id: 'architecture',
    title: 'Architecture',
    keywords: ['architecture', 'brutalist', 'building', 'concrete', 'bridge', 'cathedral', 'skyline', 'facade', 'interior'],
  },
  {
    id: 'sunset',
    title: 'Sunsets & Coast',
    keywords: ['sunset', 'sunrise', 'dawn', 'dusk', 'coastal', 'ocean', 'sea', 'horizon', 'golden'],
  },
  {
    id: 'nature',
    title: 'Nature & Botanical',
    keywords: ['botanical', 'leaves', 'leaf', 'flower', 'flowers', 'plant', 'forest', 'garden', 'tree', 'nature', 'alpine'],
  },
  {
    id: 'night',
    title: 'Night & Street',
    keywords: ['night', 'rain', 'neon', 'street', 'evening', 'urban', 'traffic'],
  },
  {
    id: 'macro',
    title: 'Macro & Tech',
    keywords: ['macro', 'circuit', 'electronics', 'pcb', 'hardware', 'microchip', 'closeup', 'gadget', 'keyboard'],
  },
  {
    id: 'portraits',
    title: 'Portraits & People',
    keywords: ['person', 'people', 'selfie', 'smile', 'face', 'friends', 'family', 'wedding', 'party'],
  },
];

function capitalizeLabel(word: string): string {
  return word.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function suggestSmartAlbums(
  livePhotos: PhotoItem[],
  existingAlbums: DynamicAlbum[]
): SmartAlbumSuggestion[] {
  if (livePhotos.length === 0) return [];

  const existingNames = new Set(existingAlbums.map((a) => a.name.trim().toLowerCase()));
  const existingQueries = new Set(existingAlbums.map((a) => a.query.trim().toLowerCase()));
  const suggestions: SmartAlbumSuggestion[] = [];
  const usedNames = new Set<string>();

  const tryPush = (item: SmartAlbumSuggestion) => {
    const nameKey = item.name.trim().toLowerCase();
    const queryKey = item.query.trim().toLowerCase();
    if (existingNames.has(nameKey) || existingQueries.has(queryKey) || usedNames.has(nameKey)) {
      return;
    }
    usedNames.add(nameKey);
    suggestions.push(item);
  };

  // 1. Curated semantic AI tag pattern clusters (e.g., Vacation 2024, Food & Dining, Pets & Animals)
  for (const pattern of CURATED_PATTERNS) {
    const kwSet = new Set(pattern.keywords);
    const matchingPhotos = livePhotos.filter((p) => {
      const tokens = new Set([
        ...p.tags.map((t) => t.toLowerCase()),
        p.folder.toLowerCase(),
        ...(p.place ? p.place.toLowerCase().split(/\W+/) : []),
      ]);
      return pattern.keywords.some((kw) => tokens.has(kw));
    });

    if (matchingPhotos.length === 0) continue;

    if (pattern.groupByYear) {
      const byYear = new Map<string, PhotoItem[]>();
      for (const p of matchingPhotos) {
        const yr = p.date.slice(0, 4);
        if (!/^\d{4}$/.test(yr)) continue;
        const arr = byYear.get(yr) || [];
        arr.push(p);
        byYear.set(yr, arr);
      }

      const yearsSorted = Array.from(byYear.entries()).sort((a, b) => b[0].localeCompare(a[0]));
      for (const [yr, yrPhotos] of yearsSorted) {
        if (yrPhotos.length < (livePhotos.length > 10 ? 2 : 1)) continue;
        const foundTags = Array.from(
          new Set(
            yrPhotos.flatMap((p) => p.tags.map((t) => t.toLowerCase())).filter((t) => kwSet.has(t))
          )
        ).slice(0, 3);
        const queryTokens = (foundTags.length ? foundTags : pattern.keywords.slice(0, 4))
          .map((t) => `${t} ${yr}`)
          .join('|');
        tryPush({
          id: `${pattern.id}-${yr}`,
          name: `${pattern.title} ${yr}`,
          query: queryTokens,
          reason: `AI tags (${foundTags.join(', ') || pattern.title.toLowerCase()}) in ${yr}`,
          matchedTags: [...foundTags, yr],
          count: yrPhotos.length,
          previewPhotos: yrPhotos.slice(0, 3),
          isAiPattern: yrPhotos.some((p) => Boolean(p.ai)),
        });
      }
    }

    if (matchingPhotos.length >= (livePhotos.length > 10 ? 2 : 1)) {
      const foundTags = Array.from(
        new Set(
          matchingPhotos.flatMap((p) => p.tags.map((t) => t.toLowerCase())).filter((t) => kwSet.has(t))
        )
      ).slice(0, 4);
      const query = (foundTags.length ? foundTags : pattern.keywords.slice(0, 5)).join('|');
      tryPush({
        id: pattern.id,
        name: pattern.title,
        query,
        reason: `Detected tags: ${foundTags.join(', ') || pattern.keywords.slice(0, 2).join(', ')}`,
        matchedTags: foundTags,
        count: matchingPhotos.length,
        previewPhotos: matchingPhotos.slice(0, 3),
        isAiPattern: matchingPhotos.some((p) => Boolean(p.ai)),
      });
    }
  }

  // 2. Frequent individual AI tags not already represented
  const tagCounts = new Map<string, { photos: PhotoItem[]; aiHits: number }>();
  for (const p of livePhotos) {
    const folderLower = p.folder.toLowerCase();
    const seenForPhoto = new Set<string>();
    for (const rawTag of p.tags) {
      const tag = rawTag.trim().toLowerCase();
      if (
        !tag ||
        tag.length < 3 ||
        seenForPhoto.has(tag) ||
        IGNORED_GENERIC_TAGS.has(tag) ||
        /^\d{4}$/.test(tag) ||
        tag === folderLower
      ) {
        continue;
      }
      seenForPhoto.add(tag);
      const entry = tagCounts.get(tag) || { photos: [], aiHits: 0 };
      entry.photos.push(p);
      if (p.ai) entry.aiHits += 1;
      tagCounts.set(tag, entry);
    }
  }

  const coveredKeywords = new Set(
    suggestions.flatMap((s) => s.matchedTags.map((t) => t.toLowerCase()))
  );

  const frequentTags = Array.from(tagCounts.entries())
    .filter(([tag, info]) => !coveredKeywords.has(tag) && info.photos.length >= (livePhotos.length > 8 ? 2 : 1))
    .sort((a, b) => b[1].photos.length - a[1].photos.length || b[1].aiHits - a[1].aiHits)
    .slice(0, 6);

  for (const [tag, info] of frequentTags) {
    tryPush({
      id: `tag-${tag}`,
      name: capitalizeLabel(tag),
      query: tag,
      reason: `Frequent ${info.aiHits > 0 ? 'AI ' : ''}tag across ${info.photos.length} ${info.photos.length === 1 ? 'photo' : 'photos'}`,
      matchedTags: [tag],
      count: info.photos.length,
      previewPhotos: info.photos.slice(0, 3),
      isAiPattern: info.aiHits > 0,
    });
  }

  // 3. Frequent Places (e.g., Lisbon, Tokyo, Kyoto)
  const placeGroups = new Map<string, PhotoItem[]>();
  for (const p of livePhotos) {
    if (!p.place) continue;
    const shortPlace = p.place.split(',')[0].trim();
    if (!shortPlace) continue;
    const arr = placeGroups.get(shortPlace) || [];
    arr.push(p);
    placeGroups.set(shortPlace, arr);
  }
  for (const [placeName, pItems] of placeGroups.entries()) {
    if (pItems.length < 1) continue;
    tryPush({
      id: `place-${placeName.toLowerCase()}`,
      name: placeName,
      query: placeName.toLowerCase(),
      reason: `Location pattern · ${pItems.length} ${pItems.length === 1 ? 'photo' : 'photos'}`,
      matchedTags: [placeName],
      count: pItems.length,
      previewPhotos: pItems.slice(0, 3),
      isAiPattern: false,
    });
  }

  return suggestions
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return Number(b.isAiPattern) - Number(a.isAiPattern);
    })
    .slice(0, 8);
}
