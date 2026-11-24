import React, {useEffect, useState} from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Droplets,
  ExternalLink,
  Eye,
  Globe,
  Leaf,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Sprout,
  Sun,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  POT_SIZE_LABEL,
  buildLocalGrowthFallbackAssessment,
  calculateWateringSchedule,
  formatDueSummary,
  getBarcelonaPeakWindow,
  getBarcelonaSubstitutesForPlant,
  getPlantAverageLuxStats,
} from '../lib/botanicalEngine';
import {
  ApiUnreachableError,
  addGrowthPhoto,
  analyzePlantGrowth,
  deleteGrowthPhoto,
  identifyPlantFromPhoto,
  replaceGrowthPhotoAnalysis,
  subscribeGrowthPhotos,
  subscribePlantLogs,
} from '../lib/firestoreService';
import {MonthlyTemp, PlantGrowthPhoto, PlantLog, PlantLookupResult, PlantRecord} from '../types';
import {CameraModal} from './CameraModal';

interface PlantDetailModalProps {
  userId: string;
  plant: PlantRecord | null;
  monthlyTemps: MonthlyTemp[];
  onClose: () => void;
  onWater: (plant: PlantRecord) => Promise<void>;
  onSnoozeDamp: (plant: PlantRecord) => Promise<void>;
  onUpdatePhoto: (
    plantId: string,
    dataUrl: string,
    lookup?: PlantLookupResult | null,
  ) => Promise<void>;
  onEdit: (plant: PlantRecord) => void;
  onOpenLuxForPlant: (plant: PlantRecord) => void;
  onDelete: (plant: PlantRecord) => Promise<void>;
}

export const PlantDetailModal: React.FC<PlantDetailModalProps> = ({
  userId,
  plant,
  monthlyTemps,
  onClose,
  onWater,
  onSnoozeDamp,
  onUpdatePhoto,
  onEdit,
  onOpenLuxForPlant,
  onDelete,
}) => {
  const [logs, setLogs] = useState<PlantLog[]>([]);
  const [growthPhotos, setGrowthPhotos] = useState<PlantGrowthPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'species' | 'growth'>('species');
  const [busy, setBusy] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [analyzingGrowth, setAnalyzingGrowth] = useState(false);
  const [growthError, setGrowthError] = useState<string | null>(null);
  const [selectedGrowthId, setSelectedGrowthId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const plantId = plant?.id ?? null;

  useEffect(() => {
    if (!plantId) return;
    setConfirmDelete(false);
    setLookupError(null);
    setGrowthError(null);
    setSelectedGrowthId(null);
    const unsubLogs = subscribePlantLogs(userId, plantId, setLogs);
    const unsubGrowth = subscribeGrowthPhotos(userId, plantId, setGrowthPhotos);
    return () => {
      unsubLogs();
      unsubGrowth();
    };
  }, [userId, plantId]);

  if (!plant) return null;

  const now = new Date();
  const calc = calculateWateringSchedule(plant, monthlyTemps, now);
  const luxStats = getPlantAverageLuxStats(plant, logs, now);
  const peakWindow = getBarcelonaPeakWindow(now);
  const substitutes = getBarcelonaSubstitutesForPlant(plant, monthlyTemps, now, 3);
  const nextDateLabel = calc.nextWaterDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const lastWateredLabel = new Date(plant.lastWateredAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const handleWater = async () => {
    setBusy(true);
    try {
      await onWater(plant);
    } finally {
      setBusy(false);
    }
  };

  const handleSnoozeDamp = async () => {
    setSnoozing(true);
    try {
      await onSnoozeDamp(plant);
    } finally {
      setSnoozing(false);
    }
  };

  const handlePhotoAndLookup = async (dataUrl: string) => {
    setLookingUp(true);
    setLookupError(null);
    try {
      const lookup = await identifyPlantFromPhoto(dataUrl);
      await onUpdatePhoto(plant.id, dataUrl, lookup);
    } catch (err) {
      await onUpdatePhoto(plant.id, dataUrl, null);
      setLookupError(
        err instanceof Error
          ? `${err.message} Saved the new photo.`
          : 'Saved the new photo, but online lookup failed.',
      );
    } finally {
      setLookingUp(false);
    }
  };

  const handleLookupExistingPhoto = async () => {
    if (!plant.photoDataUrl) return;
    setLookingUp(true);
    setLookupError(null);
    try {
      const lookup = await identifyPlantFromPhoto(plant.photoDataUrl);
      await onUpdatePhoto(plant.id, plant.photoDataUrl, lookup);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Online lookup failed.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleGrowthPhotoCaptured = async (dataUrl: string) => {
    setAnalyzingGrowth(true);
    setGrowthError(null);
    const previousPhoto = growthPhotos[0];
    try {
      const analysis = await analyzePlantGrowth({
        currentPhotoDataUrl: dataUrl,
        previousPhotoDataUrl: previousPhoto?.photoDataUrl || plant.photoDataUrl || undefined,
        previousRecordedAt: previousPhoto?.recordedAt,
        plant,
        effectiveTempC: calc.effectiveTempC,
        effectiveHumidityPct: calc.effectiveHumidityPct,
        daylightHours: calc.daylightHours,
      });
      const newId = await addGrowthPhoto(userId, plant, dataUrl, analysis, true);
      setSelectedGrowthId(newId);
    } catch (err) {
      if (err instanceof ApiUnreachableError) {
        const fallback = buildLocalGrowthFallbackAssessment({
          plant,
          calc,
          avgRecordedLux: luxStats.avgRecordedLux,
          hasPreviousPhoto: Boolean(previousPhoto || plant.photoDataUrl),
        });
        const newId = await addGrowthPhoto(userId, plant, dataUrl, fallback, true);
        setSelectedGrowthId(newId);
        setGrowthError(
          `Saved photo to timeline using local light/watering check. ${err.message}`,
        );
      } else {
        setGrowthError(
          err instanceof Error
            ? err.message
            : 'Could not analyze plant growth from that photo.',
        );
      }
    } finally {
      setAnalyzingGrowth(false);
    }
  };

  const handleCheckExistingCoverPhoto = async () => {
    if (!plant.photoDataUrl) return;
    setAnalyzingGrowth(true);
    setGrowthError(null);
    try {
      const analysis = await analyzePlantGrowth({
        currentPhotoDataUrl: plant.photoDataUrl,
        plant,
        effectiveTempC: calc.effectiveTempC,
        effectiveHumidityPct: calc.effectiveHumidityPct,
        daylightHours: calc.daylightHours,
      });
      const newId = await addGrowthPhoto(userId, plant, plant.photoDataUrl, analysis, false);
      setSelectedGrowthId(newId);
    } catch (err) {
      if (err instanceof ApiUnreachableError) {
        const fallback = buildLocalGrowthFallbackAssessment({
          plant,
          calc,
          avgRecordedLux: luxStats.avgRecordedLux,
          hasPreviousPhoto: false,
        });
        const newId = await addGrowthPhoto(
          userId,
          plant,
          plant.photoDataUrl,
          fallback,
          false,
        );
        setSelectedGrowthId(newId);
        setGrowthError(
          `Saved baseline photo using local light/watering check. ${err.message}`,
        );
      } else {
        setGrowthError(
          err instanceof Error ? err.message : 'Could not analyze current plant photo.',
        );
      }
    } finally {
      setAnalyzingGrowth(false);
    }
  };

  const handleReanalyzeGrowthPhoto = async (entry: PlantGrowthPhoto) => {
    setAnalyzingGrowth(true);
    setGrowthError(null);
    try {
      const entryIdx = growthPhotos.findIndex((p) => p.id === entry.id);
      const earlierPhoto =
        entryIdx >= 0 && entryIdx + 1 < growthPhotos.length
          ? growthPhotos[entryIdx + 1]
          : undefined;
      const analysis = await analyzePlantGrowth({
        currentPhotoDataUrl: entry.photoDataUrl,
        previousPhotoDataUrl: earlierPhoto?.photoDataUrl,
        previousRecordedAt: earlierPhoto?.recordedAt,
        plant,
        effectiveTempC: calc.effectiveTempC,
        effectiveHumidityPct: calc.effectiveHumidityPct,
        daylightHours: calc.daylightHours,
      });
      const newId = await replaceGrowthPhotoAnalysis(userId, plant, entry, analysis);
      setSelectedGrowthId(newId);
    } catch (err) {
      setGrowthError(
        err instanceof Error ? err.message : 'Could not run online growth diagnosis.',
      );
    } finally {
      setAnalyzingGrowth(false);
    }
  };

  const handleDeleteGrowthPhoto = async (photoId: string) => {
    setDeletingPhotoId(photoId);
    setGrowthError(null);
    try {
      await deleteGrowthPhoto(userId, plant.id, photoId);
      if (selectedGrowthId === photoId) {
        setSelectedGrowthId(null);
      }
    } catch (err) {
      setGrowthError(err instanceof Error ? err.message : 'Could not remove growth photo.');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete(plant);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const inspectedGrowthPhoto =
    growthPhotos.find((p) => p.id === selectedGrowthId) ?? growthPhotos[0] ?? null;
  const earliestGrowthPhoto =
    growthPhotos.length >= 2 ? growthPhotos[growthPhotos.length - 1] : null;
  const latestGrowthPhoto = growthPhotos.length >= 2 ? growthPhotos[0] : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plant-detail-title"
      >
        <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E4E6DF] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E6DF] shrink-0">
            <div className="min-w-0">
              <h2 id="plant-detail-title" className="text-lg font-semibold text-[#18221D] truncate">
                {plant.entryType === 'group' ? `${plant.quantity}× ${plant.name}` : plant.name}
              </h2>
              <p className="text-xs font-serif italic text-[#4B5850] truncate">
                {plant.speciesName}
                {plant.botanicalName && plant.botanicalName !== plant.speciesName
                  ? ` (${plant.botanicalName})`
                  : ''}{' '}
                · {plant.entryType === 'group' ? `Group of ${plant.quantity}` : 'Individual plant'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close plant details"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#4B5850] hover:bg-[#F0F1EC] shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-5 space-y-6">
            {lookingUp && (
              <div className="p-3 rounded-xl bg-[#EEF4F0] text-xs font-medium text-[#1F513B] flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Looking up plant species and care guide online...</span>
              </div>
            )}

            {lookupError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309]">
                {lookupError}
              </div>
            )}

            {/* Photo & Primary Status */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-5 items-stretch">
              <div className="sm:col-span-2 relative aspect-[4/3] sm:aspect-square rounded-2xl overflow-hidden bg-[#EEF4F0] border border-[#E4E6DF]">
                {plant.photoDataUrl ? (
                  <img
                    src={plant.photoDataUrl}
                    alt={plant.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#1F513B] gap-2 p-4 text-center">
                    <Leaf className="w-8 h-8" />
                    <span className="text-xs font-medium">No photo yet</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCameraMode('species');
                    setCameraOpen(true);
                  }}
                  className="absolute bottom-2.5 right-2.5 min-h-[40px] px-3 py-1.5 rounded-xl bg-black/70 text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-black/85 backdrop-blur-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{plant.photoDataUrl ? 'Retake & Lookup' : 'Snap & Lookup'}</span>
                </button>
              </div>

              <div className="sm:col-span-3 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E4E6DF] space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#4B5850]">
                      <span>Next Watering</span>
                      <span className="font-mono tabular-nums">
                        Every {calc.adjustedIntervalDays} days
                      </span>
                    </div>
                    <p
                      className={`text-xl font-semibold ${
                        calc.status === 'overdue'
                          ? 'text-[#B91C1C]'
                          : calc.status === 'today'
                            ? 'text-[#B45309]'
                            : 'text-[#1F513B]'
                      }`}
                    >
                      {formatDueSummary(calc.daysUntilWater)} · {nextDateLabel}
                    </p>
                    <p className="text-xs text-[#4B5850]">
                      Last watered {lastWateredLabel} ({calc.daysSinceWatered}d ago)
                    </p>
                    {calc.isSnoozed && (
                      <p className="text-xs font-medium text-[#1F513B]">
                        Snoozed (+2d) after soil-moisture check
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-[#F7F7F4]">
                      <span className="text-xs text-[#4B5850] block">Average Daylight Lux</span>
                      <span className="text-base font-semibold font-mono tabular-nums text-[#18221D]">
                        {luxStats.avgRecordedLux} lux
                      </span>
                      <span className="text-[11px] text-[#4B5850] block">
                        {calc.lightAssessment} · {luxStats.readingCount}{' '}
                        {luxStats.readingCount === 1 ? 'reading' : 'readings'}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-[#4B5850] block">
                        Latest {plant.latestLux} · Day mean ~{luxStats.estimatedFullDayLux} lx
                      </span>
                      <span
                        className={`text-[11px] font-medium block mt-0.5 ${
                          luxStats.dueForMonthlyLux ? 'text-[#B45309]' : 'text-[#1F513B]'
                        }`}
                      >
                        {luxStats.dueForMonthlyLux
                          ? `Due in ${peakWindow.monthName} (~${peakWindow.peakTimeLabel})`
                          : `${peakWindow.monthName} reading logged`}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7F7F4]">
                      <span className="text-xs text-[#4B5850] block">Room Climate</span>
                      <span className="text-base font-semibold font-mono tabular-nums text-[#18221D]">
                        {calc.effectiveTempC.toFixed(1)}°C
                      </span>
                      <span className="text-[11px] text-[#4B5850] block">
                        {calc.effectiveHumidityPct}% RH · {calc.daylightHours}h light
                      </span>
                      {plant.idealLuxMin && plant.idealLuxMax ? (
                        <span className="text-[11px] font-mono tabular-nums text-[#4B5850] block mt-0.5">
                          Target {plant.idealLuxMin}–{plant.idealLuxMax} lx
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busy || snoozing}
                    onClick={() => void handleWater()}
                    className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#173E2D]"
                  >
                    <Droplets className="w-4 h-4" />
                    <span>{busy ? 'Saving...' : 'Water Now'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy || snoozing}
                    onClick={() => void handleSnoozeDamp()}
                    title="Postpone watering by 2 days and lengthen base interval"
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#F0F1EC]"
                  >
                    <Clock className="w-4 h-4 text-[#1F513B]" />
                    <span>{snoozing ? 'Snoozing...' : 'Still Damp (+2d)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenLuxForPlant(plant);
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#F0F1EC]"
                  >
                    <Sun className="w-4 h-4 text-[#B45309]" />
                    <span>Log Lux</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Growth & Health Timeline */}
            <div className="rounded-2xl bg-[#FAFBF8] border border-[#E4E6DF] p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#1F513B]" />
                    <h3 className="text-sm font-semibold text-[#18221D]">
                      Growth &amp; Health Timeline
                    </h3>
                  </div>
                  <p className="text-xs text-[#4B5850]">
                    Snap dated photos to track new growth and spot light, watering, or leaf issues early.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {growthPhotos.length === 0 && plant.photoDataUrl && (
                    <button
                      type="button"
                      disabled={analyzingGrowth}
                      onClick={() => void handleCheckExistingCoverPhoto()}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-xs font-medium text-[#18221D] hover:bg-[#F0F1EC] inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#1F513B]" />
                      <span>Check Current Photo</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={analyzingGrowth}
                    onClick={() => {
                      setCameraMode('growth');
                      setCameraOpen(true);
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1F513B] text-white text-xs font-medium hover:bg-[#173E2D] inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Snap Growth Photo</span>
                  </button>
                </div>
              </div>

              {analyzingGrowth && (
                <div className="p-3 rounded-xl bg-[#EEF4F0] text-xs font-medium text-[#1F513B] flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Comparing growth &amp; checking plant health...</span>
                </div>
              )}

              {growthError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309]">
                  {growthError}
                </div>
              )}

              {inspectedGrowthPhoto ? (
                <div className="space-y-4">
                  {/* Inspected Diagnosis Card */}
                  <div
                    className={`rounded-xl border p-3.5 space-y-2.5 ${
                      inspectedGrowthPhoto.healthStatus === 'issue'
                        ? 'bg-red-50/70 border-red-200'
                        : inspectedGrowthPhoto.healthStatus === 'watch'
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-[#EEF4F0]/70 border-[#CFE0D5]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
                        {inspectedGrowthPhoto.healthStatus === 'issue' ? (
                          <>
                            <AlertTriangle className="w-4 h-4 text-[#B91C1C]" />
                            <span className="text-[#B91C1C]">Growth Issue Detected</span>
                          </>
                        ) : inspectedGrowthPhoto.healthStatus === 'watch' ? (
                          <>
                            <Eye className="w-4 h-4 text-[#B45309]" />
                            <span className="text-[#B45309]">Watch Closely</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-[#1F513B]" />
                            <span className="text-[#1F513B]">Optimal Growth</span>
                          </>
                        )}
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-[#4B5850]">
                        {new Date(inspectedGrowthPhoto.recordedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        · {inspectedGrowthPhoto.avgLuxSnapshot} lx avg
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <p className="text-[#18221D]">
                        <span className="font-semibold">Growth observed:</span>{' '}
                        {inspectedGrowthPhoto.growthSummary}
                      </p>
                      {inspectedGrowthPhoto.issueDetected && (
                        <p className="text-[#991B1B] bg-white/80 border border-red-200/80 rounded-lg px-2.5 py-2">
                          <span className="font-semibold">What looks wrong:</span>{' '}
                          {inspectedGrowthPhoto.issueDetected}
                        </p>
                      )}
                      {inspectedGrowthPhoto.recommendedAction && (
                        <p className="text-[#323E37]">
                          <span className="font-semibold text-[#18221D]">Next step:</span>{' '}
                          {inspectedGrowthPhoto.recommendedAction}
                        </p>
                      )}
                    </div>

                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        disabled={analyzingGrowth}
                        onClick={() => void handleReanalyzeGrowthPhoto(inspectedGrowthPhoto)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[#D4D8CE] bg-white text-[11px] font-medium text-[#1F513B] hover:bg-[#F0F1EC] inline-flex items-center gap-1.5 disabled:opacity-60"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Analyze Photo Online</span>
                      </button>
                    </div>
                  </div>

                  {/* First -> Latest side-by-side comparison */}
                  {earliestGrowthPhoto && latestGrowthPhoto && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4B5850]">
                        Before &rarr; Now ({growthPhotos.length} photos)
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-[#E4E6DF] bg-white overflow-hidden">
                          <div className="aspect-[4/3] bg-[#EEF4F0]">
                            <img
                              src={earliestGrowthPhoto.photoDataUrl}
                              alt="First growth snapshot"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px]">
                            <span className="font-medium text-[#4B5850]">First</span>
                            <span className="font-mono tabular-nums text-[#18221D]">
                              {new Date(earliestGrowthPhoto.recordedAt).toLocaleDateString(
                                'en-GB',
                                {day: 'numeric', month: 'short'},
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-[#1F513B]/40 bg-white overflow-hidden">
                          <div className="aspect-[4/3] bg-[#EEF4F0]">
                            <img
                              src={latestGrowthPhoto.photoDataUrl}
                              alt="Latest growth snapshot"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-[#1F513B]">Latest</span>
                            <span className="font-mono tabular-nums text-[#18221D]">
                              {new Date(latestGrowthPhoto.recordedAt).toLocaleDateString(
                                'en-GB',
                                {day: 'numeric', month: 'short'},
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Photo History List */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {growthPhotos.map((entry) => {
                      const isSelected = entry.id === inspectedGrowthPhoto.id;
                      const statusLabel =
                        entry.healthStatus === 'issue'
                          ? 'Issue'
                          : entry.healthStatus === 'watch'
                            ? 'Watch'
                            : 'Optimal';
                      const statusColor =
                        entry.healthStatus === 'issue'
                          ? 'text-[#B91C1C]'
                          : entry.healthStatus === 'watch'
                            ? 'text-[#B45309]'
                            : 'text-[#1F513B]';
                      return (
                        <div
                          key={entry.id}
                          className={`rounded-xl border bg-white overflow-hidden transition-colors ${
                            isSelected
                              ? 'border-[#1F513B] ring-1 ring-[#1F513B]/30'
                              : 'border-[#E4E6DF]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedGrowthId(entry.id)}
                            className="w-full text-left block"
                          >
                            <div className="aspect-[4/3] bg-[#EEF4F0]">
                              <img
                                src={entry.photoDataUrl}
                                alt={`Growth check ${new Date(entry.recordedAt).toLocaleDateString('en-GB')}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="px-2.5 pt-2 pb-1 space-y-0.5">
                              <div className="flex items-center justify-between gap-1 text-[11px]">
                                <span className={`font-semibold ${statusColor}`}>
                                  {statusLabel}
                                </span>
                                <span className="font-mono tabular-nums text-[#4B5850]">
                                  {new Date(entry.recordedAt).toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                  })}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#4B5850] line-clamp-2">
                                {entry.growthSummary}
                              </p>
                            </div>
                          </button>
                          <div className="px-2 pb-1.5 flex justify-end">
                            <button
                              type="button"
                              disabled={deletingPhotoId === entry.id}
                              onClick={() => void handleDeleteGrowthPhoto(entry.id)}
                              aria-label="Delete growth photo"
                              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#728078] hover:text-[#B91C1C] hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#4B5850]">
                  No growth checks yet. Snap your first progress photo to establish a baseline and diagnose any light or watering stress.
                </p>
              )}
            </div>

            {/* Online Looked-up Plant Care Details */}
            <div className="rounded-2xl bg-[#FAFBF8] border border-[#E4E6DF] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#18221D]">
                  Species Care Guide
                </h3>
                <div className="flex items-center gap-3">
                  {plant.sourceUrl && (
                    <a
                      href={plant.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#1F513B] hover:underline inline-flex items-center gap-1"
                    >
                      <span className="truncate max-w-[160px]">
                        {plant.sourceTitle || 'Web reference'}
                      </span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                  {plant.photoDataUrl && (
                    <button
                      type="button"
                      disabled={lookingUp}
                      onClick={() => void handleLookupExistingPhoto()}
                      className="text-xs font-medium text-[#1F513B] hover:underline inline-flex items-center gap-1"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Refresh Care Online</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-[#323E37] leading-relaxed">
                {plant.careDetails ||
                  'Take or refresh a plant photo to automatically look up species care details online.'}
              </p>
            </div>

            {/* Barcelona North-Window Schedule Formula Breakdown */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-[#18221D]">
                How Your Barcelona North-Window Schedule Is Calculated
              </h3>
              <div className="rounded-2xl border border-[#E4E6DF] divide-y divide-[#EEF0EA]">
                <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="text-[#4B5850]">
                    Base interval
                    {(plant.dampSnoozeCount ?? 0) > 0
                      ? ` (calibrated from ${plant.dampSnoozeCount} damp ${
                          plant.dampSnoozeCount === 1 ? 'check' : 'checks'
                        })`
                      : ''}
                  </span>
                  <span className="font-mono tabular-nums font-medium text-[#18221D]">
                    {plant.baseWaterDays} days
                  </span>
                </div>
                {calc.factors.map((f) => (
                  <div
                    key={f.label}
                    className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="text-[#4B5850]">
                      {f.label} <span className="text-[#728078]">({f.detail})</span>
                    </span>
                    <span className="font-mono tabular-nums font-medium text-[#18221D] shrink-0">
                      ×{f.multiplier.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="px-4 py-2.5 flex items-center justify-between text-xs bg-[#FAFBF8]">
                  <span className="font-semibold text-[#18221D]">Adjusted watering interval</span>
                  <span className="font-mono tabular-nums font-semibold text-[#1F513B]">
                    Every {calc.adjustedIntervalDays} days
                  </span>
                </div>
              </div>
            </div>

            {plant.notes && (
              <div className="text-xs text-[#4B5850] bg-[#FAFBF8] rounded-xl px-4 py-3 border border-[#EEF0EA]">
                <strong className="text-[#18221D]">Personal notes:</strong> {plant.notes}
              </div>
            )}

            {/* Activity History */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-[#18221D]">Care &amp; Lux Log</h3>
              {logs.length === 0 ? (
                <p className="text-xs text-[#4B5850]">
                  No watering or lux readings logged yet for this plant.
                </p>
              ) : (
                <div className="divide-y divide-[#EEF0EA] border border-[#E4E6DF] rounded-2xl">
                  {logs.slice(0, 12).map((log) => (
                    <div
                      key={log.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-[#18221D]">
                          {log.logType === 'water'
                            ? 'Watered'
                            : log.logType === 'snooze'
                              ? 'Still damp check'
                              : `Measured ${log.luxValue} lux`}
                        </span>
                        {log.logType === 'lux' && log.readingPeriod === 'peak_noon' && (
                          <span className="text-[#1F513B]"> · Barcelona peak daylight</span>
                        )}
                        {log.logType === 'lux' && log.readingPeriod === 'general' && (
                          <span className="text-[#4B5850]"> · General time</span>
                        )}
                        {log.note && <span className="text-[#4B5850]"> · {log.note}</span>}
                      </div>
                      <span className="font-mono tabular-nums text-[#4B5850] shrink-0">
                        {new Date(log.recordedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Better-Suited Barcelona Substitutes for This Position */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sprout className="w-4 h-4 text-[#1F513B]" />
                  <h3 className="text-sm font-semibold text-[#18221D]">
                    Barcelona Substitutes for This Spot
                  </h3>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-[#4B5850]">
                  {POT_SIZE_LABEL[plant.potSize]} · {substitutes.positionLux} lx avg
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {substitutes.recommendations.map(({candidate, fitLabel, sizeLabel, whyBetterHere}) => (
                  <div
                    key={`detail-sub-${candidate.id}`}
                    className="rounded-xl border border-[#E4E6DF] bg-[#FAFBF8] p-3 flex flex-col justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-[#18221D] block">
                            {candidate.commonName}
                          </span>
                          <span className="text-[11px] font-serif italic text-[#4B5850] block">
                            {candidate.botanicalName}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-[#1F513B] bg-[#EEF4F0] px-1.5 py-0.5 rounded-md shrink-0">
                          {fitLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#18221D]">
                        <span className="font-medium">ES:</span> {candidate.nurseryNameES}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-[#4B5850]">
                        {sizeLabel} · {candidate.idealLuxMin}–{candidate.idealLuxMax} lx
                      </p>
                      <p className="text-[11px] text-[#323E37] leading-relaxed">
                        {whyBetterHere}
                      </p>
                    </div>
                    <p className="pt-1.5 border-t border-[#E8EAE3] text-[10px] text-[#4B5850] flex items-start gap-1">
                      <MapPin className="w-3 h-3 text-[#1F513B] shrink-0 mt-0.5" />
                      <span>{candidate.barcelonaAvailability}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Edit / Delete */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#EEF0EA]">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-[#B91C1C] hover:bg-red-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Entry</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete()}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-medium"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] text-xs text-[#18221D]"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(plant);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D4D8CE] bg-white text-xs font-medium text-[#18221D] hover:bg-[#F0F1EC] inline-flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          if (cameraMode === 'growth') {
            void handleGrowthPhotoCaptured(dataUrl);
          } else {
            void handlePhotoAndLookup(dataUrl);
          }
        }}
        title={
          cameraMode === 'growth'
            ? `Growth Check · ${plant.name}`
            : `Update Photo · ${plant.name}`
        }
      />
    </>
  );
};
