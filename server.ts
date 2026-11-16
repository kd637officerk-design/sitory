import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const cliPort = Number(process.argv[portArgIdx + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  if (Number.isFinite(envPort) && envPort > 0 && envPort !== nginxPort) {
    return envPort;
  }
  const defaultPort = Number(process.env.DEFAULT_APP_PORT);
  if (Number.isFinite(defaultPort) && defaultPort > 0) {
    return defaultPort;
  }
  return 3000;
}

const PORT = resolvePort();
const isProd = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    const ai = getGeminiClient();
    res.json({ ok: true, aiAvailable: Boolean(ai) });
  });

  app.post('/api/ai/analyze-photo', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }
    try {
      const { imageDataUrl, preTags } = req.body as {
        imageDataUrl?: string;
        preTags?: string[];
      };
      if (!imageDataUrl) {
        return res.status(400).json({ error: 'imageDataUrl is required.' });
      }
      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid base64 image data URL.' });
      }

      const preTagHint =
        Array.isArray(preTags) && preTags.length > 0
          ? ` On-device object detection pre-tags: ${preTags.join(', ')}. Refine, expand, and verify these.`
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
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '4 to 6 lowercase single-word nouns describing the photo',
              },
              caption: {
                type: Type.STRING,
                description: 'One short sentence describing the photo',
              },
            },
            required: ['tags', 'caption'],
          },
        },
      });

      const payload = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        tags: Array.isArray(payload.tags) ? payload.tags.map((t: string) => String(t).toLowerCase().trim()) : [],
        caption: typeof payload.caption === 'string' ? payload.caption : '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze photo';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/describe-photo', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }
    try {
      const { imageDataUrl, date, place } = req.body as {
        imageDataUrl?: string;
        date?: string;
        place?: string;
      };
      if (!imageDataUrl) {
        return res.status(400).json({ error: 'imageDataUrl is required.' });
      }
      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid image format.' });
      }

      const contextNote = [date ? `Taken on ${date}` : '', place ? `at ${place}` : '']
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

      return res.json({ description: (response.text ?? '').trim() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to describe photo';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/auto-enhance', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }
    try {
      const { imageDataUrl } = req.body as { imageDataUrl?: string };
      if (!imageDataUrl) {
        return res.status(400).json({ error: 'imageDataUrl is required.' });
      }
      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid image format.' });
      }

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
              b: { type: Type.INTEGER, description: 'Brightness 85 to 125 (100 neutral)' },
              c: { type: Type.INTEGER, description: 'Contrast 85 to 130 (100 neutral)' },
              s: { type: Type.INTEGER, description: 'Saturation 75 to 145 (100 neutral)' },
              w: { type: Type.INTEGER, description: 'Warmth -30 to 30 (0 neutral)' },
            },
            required: ['b', 'c', 's', 'w'],
          },
        },
      });

      const payload = JSON.parse((response.text ?? '{}').trim());
      return res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to auto-enhance';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/search', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }
    try {
      const { query, catalog, availableTags } = req.body as {
        query?: string;
        catalog?: Array<{
          id: number;
          date: string;
          folder: string;
          place: string;
          fav: boolean;
          tags: string[];
        }>;
        availableTags?: string[];
      };
      if (!query) {
        return res.status(400).json({ error: 'query is required.' });
      }

      const today = new Date().toISOString().slice(0, 10);
      const compactCatalog = (catalog ?? [])
        .slice(0, 250)
        .map((p) => `${p.id}|${p.date}|${p.folder}|${p.place || ''}|${p.fav ? 'fav' : ''}|${p.tags.join(',')}`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You search a personal photo library. Today is ${today}.
Available tags: ${(availableTags ?? []).join(', ')}
User query: "${query}"
Catalog (id|date|folder|place|fav|tags):
${compactCatalog}

Select all matching photo IDs and return a short helpful answer if the user asked a question.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchedIds: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
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

      const payload = JSON.parse((response.text ?? '{}').trim());
      return res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return res.status(500).json({ error: message });
    }
  });

  if (!isProd) {
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SYMPHONY 8TH server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SYMPHONY 8TH server:', err);
  process.exit(1);
});
