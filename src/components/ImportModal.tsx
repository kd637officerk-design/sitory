import { useRef, useState } from 'react';
import { FolderUp, ImagePlus, Pin, Upload, X } from 'lucide-react';
import type { CompressionPreset, UserProfile } from '../types/gallery';

interface ImportModalProps {
  open: boolean;
  profiles: UserProfile[];
  activeProfileId: string;
  initialTarget?: 'gallery' | 'avatar' | 'cover';
  initialPreset?: CompressionPreset;
  onClose: () => void;
  onImportFiles: (
    files: File[],
    options: {
      folderOverride?: string;
      profileId: string;
      target: 'gallery' | 'avatar' | 'cover';
      preset: CompressionPreset;
    }
  ) => void;
}

export function ImportModal({
  open,
  profiles,
  activeProfileId,
  initialTarget = 'gallery',
  initialPreset = 'balanced',
  onClose,
  onImportFiles,
}: ImportModalProps) {
  const [preset] = useState<CompressionPreset>(initialPreset);
  const [profileId, setProfileId] = useState<string>(activeProfileId);
  const [target, setTarget] = useState<'gallery' | 'avatar' | 'cover'>(initialTarget);
  const [folderOverride, setFolderOverride] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const triggerPick = (folder?: string) => {
    setFolderOverride(folder || '');
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleFilesSelected = (fileList: FileList | null, fromDir = false) => {
    if (!fileList) return;
    const imgs = Array.from(fileList).filter((f) => /^image\//i.test(f.type));
    if (!imgs.length) return;
    const relFolder = fromDir
      ? ((imgs[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '').split('/')[0]
      : folderOverride || undefined;
    onImportFiles(imgs, {
      folderOverride: relFolder,
      profileId,
      target,
      preset,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[var(--sf)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--tx)] shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Import High-Resolution Photos</h3>
            <p className="text-xs text-[var(--tx2)]">
              Supports 4K/8K JPEG, PNG, WebP, and HEIC with automatic fast compression
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Close import dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Destination User Profile & Assignment */}
        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--tx2)]">
            <span>Assign to User Profile</span>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.handle})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--tx2)]">
            <span>Import Destination</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as 'gallery' | 'avatar' | 'cover')}
              className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
            >
              <option value="gallery">Profile Gallery &amp; Library</option>
              <option value="avatar">Set First Photo as Profile Avatar</option>
              <option value="cover">Set First Photo as Profile Cover</option>
            </select>
          </label>
        </div>

        {/* Import Sources */}
        <div className="space-y-2.5">
          <button
            onClick={() => triggerPick()}
            className="flex w-full items-start gap-3.5 rounded-2xl border border-white/10 bg-[var(--bg)]/45 p-4 text-left transition hover:border-[var(--ac)]/60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--acb)] text-[var(--ac)]">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Device Gallery, Camera &amp; Google Photos</div>
              <div className="mt-0.5 text-xs text-[var(--tx2)]">
                Select one or multiple high-resolution photos from your phone or computer.
              </div>
            </div>
          </button>

          <button
            onClick={() => dirInputRef.current?.click()}
            className="flex w-full items-start gap-3.5 rounded-2xl border border-white/10 bg-[var(--bg)]/45 p-4 text-left transition hover:border-[var(--ac)]/60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--acb)] text-[var(--ac)]">
              <FolderUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Whole Folder</div>
              <div className="mt-0.5 text-xs text-[var(--tx2)]">
                Import a complete folder at once while preserving the folder name.
              </div>
            </div>
          </button>

          <button
            onClick={() => triggerPick('Pins')}
            className="flex w-full items-start gap-3.5 rounded-2xl border border-white/10 bg-[var(--bg)]/45 p-4 text-left transition hover:border-[var(--ac)]/60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--acb)] text-[var(--ac)]">
              <Pin className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Pinterest &amp; Saved Pins</div>
              <div className="mt-0.5 text-xs text-[var(--tx2)]">
                Import downloaded pins directly into your Pins collection.
              </div>
            </div>
          </button>
        </div>

        <p className="mt-4 flex items-center gap-2 text-xs text-[var(--tx2)]">
          <ImagePlus className="h-4 w-4 shrink-0 text-[var(--ac)]" />
          Tip: You can also drag and drop images anywhere onto SYMPHONY 8TH or paste from clipboard.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files, false);
            e.target.value = '';
          }}
        />
        <input
          ref={dirInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is non-standard
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files, true);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
