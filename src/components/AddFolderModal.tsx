import { useRef, useState } from 'react';
import { FolderPlus, FolderUp, HardDrive, ImagePlus, X } from 'lucide-react';
import type { CompressionPreset, UserProfile } from '../types/gallery';

interface AddFolderModalProps {
  open: boolean;
  existingFolders: string[];
  profiles: UserProfile[];
  activeProfileId: string;
  onClose: () => void;
  onCreateFolder: (folderName: string, files?: File[], preset?: CompressionPreset) => void;
  onImportPcFolder: (files: File[], folderName: string, preset: CompressionPreset) => void;
}

interface DirPickerHandle {
  name: string;
  values: () => AsyncIterableIterator<{
    kind: 'file' | 'directory';
    name: string;
    getFile?: () => Promise<File>;
  }>;
}

export function AddFolderModal({
  open,
  existingFolders,
  profiles,
  activeProfileId,
  onClose,
  onCreateFolder,
  onImportPcFolder,
}: AddFolderModalProps) {
  const [folderName, setFolderName] = useState('');
  const preset: CompressionPreset =
    profiles.find((p) => p.id === activeProfileId)?.compressionPreset || 'balanced';
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanningPc, setScanningPc] = useState(false);

  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const dirFallbackRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = folderName.trim();
    if (!cleaned) {
      setErrorMsg('Enter a folder name to create.');
      return;
    }
    onCreateFolder(cleaned, pendingFiles.length > 0 ? pendingFiles : undefined, preset);
    setFolderName('');
    setPendingFiles([]);
    setErrorMsg(null);
    onClose();
  };

  const handleOpenPcFolder = async () => {
    setErrorMsg(null);
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirPickerHandle> })
      .showDirectoryPicker;
    if (typeof picker === 'function') {
      try {
        setScanningPc(true);
        const dirHandle = await picker();
        const collected: File[] = [];
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file' && entry.getFile) {
            const f = await entry.getFile();
            if (
              /^image\//i.test(f.type) ||
              /\.(jpe?g|png|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i.test(f.name)
            ) {
              collected.push(f);
            }
          }
        }
        setScanningPc(false);
        if (collected.length === 0) {
          onCreateFolder(dirHandle.name);
        } else {
          onImportPcFolder(collected, dirHandle.name, preset);
        }
        onClose();
        return;
      } catch (err) {
        setScanningPc(false);
        if ((err as { name?: string })?.name === 'AbortError') return;
        // fallback to input[webkitdirectory]
      }
    }
    dirFallbackRef.current?.click();
  };

  return (
    <div
      className="fixed inset-0 z-[74] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-white/10 bg-[var(--sf)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--tx)] shadow-2xl sm:rounded-[28px] sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--acb)] text-[var(--ac)]">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Add Folder</h3>
              <p className="text-xs text-[var(--tx2)]">
                Create a new collection or open a folder from Windows PC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Close add folder dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Create New Folder Form */}
        <form onSubmit={handleCreateSubmit} className="mb-5 space-y-3 rounded-2xl border border-[var(--ln)]/25 bg-[var(--bg)]/45 p-4">
          <label className="block text-xs font-semibold text-[var(--tx2)]">
            New Folder Name
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="e.g., Architecture, Windows Wallpapers, Raw Shots"
              className="mt-1.5 w-full rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
            />
          </label>

          {/* Suggested quick folder names */}
          <div className="flex flex-wrap gap-1.5">
            {['Wallpapers', 'Screenshots', 'RAW & Exports', 'Travel']
              .filter((s) => !existingFolders.includes(s))
              .map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setFolderName(suggestion)}
                  className="rounded-lg border border-[var(--ln)]/30 bg-[var(--sf)] px-2.5 py-1 text-[11px] text-[var(--tx2)] transition hover:border-[var(--ac)] hover:text-[var(--tx)]"
                >
                  + {suggestion}
                </button>
              ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => filesInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ln)]/40 bg-[var(--sf)] px-3 py-2 text-xs font-medium text-[var(--tx)] transition hover:border-[var(--ac)]"
            >
              <ImagePlus className="h-3.5 w-3.5 text-[var(--ac)]" />
              {pendingFiles.length > 0
                ? `${pendingFiles.length} ${pendingFiles.length === 1 ? 'photo' : 'photos'} selected`
                : 'Add photos (optional)'}
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ac)] px-4 py-2 text-xs font-semibold text-slate-950 transition hover:opacity-90"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Create Folder
            </button>
          </div>

          {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}
        </form>

        {/* Open Windows PC Folder */}
        <div className="space-y-2.5">
          <div className="px-1 text-xs font-semibold text-[var(--tx2)]">
            Or Open Folder From Windows 11 PC
          </div>

          <button
            type="button"
            disabled={scanningPc}
            onClick={() => void handleOpenPcFolder()}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-[var(--ln)]/30 bg-[var(--bg)]/55 p-4 text-left transition hover:border-[var(--ac)]/70 disabled:opacity-60"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--acb)] text-[var(--ac)]">
              {scanningPc ? <HardDrive className="h-5 w-5 animate-pulse" /> : <FolderUp className="h-5 w-5" />}
            </div>
            <div>
              <div className="text-sm font-semibold">
                {scanningPc ? 'Reading Windows folder…' : 'Browse Windows PC Folder'}
              </div>
              <div className="mt-0.5 text-xs text-[var(--tx2)]">
                Import a whole folder (e.g. Pictures, Camera Roll, Screenshots) with original EXIF metadata intact.
              </div>
            </div>
          </button>
        </div>

        <input
          ref={filesInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const imgs = Array.from(e.target.files || []).filter((f) => /^image\//i.test(f.type));
            if (imgs.length) setPendingFiles(imgs);
            e.target.value = '';
          }}
        />
        <input
          ref={dirFallbackRef}
          type="file"
          // @ts-expect-error webkitdirectory is non-standard
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={(e) => {
            const imgs = Array.from(e.target.files || []).filter((f) => /^image\//i.test(f.type));
            if (imgs.length) {
              const rel =
                ((imgs[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '').split(
                  '/'
                )[0] || 'PC Folder';
              onImportPcFolder(imgs, rel, preset);
              onClose();
            }
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
