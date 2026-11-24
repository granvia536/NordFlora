import {Capacitor} from '@capacitor/core';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {OperationType, auth, db, handleFirestoreError} from '../firebase';
import {
  EntryType,
  GrowthAnalysisResult,
  HeatingOrAc,
  LuxSource,
  MonthlyTemp,
  PlantGrowthPhoto,
  PlantLog,
  PlantLookupResult,
  PlantRecord,
  PotMaterial,
  PotSize,
  ReadingPeriod,
} from '../types';
import {computeDampSnoozeCalibration, getCurrentMonthKey} from './botanicalEngine';

function makeSafeId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`.slice(0, 120);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sanitizeHttpUrl(url: string | undefined): string {
  if (!url) return '';
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

export class ApiUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnreachableError';
  }
}

async function describeNonJsonResponse(
  res: Response,
  featureLabel: string,
): Promise<string> {
  const contentType = res.headers.get('content-type') || 'unknown';
  const bodySnippet = await res.text().catch(() => '');
  const looksLikeGoogleProxy =
    res.url.includes('accounts.google.com') ||
    bodySnippet.includes('accounts.google.com') ||
    bodySnippet.includes('ServiceLogin');

  if (looksLikeGoogleProxy) {
    return `${featureLabel} was blocked by an auth proxy login page (AI Studio preview URLs require a browser session and cannot be called directly by an APK). Use the web preview or host NordFlora's server publicly.`;
  }

  return `${featureLabel} is unreachable from this build (HTTP ${res.status}, ${contentType}).`;
}

export async function identifyPlantFromPhoto(imageDataUrl: string): Promise<PlantLookupResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in before looking up a plant photo.');
  }
  const idToken = await currentUser.getIdToken();
  const configuredApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const endpoint = configuredApiBase ? `${configuredApiBase}/api/identify-plant` : '/api/identify-plant';

  if (Capacitor.isNativePlatform() && !configuredApiBase) {
    throw new ApiUnreachableError(
      'Photo species lookup in the standalone APK needs VITE_API_BASE_URL set to a public NordFlora server URL at build time. You can still pick a species preset or enter care details manually.',
    );
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({imageDataUrl}),
    });
  } catch {
    throw new ApiUnreachableError(
      'Could not reach the species lookup server. Check your internet connection or server URL.',
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiUnreachableError(
      await describeNonJsonResponse(res, 'Photo species lookup API'),
    );
  }

  const payload = (await res.json().catch(() => ({}))) as Partial<PlantLookupResult> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(payload.error || 'Could not look up that plant photo online.');
  }

  return {
    commonName: payload.commonName || 'Houseplant',
    botanicalName: payload.botanicalName || '',
    matchedPresetId: payload.matchedPresetId || 'custom',
    baseWaterDays: Number(payload.baseWaterDays) || 10,
    idealLuxMin: Number(payload.idealLuxMin) || 250,
    idealLuxMax: Number(payload.idealLuxMax) || 1600,
    careDetails: payload.careDetails || '',
    confidence: payload.confidence || 'medium',
    grounded: payload.grounded,
    sources: Array.isArray(payload.sources) ? payload.sources : [],
  };
}

export async function analyzePlantGrowth(params: {
  currentPhotoDataUrl: string;
  previousPhotoDataUrl?: string;
  previousRecordedAt?: string;
  plant: PlantRecord;
  effectiveTempC: number;
  effectiveHumidityPct: number;
  daylightHours: number;
}): Promise<GrowthAnalysisResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in before analyzing plant growth.');
  }
  const idToken = await currentUser.getIdToken();
  const configuredApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const endpoint = configuredApiBase ? `${configuredApiBase}/api/analyze-growth` : '/api/analyze-growth';

  if (Capacitor.isNativePlatform() && !configuredApiBase) {
    throw new ApiUnreachableError(
      'Standalone APK has no public VITE_API_BASE_URL configured for AI vision.',
    );
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        currentPhotoDataUrl: params.currentPhotoDataUrl,
        previousPhotoDataUrl: params.previousPhotoDataUrl || undefined,
        previousRecordedAt: params.previousRecordedAt || undefined,
        plantContext: {
          name: params.plant.name,
          speciesName: params.plant.speciesName,
          botanicalName: params.plant.botanicalName,
          avgLux: params.plant.avgLux ?? params.plant.latestLux,
          idealLuxMin: params.plant.idealLuxMin,
          idealLuxMax: params.plant.idealLuxMax,
          baseWaterDays: params.plant.baseWaterDays,
          potMaterial: params.plant.potMaterial,
          potSize: params.plant.potSize,
          avgTempC: params.effectiveTempC,
          humidityPct: params.effectiveHumidityPct,
          daylightHours: params.daylightHours,
        },
      }),
    });
  } catch {
    throw new ApiUnreachableError(
      'Could not reach the growth diagnosis server. Check your internet connection or server URL.',
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiUnreachableError(
      await describeNonJsonResponse(res, 'Growth diagnosis API'),
    );
  }

  const payload = (await res.json().catch(() => ({}))) as Partial<GrowthAnalysisResult> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(payload.error || 'Could not analyze plant growth from that photo.');
  }

  const status =
    payload.healthStatus === 'thriving' ||
    payload.healthStatus === 'watch' ||
    payload.healthStatus === 'issue'
      ? payload.healthStatus
      : 'watch';

  return {
    healthStatus: status,
    growthSummary: payload.growthSummary || 'Growth snapshot saved.',
    issueDetected: payload.issueDetected || '',
    recommendedAction:
      payload.recommendedAction ||
      'Continue monitoring topsoil moisture and north-window light levels.',
  };
}

export function subscribePlants(
  userId: string,
  onData: (plants: PlantRecord[]) => void,
) {
  const path = `users/${userId}/plants`;
  const q = query(
    collection(db, 'users', userId, 'plants'),
    where('ownerId', '==', userId),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as PlantRecord);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeMonthlyTemps(
  userId: string,
  onData: (temps: MonthlyTemp[]) => void,
) {
  const path = `users/${userId}/monthlyTemps`;
  const q = query(
    collection(db, 'users', userId, 'monthlyTemps'),
    where('ownerId', '==', userId),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as MonthlyTemp)
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribePlantLogs(
  userId: string,
  plantId: string,
  onData: (logs: PlantLog[]) => void,
) {
  const path = `users/${userId}/plants/${plantId}/logs`;
  const q = query(
    collection(db, 'users', userId, 'plants', plantId, 'logs'),
    where('ownerId', '==', userId),
    orderBy('recordedAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as PlantLog);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeGrowthPhotos(
  userId: string,
  plantId: string,
  onData: (photos: PlantGrowthPhoto[]) => void,
) {
  const path = `users/${userId}/plants/${plantId}/growthPhotos`;
  const q = query(
    collection(db, 'users', userId, 'plants', plantId, 'growthPhotos'),
    where('ownerId', '==', userId),
    orderBy('recordedAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as PlantGrowthPhoto);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export interface SavePlantInput {
  id?: string;
  name: string;
  speciesId: string;
  speciesName: string;
  botanicalName?: string;
  careDetails?: string;
  idealLuxMin?: number;
  idealLuxMax?: number;
  sourceTitle?: string;
  sourceUrl?: string;
  entryType: EntryType;
  quantity: number;
  potMaterial: PotMaterial;
  potSize: PotSize;
  baseWaterDays: number;
  latestLux: number;
  avgLux?: number;
  luxSource: LuxSource;
  lastLuxAt: string;
  lastWateredAt: string;
  notes: string;
  photoDataUrl: string;
}

export async function createPlant(userId: string, input: SavePlantInput): Promise<string> {
  const plantId = input.id ? input.id.replace(/[^a-zA-Z0-9_-]/g, '') : makeSafeId('plant');
  const path = `users/${userId}/plants/${plantId}`;
  const entryType: EntryType = input.entryType === 'group' ? 'group' : 'individual';
  const quantity =
    entryType === 'individual' ? 1 : Math.round(clamp(input.quantity || 2, 2, 200));

  const safeLatestLux = Math.round(clamp(input.latestLux, 0, 150000));
  const rawMonth = input.lastLuxAt.slice(0, 7);
  const lastLuxMonth = /^[0-9]{4}-[0-9]{2}$/.test(rawMonth)
    ? rawMonth
    : getCurrentMonthKey();

  const payload = {
    id: plantId,
    ownerId: userId,
    name: input.name.trim().slice(0, 80) || 'Unnamed Plant',
    speciesId: input.speciesId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'custom',
    speciesName: input.speciesName.trim().slice(0, 80) || 'Houseplant',
    botanicalName: (input.botanicalName ?? '').trim().slice(0, 100),
    careDetails: (input.careDetails ?? '').trim().slice(0, 800),
    idealLuxMin: Math.round(clamp(input.idealLuxMin ?? 250, 0, 150000)),
    idealLuxMax: Math.round(clamp(input.idealLuxMax ?? 1600, 0, 150000)),
    sourceTitle: (input.sourceTitle ?? '').trim().slice(0, 120),
    sourceUrl: sanitizeHttpUrl(input.sourceUrl),
    entryType,
    quantity,
    potMaterial: input.potMaterial,
    potSize: input.potSize,
    baseWaterDays: Number(clamp(input.baseWaterDays, 1, 90).toFixed(1)),
    latestLux: safeLatestLux,
    avgLux:
      typeof input.avgLux === 'number'
        ? Math.round(clamp(input.avgLux, 0, 150000))
        : safeLatestLux,
    luxReadingCount: 1,
    lastLuxMonth,
    luxSource: input.luxSource,
    lastLuxAt: input.lastLuxAt.slice(0, 40),
    lastWateredAt: input.lastWateredAt.slice(0, 40),
    notes: input.notes.trim().slice(0, 300),
    photoDataUrl: input.photoDataUrl.slice(0, 175000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', userId, 'plants', plantId), payload);
    return plantId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePlantDetails(
  userId: string,
  plantId: string,
  input: SavePlantInput,
): Promise<void> {
  const path = `users/${userId}/plants/${plantId}`;
  const entryType: EntryType = input.entryType === 'group' ? 'group' : 'individual';
  const quantity =
    entryType === 'individual' ? 1 : Math.round(clamp(input.quantity || 2, 2, 200));

  try {
    const updatePayload: Record<string, unknown> = {
      name: input.name.trim().slice(0, 80) || 'Unnamed Plant',
      speciesId: input.speciesId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'custom',
      speciesName: input.speciesName.trim().slice(0, 80) || 'Houseplant',
      botanicalName: (input.botanicalName ?? '').trim().slice(0, 100),
      careDetails: (input.careDetails ?? '').trim().slice(0, 800),
      idealLuxMin: Math.round(clamp(input.idealLuxMin ?? 250, 0, 150000)),
      idealLuxMax: Math.round(clamp(input.idealLuxMax ?? 1600, 0, 150000)),
      sourceTitle: (input.sourceTitle ?? '').trim().slice(0, 120),
      sourceUrl: sanitizeHttpUrl(input.sourceUrl),
      entryType,
      quantity,
      potMaterial: input.potMaterial,
      potSize: input.potSize,
      baseWaterDays: Number(clamp(input.baseWaterDays, 1, 90).toFixed(1)),
      latestLux: Math.round(clamp(input.latestLux, 0, 150000)),
      luxSource: input.luxSource,
      lastLuxAt: input.lastLuxAt.slice(0, 40),
      lastWateredAt: input.lastWateredAt.slice(0, 40),
      notes: input.notes.trim().slice(0, 300),
      photoDataUrl: input.photoDataUrl.slice(0, 175000),
      updatedAt: serverTimestamp(),
    };
    if (typeof input.avgLux === 'number') {
      updatePayload.avgLux = Math.round(clamp(input.avgLux, 0, 150000));
    }
    await updateDoc(doc(db, 'users', userId, 'plants', plantId), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markPlantWatered(
  userId: string,
  plant: PlantRecord,
  note = 'Watered',
): Promise<void> {
  const nowIso = new Date().toISOString();
  const logId = makeSafeId('log');
  const plantPath = `users/${userId}/plants/${plant.id}`;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', userId, 'plants', plant.id), {
      lastWateredAt: nowIso,
      snoozedUntilAt: '',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', userId, 'plants', plant.id, 'logs', logId), {
      id: logId,
      ownerId: userId,
      plantId: plant.id,
      logType: 'water',
      luxValue: Math.round(clamp(plant.latestLux, 0, 150000)),
      luxSource: 'none',
      readingPeriod: 'none',
      note: note.trim().slice(0, 160),
      recordedAt: nowIso,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, plantPath);
  }
}

export async function snoozePlantDamp(
  userId: string,
  plant: PlantRecord,
  monthlyTemps: MonthlyTemp[],
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const logId = makeSafeId('snooze');
  const plantPath = `users/${userId}/plants/${plant.id}`;
  const cal = computeDampSnoozeCalibration(plant, monthlyTemps, now, 2);

  const note =
    cal.stepDays > 0
      ? `Snoozed +2d (soil still damp) · base ${plant.baseWaterDays}d → ${cal.nextBaseWaterDays}d`
      : 'Snoozed +2d (soil still damp)';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', userId, 'plants', plant.id), {
      snoozedUntilAt: cal.snoozedUntilAt,
      baseWaterDays: cal.nextBaseWaterDays,
      dampSnoozeCount: cal.nextDampSnoozeCount,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', userId, 'plants', plant.id, 'logs', logId), {
      id: logId,
      ownerId: userId,
      plantId: plant.id,
      logType: 'snooze',
      luxValue: Math.round(clamp(plant.latestLux, 0, 150000)),
      luxSource: 'none',
      readingPeriod: 'none',
      note: note.slice(0, 160),
      recordedAt: nowIso,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, plantPath);
  }
}

export async function recordPlantLux(
  userId: string,
  plant: PlantRecord,
  luxValue: number,
  luxSource: LuxSource,
  readingPeriod: Exclude<ReadingPeriod, 'none'> = 'peak_noon',
  note = '',
  mode: 'append' | 'set_average' = 'append',
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const safeLux = Math.round(clamp(luxValue, 0, 150000));
  const logId = makeSafeId('lux');
  const plantPath = `users/${userId}/plants/${plant.id}`;

  const prevCount = Math.max(0, Math.round(plant.luxReadingCount ?? 1));
  const prevAvg = Math.max(0, plant.avgLux ?? plant.latestLux);
  const newCount = mode === 'set_average' ? 1 : Math.min(10000, prevCount + 1);
  const newAvg =
    mode === 'set_average' || newCount <= 1
      ? safeLux
      : Math.round(clamp((prevAvg * prevCount + safeLux) / newCount, 0, 150000));
  const lastLuxMonth = getCurrentMonthKey(now);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', userId, 'plants', plant.id), {
      latestLux: safeLux,
      avgLux: newAvg,
      luxReadingCount: newCount,
      lastLuxMonth,
      luxSource,
      lastLuxAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', userId, 'plants', plant.id, 'logs', logId), {
      id: logId,
      ownerId: userId,
      plantId: plant.id,
      logType: 'lux',
      luxValue: safeLux,
      luxSource,
      readingPeriod,
      note: (
        note ||
        (mode === 'set_average'
          ? `Set average daylight · ${safeLux} lux (${luxSource})`
          : `${readingPeriod === 'peak_noon' ? 'Barcelona peak daylight' : 'General time'} · ${safeLux} lux (${luxSource})`)
      )
        .trim()
        .slice(0, 160),
      recordedAt: nowIso,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, plantPath);
  }
}

export async function updatePlantPhotoAndCare(
  userId: string,
  plantId: string,
  photoDataUrl: string,
  lookup?: PlantLookupResult | null,
): Promise<void> {
  const path = `users/${userId}/plants/${plantId}`;
  const updatePayload: Record<string, unknown> = {
    photoDataUrl: photoDataUrl.slice(0, 175000),
    updatedAt: serverTimestamp(),
  };

  if (lookup) {
    const firstSource = lookup.sources[0];
    updatePayload.speciesId = lookup.matchedPresetId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'custom';
    updatePayload.speciesName = lookup.commonName.trim().slice(0, 80) || 'Houseplant';
    updatePayload.botanicalName = lookup.botanicalName.trim().slice(0, 100);
    updatePayload.careDetails = lookup.careDetails.trim().slice(0, 800);
    updatePayload.idealLuxMin = Math.round(clamp(lookup.idealLuxMin, 0, 150000));
    updatePayload.idealLuxMax = Math.round(clamp(lookup.idealLuxMax, 0, 150000));
    updatePayload.baseWaterDays = Number(clamp(lookup.baseWaterDays, 1, 90).toFixed(1));
    updatePayload.sourceTitle = (firstSource?.title ?? '').trim().slice(0, 120);
    updatePayload.sourceUrl = sanitizeHttpUrl(firstSource?.url);
  }

  try {
    await updateDoc(doc(db, 'users', userId, 'plants', plantId), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addGrowthPhoto(
  userId: string,
  plant: PlantRecord,
  photoDataUrl: string,
  analysis: GrowthAnalysisResult,
  updateCoverPhoto = true,
  recordedAtOverride?: string,
): Promise<string> {
  const nowIso = recordedAtOverride ? recordedAtOverride.slice(0, 40) : new Date().toISOString();
  const photoId = makeSafeId('growth');
  const path = `users/${userId}/plants/${plant.id}/growthPhotos/${photoId}`;
  const avgLuxSnapshot = Math.round(clamp(plant.avgLux ?? plant.latestLux, 0, 150000));

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', userId, 'plants', plant.id, 'growthPhotos', photoId), {
      id: photoId,
      ownerId: userId,
      plantId: plant.id,
      photoDataUrl: photoDataUrl.slice(0, 175000),
      healthStatus: analysis.healthStatus,
      growthSummary: (analysis.growthSummary.trim() || 'Growth photo recorded.').slice(0, 300),
      issueDetected: analysis.issueDetected.trim().slice(0, 300),
      recommendedAction: analysis.recommendedAction.trim().slice(0, 400),
      avgLuxSnapshot,
      recordedAt: nowIso,
      createdAt: serverTimestamp(),
    });
    if (updateCoverPhoto) {
      batch.update(doc(db, 'users', userId, 'plants', plant.id), {
        photoDataUrl: photoDataUrl.slice(0, 175000),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return photoId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function replaceGrowthPhotoAnalysis(
  userId: string,
  plant: PlantRecord,
  existingPhoto: PlantGrowthPhoto,
  analysis: GrowthAnalysisResult,
): Promise<string> {
  const newPhotoId = makeSafeId('growth');
  const path = `users/${userId}/plants/${plant.id}/growthPhotos/${newPhotoId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', userId, 'plants', plant.id, 'growthPhotos', newPhotoId), {
      id: newPhotoId,
      ownerId: userId,
      plantId: plant.id,
      photoDataUrl: existingPhoto.photoDataUrl.slice(0, 175000),
      healthStatus: analysis.healthStatus,
      growthSummary: (analysis.growthSummary.trim() || 'Growth photo analyzed.').slice(0, 300),
      issueDetected: analysis.issueDetected.trim().slice(0, 300),
      recommendedAction: analysis.recommendedAction.trim().slice(0, 400),
      avgLuxSnapshot: existingPhoto.avgLuxSnapshot,
      recordedAt: existingPhoto.recordedAt.slice(0, 40),
      createdAt: serverTimestamp(),
    });
    batch.delete(
      doc(db, 'users', userId, 'plants', plant.id, 'growthPhotos', existingPhoto.id),
    );
    await batch.commit();
    return newPhotoId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteGrowthPhoto(
  userId: string,
  plantId: string,
  photoId: string,
): Promise<void> {
  const path = `users/${userId}/plants/${plantId}/growthPhotos/${photoId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'plants', plantId, 'growthPhotos', photoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deletePlant(userId: string, plantId: string): Promise<void> {
  const path = `users/${userId}/plants/${plantId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'plants', plantId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface SaveMonthlyTempInput {
  monthKey: string;
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  humidityPct: number;
  heatingOrAc: HeatingOrAc;
  daylightHours: number;
  note: string;
}

export async function saveMonthlyTemp(
  userId: string,
  input: SaveMonthlyTempInput,
  existsAlready: boolean,
): Promise<void> {
  const monthId = input.monthKey;
  const path = `users/${userId}/monthlyTemps/${monthId}`;
  const avgTempC = Number(clamp(input.avgTempC, 5, 42).toFixed(1));
  const minTempC = Number(clamp(Math.min(input.minTempC, avgTempC), 0, 40).toFixed(1));
  const maxTempC = Number(clamp(Math.max(input.maxTempC, avgTempC), 5, 45).toFixed(1));
  const humidityPct = Math.round(clamp(input.humidityPct, 15, 95));
  const daylightHours = Number(clamp(input.daylightHours, 0.5, 18).toFixed(1));

  try {
    if (existsAlready) {
      await updateDoc(doc(db, 'users', userId, 'monthlyTemps', monthId), {
        avgTempC,
        minTempC,
        maxTempC,
        humidityPct,
        heatingOrAc: input.heatingOrAc,
        daylightHours,
        note: input.note.trim().slice(0, 200),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'users', userId, 'monthlyTemps', monthId), {
        id: monthId,
        ownerId: userId,
        monthKey: monthId,
        avgTempC,
        minTempC,
        maxTempC,
        humidityPct,
        heatingOrAc: input.heatingOrAc,
        daylightHours,
        note: input.note.trim().slice(0, 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existsAlready ? OperationType.UPDATE : OperationType.CREATE,
      path,
    );
  }
}
