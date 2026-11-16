const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

let mainWindow = null;
let localServer = null;
let serverUrl = '';
let rendererReady = false;
const pendingFiles = [];

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function loadEnvIfPresent() {
  try {
    const dotenv = require('dotenv');
    const candidates = [
      path.join(app.getAppPath(), '.env'),
      path.join(path.dirname(process.execPath), '.env'),
      path.join(app.getPath('userData'), '.env'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        break;
      }
    }
  } catch {
    // optional dotenv
  }
}

async function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    return new GoogleGenAI({ apiKey });
  } catch {
    return null;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseDataUrl(dataUrl) {
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function startBuiltInServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

      if (req.method === 'GET' && urlPath === '/api/health') {
        const ai = await getGeminiClient();
        return sendJson(res, 200, { ok: true, aiAvailable: Boolean(ai), desktop: true });
      }

      if (req.method === 'POST' && urlPath.startsWith('/api/ai/')) {
        const ai = await getGeminiClient();
        if (!ai) {
          return sendJson(res, 503, { error: 'Gemini API key is not configured.' });
        }
        try {
          const body = await readJsonBody(req);
          const { Type } = await import('@google/genai');

          if (urlPath === '/api/ai/analyze-photo') {
            const parsed = parseDataUrl(body.imageDataUrl);
            if (!parsed) return sendJson(res, 400, { error: 'Invalid base64 image data URL.' });
            const preTagHint =
              Array.isArray(body.preTags) && body.preTags.length > 0
                ? ` On-device object detection pre-tags: ${body.preTags.join(', ')}. Refine, expand, and verify these.`
                : '';
            const response = await ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: {
                parts: [
                  { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
                  {
                    text: `Analyze this photo. Return 4 to 6 lowercase single-word noun tags describing the subject, lighting, or scene, plus one concise descriptive sentence.${preTagHint}`,
                  },
                ],
              },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    caption: { type: Type.STRING },
                  },
                  required: ['tags', 'caption'],
                },
              },
            });
            const payload = JSON.parse((response.text || '{}').trim());
            return sendJson(res, 200, {
              tags: Array.isArray(payload.tags)
                ? payload.tags.map((t) => String(t).toLowerCase().trim())
                : [],
              caption: typeof payload.caption === 'string' ? payload.caption : '',
            });
          }

          if (urlPath === '/api/ai/describe-photo') {
            const parsed = parseDataUrl(body.imageDataUrl);
            if (!parsed) return sendJson(res, 400, { error: 'Invalid image format.' });
            const contextNote = [
              body.date ? `Taken on ${body.date}` : '',
              body.place ? `at ${body.place}` : '',
            ]
              .filter(Boolean)
              .join(' ');
            const response = await ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: {
                parts: [
                  { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
                  {
                    text: `Write a warm, observant 2-sentence caption for this photograph. No hashtags or emojis. ${contextNote}`,
                  },
                ],
              },
            });
            return sendJson(res, 200, { description: (response.text || '').trim() });
          }

          if (urlPath === '/api/ai/auto-enhance') {
            const parsed = parseDataUrl(body.imageDataUrl);
            if (!parsed) return sendJson(res, 400, { error: 'Invalid image format.' });
            const response = await ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: {
                parts: [
                  { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
                  {
                    text: 'Evaluate exposure, contrast, color vibrancy, and white balance of this image. Suggest subtle balanced adjustments to make it look crisp and natural.',
                  },
                ],
              },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    b: { type: Type.INTEGER },
                    c: { type: Type.INTEGER },
                    s: { type: Type.INTEGER },
                    w: { type: Type.INTEGER },
                  },
                  required: ['b', 'c', 's', 'w'],
                },
              },
            });
            return sendJson(res, 200, JSON.parse((response.text || '{}').trim()));
          }

          if (urlPath === '/api/ai/search') {
            if (!body.query) return sendJson(res, 400, { error: 'query is required.' });
            const today = new Date().toISOString().slice(0, 10);
            const compactCatalog = (body.catalog || [])
              .slice(0, 250)
              .map(
                (p) =>
                  `${p.id}|${p.date}|${p.folder}|${p.place || ''}|${p.fav ? 'fav' : ''}|${(p.tags || []).join(',')}`
              )
              .join('\n');
            const response = await ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: `You search a personal photo library. Today is ${today}.
Available tags: ${(body.availableTags || []).join(', ')}
User query: "${body.query}"
Catalog (id|date|folder|place|fav|tags):
${compactCatalog}

Select all matching photo IDs and return a short helpful answer if the user asked a question.`,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    matchedIds: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    place: { type: Type.STRING },
                    from: { type: Type.STRING },
                    to: { type: Type.STRING },
                    favorites: { type: Type.BOOLEAN },
                    answer: { type: Type.STRING },
                  },
                  required: ['matchedIds', 'tags', 'favorites', 'answer'],
                },
              },
            });
            return sendJson(res, 200, JSON.parse((response.text || '{}').trim()));
          }

          return sendJson(res, 404, { error: 'Unknown AI endpoint.' });
        } catch (err) {
          return sendJson(res, 500, {
            error: err instanceof Error ? err.message : 'AI request failed',
          });
        }
      }

      // Serve static built assets with SPA fallback
      const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      let filePath = path.resolve(distDir, relPath);
      if (!filePath.startsWith(distDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        res.end(data);
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3000;
      localServer = server;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function collectImagePaths(argv) {
  return (argv || []).filter((arg) => {
    if (!arg || arg.startsWith('-')) return false;
    try {
      return IMAGE_EXT_RE.test(arg) && fs.existsSync(arg) && fs.statSync(arg).isFile();
    } catch {
      return false;
    }
  });
}

function serializeFilesForRenderer(filePaths) {
  const out = [];
  for (const fp of filePaths) {
    try {
      const buf = fs.readFileSync(fp);
      const stat = fs.statSync(fp);
      out.push({
        name: path.basename(fp),
        mimeType: getMimeType(fp),
        lastModified: stat.mtimeMs,
        data: buf.toString('base64'),
      });
    } catch {
      // skip unreadable files
    }
  }
  return out;
}

function dispatchFilesToRenderer(filePaths) {
  if (!filePaths.length) return;
  const serialized = serializeFilesForRenderer(filePaths);
  if (!serialized.length) return;
  if (mainWindow && rendererReady && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('billworld:open-files', serialized);
  } else {
    pendingFiles.push(...serialized);
  }
}

function createWindow() {
  const appPath = app.getAppPath();
  const iconCandidates = [
    path.join(appPath, 'dist', 'app-icon.ico'),
    path.join(appPath, 'public', 'app-icon.ico'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 880,
    minHeight: 620,
    title: 'SYMPHONY 8TH',
    backgroundColor: '#090a0d',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(serverUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.loadURL(serverUrl);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const opened = collectImagePaths(argv);
    if (opened.length) dispatchFilesToRenderer(opened);
  });

  app.whenReady().then(async () => {
    loadEnvIfPresent();
    const distDir = path.join(app.getAppPath(), 'dist');
    serverUrl = await startBuiltInServer(distDir);

    ipcMain.on('billworld:renderer-ready', () => {
      rendererReady = true;
      if (pendingFiles.length && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('billworld:open-files', pendingFiles.splice(0, pendingFiles.length));
      }
    });

    ipcMain.handle('billworld:pick-files', async () => {
      if (!mainWindow) return [];
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Photos in SYMPHONY 8TH',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Images',
            extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg', 'heic', 'heif', 'tif', 'tiff'],
          },
        ],
      });
      if (result.canceled || !result.filePaths.length) return [];
      return serializeFilesForRenderer(result.filePaths);
    });

    createWindow();

    const initialFiles = collectImagePaths(process.argv.slice(1));
    if (initialFiles.length) {
      dispatchFilesToRenderer(initialFiles);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        rendererReady = false;
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (localServer) {
      localServer.close();
      localServer = null;
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
