import type { CompressionPreset, ExifMetadata, PhotoItem, UserProfile } from '../types/gallery';

export const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} kB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  return `${(n / 1_000_000_000).toFixed(2)} GB`;
}

export function formatCount(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

export function formatIsoDate(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function folderFromFile(f: File): string {
  if (/screen[ _-]?shot/i.test(f.name)) return 'Screenshots';
  if (/jpe?g|heic|heif|raw|dng|cr2|nef|arw/i.test(f.type + f.name)) return 'Camera';
  return 'Downloads';
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function parseTiffMetadata(
  b: DataView,
  tiffStart: number,
  exif: ExifMetadata
): Date | null {
  if (tiffStart + 8 > b.byteLength) return null;
  const endian = b.getUint16(tiffStart);
  if (endian !== 0x4949 && endian !== 0x4d4d) return null;
  const le = endian === 0x4949;
  const g2 = (x: number) => (x >= 0 && x + 2 <= b.byteLength ? b.getUint16(x, le) : 0);
  const g4 = (x: number) => (x >= 0 && x + 4 <= b.byteLength ? b.getUint32(x, le) : 0);

  const rd = (i: number) => {
    const count = Math.min(g2(i), 250);
    const rec: Record<number, { type: number; count: number; valOffset: number; rawOff: number }> = {};
    for (let k = 0; k < count; k++) {
      const e = i + 2 + k * 12;
      if (e + 12 > b.byteLength) break;
      rec[g2(e)] = {
        type: g2(e + 2),
        count: g4(e + 4),
        valOffset: g4(e + 8),
        rawOff: e + 8,
      };
    }
    return rec;
  };

  const readTagAscii = (tag?: { count: number; valOffset: number; rawOff: number }) => {
    if (!tag || !tag.count) return '';
    const off = tag.count <= 4 ? tag.rawOff : tiffStart + tag.valOffset;
    return readAscii(b, off, tag.count);
  };

  const ifd0Offset = g4(tiffStart + 4);
  const ifd0 = rd(tiffStart + ifd0Offset);

  if (ifd0[0x010f]) exif.make = readTagAscii(ifd0[0x010f]);
  if (ifd0[0x0110]) exif.model = readTagAscii(ifd0[0x0110]);
  if (ifd0[0x0131]) exif.software = readTagAscii(ifd0[0x0131]);
  if (ifd0[0x0112]) exif.orientation = g2(ifd0[0x0112].rawOff);

  const exIfd = ifd0[0x8769] ? rd(tiffStart + ifd0[0x8769].valOffset) : {};
  if (exIfd[0x8827]) exif.iso = g2(exIfd[0x8827].rawOff);
  if (exIfd[0xa434]) exif.lens = readTagAscii(exIfd[0xa434]);

  if (exIfd[0x829d]) {
    const off = tiffStart + exIfd[0x829d].valOffset;
    const num = g4(off);
    const den = g4(off + 4) || 1;
    if (num) exif.aperture = `f/${(num / den).toFixed(1).replace(/\.0$/, '')}`;
  }
  if (exIfd[0x829a]) {
    const off = tiffStart + exIfd[0x829a].valOffset;
    const num = g4(off);
    const den = g4(off + 4) || 1;
    if (num) {
      exif.shutter = num < den ? `1/${Math.round(den / num)}s` : `${(num / den).toFixed(1)}s`;
    }
  }
  if (exIfd[0x920a]) {
    const off = tiffStart + exIfd[0x920a].valOffset;
    const num = g4(off);
    const den = g4(off + 4) || 1;
    if (num) exif.focalLength = `${Math.round(num / den)}mm`;
  }

  // GPS IFD (0x8825)
  if (ifd0[0x8825]) {
    const gpsIfd = rd(tiffStart + ifd0[0x8825].valOffset);
    const readDms = (tag?: { valOffset: number }) => {
      if (!tag) return null;
      const off = tiffStart + tag.valOffset;
      if (off + 24 > b.byteLength) return null;
      const d = g4(off) / (g4(off + 4) || 1);
      const m = g4(off + 8) / (g4(off + 12) || 1);
      const s = g4(off + 16) / (g4(off + 20) || 1);
      if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(s)) return null;
      return d + m / 60 + s / 3600;
    };
    const latRef = readTagAscii(gpsIfd[0x0001]);
    const latVal = readDms(gpsIfd[0x0002]);
    const lngRef = readTagAscii(gpsIfd[0x0003]);
    const lngVal = readDms(gpsIfd[0x0004]);
    if (latVal !== null && lngVal !== null) {
      exif.lat = Number((latRef === 'S' ? -latVal : latVal).toFixed(6));
      exif.lng = Number((lngRef === 'W' ? -lngVal : lngVal).toFixed(6));
    }
  }

  const subSec = readTagAscii(exIfd[0x9291] || exIfd[0x9292] || exIfd[0x9290]);
  if (subSec) exif.subSec = subSec;
  const offsetTime = readTagAscii(exIfd[0x9011] || exIfd[0x9010]);
  if (offsetTime) exif.offsetTime = offsetTime;

  const dateStr = readTagAscii(exIfd[0x9003] || exIfd[0x9004] || ifd0[0x0132]);
  if (dateStr) {
    exif.dateTimeOriginal = dateStr;
    const q = dateStr.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
    if (q && Number(q[1]) > 1990) {
      const ms = subSec ? Number(subSec.slice(0, 3).padEnd(3, '0')) || 0 : 0;
      return new Date(+q[1], +q[2] - 1, +q[3], +q[4], +q[5], +q[6], ms);
    }
  }
  return null;
}

function parseXmpDate(text: string): Date | null {
  const m = text.match(
    /(?:photoshop:DateCreated|xmp:CreateDate|exif:DateTimeOriginal|xmp:ModifyDate)["'>\s=]+(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/i
  );
  if (!m) return null;
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) || 0 : 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
}

export async function extractExifAndDate(
  file: File
): Promise<{ date: Date; source: string; exif: ExifMetadata }> {
  const exif: ExifMetadata = {
    originalFileName: file.name,
    originalMimeType: file.type || 'image/jpeg',
    originalLastModified: file.lastModified || Date.now(),
    hasEmbeddedMetadata: false,
  };

  try {
    const sliceSize = Math.min(file.size, 524288);
    const buf = await file.slice(0, sliceSize).arrayBuffer();
    const b = new DataView(buf);

    // 1. JPEG APP1 (EXIF & XMP)
    if (b.byteLength > 12 && b.getUint16(0) === 0xffd8) {
      let o = 2;
      let parsedDate: Date | null = null;
      let parsedSource = '';

      while (o < b.byteLength - 10) {
        const marker = b.getUint16(o);
        if (marker === 0xffda || marker === 0xffd9) break; // SOS or EOI
        const len = b.getUint16(o + 2);
        if (len < 2) break;

        if (marker === 0xffe1 && o + 10 < b.byteLength) {
          // Exif\0\0
          if (b.getUint32(o + 4) === 0x45786966) {
            exif.hasEmbeddedMetadata = true;
            const d = parseTiffMetadata(b, o + 10, exif);
            if (d && !parsedDate) {
              parsedDate = d;
              parsedSource = 'EXIF DateTimeOriginal';
            }
          } else {
            const sig = readAscii(b, o + 4, 29);
            if (sig.includes('ns.adobe.com/xap')) {
              exif.hasEmbeddedMetadata = true;
              const xmpBytes = new Uint8Array(buf, o + 4, Math.min(len - 2, b.byteLength - o - 4));
              const xmpText = new TextDecoder().decode(xmpBytes);
              const xd = parseXmpDate(xmpText);
              if (xd && !parsedDate) {
                parsedDate = xd;
                parsedSource = 'XMP metadata';
              }
            }
          }
        }
        if ((marker & 0xff00) !== 0xff00) break;
        o += 2 + len;
      }

      if (parsedDate) {
        return { date: parsedDate, source: parsedSource, exif };
      }
    }

    // 2. PNG eXIf / XMP chunks
    if (b.byteLength > 16 && b.getUint32(0) === 0x89504e47) {
      let o = 8;
      while (o + 12 <= b.byteLength) {
        const chunkLen = b.getUint32(o);
        const type = readAscii(b, o + 4, 4);
        if (type === 'eXIf' && o + 8 + chunkLen <= b.byteLength) {
          exif.hasEmbeddedMetadata = true;
          const d = parseTiffMetadata(b, o + 8, exif);
          if (d) return { date: d, source: 'PNG eXIf metadata', exif };
        } else if ((type === 'iTXt' || type === 'tEXt') && o + 8 + chunkLen <= b.byteLength) {
          const text = new TextDecoder().decode(new Uint8Array(buf, o + 8, Math.min(chunkLen, 65536)));
          if (text.includes('ns.adobe.com') || text.includes('DateCreated')) {
            exif.hasEmbeddedMetadata = true;
            const xd = parseXmpDate(text);
            if (xd) return { date: xd, source: 'PNG XMP metadata', exif };
          }
        }
        if (type === 'IDAT' || type === 'IEND') break;
        o += 12 + chunkLen;
      }
    }

    // 3. WebP RIFF EXIF / XMP chunks
    if (
      b.byteLength > 20 &&
      readAscii(b, 0, 4) === 'RIFF' &&
      readAscii(b, 8, 4) === 'WEBP'
    ) {
      let o = 12;
      while (o + 8 <= b.byteLength) {
        const chunkId = readAscii(b, o, 4);
        const chunkSize = b.getUint32(o + 4, true);
        if (chunkId === 'EXIF' && o + 8 < b.byteLength) {
          exif.hasEmbeddedMetadata = true;
          const tiffOff = readAscii(b, o + 8, 4) === 'Exif' ? o + 14 : o + 8;
          const d = parseTiffMetadata(b, tiffOff, exif);
          if (d) return { date: d, source: 'WebP EXIF metadata', exif };
        } else if (chunkId === 'XMP ' && o + 8 + chunkSize <= b.byteLength) {
          exif.hasEmbeddedMetadata = true;
          const text = new TextDecoder().decode(new Uint8Array(buf, o + 8, Math.min(chunkSize, 65536)));
          const xd = parseXmpDate(text);
          if (xd) return { date: xd, source: 'WebP XMP metadata', exif };
        }
        o += 8 + chunkSize + (chunkSize % 2);
      }
    }
  } catch {
    // ignore malformed EXIF/XMP blocks
  }

  // 4. Fallback to file name timestamp if present
  const m = file.name.match(
    /(19\d\d|20\d\d)[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[-_. T]*([01]\d|2[0-3])[-_.:]?([0-5]\d)[-_.:]?([0-5]\d))?/
  );
  if (m) {
    return {
      date: new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)),
      source: 'file name',
      exif,
    };
  }

  // 5. Fallback to original filesystem lastModified timestamp
  return {
    date: file.lastModified ? new Date(file.lastModified) : new Date(),
    source: 'file lastModified',
    exif,
  };
}

async function decodeImageSource(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // fallback to HTMLImageElement
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return {
    source: img,
    width: img.naturalWidth || 1600,
    height: img.naturalHeight || 1200,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

async function canvasToBestBlob(
  canvas: HTMLCanvasElement,
  quality: number,
  preferWebp = true
): Promise<{ blob: Blob; format: string }> {
  const toBlob = (mime: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), mime, q));

  if (preferWebp) {
    const webp = await toBlob('image/webp', quality);
    if (webp && webp.type === 'image/webp' && webp.size > 0) {
      return { blob: webp, format: 'WebP' };
    }
  }
  const jpeg = await toBlob('image/jpeg', quality);
  if (jpeg) return { blob: jpeg, format: 'JPEG' };
  const png = await toBlob('image/png', 1);
  return { blob: png || new Blob(), format: 'PNG' };
}

export interface CompressionResult {
  width: number;
  height: number;
  aspectRatio: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionMs: number;
  format: string;
  compressedFormat: string;
  displayBlob: Blob;
  thumbBlob: Blob;
  origBlob: Blob;
}

const PRESET_CONFIG: Record<CompressionPreset, { maxDim: number; quality: number }> = {
  balanced: { maxDim: 2048, quality: 0.84 },
  compact: { maxDim: 1440, quality: 0.72 },
  lossless: { maxDim: 4096, quality: 0.94 },
};

export async function compressImagePipeline(
  origBlob: Blob,
  preset: CompressionPreset = 'balanced',
  fileName = 'image.jpg'
): Promise<CompressionResult> {
  const t0 = performance.now();
  const decoded = await decodeImageSource(origBlob);
  const { source, width, height, cleanup } = decoded;
  const origFormat = (origBlob.type.split('/')[1] || fileName.split('.').pop() || 'IMG')
    .toUpperCase()
    .replace('JPEG', 'JPG');

  try {
    const cfg = PRESET_CONFIG[preset];

    // 1. Fast Thumbnail (480px max)
    const thumbScale = Math.min(1, 480 / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * thumbScale));
    const th = Math.max(1, Math.round(height * thumbScale));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw;
    thumbCanvas.height = th;
    const tCtx = thumbCanvas.getContext('2d');
    if (tCtx) {
      tCtx.imageSmoothingEnabled = true;
      tCtx.imageSmoothingQuality = 'high';
      tCtx.drawImage(source, 0, 0, tw, th);
    }
    const { blob: thumbBlob } = await canvasToBestBlob(thumbCanvas, 0.76, true);

    // 2. Optimized Display Asset
    let displayBlob = origBlob;
    let compressedFormat = origFormat;

    if (preset === 'lossless' && origBlob.size <= 3_500_000) {
      displayBlob = origBlob;
      compressedFormat = origFormat;
    } else {
      const dispScale = Math.min(1, cfg.maxDim / Math.max(width, height));
      const dw = Math.max(1, Math.round(width * dispScale));
      const dh = Math.max(1, Math.round(height * dispScale));
      const dispCanvas = document.createElement('canvas');
      dispCanvas.width = dw;
      dispCanvas.height = dh;
      const dCtx = dispCanvas.getContext('2d');
      if (dCtx) {
        dCtx.imageSmoothingEnabled = true;
        dCtx.imageSmoothingQuality = 'high';
        dCtx.drawImage(source, 0, 0, dw, dh);
      }
      const candidate = await canvasToBestBlob(dispCanvas, cfg.quality, true);
      if (candidate.blob.size > 0 && (candidate.blob.size < origBlob.size || dispScale < 1)) {
        displayBlob = candidate.blob;
        compressedFormat = candidate.format;
      }
    }

    const compressionMs = Math.max(1, Math.round(performance.now() - t0));
    const ratio = origBlob.size > 0 ? Math.max(0, 1 - displayBlob.size / origBlob.size) : 0;

    return {
      width,
      height,
      aspectRatio: width / Math.max(1, height),
      originalSize: origBlob.size,
      compressedSize: displayBlob.size,
      compressionRatio: ratio,
      compressionMs,
      format: origFormat,
      compressedFormat,
      displayBlob,
      thumbBlob,
      origBlob,
    };
  } finally {
    cleanup();
  }
}

export async function blobToDataUrl(blob: Blob, maxDim = 960): Promise<string> {
  const decoded = await decodeImageSource(blob);
  try {
    const scale = Math.min(1, maxDim / Math.max(decoded.width, decoded.height));
    const w = Math.max(1, Math.round(decoded.width * scale));
    const h = Math.max(1, Math.round(decoded.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (ctx) ctx.drawImage(decoded.source, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    decoded.cleanup();
  }
}

export async function computeColorTags(src: string, aspect: number): Promise<string[]> {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => {});
  if (!img.naturalWidth) return [];
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 24;
  const ctx = c.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, 24, 24);
  const d = ctx.getImageData(0, 0, 24, 24).data;
  const hb = new Array<number>(8).fill(0);
  let L = 0;
  let S = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const df = mx - mn;
    L += mx;
    S += mx ? df / mx : 0;
    if (df > 0.15 && mx > 0.2) {
      const h =
        (mx === r ? ((g - b) / df + 6) % 6 : mx === g ? (b - r) / df + 2 : (r - g) / df + 4) * 60;
      const bucket =
        h < 15 || h >= 345
          ? 0
          : h < 45
          ? 1
          : h < 70
          ? 2
          : h < 165
          ? 3
          : h < 195
          ? 4
          : h < 255
          ? 5
          : h < 290
          ? 6
          : 7;
      hb[bucket] += df;
    }
  }
  const n = d.length / 4;
  const names = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
  const tags: string[] = [];
  L /= n;
  S /= n;
  if (S < 0.12) tags.push('monochrome');
  else {
    const m = Math.max(...hb);
    if (m > 0) tags.push(names[hb.indexOf(m)]);
  }
  if (L < 0.3) tags.push('dark');
  else if (L > 0.72) tags.push('bright');
  tags.push(aspect > 1.15 ? 'landscape' : aspect < 0.87 ? 'portrait' : 'square');
  return tags;
}

export async function computeDHash(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => {});
  if (!img.naturalWidth) return '';
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  let hash = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = y * 36 + x * 4;
      const b = a + 4;
      const la = d[a] * 0.3 + d[a + 1] * 0.6 + d[a + 2] * 0.1;
      const lb = d[b] * 0.3 + d[b + 1] * 0.6 + d[b + 2] * 0.1;
      hash += la > lb ? '1' : '0';
    }
  }
  return hash.split('1').length - 1 < 6 ? '' : hash;
}

export function createDefaultProfiles(): UserProfile[] {
  return [
    {
      id: 'profile-1',
      name: 'Bill Mercer',
      handle: '@billmercer',
      role: 'Lead Architectural Photographer',
      location: 'Seattle, WA',
      bio: 'Documenting Pacific Northwest brutalism, coastal dusk, and macro electronics in full uncompressed resolution.',
      avatarPhotoId: 1,
      coverPhotoId: 2,
      isMainOpenerDefault: true,
      compressionPreset: 'balanced',
      createdAt: Date.now() - 86400000 * 30,
    },
    {
      id: 'profile-2',
      name: 'Elena Vance',
      handle: '@elenavance',
      role: 'Editorial Portrait & Film',
      location: 'Lisbon, PT',
      bio: 'High-contrast street light, rain reflections, and medium-format portrait studies.',
      avatarPhotoId: 3,
      coverPhotoId: 4,
      isMainOpenerDefault: true,
      compressionPreset: 'lossless',
      createdAt: Date.now() - 86400000 * 14,
    },
    {
      id: 'profile-3',
      name: 'Marcus Sato',
      handle: '@marcussato',
      role: 'Alpine Field Researcher',
      location: 'Nagano, JP',
      bio: 'High-altitude ridge panoramas, botanical macro studies, and compressed field dispatches.',
      avatarPhotoId: 5,
      coverPhotoId: 6,
      isMainOpenerDefault: true,
      compressionPreset: 'compact',
      createdAt: Date.now() - 86400000 * 5,
    },
  ];
}

interface StarterSpec {
  id: number;
  profileId: string;
  name: string;
  folder: string;
  place: string;
  daysAgo: number;
  w: number;
  h: number;
  palette: [string, string, string];
  tags: string[];
  desc: string;
  fav: boolean;
  motif: 'architecture' | 'sunset' | 'macro' | 'rain' | 'alpine' | 'portrait';
}

const STARTER_SPECS: StarterSpec[] = [
  {
    id: 1,
    profileId: 'profile-1',
    name: 'glass-pavilion-4k.png',
    folder: 'Camera',
    place: 'Seattle Art Museum',
    daysAgo: 0,
    w: 2400,
    h: 1600,
    palette: ['#0d1b2a', '#415a77', '#e0a96d'],
    tags: ['architecture', 'glass', 'dusk', 'blue', 'landscape'],
    desc: 'Warm golden-hour light slicing across angled structural glass ribs and brushed steel.',
    fav: true,
    motif: 'architecture',
  },
  {
    id: 2,
    profileId: 'profile-1',
    name: 'coastal-horizon-uhd.png',
    folder: 'Camera',
    place: 'Olympic Coast',
    daysAgo: 1,
    w: 2560,
    h: 1440,
    palette: ['#12263a', '#f26a4b', '#ffd166'],
    tags: ['sunset', 'ocean', 'horizon', 'orange', 'landscape'],
    desc: 'Low Pacific tide reflecting amber clouds and distant sea stacks at twilight.',
    fav: true,
    motif: 'sunset',
  },
  {
    id: 3,
    profileId: 'profile-2',
    name: 'emerald-pcb-macro.png',
    folder: 'Macro Lab',
    place: 'Lisbon Studio',
    daysAgo: 2,
    w: 1800,
    h: 2400,
    palette: ['#0b3b24', '#2ecc71', '#d4af37'],
    tags: ['macro', 'circuit', 'hardware', 'green', 'portrait'],
    desc: 'Close-range inspection frame revealing gold-plated traces, solder pads, and optical sensor array.',
    fav: false,
    motif: 'macro',
  },
  {
    id: 4,
    profileId: 'profile-2',
    name: 'crosswalk-rain-study.png',
    folder: 'Street',
    place: 'Alfama, Lisbon',
    daysAgo: 4,
    w: 2400,
    h: 1600,
    palette: ['#11151c', '#212d40', '#f4d35e'],
    tags: ['street', 'rain', 'night', 'yellow', 'landscape'],
    desc: 'Wet asphalt zebra stripes catching neon amber reflections after an evening downpour.',
    fav: true,
    motif: 'rain',
  },
  {
    id: 5,
    profileId: 'profile-3',
    name: 'alpine-ridge-dawn.png',
    folder: 'Expedition',
    place: 'Kamikochi Valley',
    daysAgo: 8,
    w: 2400,
    h: 1800,
    palette: ['#1b263b', '#778da9', '#f7b267'],
    tags: ['mountains', 'dawn', 'alpine', 'blue', 'landscape'],
    desc: 'First crisp alpine sunlight cresting granite ridgelines above the morning valley mist.',
    fav: true,
    motif: 'alpine',
  },
  {
    id: 6,
    profileId: 'profile-3',
    name: 'botanical-monograph.png',
    folder: 'Field Notes',
    place: 'Kyoto Conservatory',
    daysAgo: 12,
    w: 1920,
    h: 2400,
    palette: ['#14281d', '#588157', '#dad7cd'],
    tags: ['botanical', 'leaves', 'minimal', 'green', 'portrait'],
    desc: 'Soft diffused skylight illuminating layered fern fronds with fine surface grain.',
    fav: false,
    motif: 'portrait',
  },
];

function renderStarterCanvasBlob(spec: StarterSpec): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = spec.w;
  c.height = spec.h;
  const ctx = c.getContext('2d')!;
  const [c0, c1, c2] = spec.palette;

  const grad = ctx.createLinearGradient(0, 0, spec.w, spec.h);
  grad.addColorStop(0, c0);
  grad.addColorStop(0.55, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, spec.w, spec.h);

  // Add crisp geometric architectural/photographic details for real zoom inspection
  ctx.save();
  if (spec.motif === 'architecture') {
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.04})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(i * (spec.w / 14), 0);
      ctx.lineTo(i * (spec.w / 14) - spec.h * 0.35, spec.h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(224, 169, 109, 0.25)';
    ctx.beginPath();
    ctx.arc(spec.w * 0.72, spec.h * 0.28, spec.h * 0.24, 0, Math.PI * 2);
    ctx.fill();
  } else if (spec.motif === 'sunset') {
    ctx.fillStyle = 'rgba(255, 209, 102, 0.75)';
    ctx.beginPath();
    ctx.arc(spec.w * 0.5, spec.h * 0.56, spec.h * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10, 20, 34, 0.78)';
    ctx.fillRect(0, spec.h * 0.62, spec.w, spec.h * 0.38);
    for (let y = 0; y < 24; y++) {
      ctx.fillStyle = `rgba(255, 190, 95, ${0.42 - y * 0.015})`;
      const w = spec.w * (0.28 - y * 0.008);
      ctx.fillRect((spec.w - w) / 2, spec.h * 0.63 + y * 18, w, 6);
    }
  } else if (spec.motif === 'macro') {
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 16; i++) {
      const y = 180 + i * 120;
      ctx.beginPath();
      ctx.moveTo(140, y);
      ctx.lineTo(spec.w * 0.45, y);
      ctx.lineTo(spec.w * 0.65, y - 60);
      ctx.lineTo(spec.w - 140, y - 60);
      ctx.stroke();
    }
    ctx.fillStyle = '#18181b';
    ctx.fillRect(spec.w * 0.34, spec.h * 0.32, spec.w * 0.32, spec.h * 0.36);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 8;
    ctx.strokeRect(spec.w * 0.34, spec.h * 0.32, spec.w * 0.32, spec.h * 0.36);
  } else if (spec.motif === 'rain') {
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 211, 94, 0.85)' : 'rgba(17, 21, 28, 0.5)';
      ctx.fillRect(spec.w * 0.1 + i * (spec.w * 0.09), spec.h * 0.55, spec.w * 0.055, spec.h * 0.4);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 120; i++) {
      const rx = (i * 197) % spec.w;
      const ry = (i * 313) % spec.h;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 14, ry + 64);
      ctx.stroke();
    }
  } else if (spec.motif === 'alpine') {
    const drawPeak = (x0: number, peakX: number, peakY: number, x1: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x0, spec.h);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(x1, spec.h);
      ctx.closePath();
      ctx.fill();
    };
    drawPeak(-100, spec.w * 0.28, spec.h * 0.36, spec.w * 0.72, 'rgba(27,38,59,0.72)');
    drawPeak(spec.w * 0.25, spec.w * 0.66, spec.h * 0.28, spec.w + 150, 'rgba(13,27,42,0.86)');
    drawPeak(-50, spec.w * 0.45, spec.h * 0.48, spec.w * 0.95, 'rgba(15,23,42,0.94)');
  } else {
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(218, 215, 205, ${0.1 + (i % 3) * 0.06})`;
      ctx.beginPath();
      ctx.ellipse(
        spec.w * 0.5 + Math.cos(i * 0.6) * 240,
        spec.h * 0.5 + Math.sin(i * 0.6) * 320,
        320,
        95,
        i * 0.45,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  // Fine high-frequency micro-grid texture so 1:1 pixel zoom shows sharp detail
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < spec.w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, spec.h);
    ctx.stroke();
  }
  for (let y = 0; y < spec.h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(spec.w, y);
    ctx.stroke();
  }
  ctx.restore();

  return new Promise((resolve) => {
    c.toBlob((blob) => resolve(blob || new Blob()), 'image/png');
  });
}

export async function generateStarterLibrary(): Promise<{
  photos: PhotoItem[];
  profiles: UserProfile[];
}> {
  const profiles = createDefaultProfiles();
  const photos: PhotoItem[] = [];

  for (const spec of STARTER_SPECS) {
    const origBlob = await renderStarterCanvasBlob(spec);
    const comp = await compressImagePipeline(origBlob, 'balanced', spec.name);
    const d = new Date();
    d.setDate(d.getDate() - spec.daysAgo);
    d.setHours(9 + (spec.id % 10), (spec.id * 17) % 60, 0, 0);

    const origSrc = URL.createObjectURL(comp.origBlob);
    const src = URL.createObjectURL(comp.displayBlob);
    const thumbSrc = URL.createObjectURL(comp.thumbBlob);

    photos.push({
      id: spec.id,
      profileId: spec.profileId,
      name: spec.name,
      folder: spec.folder,
      date: formatIsoDate(d),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      ts: d.getTime(),
      dsrc: 'camera EXIF',
      place: spec.place,
      desc: spec.desc,
      fav: spec.fav,
      del: false,
      backedUp: spec.id !== 3,
      a: comp.aspectRatio,
      width: comp.width,
      height: comp.height,
      originalSize: comp.originalSize,
      compressedSize: comp.compressedSize,
      compressionRatio: comp.compressionRatio,
      compressionMs: comp.compressionMs,
      compressionPreset: 'balanced',
      format: comp.format,
      compressedFormat: comp.compressedFormat,
      src,
      thumbSrc,
      origSrc,
      ob: comp.origBlob,
      blob: comp.displayBlob,
      thumbBlob: comp.thumbBlob,
      tags: [...spec.tags, spec.folder.toLowerCase(), MONTHS[d.getMonth()], String(d.getFullYear())],
      exif: {
        make: spec.id % 2 === 0 ? 'Sony' : 'Leica',
        model: spec.id % 2 === 0 ? 'ILCE-7RM5' : 'Q3 28mm',
        iso: spec.id === 4 ? 1600 : 100,
        aperture: spec.id === 3 ? 'f/2.8' : 'f/4.0',
        shutter: spec.id === 4 ? '1/125s' : '1/500s',
        focalLength: spec.id === 3 ? '90mm' : '28mm',
      },
    });
  }

  return { photos, profiles };
}
