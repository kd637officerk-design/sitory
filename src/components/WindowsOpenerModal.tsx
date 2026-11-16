import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileImage,
  FolderOpen,
  Keyboard,
  Monitor,
  Play,
  X,
} from 'lucide-react';
import { decodeElectronFiles, getElectronAPI, usePWAInstall } from '../hooks/usePWAInstall';

interface WindowsOpenerModalProps {
  open: boolean;
  onClose: () => void;
  onOpenLocalFiles: (files: File[]) => void;
  onOpenAddFolder: () => void;
  onStartSlideshow: () => void;
}

export function WindowsOpenerModal({
  open,
  onClose,
  onOpenLocalFiles,
  onOpenAddFolder,
  onStartSlideshow,
}: WindowsOpenerModalProps) {
  const { isInstallable, isInstalled, isIOS, isElectron, install } = usePWAInstall();
  const [showManualSteps, setShowManualSteps] = useState(false);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleOpenFileFromPc = async () => {
    const electronApi = getElectronAPI();
    if (electronApi?.pickFiles) {
      const picked = await electronApi.pickFiles();
      const files = decodeElectronFiles(picked);
      if (files.length > 0) {
        onOpenLocalFiles(files);
        onClose();
      }
      return;
    }

    const picker = (
      window as unknown as {
        showOpenFilePicker?: (opts?: unknown) => Promise<Array<{ getFile: () => Promise<File> }>>;
      }
    ).showOpenFilePicker;

    if (typeof picker === 'function') {
      try {
        const handles = await picker({
          multiple: true,
          types: [
            {
              description: 'Images',
              accept: {
                'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.heic', '.heif'],
              },
            },
          ],
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        if (files.length > 0) {
          onOpenLocalFiles(files);
          onClose();
          return;
        }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    }
    filePickerRef.current?.click();
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] border border-white/10 bg-[var(--sf)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--tx)] shadow-2xl sm:rounded-[28px] sm:p-6">
        <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <div className="relative h-36 w-full overflow-hidden sm:h-44">
            <img
              src="/assets/aistudio/eb6c85fb580911c756919c40c7518ec8__1__58d7dd4f.jpg"
              alt="SYMPHONY 8TH Windows 11 App Cover"
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/80"
              aria-label="Close Windows opener modal"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute inset-x-4 bottom-3 flex items-center gap-3">
              <img
                src="/pwa-192x192.png"
                alt="SYMPHONY 8TH App Icon"
                className="h-12 w-12 rounded-2xl border border-[#c8a464]/35 object-cover shadow-lg"
              />
              <div className="min-w-0">
                <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-white">
                  <Monitor className="h-4 w-4 shrink-0 text-[var(--ac)]" />
                  <span className="truncate">SYMPHONY 8TH for Windows 11</span>
                </h3>
                <p className="truncate text-xs text-neutral-300">
                  Main Photos Opener · Desktop app icon &amp; File Explorer integration
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Install as Windows 11 Desktop App Card */}
        <div className="mb-4 rounded-2xl border border-[var(--ac)]/30 bg-[var(--bg)]/55 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {isInstalled ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>{isElectron ? 'Running as Windows Desktop App' : 'Installed as Desktop App'}</span>
                  </>
                ) : (
                  <span>SYMPHONY 8TH for Windows 11</span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--tx2)]">
                Native Windows <span className="font-mono-num text-[var(--tx)]">.exe</span> installer &amp; PWA{' '}
                <span className="font-mono-num text-[var(--tx)]">file_handlers</span>{' '}
                for JPEG, PNG, WebP, HEIC, AVIF &amp; GIF in File Explorer.
              </p>
            </div>

            {!isInstalled && (
              <div className="flex items-center gap-2">
                {isInstallable ? (
                  <button
                    onClick={() => void install()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--ac)] px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-md transition hover:opacity-90"
                  >
                    <Download className="h-4 w-4" />
                    Install App
                  </button>
                ) : (
                  <button
                    onClick={() => setShowManualSteps((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--ac)]/50 bg-[var(--acb)] px-3.5 py-2 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--ac)] hover:text-slate-950"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isIOS ? 'Install on iOS' : 'Windows .exe & Install'}
                  </button>
                )}
              </div>
            )}
          </div>

          {(showManualSteps || !isInstallable) && !isInstalled && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-[var(--tx2)]">
              {isIOS ? (
                <p>
                  Tap <strong className="text-[var(--tx)]">Share</strong> in Safari and choose{' '}
                  <strong className="text-[var(--tx)]">Add to Home Screen</strong>.
                </p>
              ) : (
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    Push to <strong className="text-[var(--tx)]">GitHub</strong> to build{' '}
                    <span className="font-mono-num text-[var(--tx)]">SYMPHONY-8TH-1.0.0-Windows-Setup.exe</span> &amp; Portable{' '}
                    <span className="font-mono-num text-[var(--tx)]">.exe</span> via GitHub Actions, or run{' '}
                    <span className="font-mono-num text-[var(--tx)]">npm run build:win</span> locally on Windows.
                  </li>
                  <li>
                    Or in <strong className="text-[var(--tx)]">Microsoft Edge / Chrome</strong> on Windows 11, click{' '}
                    <strong className="text-[var(--tx)]">Install app</strong> in the address bar.
                  </li>
                  <li>
                    Right-click any image in <strong className="text-[var(--tx)]">Windows File Explorer</strong> →{' '}
                    <strong className="text-[var(--tx)]">Open with → SYMPHONY 8TH → Always</strong>.
                  </li>
                </ol>
              )}
            </div>
          )}
        </div>

        {/* Quick Windows PC Actions */}
        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <button
            onClick={() => void handleOpenFileFromPc()}
            className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--ln)]/30 bg-[var(--bg)]/45 p-3.5 text-left transition hover:border-[var(--ac)]"
          >
            <FileImage className="h-5 w-5 text-[var(--ac)]" />
            <div>
              <div className="text-xs font-semibold">Open Photo File</div>
              <div className="mt-0.5 text-[11px] text-[var(--tx2)]">Launch directly in Opener</div>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenAddFolder();
            }}
            className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--ln)]/30 bg-[var(--bg)]/45 p-3.5 text-left transition hover:border-[var(--ac)]"
          >
            <FolderOpen className="h-5 w-5 text-[var(--ac)]" />
            <div>
              <div className="text-xs font-semibold">Add / Open Folder</div>
              <div className="mt-0.5 text-[11px] text-[var(--tx2)]">Pictures, Camera Roll…</div>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onStartSlideshow();
            }}
            className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--ln)]/30 bg-[var(--bg)]/45 p-3.5 text-left transition hover:border-[var(--ac)]"
          >
            <Play className="h-5 w-5 text-[var(--ac)]" />
            <div>
              <div className="text-xs font-semibold">Start Slideshow</div>
              <div className="mt-0.5 text-[11px] text-[var(--tx2)]">Fullscreen presentation</div>
            </div>
          </button>
        </div>

        {/* PC Keyboard & Mouse Ergonomics */}
        <div className="rounded-2xl border border-[var(--ln)]/25 bg-[var(--bg)]/40 p-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-[var(--tx)]">
            <Keyboard className="h-4 w-4 text-[var(--ac)]" />
            Windows PC Keyboard &amp; Mouse Shortcuts
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--tx2)]">
            <div className="flex justify-between">
              <span>Prev / Next photo</span>
              <kbd className="font-mono-num rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-[var(--tx)]">← / →</kbd>
            </div>
            <div className="flex justify-between">
              <span>Toggle Slideshow</span>
              <kbd className="font-mono-num rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-[var(--tx)]">Space / S</kbd>
            </div>
            <div className="flex justify-between">
              <span>Zoom in / out / reset</span>
              <kbd className="font-mono-num rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-[var(--tx)]">+ / - / 0</kbd>
            </div>
            <div className="flex justify-between">
              <span>Mouse wheel zoom</span>
              <kbd className="font-mono-num rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-[var(--tx)]">Scroll</kbd>
            </div>
            <div className="flex justify-between">
              <span>Metadata inspector</span>
              <kbd className="font-mono-num rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-[var(--tx)]">I</kbd>
            </div>
            <div className="flex justify-between">
              <span>Favourite / Close</span>
              <kbd className="font-mono-num rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-[var(--tx)]">F / Esc</kbd>
            </div>
          </div>
        </div>

        <input
          ref={filePickerRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []).filter((f) => /^image\//i.test(f.type));
            if (files.length) {
              onOpenLocalFiles(files);
              onClose();
            }
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
