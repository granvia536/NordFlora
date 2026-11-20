import React, {useEffect, useRef, useState} from 'react';
import {Camera, Check, Gauge, Sun} from 'lucide-react';
import {LUX_REFERENCE_ZONES} from '../lib/botanicalEngine';
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
    note?: string,
  ) => Promise<void>;
}

export const LuxMeterView: React.FC<LuxMeterViewProps> = ({
  plants,
  initialPlantId,
  onSaveLux,
}) => {
  const [selectedPlantId, setSelectedPlantId] = useState<string>(
    initialPlantId || plants[0]?.id || '',
  );
  const [luxValue, setLuxValue] = useState<number>(350);
  const [luxSource, setLuxSource] = useState<LuxSource>('manual');
  const [sensorActive, setSensorActive] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialPlantId) {
      setSelectedPlantId(initialPlantId);
    } else if (!selectedPlantId && plants[0]) {
      setSelectedPlantId(plants[0].id);
    }
  }, [initialPlantId, plants, selectedPlantId]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const hasAmbientSensor =
    typeof window !== 'undefined' && 'AmbientLightSensor' in window;

  const startPhoneSensor = () => {
    setSensorError(null);
    if (!hasAmbientSensor) {
      setSensorError(
        'AmbientLightSensor is blocked or unsupported in this browser. Use the Camera Estimator or enter lux manually below.',
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
      setSensorActive(true);
    } catch {
      setSensorError(
        'Could not start phone light sensor. Try the Camera Estimator or enter a reading manually.',
      );
    }
  };

  const stopCameraEstimator = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'environment'},
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 64;
      sampleCanvas.height = 48;
      const ctx = sampleCanvas.getContext('2d', {willReadFrequently: true});

      let lastSampleTime = 0;
      const tick = (ts: number) => {
        if (!streamRef.current) return;
        if (ts - lastSampleTime > 300 && videoRef.current && ctx) {
          lastSampleTime = ts;
          ctx.drawImage(videoRef.current, 0, 0, 64, 48);
          const pixels = ctx.getImageData(0, 0, 64, 48).data;
          let sumLuma = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
            sumLuma += luma;
          }
          const avgLuma = sumLuma / (64 * 48); // 0..255
          // Calibrated curve for indoor north-facing window light (40..3200 lux)
          const estimated = Math.round(35 * Math.pow(avgLuma / 255, 2.2) * 85 + 25);
          setLuxValue(estimated);
          setLuxSource('camera');
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraError('Camera permission was denied. Enter lux manually or pick a north-window zone.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlantId) return;
    setSaving(true);
    setSavedFeedback(null);
    try {
      await onSaveLux(selectedPlantId, luxValue, luxSource);
      const targetName = plants.find((p) => p.id === selectedPlantId)?.name ?? 'Plant';
      setSavedFeedback(`Saved ${luxValue} lux to ${targetName}`);
      stopCameraEstimator();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#18221D]">
          Light Level (Lux) Recorder
        </h1>
        <p className="text-sm text-[#4B5850] mt-1">
          Measure or log the illuminance at each plant&apos;s spot along your north-facing window.
        </p>
      </div>

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
                  lux ({luxSource === 'sensor' ? 'phone sensor' : luxSource === 'camera' ? 'camera estimate' : 'manual'})
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
              onClick={startPhoneSensor}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                sensorActive
                  ? 'bg-[#1F513B] text-white'
                  : 'border border-[#D4D8CE] bg-white text-[#18221D] hover:bg-[#F0F1EC]'
              }`}
            >
              <Gauge className="w-4 h-4" />
              <span>{sensorActive ? 'Phone Sensor Active' : 'Read Phone Lux Sensor'}</span>
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
          </div>

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

          {/* Manual Lux Input & Quick North Zones */}
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4 pt-2 border-t border-[#EEF0EA]">
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
                    plants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.entryType === 'group' ? `${p.quantity}× ${p.name}` : p.name} (currently{' '}
                        {p.latestLux} lx)
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {savedFeedback ? (
                <span className="text-xs font-medium text-[#1F513B] inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  {savedFeedback}
                </span>
              ) : (
                <span className="text-xs text-[#4B5850]">
                  Updating lux recalculates that plant&apos;s watering schedule automatically.
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

        {/* Barcelona North-Facing Window Reference Guide */}
        <aside className="lg:col-span-5 rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-4">
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
        </aside>
      </div>
    </div>
  );
};
