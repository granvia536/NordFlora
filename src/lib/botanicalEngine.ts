import {
  MonthlyTemp,
  PlantRecord,
  ScheduleFactor,
  SpeciesPreset,
  WateringCalculation,
  WateringStatus,
} from '../types';

export const BARCELONA_MONTHLY_BASELINE: Record<
  number,
  {monthName: string; shortName: string; daylightHours: number; avgIndoorTempC: number; avgHumidityPct: number}
> = {
  1: {monthName: 'January', shortName: 'Jan', daylightHours: 9.5, avgIndoorTempC: 18.5, avgHumidityPct: 62},
  2: {monthName: 'February', shortName: 'Feb', daylightHours: 10.6, avgIndoorTempC: 19.0, avgHumidityPct: 60},
  3: {monthName: 'March', shortName: 'Mar', daylightHours: 12.0, avgIndoorTempC: 20.0, avgHumidityPct: 58},
  4: {monthName: 'April', shortName: 'Apr', daylightHours: 13.4, avgIndoorTempC: 21.0, avgHumidityPct: 59},
  5: {monthName: 'May', shortName: 'May', daylightHours: 14.5, avgIndoorTempC: 22.8, avgHumidityPct: 60},
  6: {monthName: 'June', shortName: 'Jun', daylightHours: 15.1, avgIndoorTempC: 25.2, avgHumidityPct: 58},
  7: {monthName: 'July', shortName: 'Jul', daylightHours: 14.8, avgIndoorTempC: 26.8, avgHumidityPct: 57},
  8: {monthName: 'August', shortName: 'Aug', daylightHours: 13.8, avgIndoorTempC: 27.0, avgHumidityPct: 60},
  9: {monthName: 'September', shortName: 'Sep', daylightHours: 12.4, avgIndoorTempC: 24.5, avgHumidityPct: 63},
  10: {monthName: 'October', shortName: 'Oct', daylightHours: 11.0, avgIndoorTempC: 22.0, avgHumidityPct: 65},
  11: {monthName: 'November', shortName: 'Nov', daylightHours: 9.8, avgIndoorTempC: 20.0, avgHumidityPct: 64},
  12: {monthName: 'December', shortName: 'Dec', daylightHours: 9.2, avgIndoorTempC: 18.5, avgHumidityPct: 63},
};

export const NORTH_WINDOW_SPECIES: SpeciesPreset[] = [
  {
    id: 'pothos',
    commonName: 'Golden Pothos',
    botanicalName: 'Epipremnum aureum',
    baseWaterDays: 10,
    idealLuxMin: 250,
    idealLuxMax: 1500,
    northWindowFit: 'Thrives',
    careTip: 'Handles 200–600 lux well; let the top 3 cm of substrate dry before watering.',
  },
  {
    id: 'monstera',
    commonName: 'Monstera Deliciosa',
    botanicalName: 'Monstera deliciosa',
    baseWaterDays: 10,
    idealLuxMin: 450,
    idealLuxMax: 2200,
    northWindowFit: 'Needs Sill Edge',
    careTip: 'Place within 1 m of your Barcelona north window so petioles stay compact.',
  },
  {
    id: 'peace_lily',
    commonName: 'Peace Lily',
    botanicalName: 'Spathiphyllum wallisii',
    baseWaterDays: 7,
    idealLuxMin: 300,
    idealLuxMax: 1600,
    northWindowFit: 'Thrives',
    careTip: 'Enjoys steady north skylight and Barcelona coastal humidity; never let soil bone-dry.',
  },
  {
    id: 'zz_plant',
    commonName: 'ZZ Plant',
    botanicalName: 'Zamioculcas zamiifolia',
    baseWaterDays: 18,
    idealLuxMin: 120,
    idealLuxMax: 1400,
    northWindowFit: 'Thrives',
    careTip: 'Rhizomes store water; extend intervals in cooler Barcelona winter months.',
  },
  {
    id: 'snake_plant',
    commonName: 'Snake Plant',
    botanicalName: 'Dracaena trifasciata',
    baseWaterDays: 16,
    idealLuxMin: 150,
    idealLuxMax: 1800,
    northWindowFit: 'Thrives',
    careTip: 'Tolerates deep north-room shade; overwatering is the primary risk below 300 lux.',
  },
  {
    id: 'calathea',
    commonName: 'Calathea / Prayer Plant',
    botanicalName: 'Goeppertia makoyana',
    baseWaterDays: 7,
    idealLuxMin: 350,
    idealLuxMax: 1300,
    northWindowFit: 'Thrives',
    careTip: 'North windows protect patterned leaves from scorch; prefers filtered or settled water.',
  },
  {
    id: 'boston_fern',
    commonName: 'Boston Fern',
    botanicalName: 'Nephrolepis exaltata',
    baseWaterDays: 5,
    idealLuxMin: 400,
    idealLuxMax: 1600,
    northWindowFit: 'Adapts Well',
    careTip: 'Keep evenly moist; check soil every few days during warm Barcelona summers.',
  },
  {
    id: 'parlor_palm',
    commonName: 'Parlor Palm',
    botanicalName: 'Chamaedorea elegans',
    baseWaterDays: 9,
    idealLuxMin: 250,
    idealLuxMax: 1400,
    northWindowFit: 'Thrives',
    careTip: 'Classic shade-tolerant palm suited to bright north-facing Mediterranean rooms.',
  },
  {
    id: 'philodendron',
    commonName: 'Heartleaf Philodendron',
    botanicalName: 'Philodendron hederaceum',
    baseWaterDays: 9,
    idealLuxMin: 250,
    idealLuxMax: 1600,
    northWindowFit: 'Thrives',
    careTip: 'Reliable trailer on north shelves; adapts smoothly down to 200 lux.',
  },
  {
    id: 'cast_iron',
    commonName: 'Cast Iron Plant',
    botanicalName: 'Aspidistra elatior',
    baseWaterDays: 14,
    idealLuxMin: 120,
    idealLuxMax: 1200,
    northWindowFit: 'Thrives',
    careTip: 'Built for low-light corridors and north corners; water deeply then allow surface to dry.',
  },
  {
    id: 'ficus_elastica',
    commonName: 'Rubber Fig',
    botanicalName: 'Ficus elastica',
    baseWaterDays: 11,
    idealLuxMin: 550,
    idealLuxMax: 2500,
    northWindowFit: 'Needs Sill Edge',
    careTip: 'Needs the brightest spot right against the north glass; rotate monthly.',
  },
  {
    id: 'orchid',
    commonName: 'Moth Orchid',
    botanicalName: 'Phalaenopsis',
    baseWaterDays: 9,
    idealLuxMin: 450,
    idealLuxMax: 1800,
    northWindowFit: 'Adapts Well',
    careTip: 'Soak bark medium when roots turn silvery-grey; north light prevents leaf burn.',
  },
  {
    id: 'english_ivy',
    commonName: 'English Ivy',
    botanicalName: 'Hedera helix',
    baseWaterDays: 7,
    idealLuxMin: 350,
    idealLuxMax: 1700,
    northWindowFit: 'Adapts Well',
    careTip: 'Prefers cooler room temperatures; watch for dry air when heating runs in winter.',
  },
  {
    id: 'custom',
    commonName: 'Custom Species',
    botanicalName: 'Custom Botanical',
    baseWaterDays: 10,
    idealLuxMin: 250,
    idealLuxMax: 1600,
    northWindowFit: 'Adapts Well',
    careTip: 'Adjust the baseline watering days to match your plant substrate and root density.',
  },
];

export const LUX_REFERENCE_ZONES = [
  {label: 'Deep North Room (3m+)', range: '50–150 lx', presetLux: 110},
  {label: 'Mid Room (1.5–2.5m)', range: '200–450 lx', presetLux: 320},
  {label: 'North Sill (Glass Edge)', range: '500–1,100 lx', presetLux: 750},
  {label: 'Bright Reflected Courtyard', range: '1,200–2,400 lx', presetLux: 1650},
] as const;

export function getCurrentMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const info = BARCELONA_MONTHLY_BASELINE[m || 1];
  return `${info?.monthName ?? monthKey} ${y}`;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calculateWateringSchedule(
  plant: PlantRecord,
  monthlyTemps: MonthlyTemp[],
  now = new Date(),
): WateringCalculation {
  const monthNumber = now.getMonth() + 1;
  const currentMonthKey = getCurrentMonthKey(now);
  const baseline = BARCELONA_MONTHLY_BASELINE[monthNumber] ?? BARCELONA_MONTHLY_BASELINE[11];

  const recordedMonth = monthlyTemps.find((m) => m.monthKey === currentMonthKey);
  const latestRecorded =
    recordedMonth ??
    [...monthlyTemps].sort((a, b) => b.monthKey.localeCompare(a.monthKey))[0];

  const tempSource: 'recorded' | 'barcelona_baseline' = recordedMonth
    ? 'recorded'
    : 'barcelona_baseline';
  const effectiveTempC = recordedMonth
    ? recordedMonth.avgTempC
    : latestRecorded && latestRecorded.monthKey.slice(5) === currentMonthKey.slice(5)
      ? latestRecorded.avgTempC
      : baseline.avgIndoorTempC;
  const effectiveHumidityPct = recordedMonth
    ? recordedMonth.humidityPct
    : baseline.avgHumidityPct;

  const factors: ScheduleFactor[] = [];

  // 1. Light (Lux) factor for north-facing Barcelona window
  // Reference 500 lux = 1.0x. Dim light slows transpiration; brighter reflected light speeds uptake.
  let luxMult = 1.0;
  if (plant.latestLux < 150) {
    luxMult = 1.38;
  } else if (plant.latestLux < 300) {
    luxMult = 1.22;
  } else if (plant.latestLux < 500) {
    luxMult = 1.08;
  } else if (plant.latestLux <= 900) {
    luxMult = 1.0;
  } else if (plant.latestLux <= 1600) {
    luxMult = 0.88;
  } else {
    luxMult = 0.78;
  }
  factors.push({
    label: 'Light intensity',
    multiplier: luxMult,
    detail: `${Math.round(plant.latestLux)} lux recorded`,
  });

  // 2. Room temperature factor (reference 21°C = 1.0x, ~3% per °C)
  const tempDelta = effectiveTempC - 21;
  const tempMult = Math.max(0.72, Math.min(1.3, Number((1 - tempDelta * 0.032).toFixed(2))));
  factors.push({
    label: tempSource === 'recorded' ? 'Recorded room temp' : 'Barcelona room baseline',
    multiplier: tempMult,
    detail: `${effectiveTempC.toFixed(1)}°C`,
  });

  // 3. Barcelona 41.39°N seasonal photoperiod factor (12h = 1.0x)
  const photoDelta = baseline.daylightHours - 12;
  const photoMult = Math.max(0.88, Math.min(1.14, Number((1 - photoDelta * 0.032).toFixed(2))));
  factors.push({
    label: 'Barcelona north photoperiod',
    multiplier: photoMult,
    detail: `${baseline.daylightHours.toFixed(1)}h daylight (${baseline.shortName})`,
  });

  // 4. Indoor humidity factor (reference 60% RH = 1.0x)
  const humidityDelta = effectiveHumidityPct - 60;
  const humidityMult = Math.max(
    0.85,
    Math.min(1.15, Number((1 + humidityDelta * 0.004).toFixed(2))),
  );
  factors.push({
    label: 'Room humidity',
    multiplier: humidityMult,
    detail: `${Math.round(effectiveHumidityPct)}% RH`,
  });

  // 5. Pot material & size evaporation factor
  const materialMult =
    plant.potMaterial === 'terracotta' ? 0.82 : plant.potMaterial === 'plastic' ? 1.08 : 1.0;
  const sizeMult = plant.potSize === 'small' ? 0.85 : plant.potSize === 'large' ? 1.18 : 1.0;
  const potMult = Number((materialMult * sizeMult).toFixed(2));
  factors.push({
    label: 'Pot & volume',
    multiplier: potMult,
    detail: `${plant.potSize} ${plant.potMaterial}`,
  });

  const rawInterval =
    plant.baseWaterDays * luxMult * tempMult * photoMult * humidityMult * potMult;
  const adjustedIntervalDays = Math.max(2, Math.min(60, Math.round(rawInterval)));

  const lastWatered = new Date(plant.lastWateredAt);
  const todayStart = startOfLocalDay(now);
  const wateredStart = startOfLocalDay(
    Number.isNaN(lastWatered.getTime()) ? now : lastWatered,
  );

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceWatered = Math.max(
    0,
    Math.round((todayStart.getTime() - wateredStart.getTime()) / msPerDay),
  );
  const nextWaterDate = new Date(wateredStart.getTime() + adjustedIntervalDays * msPerDay);
  const daysUntilWater = Math.round(
    (nextWaterDate.getTime() - todayStart.getTime()) / msPerDay,
  );

  let status: WateringStatus = 'hydrated';
  if (daysUntilWater < 0) {
    status = 'overdue';
  } else if (daysUntilWater === 0) {
    status = 'today';
  } else if (daysUntilWater <= 2) {
    status = 'soon';
  }

  const preset = NORTH_WINDOW_SPECIES.find((s) => s.id === plant.speciesId);
  const minLux = plant.idealLuxMin ?? preset?.idealLuxMin ?? 250;
  const maxLux = plant.idealLuxMax ?? preset?.idealLuxMax ?? 1600;
  let lightAssessment: 'Too Dim' | 'Ideal North Light' | 'Bright Indirect' = 'Ideal North Light';
  if (plant.latestLux < minLux) {
    lightAssessment = 'Too Dim';
  } else if (plant.latestLux > maxLux) {
    lightAssessment = 'Bright Indirect';
  }

  return {
    adjustedIntervalDays,
    daysSinceWatered,
    daysUntilWater,
    nextWaterDate,
    status,
    lightAssessment,
    tempSource,
    effectiveTempC,
    effectiveHumidityPct,
    daylightHours: baseline.daylightHours,
    factors,
  };
}

export function formatDueSummary(daysUntilWater: number): string {
  if (daysUntilWater < -1) return `${Math.abs(daysUntilWater)}d overdue`;
  if (daysUntilWater === -1) return '1d overdue';
  if (daysUntilWater === 0) return 'Water today';
  if (daysUntilWater === 1) return 'Tomorrow';
  return `In ${daysUntilWater}d`;
}
