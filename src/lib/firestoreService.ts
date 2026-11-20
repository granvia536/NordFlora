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
  HeatingOrAc,
  LuxSource,
  MonthlyTemp,
  PlantLog,
  PlantLookupResult,
  PlantRecord,
  PotMaterial,
  PotSize,
} from '../types';

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

export async function identifyPlantFromPhoto(imageDataUrl: string): Promise<PlantLookupResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in before looking up a plant photo.');
  }
  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/identify-plant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({imageDataUrl}),
  });

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
    latestLux: Math.round(clamp(input.latestLux, 0, 150000)),
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
    await updateDoc(doc(db, 'users', userId, 'plants', plantId), {
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
    });
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
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', userId, 'plants', plant.id, 'logs', logId), {
      id: logId,
      ownerId: userId,
      plantId: plant.id,
      logType: 'water',
      luxValue: Math.round(clamp(plant.latestLux, 0, 150000)),
      luxSource: 'none',
      note: note.trim().slice(0, 160),
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
  plantId: string,
  luxValue: number,
  luxSource: LuxSource,
  note = '',
): Promise<void> {
  const nowIso = new Date().toISOString();
  const safeLux = Math.round(clamp(luxValue, 0, 150000));
  const logId = makeSafeId('lux');
  const plantPath = `users/${userId}/plants/${plantId}`;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', userId, 'plants', plantId), {
      latestLux: safeLux,
      luxSource,
      lastLuxAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', userId, 'plants', plantId, 'logs', logId), {
      id: logId,
      ownerId: userId,
      plantId,
      logType: 'lux',
      luxValue: safeLux,
      luxSource,
      note: (note || `Recorded ${safeLux} lux (${luxSource})`).trim().slice(0, 160),
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

  try {
    if (existsAlready) {
      await updateDoc(doc(db, 'users', userId, 'monthlyTemps', monthId), {
        avgTempC,
        minTempC,
        maxTempC,
        humidityPct,
        heatingOrAc: input.heatingOrAc,
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
