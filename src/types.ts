export type EntryType = 'individual' | 'group';
export type PotMaterial = 'terracotta' | 'ceramic' | 'plastic';
export type PotSize = 'small' | 'medium' | 'large';
export type LuxSource = 'sensor' | 'camera' | 'manual';
export type HeatingOrAc = 'none' | 'heating' | 'ac' | 'natural_vent';
export type AppView = 'widget' | 'collection' | 'climate' | 'lux';

export interface PlantRecord {
  id: string;
  ownerId: string;
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
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlantLookupResult {
  commonName: string;
  botanicalName: string;
  matchedPresetId: string;
  baseWaterDays: number;
  idealLuxMin: number;
  idealLuxMax: number;
  careDetails: string;
  confidence: 'high' | 'medium' | 'low';
  grounded?: boolean;
  sources: Array<{title: string; url: string}>;
}

export interface PlantLog {
  id: string;
  ownerId: string;
  plantId: string;
  logType: 'water' | 'lux';
  luxValue: number;
  luxSource: LuxSource | 'none';
  note: string;
  recordedAt: string;
  createdAt?: unknown;
}

export interface MonthlyTemp {
  id: string;
  ownerId: string;
  monthKey: string; // YYYY-MM
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  humidityPct: number;
  heatingOrAc: HeatingOrAc;
  note: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SpeciesPreset {
  id: string;
  commonName: string;
  botanicalName: string;
  baseWaterDays: number;
  idealLuxMin: number;
  idealLuxMax: number;
  northWindowFit: 'Thrives' | 'Adapts Well' | 'Needs Sill Edge';
  careTip: string;
}

export interface ScheduleFactor {
  label: string;
  multiplier: number;
  detail: string;
}

export type WateringStatus = 'overdue' | 'today' | 'soon' | 'hydrated';

export interface WateringCalculation {
  adjustedIntervalDays: number;
  daysSinceWatered: number;
  daysUntilWater: number;
  nextWaterDate: Date;
  status: WateringStatus;
  lightAssessment: 'Too Dim' | 'Ideal North Light' | 'Bright Indirect';
  tempSource: 'recorded' | 'barcelona_baseline';
  effectiveTempC: number;
  effectiveHumidityPct: number;
  daylightHours: number;
  factors: ScheduleFactor[];
}
