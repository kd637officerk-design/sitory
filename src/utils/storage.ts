import type { DynamicAlbum, PhotoItem, UserProfile } from '../types/gallery';

const DB_NAME = 'bill-world-gallery';
const STORE_NAME = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'writeonly' as unknown as IDBTransactionMode);
      void tx;
    } catch {
      // ignore
    }
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export interface StoredPhotoRecord {
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
  a: number;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionMs: number;
  compressionPreset: 'balanced' | 'compact' | 'lossless';
  format: string;
  compressedFormat: string;
  ob: Blob;
  blob: Blob;
  thumbBlob?: Blob;
  E?: PhotoItem['E'];
  tags: string[];
  preTags?: string[];
  preTagged?: boolean;
  ai?: boolean;
  dHash?: string;
  exif?: PhotoItem['exif'];
}

export async function savePhotosToDb(photos: PhotoItem[]): Promise<void> {
  const records: StoredPhotoRecord[] = photos.map((p) => ({
    id: p.id,
    profileId: p.profileId,
    name: p.name,
    folder: p.folder,
    date: p.date,
    time: p.time,
    ts: p.ts,
    lastModified: p.lastModified,
    dsrc: p.dsrc,
    place: p.place,
    desc: p.desc,
    fav: p.fav,
    del: p.del,
    archived: p.archived,
    locked: p.locked,
    backedUp: p.backedUp,
    a: p.a,
    width: p.width,
    height: p.height,
    originalSize: p.originalSize,
    compressedSize: p.compressedSize,
    compressionRatio: p.compressionRatio,
    compressionMs: p.compressionMs,
    compressionPreset: p.compressionPreset,
    format: p.format,
    compressedFormat: p.compressedFormat,
    ob: p.ob,
    blob: p.blob,
    thumbBlob: p.thumbBlob,
    E: p.E,
    tags: p.tags,
    preTags: p.preTags,
    preTagged: p.preTagged,
    ai: p.ai,
    dHash: p.dHash,
    exif: p.exif,
  }));
  await kvSet('photos', records);
}

export async function loadPhotosFromDb(): Promise<PhotoItem[]> {
  const records = await kvGet<StoredPhotoRecord[]>('photos');
  if (!records || !Array.isArray(records)) return [];
  return records.map((r) => {
    const origUrl = URL.createObjectURL(r.ob || r.blob);
    const displayUrl = URL.createObjectURL(r.blob || r.ob);
    const thumbUrl = r.thumbBlob ? URL.createObjectURL(r.thumbBlob) : displayUrl;
    return {
      ...r,
      profileId: r.profileId || 'profile-1',
      name: r.name || `photo-${r.id}.jpg`,
      folder: r.folder || 'Camera',
      backedUp: Boolean(r.backedUp),
      width: r.width || 1600,
      height: r.height || 1200,
      originalSize: r.originalSize || r.ob?.size || 0,
      compressedSize: r.compressedSize || r.blob?.size || 0,
      compressionRatio: r.compressionRatio || 0,
      compressionMs: r.compressionMs || 0,
      compressionPreset: r.compressionPreset || 'balanced',
      format: r.format || 'JPEG',
      compressedFormat: r.compressedFormat || 'WebP',
      src: displayUrl,
      thumbSrc: thumbUrl,
      origSrc: origUrl,
    };
  });
}

export interface PersistedSettings {
  albums: DynamicAlbum[];
  customFolders: string[];
  activeProfileId: string;
}

const SETTINGS_KEY = 'bw-app-settings-v2';

export function loadSettings(): Partial<PersistedSettings> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<PersistedSettings>;
  } catch {
    return {};
  }
}

export function saveSettings(settings: Partial<PersistedSettings>): void {
  try {
    const prev = loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...settings }));
  } catch {
    // ignore quota errors
  }
}

export async function saveProfilesToDb(profiles: UserProfile[]): Promise<void> {
  await kvSet('profiles', profiles);
}

export async function loadProfilesFromDb(): Promise<UserProfile[]> {
  const data = await kvGet<UserProfile[]>('profiles');
  return Array.isArray(data) ? data : [];
}
