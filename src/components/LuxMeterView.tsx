import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Bell,
  CalendarPlus,
  Camera,
  Check,
  Clock,
  Gauge,
  ImagePlus,
  Sun,
} from 'lucide-react';
import {
  LUX_REFERENCE_ZONES,
  buildMonthlyLuxReminderIcs,
  getBarcelonaPeakWindow,
  getCurrentMonthKey,
  getPlantAverageLuxStats,
} from '../lib/botanicalEngine';
import {hasNativeLightSensorBridge, startNativeLightSensor} from '../lib/nativeLightSensor';
import {LuxSource, PlantRecord} from '../types';

interface AmbientLightSensorInstance {
  illuminance: number | null;
  start: () => void;
  stop: () => void;
  addEventListener: (event: string, cb: () => void) => void;
  removeEventListener: (event: string, cb: () => void) => void;
}

interface LuxMeterViewProps {
  plants: PlantRecord[];
  initialPlantId?: string | null;
  onSaveLux: (
    plantId: string,
    luxValue: number,
    source: LuxSource,
    readingPeriod: 'peak_noon' | 'general',
    note?: string,
  ) => Promise<void>;
}

export const LuxMeterView: React.FC<LuxMeterViewProps> = ({
  plants,
  initialPlantId,
  onSaveLux,
}) => {
  const now = new Date();
  const currentMonthKey = getCurrentMonthKey(now);
  const peakWindow = useMemo(() => getBarcelonaPeakWindow(now), [now.toDateString()]);

  const [selectedPlantId, setSelectedPlantId] = useState<string>(
    initialPlantId || plants[0]?.id || '',
  );
  const [luxValue, setLuxValue] = useState<number>(350);
  const [luxSource, setLuxSource] = useState<LuxSource>('manual');
  const [readingPeriod, setReadingPeriod] = useState<'peak_noon' | 'general'>('peak_noon');
  const [noteInput, setNoteInput] = useState<string>('');
  const [sensorActive, setSensorActive] = useState(false);
  const [sensorName, setSensorName] = useState<string | null>(null);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const sensorStopRef = useRef<(() => Promise<void> | void) | null>(null);

  const duePlants = useMemo(
    () =>
      plants.filter(
        (p) => getPlantAverageLuxStats(p, undefined, now).dueForMonthlyLux,
      ),
    [plants, currentMonthKey],
  );

  useEffect(() => {
    if (initialPlantId) {
      setSelectedPlantId(initialPlantId);
    } else if (!selectedPlantId && (duePlants[0] || plants[0])) {
      setSelectedPlantId((duePlants[0] ?? plants[0]).id);
    }
  }, [initialPlantId, plants, duePlants, selectedPlantId]);

  useEffect(() => {
    return () => {
      if (sensorStopRef.current) {
        void sensorStopRef.current();
        sensorStopRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const hasAmbientSensor =
    typeof window !== 'undefined' && 'AmbientLightSensor' in window;
  const hasNativeSensor = hasNativeLightSensorBridge();

  const stopPhoneSensor = async () => {
    if (sensorStopRef.current) {
      await Promise.resolve(sensorStopRef.current()).catch(() => {});
      sensorStopRef.current = null;
    }
    setSensorActive(false);
    setSensorName(null);
  };

  const startPhoneSensor = async () => {
    setSensorError(null);
    if (sensorActive) {
      await stopPhoneSensor();
      return;
    }

    if (cameraActive) {
      stopCameraEstimator();
    }

    if (hasNativeSensor) {
      try {
        const handle = await startNativeLightSensor((reading) => {
          setLuxValue(Math.max(0, Math.round(reading.lux)));
          setLuxSource('sensor');
          if (reading.sensorName) {
            setSensorName(reading.sensorName);
          }
        });
        sensorStopRef.current = handle.stop;
        setSensorName(handle.sensorName ?? 'Android Light Sensor');
        setSensorActive(true);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not start Android light sensor. Use the Camera Estimator or enter lux manually.';
        setSensorError(msg);
      }
      return;
    }

    if (!hasAmbientSensor) {
      setSensorError(
        'AmbientLightSensor is blocked or unsupported in this browser. Install the NordFlora Android APK to use your phone’s hardware sensor, or use the Camera Estimator / manual entry below.',
      );
      return;
    }

    try {
      const SensorCtor = (
        window as unknown as {
          AmbientLightSensor: new () => AmbientLightSensorInstance;
        }
      ).AmbientLightSensor;
      const sensor = new SensorCtor();
      const onReading = () => {
        if (typeof sensor.illuminance === 'number') {
          setLuxValue(Math.round(sensor.illuminance));
          setLuxSource('sensor');
        }
      };
      const onError = () => {
        setSensorError(
          'Phone light sensor permission was denied or unavailable. Use the Camera Estimator or manual lux entry.',
        );
        setSensorActive(false);
      };
      sensor.addEventListener('reading', onReading);
      sensor.addEventListener('error', onError);
      sensor.start();
      sensorStopRef.current = () => {
        sensor.removeEventListener('reading', onReading);
        sensor.removeEventListener('error', onError);
        sensor.stop();
      };
      setSensorName('Browser AmbientLightSensor');
      setSensorActive(true);
    } catch {
      setSensorError(
        'Could not start phone light sensor. Try the Camera Estimator or enter a reading manually.',
      );
    }
  };

  const estimateLuxFromImageSource = (
    source: CanvasImageSource,
  ): number => {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 64;
    sampleCanvas.height = 48;
    const ctx = sampleCanvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return luxValue;
    ctx.drawImage(source, 0, 0, 64, 48);
    const pixels = ctx.getImageData(0, 0, 64, 48).data;
    let sumLuma = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      sumLuma += luma;
    }
    const avgLuma = sumLuma / (64 * 48); // 0..255
    // Calibrated curve for indoor north-facing window light (25..3000 lux)
    return Math.round(35 * Math.pow(avgLuma / 255, 2.2) * 85 + 25);
  };

  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    video.srcObject = stream;
    void video.play().catch(() => {});

    let lastSampleTime = 0;
    const tick = (ts: number) => {
      if (cancelled || !streamRef.current || !videoRef.current) return;
      const v = videoRef.current;
      if (
        ts - lastSampleTime > 300 &&
        v.readyState >= 2 &&
        v.videoWidth > 0 &&
        v.videoHeight > 0
      ) {
        lastSampleTime = ts;
        const estimated = estimateLuxFromImageSource(v);
        setLuxValue(estimated);
        setLuxSource('camera');
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (video) {
        video.srcObject = null;
      }
    };
  }, [cameraActive]);

  const stopCameraEstimator = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCameraEstimator = async () => {
    setCameraError(null);
    if (cameraActive) {
      stopCameraEstimator();
      return;
    }
    if (sensorActive) {
      await stopPhoneSensor();
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Live camera preview is blocked in this browser/iframe. Tap "Measure from Photo" or enter lux manually below.',
      );
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {facingMode: {ideal: 'environment'}},
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCameraError(
          'Camera permission was blocked by the browser or preview frame. Use "Measure from Photo" below or open the app directly.',
        );
      } else {
        setCameraError(
          'Could not start live camera preview. Use "Measure from Photo" or pick a north-window zone below.',
        );
      }
    }
  };

  const handleMeasureFromPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCameraError(null);
    try {
      const bitmapUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not read photo'));
        img.src = bitmapUrl;
      });
      const estimated = estimateLuxFromImageSource(img);
      URL.revokeObjectURL(bitmapUrl);
      setLuxValue(estimated);
      setLuxSource('camera');
      stopCameraEstimator();
    } catch {
      setCameraError('Could not read that photo for lux estimation. Try another photo or enter lux manually.');
    }
  };

  const handleDownloadMonthlyCalendarReminder = () => {
    const icsContent = buildMonthlyLuxReminderIcs(new Date());
    const blob = new Blob([icsContent], {type: 'text/calendar;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nordflora-barcelona-monthly-lux.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setReminderFeedback(
      `Calendar file downloaded — import it to get a monthly alarm around ${peakWindow.peakTimeLabel}.`,
    );
  };

  const handleEnableBrowserAlert = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted') {
      new Notification('NordFlora Monthly Lux Reminder', {
        body: `Best Barcelona daylight window today: ${peakWindow.timeRangeLabel}. Measure each plant to update its average daylight lux.`,
        icon: '/pwa-192x192.png',
      });
      setReminderFeedback('Browser reminders enabled for monthly peak-lux check-ins.');
    }
  };

  const selectedPlant = plants.find((p) => p.id === selectedPlantId) ?? null;
  const selectedStats = selectedPlant
    ? getPlantAverageLuxStats(selectedPlant, undefined, now)
    : null;

  const previewNewAvg = selectedStats
    ? Math.round(
        (selectedStats.avgRecordedLux * selectedStats.readingCount + luxValue) /
          (selectedStats.readingCount + 1),
      )
    : luxValue;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlantId) return;
    setSaving(true);
    setSavedFeedback(null);
    try {
      await onSaveLux(
        selectedPlantId,
        luxValue,
        luxSource,
        readingPeriod,
        noteInput.trim() || undefined,
      );
      const targetName = selectedPlant?.name ?? 'Plant';
      setSavedFeedback(
        `Saved ${luxValue} lux to ${targetName} · New avg ${previewNewAvg} lx`,
      );
      setNoteInput('');
      stopCameraEstimator();
      await stopPhoneSensor();

      // Advance smoothly to the next plant due this month if any remain
      const remainingDue = duePlants.filter((p) => p.id !== selectedPlantId);
      if (remainingDue.length > 0) {
        setSelectedPlantId(remainingDue[0].id);
      }
    } finally {
      setSaving(false);
    }
  };

  const northLightZone =
    luxValue < 150
      ? 'Deep interior shade — extend watering intervals'
      : luxValue < 450
        ? 'Mid-room Barcelona north light — ideal for Pothos, ZZ, Snake Plant'
        : luxValue < 1200
          ? 'North windowsill edge — supports Monstera, Peace Lily, Ferns'
          : 'Bright reflected courtyard sky — faster transpiration';

  const measuredCount = plants.length - duePlants.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#18221D]">
          Light Level (Lux) Recorder
        </h1>
        <p className="text-sm text-[#4B5850] mt-1">
          Measure illuminance once a month at Barcelona&apos;s strongest daylight hour to compute
          each plant&apos;s true average daylight lux.
        </p>
      </div>

      {/* Monthly Barcelona Strongest-Daylight Check-In & Reminder Card */}
      <section className="rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#1F513B] font-medium">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                Strongest Barcelona Daylight ({peakWindow.monthName}):{' '}
                <strong className="font-mono tabular-nums">{peakWindow.timeRangeLabel}</strong>{' '}
                (Solar noon {peakWindow.peakTimeLabel})
              </span>
              {peakWindow.isNowInPeakWindow && (
                <span className="text-[#B45309] font-semibold">· Peak window active now</span>
              )}
            </div>
            <h2 className="text-base font-semibold text-[#18221D]">
              {plants.length === 0
                ? 'Add plants to start monthly peak-lux tracking'
                : duePlants.length === 0
                  ? `All ${plants.length} ${plants.length === 1 ? 'plant' : 'plants'} measured for ${peakWindow.monthName}`
                  : `${duePlants.length} of ${plants.length} ${
                      plants.length === 1 ? 'plant' : 'plants'
                    } due for ${peakWindow.monthName} peak-lux reading`}
            </h2>
            <p className="text-xs text-[#4B5850]">
              North-facing windows in Barcelona (41.39°N) receive maximum diffuse sky light around
              solar noon ({peakWindow.timezoneLabel}). Log a reading once a month so NordFlora
              tracks every plant&apos;s average daylight lux across seasons.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleDownloadMonthlyCalendarReminder}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#EEF4F0] text-[#1F513B] hover:bg-[#1F513B] hover:text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Add Monthly Phone Alarm (.ics)</span>
            </button>

            {notifStatus !== 'unsupported' && notifStatus !== 'granted' && (
              <button
                type="button"
                onClick={() => void handleEnableBrowserAlert()}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-xs font-medium inline-flex items-center gap-2 hover:bg-[#F0F1EC] whitespace-nowrap"
              >
                <Bell className="w-4 h-4 text-[#1F513B]" />
                <span>Enable Alerts</span>
              </button>
            )}
          </div>
        </div>

        {reminderFeedback && (
          <p className="text-xs text-[#1F513B] font-medium">{reminderFeedback}</p>
        )}

        {plants.length > 0 && duePlants.length > 0 && (
          <div className="pt-3 border-t border-[#EEF0EA] flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#4B5850] mr-1">
              Due in {peakWindow.monthName} ({measuredCount}/{plants.length} done):
            </span>
            {duePlants.map((p) => {
              const active = p.id === selectedPlantId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlantId(p.id)}
                  className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-medium transition-colors ${
                    active
                      ? 'border-[#1F513B] bg-[#1F513B] text-white'
                      : 'border-[#D4D8CE] bg-[#FAFBF8] text-[#18221D] hover:bg-[#EEF4F0]'
                  }`}
                >
                  {p.entryType === 'group' ? `${p.quantity}× ${p.name}` : p.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Live Sensor / Camera / Manual Meter */}
        <section className="lg:col-span-7 rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs text-[#4B5850] block">Current Reading</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-semibold font-mono tabular-nums text-[#18221D]">
                  {luxValue}
                </span>
                <span className="text-sm font-medium text-[#4B5850]">
                  lux (
                  {luxSource === 'sensor'
                    ? 'phone sensor'
                    : luxSource === 'camera'
                      ? 'camera estimate'
                      : 'manual'}
                  )
                </span>
              </div>
              <p className="text-xs text-[#1F513B] mt-1">{northLightZone}</p>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-[#EEF4F0] text-[#1F513B] flex items-center justify-center shrink-0">
              <Sun className="w-6 h-6" />
            </div>
          </div>

          {/* Sensor & Camera Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void startPhoneSensor()}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                sensorActive
                  ? 'bg-[#1F513B] text-white'
                  : 'border border-[#D4D8CE] bg-white text-[#18221D] hover:bg-[#F0F1EC]'
              }`}
            >
              <Gauge className="w-4 h-4" />
              <span>{sensorActive ? 'Stop Phone Sensor' : 'Read Phone Lux Sensor'}</span>
            </button>

            <button
              type="button"
              onClick={() => void startCameraEstimator()}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                cameraActive
                  ? 'bg-[#1F513B] text-white'
                  : 'border border-[#D4D8CE] bg-white text-[#18221D] hover:bg-[#F0F1EC]'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>{cameraActive ? 'Stop Camera Meter' : 'Camera Luminance Meter'}</span>
            </button>

            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-sm font-medium inline-flex items-center gap-2 hover:bg-[#F0F1EC] transition-colors"
            >
              <ImagePlus className="w-4 h-4 text-[#1F513B]" />
              <span>Measure from Photo</span>
            </button>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => void handleMeasureFromPhoto(e)}
              className="hidden"
            />
          </div>

          {sensorActive && (
            <p className="text-xs text-[#1F513B] bg-[#EEF4F0] border border-[#CFE0D5] rounded-xl px-3.5 py-2.5">
              Live hardware sensor active{sensorName ? ` (${sensorName})` : ''} — hold the top edge
              of your phone facing the window or sky at leaf height, then tap{' '}
              <strong>Save Lux Reading</strong>.
            </p>
          )}
          {sensorError && (
            <p className="text-xs text-[#B45309] bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
              {sensorError}
            </p>
          )}
          {cameraError && (
            <p className="text-xs text-[#B45309] bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
              {cameraError}
            </p>
          )}

          {cameraActive && (
            <div className="space-y-1.5">
              <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden bg-[#18221D]">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-[11px] text-[#4B5850]">
                Point the rear camera toward a white sheet of paper at the plant&apos;s location for
                a relative indoor lux estimate.
              </p>
            </div>
          )}

          {/* Manual Lux Input, Time of Day, Note & Target Plant */}
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4 pt-3 border-t border-[#EEF0EA]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="lux-manual-input" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                  Exact Lux Value
                </label>
                <input
                  id="lux-manual-input"
                  type="number"
                  min={0}
                  max={150000}
                  value={luxValue}
                  onChange={(e) => {
                    setLuxValue(Math.max(0, Number(e.target.value) || 0));
                    setLuxSource('manual');
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm font-mono tabular-nums text-[#18221D]"
                />
              </div>

              <div>
                <label htmlFor="lux-target-plant" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                  Save Reading To Plant / Group
                </label>
                <select
                  id="lux-target-plant"
                  value={selectedPlantId}
                  onChange={(e) => setSelectedPlantId(e.target.value)}
                  disabled={plants.length === 0}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
                >
                  {plants.length === 0 ? (
                    <option value="">Add a plant first</option>
                  ) : (
                    plants.map((p) => {
                      const stats = getPlantAverageLuxStats(p, undefined, now);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.entryType === 'group' ? `${p.quantity}× ${p.name}` : p.name} (avg{' '}
                          {stats.avgRecordedLux} lx · {stats.readingCount})
                        </option>
                      );
                    })
                  )}
                </select>
              </div>
            </div>

            {/* Reading Time of Day Toggle */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[#4B5850]">
                Measurement Time Window
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 rounded-xl bg-[#EAECE5]">
                <button
                  type="button"
                  onClick={() => setReadingPeriod('peak_noon')}
                  className={`min-h-[40px] px-3 rounded-lg text-xs font-medium transition-colors ${
                    readingPeriod === 'peak_noon'
                      ? 'bg-white text-[#18221D] shadow-xs'
                      : 'text-[#4B5850] hover:text-[#18221D]'
                  }`}
                >
                  Barcelona Peak Daylight (~{peakWindow.peakTimeLabel})
                </button>
                <button
                  type="button"
                  onClick={() => setReadingPeriod('general')}
                  className={`min-h-[40px] px-3 rounded-lg text-xs font-medium transition-colors ${
                    readingPeriod === 'general'
                      ? 'bg-white text-[#18221D] shadow-xs'
                      : 'text-[#4B5850] hover:text-[#18221D]'
                  }`}
                >
                  Other / General Time
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="lux-note" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                Sky &amp; Window Note (optional)
              </label>
              <input
                id="lux-note"
                type="text"
                maxLength={140}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="e.g. Clear sky at 12:50 CET, blinds fully open"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
              />
            </div>

            {/* Live Average Lux Calculation Preview */}
            {selectedPlant && selectedStats && (
              <div className="rounded-xl bg-[#FAFBF8] border border-[#EEF0EA] px-4 py-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[#4B5850] block">Current Average</span>
                  <span className="font-mono tabular-nums font-semibold text-[#18221D] text-sm">
                    {selectedStats.avgRecordedLux} lx
                  </span>
                  <span className="text-[11px] text-[#4B5850] block">
                    {selectedStats.readingCount}{' '}
                    {selectedStats.readingCount === 1 ? 'reading' : 'readings'}
                  </span>
                </div>
                <div>
                  <span className="text-[#4B5850] block">New Average</span>
                  <span className="font-mono tabular-nums font-semibold text-[#1F513B] text-sm">
                    {previewNewAvg} lx
                  </span>
                  <span className="text-[11px] text-[#4B5850] block">
                    {selectedStats.readingCount + 1} readings
                  </span>
                </div>
                <div>
                  <span className="text-[#4B5850] block">Est. Full-Day Mean</span>
                  <span className="font-mono tabular-nums font-semibold text-[#18221D] text-sm">
                    ~{Math.round(previewNewAvg * 0.62)} lx
                  </span>
                  <span className="text-[11px] text-[#4B5850] block">North diffuse factor</span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {savedFeedback ? (
                <span className="text-xs font-medium text-[#1F513B] inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  {savedFeedback}
                </span>
              ) : (
                <span className="text-xs text-[#4B5850]">
                  Updates this plant&apos;s average daylight lux &amp; watering schedule.
                </span>
              )}

              <button
                type="submit"
                disabled={saving || plants.length === 0}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium hover:bg-[#173E2D] disabled:opacity-50 whitespace-nowrap"
              >
                {saving ? 'Saving...' : 'Save Lux Reading'}
              </button>
            </div>
          </form>
        </section>

        {/* Right Column: Per-Plant Average Daylight Lux + Barcelona Reference Guide */}
        <aside className="lg:col-span-5 space-y-5">
          {plants.length > 0 && (
            <div className="rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[#18221D]">
                  Average Daylight Lux by Plant
                </h2>
                <p className="text-xs text-[#4B5850] mt-0.5">
                  Arithmetic mean of all readings logged per plant, plus estimated full-day north
                  skylight average.
                </p>
              </div>

              <div className="divide-y divide-[#EEF0EA]">
                {plants.map((p) => {
                  const stats = getPlantAverageLuxStats(p, undefined, now);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlantId(p.id)}
                      className={`w-full py-2.5 px-2 rounded-xl flex items-center justify-between gap-3 text-left transition-colors ${
                        p.id === selectedPlantId ? 'bg-[#EEF4F0]/60' : 'hover:bg-[#FAFBF8]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#18221D] truncate">
                          {p.entryType === 'group' ? `${p.quantity}× ${p.name}` : p.name}
                        </p>
                        <p className="text-[11px] text-[#4B5850]">
                          {stats.readingCount}{' '}
                          {stats.readingCount === 1 ? 'reading' : 'readings'} ·{' '}
                          {stats.dueForMonthlyLux ? (
                            <span className="text-[#B45309] font-medium">
                              Due in {peakWindow.monthName}
                            </span>
                          ) : (
                            <span className="text-[#1F513B]">Logged this month</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold font-mono tabular-nums text-[#18221D] block">
                          {stats.avgRecordedLux} lx avg
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#4B5850] block">
                          ~{stats.estimatedFullDayLux} lx day
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#18221D]">
                North-Facing Barcelona Lux Zones
              </h2>
              <p className="text-xs text-[#4B5850] mt-1 leading-relaxed">
                Typical midday values in Barcelona (41.39°N) depending on distance from north glass
                and neighboring Eixample/Gràcia facade reflection.
              </p>
            </div>

            <div className="divide-y divide-[#EEF0EA]">
              {LUX_REFERENCE_ZONES.map((zone) => (
                <button
                  key={zone.label}
                  type="button"
                  onClick={() => {
                    setLuxValue(zone.presetLux);
                    setLuxSource('manual');
                  }}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FAFBF8] px-2 rounded-xl transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[#18221D]">{zone.label}</p>
                    <p className="text-xs text-[#4B5850] font-mono tabular-nums">{zone.range}</p>
                  </div>
                  <span className="text-xs font-medium text-[#1F513B] whitespace-nowrap">
                    Use {zone.presetLux} lx
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
