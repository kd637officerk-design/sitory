import type { PhotoItem } from '../types/gallery';
import type { WorkerDetectRequest, WorkerDetectResponse } from '../workers/objectDetection.worker';

let workerInstance: Worker | null = null;
const pendingCallbacks = new Map<number, (res: WorkerDetectResponse) => void>();

function getObjectDetectionWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(
      new URL('../workers/objectDetection.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerInstance.onmessage = (e: MessageEvent<WorkerDetectResponse>) => {
      const res = e.data;
      if (!res || res.type !== 'result') return;
      const cb = pendingCallbacks.get(res.id);
      if (cb) {
        pendingCallbacks.delete(res.id);
        cb(res);
      }
    };
    workerInstance.onerror = () => {
      for (const [id, cb] of pendingCallbacks.entries()) {
        pendingCallbacks.delete(id);
        cb({
          type: 'result',
          id,
          preTags: [],
          durationMs: 0,
          engine: 'browser-worker-vision',
        });
      }
    };
    return workerInstance;
  } catch {
    return null;
  }
}

export function runLocalPreTaggingInWorker(photo: PhotoItem): Promise<string[]> {
  const worker = getObjectDetectionWorker();
  const sourceBlob = photo.thumbBlob || photo.blob || photo.ob;
  if (!worker || !sourceBlob) {
    return Promise.resolve([]);
  }

  return new Promise<string[]>((resolve) => {
    const timer = window.setTimeout(() => {
      pendingCallbacks.delete(photo.id);
      resolve([]);
    }, 6000);

    pendingCallbacks.set(photo.id, (res) => {
      window.clearTimeout(timer);
      resolve(res.preTags || []);
    });

    const msg: WorkerDetectRequest = {
      type: 'detect',
      id: photo.id,
      blob: sourceBlob,
      name: photo.name,
      folder: photo.folder,
      width: photo.width,
      height: photo.height,
      exifModel: photo.exif?.model,
    };
    worker.postMessage(msg);
  });
}

export function disposeObjectDetectionWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  pendingCallbacks.clear();
}
