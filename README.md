# SYMPHONY 8TH — Windows Desktop Photo Opener & Gallery

<p align="center">
  <img src="public/assets/aistudio/eb6c85fb580911c756919c40c7518ec8__1__58d7dd4f.jpg" alt="SYMPHONY 8TH Windows App Icon & Cover" width="420" />
</p>

**SYMPHONY 8TH** is a native **Windows Desktop Application** (`.exe` installer & portable executable via Electron) and installable PWA styled in a mature dark fantasy aesthetic with live rain ambience, designed as a fast, zero-settings **Main Photo Opener** and personal gallery with lossless original metadata preservation, off-thread local object detection, and optional Gemini AI enrichment.

## Features

- **Native Windows Desktop App (`.exe`)**:
  - Built with Electron (`electron/main.cjs`) using `public/app-icon.ico` for the app window, taskbar, Desktop home screen shortcut, Start Menu shortcut, and NSIS installer.
  - Registers Windows File Explorer associations for `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`, `.bmp`, `.heic`, `.heif`, and `.tif`/`.tiff` so double-clicking any photo opens it directly in SYMPHONY 8TH.
  - Built-in local asset & AI API server inside the desktop shell.
- **Dark Fantasy Rain Player & Main Photo Opener**:
  - Live animated rain backdrop across the gallery, Photo Opener, Highlight Reel player, and Photo Editor (`prefers-reduced-motion` aware).
  - Instant `1×`–`8×` zoom & pan inspection, mouse-wheel zoom, keyboard navigation (`←` / `→` / `Home` / `End` / `Esc`), slideshow mode (`Space` / `S`), non-destructive photo editor, and EXIF metadata inspector.
- **Automatic Local Vision + Gemini AI Search**:
  - Web Worker (`src/workers/objectDetection.worker.ts`) automatically pre-tags imported photos off the main UI thread (`person`, `portrait`, `sky`, `ocean`, `plant`, `food`, `night`, `document`, etc.).
  - Optional `GEMINI_API_KEY` enables natural-language library search, AI descriptions, and auto-enhance.
- **Memories, Smart Albums & User Profiles**:
  - Curated highlight reels, dynamic/smart albums, places map, duplicate detection, and profile avatar/cover management.

## Building the Windows `.exe` on GitHub

Push this repository to GitHub. The included workflow (`.github/workflows/build-windows11.yml`) automatically runs on every push/PR to `main` or `master` and builds on `windows-latest`:

1. **GitHub Actions Artifacts**:
   - Every run uploads `SYMPHONY-8TH-Windows-App` containing:
     - `SYMPHONY-8TH-1.0.0-Windows-Setup.exe` (Windows Installer with Desktop & Start Menu shortcuts)
     - `SYMPHONY-8TH-1.0.0-Windows-Portable.exe` (Standalone portable `.exe`)
2. **GitHub Releases (Version Tags)**:
   - Push a tag like `git tag v1.0.0 && git push origin v1.0.0` to automatically create a GitHub Release with both `.exe` files attached.

## Building Locally on Windows

```bash
npm install
npm run build:win
```

The installer and portable `.exe` will be output to `release/`.

To launch the desktop app directly during development:

```bash
npm run electron:start
```

## Running as a Web / PWA Server

```bash
npm install
cp .env.example .env
# Optional: set GEMINI_API_KEY in .env for server-side Gemini Vision features
npm run dev
```

Open `http://localhost:3000`.
