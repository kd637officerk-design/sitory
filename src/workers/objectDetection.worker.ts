/// <reference lib="webworker" />

export interface WorkerDetectRequest {
  type: 'detect';
  id: number;
  blob: Blob;
  name?: string;
  folder?: string;
  width?: number;
  height?: number;
  exifModel?: string;
}

export interface WorkerDetectResponse {
  type: 'result';
  id: number;
  preTags: string[];
  durationMs: number;
  engine: 'browser-worker-vision';
}

interface ShapeDetectorLike {
  detect: (input: ImageBitmap) => Promise<Array<unknown>>;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function isSkinTone(r: number, g: number, b: number): boolean {
  return (
    r > 95 &&
    g > 40 &&
    b > 20 &&
    Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
    Math.abs(r - g) > 15 &&
    r > g &&
    r > b
  );
}

async function detectWithBrowserApis(bitmap: ImageBitmap): Promise<string[]> {
  const detected: string[] = [];
  const g = self as unknown as {
    FaceDetector?: new (opts?: { maxDetectedFaces?: number; fastMode?: boolean }) => ShapeDetectorLike;
    TextDetector?: new () => ShapeDetectorLike;
    BarcodeDetector?: new () => ShapeDetectorLike;
  };

  try {
    if (typeof g.FaceDetector === 'function') {
      const fd = new g.FaceDetector({ maxDetectedFaces: 6, fastMode: true });
      const faces = await fd.detect(bitmap);
      if (faces.length > 0) {
        detected.push('person', faces.length > 1 ? 'people' : 'portrait');
      }
    }
  } catch {
    // Shape Detection API unavailable in this browser/worker context
  }

  try {
    if (typeof g.TextDetector === 'function') {
      const td = new g.TextDetector();
      const blocks = await td.detect(bitmap);
      if (blocks.length >= 3) {
        detected.push('document', 'text');
      }
    }
  } catch {
    // TextDetector unavailable
  }

  try {
    if (typeof g.BarcodeDetector === 'function') {
      const bd = new g.BarcodeDetector();
      const codes = await bd.detect(bitmap);
      if (codes.length > 0) {
        detected.push('code');
      }
    }
  } catch {
    // BarcodeDetector unavailable
  }

  return detected;
}

function classifyFromPixels(
  data: Uint8ClampedArray,
  size: number,
  meta: { name?: string; folder?: string; width?: number; height?: number }
): string[] {
  const tags = new Set<string>();
  const total = size * size;
  const topCutoff = Math.floor(size * 0.35);
  const bottomStart = Math.floor(size * 0.65);

  let topPixels = 0;
  let bottomPixels = 0;
  let skyTop = 0;
  let waterBottom = 0;
  let foliage = 0;
  let skinCenter = 0;
  let centerPixels = 0;
  let darkCount = 0;
  let brightCount = 0;
  let warmFoodOrSunset = 0;
  let vibrantNeon = 0;
  let pcbGreen = 0;
  let neutralBright = 0;
  let rectilinearEdges = 0;
  let highEdges = 0;

  const lumAt = (x: number, y: number) => {
    const idx = (y * size + x) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, v] = rgbToHsv(r, g, b);

      if (v < 0.22) darkCount++;
      if (v > 0.84) brightCount++;
      if (s < 0.14 && v > 0.78) neutralBright++;

      if (y < topCutoff) {
        topPixels++;
        if (h >= 190 && h <= 245 && s >= 0.22 && v >= 0.45) skyTop++;
      }
      if (y >= bottomStart) {
        bottomPixels++;
        if (h >= 180 && h <= 235 && s >= 0.25 && v >= 0.2) waterBottom++;
      }

      if (
        x >= size * 0.2 &&
        x <= size * 0.8 &&
        y >= size * 0.12 &&
        y <= size * 0.75
      ) {
        centerPixels++;
        if (isSkinTone(r, g, b)) skinCenter++;
      }

      if (h >= 70 && h <= 162 && s >= 0.24 && v >= 0.18) {
        foliage++;
        if (s >= 0.65 && g > r * 1.45 && g > b * 1.35) pcbGreen++;
      }

      if (((h >= 12 && h <= 48) || h >= 335) && s >= 0.42 && v >= 0.45) {
        warmFoodOrSunset++;
      }

      if (s >= 0.72 && v >= 0.6) vibrantNeon++;

      if (x > 0 && y > 0) {
        const l = lumAt(x, y);
        const gx = Math.abs(l - lumAt(x - 1, y));
        const gy = Math.abs(l - lumAt(x, y - 1));
        if (gx + gy > 42) highEdges++;
        if ((gx > 35 && gy < 8) || (gy > 35 && gx < 8)) rectilinearEdges++;
      }
    }
  }

  const skyRatio = topPixels ? skyTop / topPixels : 0;
  const waterRatio = bottomPixels ? waterBottom / bottomPixels : 0;
  const foliageRatio = foliage / total;
  const skinRatio = centerPixels ? skinCenter / centerPixels : 0;
  const darkRatio = darkCount / total;
  const brightRatio = brightCount / total;
  const warmRatio = warmFoodOrSunset / total;
  const edgeRatio = highEdges / total;
  const rectRatio = rectilinearEdges / total;
  const neutralBrightRatio = neutralBright / total;
  const pcbRatio = pcbGreen / total;

  if (skinRatio > 0.12) {
    tags.add('person');
    if (skinRatio > 0.22) tags.add('portrait');
  }
  if (skyRatio > 0.26) tags.add('sky');
  if (waterRatio > 0.22) {
    tags.add('ocean');
    tags.add('water');
  }
  if (foliageRatio > 0.18) {
    tags.add('plant');
    tags.add('nature');
  }
  if (skyRatio > 0.2 && foliageRatio > 0.14) tags.add('tree');
  if (skyRatio > 0.22 || foliageRatio > 0.2 || waterRatio > 0.22) tags.add('outdoor');

  if (warmRatio > 0.16 && skyRatio > 0.08) tags.add('sunset');
  else if (warmRatio > 0.22 && edgeRatio > 0.12 && darkRatio < 0.35) tags.add('food');

  if (darkRatio > 0.56 && brightRatio > 0.015) tags.add('night');
  if (darkRatio > 0.45 && vibrantNeon / total > 0.08) tags.add('neon');

  if (rectRatio > 0.09 && neutralBrightRatio > 0.25) {
    tags.add('document');
    tags.add('screen');
  } else if (rectRatio > 0.08 && edgeRatio > 0.16 && skyRatio < 0.25) {
    tags.add('architecture');
  }

  if (pcbRatio > 0.12 && edgeRatio > 0.18) {
    tags.add('electronics');
    tags.add('hardware');
  }

  const hint = `${meta.name || ''} ${meta.folder || ''}`.toLowerCase();
  if (/screen|shot|ui/.test(hint)) tags.add('screenshot');
  if (/cat|kitten|feline/.test(hint)) tags.add('cat');
  if (/dog|puppy|hound/.test(hint)) tags.add('dog');
  if (/car|auto|vehicle/.test(hint)) tags.add('car');

  if (meta.width && meta.height) {
    const ar = meta.width / meta.height;
    if (ar >= 1.9) tags.add('panorama');
  }

  if (tags.size === 0) {
    tags.add(darkRatio > 0.45 ? 'indoor' : 'object');
  }

  return Array.from(tags).slice(0, 6);
}

self.onmessage = async (event: MessageEvent<WorkerDetectRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'detect') return;

  const started = performance.now();
  let preTags: string[] = [];

  try {
    const bitmap = await createImageBitmap(msg.blob);
    const apiTags = await detectWithBrowserApis(bitmap);
    let pixelTags: string[] = [];

    if (typeof OffscreenCanvas !== 'undefined') {
      const size = 96;
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, size, size);
        const imgData = ctx.getImageData(0, 0, size, size).data;
        pixelTags = classifyFromPixels(imgData, size, {
          name: msg.name,
          folder: msg.folder,
          width: msg.width || bitmap.width,
          height: msg.height || bitmap.height,
        });
      }
    }

    bitmap.close();
    preTags = Array.from(new Set([...apiTags, ...pixelTags])).slice(0, 6);
  } catch {
    preTags = [];
  }

  const response: WorkerDetectResponse = {
    type: 'result',
    id: msg.id,
    preTags,
    durationMs: Math.round(performance.now() - started),
    engine: 'browser-worker-vision',
  };

  self.postMessage(response);
};
