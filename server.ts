import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import {GenerateContentResponse, GoogleGenAI, Type} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRESET_IDS = [
  'pothos',
  'monstera',
  'peace_lily',
  'zz_plant',
  'snake_plant',
  'calathea',
  'boston_fern',
  'parlor_palm',
  'philodendron',
  'cast_iron',
  'ficus_elastica',
  'orchid',
  'english_ivy',
  'custom',
] as const;

interface FirebaseClientConfig {
  apiKey?: string;
}

function readFirebaseApiKey(): string {
  try {
    const configPath = path.join(__dirname, 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as FirebaseClientConfig;
    return typeof parsed.apiKey === 'string' ? parsed.apiKey : '';
  } catch {
    return '';
  }
}

async function verifyFirebaseBearerToken(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken || idToken.length > 8192) return null;

  const apiKey = readFirebaseApiKey();
  if (!apiKey) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({idToken}),
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{localId?: string; emailVerified?: boolean}>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return user.localId;
  } catch {
    return null;
  }
}

function sanitizeHttpUrl(url: string | undefined): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString().slice(0, 400);
    }
    return '';
  } catch {
    return '';
  }
}

function tryExtractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '2mb'}));

  const CAPACITOR_ORIGINS = new Set([
    'https://nordflora.local',
    'https://localhost',
    'http://localhost',
  ]);

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && CAPACITOR_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.post('/api/identify-plant', async (req, res) => {
    const uid = await verifyFirebaseBearerToken(req.headers.authorization);
    if (!uid) {
      res.status(401).json({error: 'Please sign in with Google before identifying a plant.'});
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const body = req.body as {imageDataUrl?: unknown};
    const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';

    const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      imageDataUrl,
    );
    if (!match || imageDataUrl.length > 450000) {
      res.status(400).json({error: 'Invalid or oversized plant photo payload.'});
      return;
    }

    const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const base64Data = match[2];

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = [
      'Identify the houseplant in this photo and provide verified botanical and indoor care details.',
      'Context: The owner keeps this plant near a north-facing window in Barcelona (41.39 N, Mediterranean coastal climate).',
      'Return ONLY a single JSON object (no extra commentary) with these exact keys:',
      '- commonName: string (e.g. "Golden Pothos")',
      '- botanicalName: string (e.g. "Epipremnum aureum")',
      `- matchedPresetId: one of ${PRESET_IDS.join(', ')}`,
      '- baseWaterDays: number between 2 and 45 (baseline days between waterings at 21C and ~500 lux indoor light)',
      '- idealLuxMin: number (minimum recommended indoor lux)',
      '- idealLuxMax: number (maximum recommended indoor lux)',
      '- careDetails: string under 650 chars covering soil mix, watering cues (when top soil dries), humidity preference, north-window placement tip in Barcelona, and pet safety.',
      '- confidence: "high" | "medium" | "low"',
    ].join('\n');

    const imagePart = {inlineData: {mimeType, data: base64Data}};
    const textPart = {text: promptText};

    let response: GenerateContentResponse | null = null;
    let grounded = false;
    let lastError: unknown = null;

    // 1. Primary: gemini-4-hydrogen with Google Search grounding
    // 2. Fallback on 429: gemini-3.1-flash-lite with Google Search grounding
    // 3. Fallback if Search grounding quota is 0: gemini-3.1-flash-lite vision + structured JSON
    const attempts: Array<{model: string; useSearch: boolean; delayMs: number}> = [
      {model: 'gemini-4-hydrogen', useSearch: true, delayMs: 0},
      {model: 'gemini-3.1-flash-lite', useSearch: true, delayMs: 900},
      {model: 'gemini-3.1-flash-lite', useSearch: false, delayMs: 600},
    ];

    for (const attempt of attempts) {
      if (attempt.delayMs > 0) {
        await sleep(attempt.delayMs);
      }
      try {
        response = await ai.models.generateContent({
          model: attempt.model,
          contents: {parts: [imagePart, textPart]},
          config: attempt.useSearch
            ? {tools: [{googleSearch: {}}]}
            : {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    commonName: {type: Type.STRING},
                    botanicalName: {type: Type.STRING},
                    matchedPresetId: {type: Type.STRING},
                    baseWaterDays: {type: Type.NUMBER},
                    idealLuxMin: {type: Type.NUMBER},
                    idealLuxMax: {type: Type.NUMBER},
                    careDetails: {type: Type.STRING},
                    confidence: {type: Type.STRING},
                  },
                  required: [
                    'commonName',
                    'botanicalName',
                    'matchedPresetId',
                    'baseWaterDays',
                    'idealLuxMin',
                    'idealLuxMax',
                    'careDetails',
                    'confidence',
                  ],
                },
              },
        });
        grounded = attempt.useSearch;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (!isQuotaOrRateLimitError(err)) {
          break;
        }
      }
    }

    if (!response) {
      if (isQuotaOrRateLimitError(lastError)) {
        res.status(429).json({
          error:
            'Gemini API quota or rate limit reached (429). Wait a moment and tap Re-run Lookup, or select a billing-enabled API key in Settings > Secrets.',
        });
        return;
      }
      const msg =
        lastError instanceof Error ? lastError.message : 'Plant identification lookup failed.';
      res.status(502).json({error: msg});
      return;
    }

    try {
      const rawText = (response.text ?? '').trim();
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = chunks
        .map((c) => {
          const web = (c as {web?: {uri?: string; title?: string}}).web;
          const url = sanitizeHttpUrl(web?.uri);
          const title = typeof web?.title === 'string' ? web.title.trim().slice(0, 120) : '';
          return url ? {title: title || url, url} : null;
        })
        .filter((s): s is {title: string; url: string} => s !== null)
        .slice(0, 4);

      let parsed = tryExtractJson(rawText);

      // Structured JSON extraction pass if the search-grounded response included prose
      if (!parsed && rawText) {
        const structuredResponse = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Extract the plant identification and care details from this research into strict JSON:\n\n${rawText}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                commonName: {type: Type.STRING},
                botanicalName: {type: Type.STRING},
                matchedPresetId: {type: Type.STRING},
                baseWaterDays: {type: Type.NUMBER},
                idealLuxMin: {type: Type.NUMBER},
                idealLuxMax: {type: Type.NUMBER},
                careDetails: {type: Type.STRING},
                confidence: {type: Type.STRING},
              },
              required: [
                'commonName',
                'botanicalName',
                'matchedPresetId',
                'baseWaterDays',
                'idealLuxMin',
                'idealLuxMax',
                'careDetails',
                'confidence',
              ],
            },
          },
        });
        parsed = tryExtractJson(structuredResponse.text ?? '');
      }

      if (!parsed) {
        res.status(502).json({
          error:
            'Could not identify the plant cleanly from that photo. Try a clearer, closer leaf shot.',
        });
        return;
      }

      const commonName =
        typeof parsed.commonName === 'string' && parsed.commonName.trim()
          ? parsed.commonName.trim().slice(0, 80)
          : 'Houseplant';
      const botanicalName =
        typeof parsed.botanicalName === 'string'
          ? parsed.botanicalName.trim().slice(0, 100)
          : '';
      const rawPreset =
        typeof parsed.matchedPresetId === 'string' ? parsed.matchedPresetId.trim() : 'custom';
      const matchedPresetId = (PRESET_IDS as readonly string[]).includes(rawPreset)
        ? rawPreset
        : 'custom';
      const baseWaterDays = Math.max(
        2,
        Math.min(45, Math.round(Number(parsed.baseWaterDays) || 10)),
      );
      const idealLuxMin = Math.max(
        50,
        Math.min(50000, Math.round(Number(parsed.idealLuxMin) || 250)),
      );
      const idealLuxMax = Math.max(
        idealLuxMin,
        Math.min(100000, Math.round(Number(parsed.idealLuxMax) || 1600)),
      );
      const careDetails =
        typeof parsed.careDetails === 'string'
          ? parsed.careDetails.trim().slice(0, 800)
          : '';
      const confidence =
        parsed.confidence === 'high' || parsed.confidence === 'medium'
          ? parsed.confidence
          : 'low';

      res.json({
        commonName,
        botanicalName,
        matchedPresetId,
        baseWaterDays,
        idealLuxMin,
        idealLuxMax,
        careDetails,
        confidence,
        grounded,
        sources,
      });
    } catch (err) {
      if (isQuotaOrRateLimitError(err)) {
        res.status(429).json({
          error:
            'Gemini API quota or rate limit reached (429). Wait a moment and retry, or check Settings > Secrets.',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Plant identification lookup failed.';
      res.status(502).json({error: msg});
    }
  });

  app.post('/api/analyze-growth', async (req, res) => {
    const uid = await verifyFirebaseBearerToken(req.headers.authorization);
    if (!uid) {
      res.status(401).json({error: 'Please sign in with Google before analyzing plant growth.'});
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const body = req.body as {
      currentPhotoDataUrl?: unknown;
      previousPhotoDataUrl?: unknown;
      previousRecordedAt?: unknown;
      plantContext?: {
        name?: unknown;
        speciesName?: unknown;
        botanicalName?: unknown;
        avgLux?: unknown;
        idealLuxMin?: unknown;
        idealLuxMax?: unknown;
        baseWaterDays?: unknown;
        potMaterial?: unknown;
        potSize?: unknown;
        avgTempC?: unknown;
        humidityPct?: unknown;
        daylightHours?: unknown;
      };
    };

    const currentUrl =
      typeof body?.currentPhotoDataUrl === 'string' ? body.currentPhotoDataUrl.trim() : '';
    const dataUrlRegex = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
    const currentMatch = dataUrlRegex.exec(currentUrl);
    if (!currentMatch || currentUrl.length > 450000) {
      res.status(400).json({error: 'Invalid or oversized current plant photo.'});
      return;
    }

    const prevUrl =
      typeof body?.previousPhotoDataUrl === 'string' ? body.previousPhotoDataUrl.trim() : '';
    const prevMatch = prevUrl && prevUrl.length <= 450000 ? dataUrlRegex.exec(prevUrl) : null;
    const prevDateStr =
      typeof body?.previousRecordedAt === 'string'
        ? body.previousRecordedAt.slice(0, 24)
        : '';

    const ctx = body?.plantContext ?? {};
    const speciesLabel =
      typeof ctx.speciesName === 'string' && ctx.speciesName.trim()
        ? ctx.speciesName.trim().slice(0, 80)
        : 'Houseplant';
    const botanicalLabel =
      typeof ctx.botanicalName === 'string' && ctx.botanicalName.trim()
        ? ` (${ctx.botanicalName.trim().slice(0, 100)})`
        : '';
    const avgLux = Number(ctx.avgLux) || 350;
    const idealMin = Number(ctx.idealLuxMin) || 250;
    const idealMax = Number(ctx.idealLuxMax) || 1600;
    const baseDays = Number(ctx.baseWaterDays) || 10;
    const potStr = `${typeof ctx.potSize === 'string' ? ctx.potSize : 'medium'} ${typeof ctx.potMaterial === 'string' ? ctx.potMaterial : 'ceramic'}`;
    const tempC = Number(ctx.avgTempC) || 20;
    const humidityPct = Number(ctx.humidityPct) || 60;
    const daylightHours = Number(ctx.daylightHours) || 11;

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}> = [];
    if (prevMatch) {
      parts.push({
        text: `EARLIER REFERENCE PHOTO (${prevDateStr || 'previous check-in'}):`,
      });
      parts.push({
        inlineData: {
          mimeType: prevMatch[1] === 'image/jpg' ? 'image/jpeg' : prevMatch[1],
          data: prevMatch[2],
        },
      });
      parts.push({
        text: 'CURRENT PHOTO (taken now):',
      });
    }
    parts.push({
      inlineData: {
        mimeType: currentMatch[1] === 'image/jpg' ? 'image/jpeg' : currentMatch[1],
        data: currentMatch[2],
      },
    });

    const promptLines = [
      `Evaluate the growth and health of this ${speciesLabel}${botanicalLabel}.`,
      prevMatch
        ? 'Compare the CURRENT PHOTO against the EARLIER REFERENCE PHOTO to describe new leaves, height/fullness change, leaf perkiness, or decline.'
        : 'Assess overall leaf vigor, new shoot/leaf activity, coloration, stem spacing, and soil/foliage condition from this photo.',
      `Barcelona North-Window Environment Context: avg daylight ${Math.round(avgLux)} lux (species target ${idealMin}-${idealMax} lux), ${daylightHours}h daylight/day, ${tempC.toFixed(1)}°C, ${Math.round(humidityPct)}% RH, ${potStr} pot, ${baseDays}d base watering interval.`,
      'If growth is NOT optimal, clearly diagnose what looks wrong visually (e.g., yellowing/chlorosis from overwatering or root stress, brown crispy tips from dry air, leggy stretched stems from insufficient north-window light, drooping/wilting, leaf spots, or pests) and correlate with the environment numbers above.',
      'Return ONLY a JSON object with keys:',
      '- healthStatus: "thriving" | "watch" | "issue"',
      '- growthSummary: string under 280 chars describing observed growth & vigor (and comparison if earlier photo provided).',
      '- issueDetected: string under 280 chars describing what is wrong if growth is not optimal (or empty string "" if thriving/optimal).',
      '- recommendedAction: string under 380 chars with concrete next steps referencing their lux, watering, or humidity if helpful.',
    ];
    parts.push({text: promptLines.join('\n')});

    const attempts: Array<{model: string; delayMs: number}> = [
      {model: 'gemini-4-hydrogen', delayMs: 0},
      {model: 'gemini-3.1-flash-lite', delayMs: 800},
    ];

    let response: GenerateContentResponse | null = null;
    let lastError: unknown = null;

    for (const attempt of attempts) {
      if (attempt.delayMs > 0) await sleep(attempt.delayMs);
      try {
        response = await ai.models.generateContent({
          model: attempt.model,
          contents: {parts},
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                healthStatus: {type: Type.STRING},
                growthSummary: {type: Type.STRING},
                issueDetected: {type: Type.STRING},
                recommendedAction: {type: Type.STRING},
              },
              required: [
                'healthStatus',
                'growthSummary',
                'issueDetected',
                'recommendedAction',
              ],
            },
          },
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (!isQuotaOrRateLimitError(err)) {
          break;
        }
      }
    }

    if (!response) {
      if (isQuotaOrRateLimitError(lastError)) {
        res.status(429).json({
          error:
            'Gemini API quota or rate limit reached (429). Wait a moment and retry, or check Settings > Secrets.',
        });
        return;
      }
      const msg =
        lastError instanceof Error ? lastError.message : 'Plant growth analysis failed.';
      res.status(502).json({error: msg});
      return;
    }

    const parsed = tryExtractJson(response.text ?? '');
    if (!parsed) {
      res.status(502).json({
        error: 'Could not interpret the plant growth photo cleanly. Try a clearer well-lit shot.',
      });
      return;
    }

    const rawStatus = typeof parsed.healthStatus === 'string' ? parsed.healthStatus.trim() : '';
    const healthStatus =
      rawStatus === 'thriving' || rawStatus === 'watch' || rawStatus === 'issue'
        ? rawStatus
        : 'watch';
    const growthSummary =
      typeof parsed.growthSummary === 'string' && parsed.growthSummary.trim()
        ? parsed.growthSummary.trim().slice(0, 300)
        : 'Photo recorded in growth timeline.';
    const issueDetected =
      typeof parsed.issueDetected === 'string'
        ? parsed.issueDetected.trim().slice(0, 300)
        : '';
    const recommendedAction =
      typeof parsed.recommendedAction === 'string'
        ? parsed.recommendedAction.trim().slice(0, 400)
        : 'Keep monitoring leaf firmness and topsoil moisture before the next watering.';

    res.json({
      healthStatus,
      growthSummary,
      issueDetected,
      recommendedAction,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({error: 'API route not found.'});
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        typeof (err as {status?: unknown})?.status === 'number'
          ? (err as {status: number}).status
          : 500;
      const msg =
        status === 413
          ? 'Uploaded photos are too large. Try snapping a closer single shot.'
          : err instanceof Error
            ? err.message
            : 'Unexpected API server error.';
      res.status(status).json({error: msg});
    },
  );

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: {server: httpServer},
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`NordFlora server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
