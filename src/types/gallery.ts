export type CompressionPreset = 'balanced' | 'compact' | 'lossless';

export type ViewMode =
  | 'photos'
  | 'folders'
  | 'folder'
  | 'favs'
  | 'trash'
  | 'profiles'
  | 'videos'
  | 'recent'
  | 'archive'
  | 'locked';

export type ZoomMode = 'day' | 'month';

export type LayoutMode = 'comfortable' | 'compact' | 'large';

export type SortMode =
  | 'newest'
  | 'oldest'
  | 'largest'
  | 'smallest'
  | 'name_asc'
  | 'name_desc';

export interface ExifMetadata {
  make?: string;
  model?: string;
  lens?: string;
  software?: string;
  iso?: number;
  aperture?: string;
  shutter?: string;
  focalLength?: string;
  orientation?: number;
  dateTimeOriginal?: string;
  offsetTime?: string;
  subSec?: string;
  lat?: number;
  lng?: number;
  originalFileName?: string;
  originalMimeType?: string;
  originalLastModified?: number;
  hasEmbeddedMetadata?: boolean;
}

export interface EditState {
  b: number;
  c: number;
  s: number;
  w: number;
  rot: number;
  fl: number;
  ar: number;
  f: string;
}

export interface PhotoItem {
  id: number;
  profileId: string;
  name: string;
  folder: string;
  date: string;
  time: string;
  ts: number;
  lastModified?: number;
  dsrc: string;
  place: string;
  desc?: string;
  fav: boolean;
  del: boolean;
  archived?: boolean;
  locked?: boolean;
  backedUp: boolean;
  a: number; // aspect ratio width / height
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number; // e.g., 0.84 means 84% smaller
  compressionMs: number;
  compressionPreset: CompressionPreset;
  format: string;
  compressedFormat: string;
  src: string; // display (compressed) object URL
  thumbSrc: string; // fast thumbnail object URL
  origSrc: string; // full-resolution original object URL
  ob: Blob; // original full-res File/Blob with untouched embedded metadata
  blob: Blob; // optimized display blob
  thumbBlob?: Blob; // fast thumbnail blob
  E?: EditState;
  tags: string[];
  preTags?: string[];
  preTagged?: boolean;
  ai?: boolean;
  dHash?: string;
  exif?: ExifMetadata;
}

export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  role: string;
  location: string;
  bio: string;
  avatarPhotoId?: number | null;
  coverPhotoId?: number | null;
  isMainOpenerDefault: boolean;
  compressionPreset: CompressionPreset;
  createdAt: number;
}

export interface DynamicAlbum {
  name: string;
  query: string;
}

export interface SearchResult {
  q: string;
  label: string;
  ids: Set<number>;
  ans: string;
  ai: boolean;
}

export interface ThemePalette {
  bg: string;
  sf: string;
  tx: string;
  tx2: string;
  ac: string;
  acb: string;
  ln: string;
}

export interface ThemeConfig {
  n: string;
  e: string;
  logo: string;
  fx?: 'sea' | 'stars' | 'rainred' | 'rain' | 'hallo';
  bgi?: string;
  nav?: [string, string, string];
  v: ThemePalette;
}

export interface GifBgOptions {
  fit: 'cover' | 'contain' | 'fill';
  blur: number;
  dim: number;
}
