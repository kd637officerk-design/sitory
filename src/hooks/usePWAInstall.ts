import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface LaunchParams {
  files?: Array<{ getFile: () => Promise<File> }>;
}

interface LaunchQueue {
  setConsumer: (consumer: (launchParams: LaunchParams) => void) => void;
}

export interface ElectronSerializedFile {
  name: string;
  mimeType: string;
  lastModified?: number;
  data: string;
}

export interface ElectronAPI {
  isElectron?: boolean;
  platform?: string;
  notifyReady?: () => void;
  pickFiles?: () => Promise<ElectronSerializedFile[]>;
  onOpenFiles?: (callback: (files: ElectronSerializedFile[]) => void) => () => void;
}

export function decodeElectronFiles(serialized: ElectronSerializedFile[]): File[] {
  const out: File[] = [];
  for (const item of serialized || []) {
    try {
      const binStr = atob(item.data);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      const file = new File([bytes], item.name, {
        type: item.mimeType || 'image/jpeg',
        lastModified: item.lastModified || Date.now(),
      });
      out.push(file);
    } catch {
      // ignore invalid base64 payload
    }
  }
  return out;
}

export function getElectronAPI(): ElectronAPI | undefined {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    const electronApi = getElectronAPI();
    const isStandalone =
      Boolean(electronApi?.isElectron) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsWindows(/windows|win32|win64/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isWindows,
    isElectron: Boolean(getElectronAPI()?.isElectron),
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function useWindowsFileOpener(onFilesLaunched: (files: File[]) => void) {
  useEffect(() => {
    const electronApi = getElectronAPI();
    let cleanupElectron: (() => void) | undefined;

    if (electronApi?.onOpenFiles) {
      cleanupElectron = electronApi.onOpenFiles((serialized) => {
        const files = decodeElectronFiles(serialized);
        if (files.length > 0) {
          onFilesLaunched(files);
        }
      });
    }

    const win = window as unknown as { launchQueue?: LaunchQueue };
    if (win.launchQueue && typeof win.launchQueue.setConsumer === 'function') {
      win.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files || launchParams.files.length === 0) return;
        const loadedFiles: File[] = [];
        for (const handle of launchParams.files) {
          try {
            const f = await handle.getFile();
            if (
              f &&
              (/^image\//i.test(f.type) ||
                /\.(jpe?g|png|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i.test(f.name))
            ) {
              loadedFiles.push(f);
            }
          } catch {
            // ignore unreadable handles
          }
        }
        if (loadedFiles.length > 0) {
          onFilesLaunched(loadedFiles);
        }
      });
    }

    return () => {
      if (cleanupElectron) cleanupElectron();
    };
  }, [onFilesLaunched]);
}
