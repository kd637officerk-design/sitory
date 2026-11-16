import { useState } from 'react';
import {
  Camera,
  ImagePlus,
  Maximize2,
  Plus,
  Sparkles,
  Upload,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { CompressionPreset, PhotoItem, UserProfile } from '../types/gallery';
import { formatBytes } from '../utils/compression';

interface UserProfilesViewProps {
  profiles: UserProfile[];
  activeProfileId: string;
  photos: PhotoItem[];
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (profile: Omit<UserProfile, 'id' | 'createdAt'>) => void;
  onOpenPhotoInMainOpener: (photoList: PhotoItem[], index: number) => void;
  onUploadForProfile: (
    profileId: string,
    target: 'gallery' | 'avatar' | 'cover',
    preset: CompressionPreset
  ) => void;
  onViewProfileGallery: (profileId: string) => void;
}

export function UserProfilesView({
  profiles,
  activeProfileId,
  photos,
  onSelectProfile,
  onCreateProfile,
  onOpenPhotoInMainOpener,
  onUploadForProfile,
  onViewProfileGallery,
}: UserProfilesViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  const livePhotos = photos.filter((p) => !p.del);

  const getPhotoById = (id?: number | null) => livePhotos.find((p) => p.id === id);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const cleanHandle = handle.trim()
      ? handle.trim().startsWith('@')
        ? handle.trim()
        : `@${handle.trim()}`
      : `@${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
    onCreateProfile({
      name: name.trim(),
      handle: cleanHandle,
      role: role.trim() || 'Visual Creator',
      location: location.trim() || 'Studio',
      bio: bio.trim() || 'High-resolution photo contributor.',
      avatarPhotoId: null,
      coverPhotoId: null,
      isMainOpenerDefault: true,
      compressionPreset: 'balanced',
    });
    setName('');
    setHandle('');
    setRole('');
    setLocation('');
    setBio('');
    setShowCreate(false);
  };

  return (
    <div className="space-y-8 pb-6">
      {/* Main Photo Opener Control Banner */}
      <section className="rounded-3xl border border-[var(--ln)]/30 bg-[var(--sf)] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--ac)]">
              <Maximize2 className="h-4 w-4" />
              <span>Main Photo Opener Integration</span>
            </div>
            <h2 className="font-display text-xl font-semibold text-[var(--tx)] sm:text-2xl">
              User Profiles &amp; High-Res Opener
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--tx2)]">
              Inspect profile avatars, covers, and high-resolution uploads with instant WebP
              compression, pinch-to-zoom, cursor pan, and one-tap profile assignment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[var(--ac)] px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" />
              New Profile
            </button>
          </div>
        </div>

        {/* Create Profile Form */}
        {showCreate && (
          <form
            onSubmit={handleCreateSubmit}
            className="mt-5 grid grid-cols-1 gap-3 border-t border-[var(--ln)]/25 pt-5 sm:grid-cols-2"
          >
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name (e.g. Jordan Park)"
              className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
            />
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Handle (e.g. @jordanpark)"
              className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
            />
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role or specialty"
              className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
            />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)]"
            />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Short profile bio..."
              rows={2}
              className="rounded-xl border border-[var(--ln)]/40 bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--tx)] outline-none focus:border-[var(--ac)] sm:col-span-2"
            />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-[var(--ln)]/40 px-4 py-2 text-sm text-[var(--tx2)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[var(--ac)] px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Create Profile
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Active Profile Spotlight */}
      {activeProfile && (
        <section className="overflow-hidden rounded-3xl border border-[var(--ln)]/30 bg-[var(--sf)]">
          {(() => {
            const cover = getPhotoById(activeProfile.coverPhotoId) || livePhotos.find((p) => p.profileId === activeProfile.id);
            const avatar = getPhotoById(activeProfile.avatarPhotoId) || livePhotos.find((p) => p.profileId === activeProfile.id);
            const profilePhotos = livePhotos.filter((p) => p.profileId === activeProfile.id);
            const origBytes = profilePhotos.reduce((s, p) => s + (p.originalSize || 0), 0);
            const compBytes = profilePhotos.reduce((s, p) => s + (p.compressedSize || 0), 0);
            const savedBytes = Math.max(0, origBytes - compBytes);

            return (
              <>
                {/* Clickable Cover Photo -> Opens in Main Photo Opener */}
                <div className="group relative h-44 w-full overflow-hidden bg-black/30 sm:h-60">
                  {cover ? (
                    <img
                      src={cover.src}
                      alt={`${activeProfile.name} cover`}
                      onClick={() => {
                        const idx = livePhotos.findIndex((p) => p.id === cover.id);
                        if (idx >= 0) onOpenPhotoInMainOpener(livePhotos, idx);
                      }}
                      className="h-full w-full cursor-pointer object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <img
                      src="/assets/aistudio/eb6c85fb580911c756919c40c7518ec8__1__58d7dd4f.jpg"
                      alt="SYMPHONY 8TH App Cover"
                      className="h-full w-full object-cover object-center"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                  <div className="absolute top-3 right-3 flex flex-wrap gap-2">
                    {cover && (
                      <button
                        onClick={() => {
                          const idx = livePhotos.findIndex((p) => p.id === cover.id);
                          if (idx >= 0) onOpenPhotoInMainOpener(livePhotos, idx);
                        }}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-black/65 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/85"
                      >
                        <Maximize2 className="h-3.5 w-3.5 text-[var(--ac)]" />
                        Inspect Cover
                      </button>
                    )}
                    <button
                      onClick={() =>
                        onUploadForProfile(activeProfile.id, 'cover', activeProfile.compressionPreset)
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-black/65 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/85"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Upload Cover
                    </button>
                  </div>
                </div>

                {/* Profile Identity & Actions */}
                <div className="relative px-5 pt-0 pb-6 sm:px-6">
                  <div className="-mt-12 mb-4 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex items-end gap-4">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border-4 border-[var(--sf)] bg-[var(--bg)] shadow-xl sm:h-28 sm:w-28">
                        {avatar ? (
                          <img
                            src={avatar.thumbSrc || avatar.src}
                            alt={activeProfile.name}
                            onClick={() => {
                              const idx = livePhotos.findIndex((p) => p.id === avatar.id);
                              if (idx >= 0) onOpenPhotoInMainOpener(livePhotos, idx);
                            }}
                            className="h-full w-full cursor-pointer object-cover transition hover:scale-105"
                            title="Click to inspect avatar in Main Photo Opener"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-[var(--ac)]">
                            {activeProfile.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <button
                          onClick={() =>
                            onUploadForProfile(
                              activeProfile.id,
                              'avatar',
                              activeProfile.compressionPreset
                            )
                          }
                          className="absolute right-1 bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-md transition hover:bg-[var(--ac)] hover:text-slate-950"
                          title="Upload high-res avatar"
                          aria-label="Upload high-res avatar"
                        >
                          <Camera className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="min-w-0 pt-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display truncate text-xl font-bold text-[var(--tx)] sm:text-2xl">
                            {activeProfile.name}
                          </h3>
                          <span className="text-sm text-[var(--tx2)]">{activeProfile.handle}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--tx2)]">
                          {activeProfile.role} · {activeProfile.location}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          onUploadForProfile(
                            activeProfile.id,
                            'gallery',
                            activeProfile.compressionPreset
                          )
                        }
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[var(--ac)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
                      >
                        <Upload className="h-4 w-4" />
                        Upload High-Res
                      </button>
                      <button
                        onClick={() => onViewProfileGallery(activeProfile.id)}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[var(--ln)]/40 px-4 py-2 text-sm font-medium text-[var(--tx)] transition hover:bg-white/5"
                      >
                        View Photos ({profilePhotos.length})
                      </button>
                    </div>
                  </div>

                  <p className="max-w-3xl text-sm leading-relaxed text-[var(--tx)]/90">
                    {activeProfile.bio}
                  </p>

                  {/* Profile Photo Summary Row */}
                  <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--ln)]/25 pt-4">
                    <div>
                      <div className="text-xs text-[var(--tx2)]">Profile Photos</div>
                      <div className="font-mono-num mt-0.5 text-lg font-semibold text-[var(--tx)]">
                        {profilePhotos.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--tx2)]">Original Volume</div>
                      <div className="font-mono-num mt-0.5 text-lg font-semibold text-[var(--tx)]">
                        {formatBytes(origBytes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--tx2)]">Bandwidth Saved</div>
                      <div className="font-mono-num mt-0.5 text-lg font-semibold text-emerald-400">
                        {formatBytes(savedBytes)}
                      </div>
                    </div>
                  </div>

                  {/* Quick Thumbnail Strip -> Opens directly in Main Photo Opener */}
                  {profilePhotos.length > 0 && (
                    <div className="mt-5">
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--tx2)]">
                          Tap any photo to inspect in Main Photo Opener
                        </span>
                        <span className="text-xs text-[var(--ac)]">Zoom &amp; Pan ready</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                        {profilePhotos.slice(0, 6).map((p, idx) => (
                          <button
                            key={p.id}
                            onClick={() => onOpenPhotoInMainOpener(profilePhotos, idx)}
                            className="group relative aspect-square overflow-hidden rounded-2xl bg-[var(--bg)]"
                          >
                            <img
                              src={p.thumbSrc || p.src}
                              alt={p.name}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            />
                            <span className="font-mono-num absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                              {p.width}×{p.height}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </section>
      )}

      {/* All User Profiles Grid */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[var(--tx)]">
            All User Profiles ({profiles.length})
          </h3>
          <span className="text-xs text-[var(--tx2)]">
            Click avatar to inspect in Main Photo Opener
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {profiles.map((prof) => {
            const isActive = prof.id === activeProfileId;
            const avatar =
              getPhotoById(prof.avatarPhotoId) ||
              livePhotos.find((p) => p.profileId === prof.id);
            const profCount = livePhotos.filter((p) => p.profileId === prof.id).length;

            return (
              <div
                key={prof.id}
                className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                  isActive
                    ? 'border-[var(--ac)] bg-[var(--sf)]'
                    : 'border-[var(--ln)]/25 bg-[var(--sf)]/70 hover:border-[var(--ln)]/60'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <button
                    onClick={() => {
                      if (avatar) {
                        const idx = livePhotos.findIndex((p) => p.id === avatar.id);
                        if (idx >= 0) onOpenPhotoInMainOpener(livePhotos, idx);
                      } else {
                        onUploadForProfile(prof.id, 'avatar', prof.compressionPreset);
                      }
                    }}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--bg)] ring-1 ring-white/10"
                    title={
                      avatar
                        ? 'Open avatar in Main Photo Opener'
                        : 'Upload avatar for this profile'
                    }
                  >
                    {avatar ? (
                      <img
                        src={avatar.thumbSrc || avatar.src}
                        alt={prof.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-[var(--ac)]">
                        <Plus className="h-5 w-5" />
                      </div>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-display truncate text-base font-semibold text-[var(--tx)]">
                        {prof.name}
                      </h4>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ac)]">
                          <UserCheck className="h-3.5 w-3.5" />
                          Active
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-[var(--tx2)]">
                      {prof.handle} · {prof.location}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--tx2)]">
                      {prof.role} · {profCount} photos
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-[var(--ln)]/20 pt-3">
                  <button
                    onClick={() => onSelectProfile(prof.id)}
                    className={`flex-1 rounded-xl py-2 text-xs font-medium transition ${
                      isActive
                        ? 'bg-[var(--acb)] text-[var(--tx)]'
                        : 'bg-[var(--bg)]/70 text-[var(--tx)] hover:bg-[var(--acb)]'
                    }`}
                  >
                    {isActive ? 'Selected Profile' : 'Switch Profile'}
                  </button>
                  <button
                    onClick={() =>
                      onUploadForProfile(prof.id, 'gallery', prof.compressionPreset)
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--ln)]/40 px-3 py-2 text-xs font-medium text-[var(--tx2)] hover:text-[var(--tx)]"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[var(--ac)]" />
                    Add Photo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
