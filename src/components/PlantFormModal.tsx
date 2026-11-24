import React, {useState} from 'react';
import {Camera, ExternalLink, Globe, Leaf, Loader2, X} from 'lucide-react';
import {LUX_REFERENCE_ZONES, NORTH_WINDOW_SPECIES} from '../lib/botanicalEngine';
import {SavePlantInput, identifyPlantFromPhoto} from '../lib/firestoreService';
import {EntryType, LuxSource, PlantRecord, PotMaterial, PotSize} from '../types';
import {CameraModal} from './CameraModal';

interface PlantFormModalProps {
  isOpen: boolean;
  initialPlant?: PlantRecord | null;
  onClose: () => void;
  onSave: (input: SavePlantInput) => Promise<void>;
}

function toLocalDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const PlantFormModal: React.FC<PlantFormModalProps> = ({
  isOpen,
  initialPlant,
  onClose,
  onSave,
}) => {
  const defaultSpecies = NORTH_WINDOW_SPECIES[0];

  const [entryType, setEntryType] = useState<EntryType>(
    initialPlant?.entryType ?? 'individual',
  );
  const [quantity, setQuantity] = useState<number>(initialPlant?.quantity ?? 1);
  const [name, setName] = useState<string>(initialPlant?.name ?? '');
  const [speciesId, setSpeciesId] = useState<string>(
    initialPlant?.speciesId ?? defaultSpecies.id,
  );
  const [speciesName, setSpeciesName] = useState<string>(
    initialPlant?.speciesName ?? defaultSpecies.commonName,
  );
  const [botanicalName, setBotanicalName] = useState<string>(
    initialPlant?.botanicalName ?? defaultSpecies.botanicalName,
  );
  const [careDetails, setCareDetails] = useState<string>(
    initialPlant?.careDetails ?? defaultSpecies.careTip,
  );
  const [idealLuxMin, setIdealLuxMin] = useState<number>(
    initialPlant?.idealLuxMin ?? defaultSpecies.idealLuxMin,
  );
  const [idealLuxMax, setIdealLuxMax] = useState<number>(
    initialPlant?.idealLuxMax ?? defaultSpecies.idealLuxMax,
  );
  const [sourceTitle, setSourceTitle] = useState<string>(initialPlant?.sourceTitle ?? '');
  const [sourceUrl, setSourceUrl] = useState<string>(initialPlant?.sourceUrl ?? '');

  const [baseWaterDays, setBaseWaterDays] = useState<number>(
    initialPlant?.baseWaterDays ?? defaultSpecies.baseWaterDays,
  );
  const [potMaterial, setPotMaterial] = useState<PotMaterial>(
    initialPlant?.potMaterial ?? 'terracotta',
  );
  const [potSize, setPotSize] = useState<PotSize>(initialPlant?.potSize ?? 'medium');
  const [latestLux, setLatestLux] = useState<number>(initialPlant?.latestLux ?? 350);
  const [avgLux, setAvgLux] = useState<number>(
    initialPlant?.avgLux ?? initialPlant?.latestLux ?? 350,
  );
  const [avgLuxEdited, setAvgLuxEdited] = useState<boolean>(false);
  const [luxSource, setLuxSource] = useState<LuxSource>(initialPlant?.luxSource ?? 'manual');
  const [lastWateredDate, setLastWateredDate] = useState<string>(
    toLocalDateInput(initialPlant?.lastWateredAt ?? new Date().toISOString()),
  );
  const [notes, setNotes] = useState<string>(initialPlant?.notes ?? '');
  const [photoDataUrl, setPhotoDataUrl] = useState<string>(
    initialPlant?.photoDataUrl ?? '',
  );

  const [cameraOpen, setCameraOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedPreset = NORTH_WINDOW_SPECIES.find((s) => s.id === speciesId);

  const handleSpeciesChange = (nextId: string) => {
    setSpeciesId(nextId);
    const preset = NORTH_WINDOW_SPECIES.find((s) => s.id === nextId);
    if (preset) {
      if (preset.id !== 'custom') {
        setSpeciesName(preset.commonName);
        setBotanicalName(preset.botanicalName);
        setCareDetails(preset.careTip);
        setIdealLuxMin(preset.idealLuxMin);
        setIdealLuxMax(preset.idealLuxMax);
        if (!name.trim()) {
          setName(preset.commonName);
        }
      }
      setBaseWaterDays(preset.baseWaterDays);
    }
  };

  const runOnlineLookup = async (dataUrl: string) => {
    if (!dataUrl) return;
    setLookingUp(true);
    setLookupError(null);
    setLookupStatus('Looking up plant species & care online...');
    try {
      const result = await identifyPlantFromPhoto(dataUrl);
      setSpeciesId(result.matchedPresetId || 'custom');
      setSpeciesName(result.commonName);
      setBotanicalName(result.botanicalName);
      setBaseWaterDays(result.baseWaterDays);
      setIdealLuxMin(result.idealLuxMin);
      setIdealLuxMax(result.idealLuxMax);
      setCareDetails(result.careDetails);
      if (result.sources[0]) {
        setSourceTitle(result.sources[0].title);
        setSourceUrl(result.sources[0].url);
      } else {
        setSourceTitle('');
        setSourceUrl('');
      }
      if (!name.trim() || name.trim() === defaultSpecies.commonName) {
        setName(result.commonName);
      }
      setLookupStatus(
        `Identified: ${result.commonName}${
          result.botanicalName ? ` (${result.botanicalName})` : ''
        }`,
      );
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : 'Online lookup could not complete right now.',
      );
      setLookupStatus(null);
    } finally {
      setLookingUp(false);
    }
  };

  const handlePhotoCaptured = (dataUrl: string) => {
    setPhotoDataUrl(dataUrl);
    void runOnlineLookup(dataUrl);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a name for your plant or group.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const [y, m, d] = lastWateredDate.split('-').map(Number);
      const wateredIso = new Date(y, (m || 1) - 1, d || 1, 9, 0, 0).toISOString();
      await onSave({
        id: initialPlant?.id,
        name: name.trim(),
        speciesId,
        speciesName: speciesName.trim() || 'Houseplant',
        botanicalName: botanicalName.trim(),
        careDetails: careDetails.trim(),
        idealLuxMin,
        idealLuxMax,
        sourceTitle: sourceTitle.trim(),
        sourceUrl: sourceUrl.trim(),
        entryType,
        quantity: entryType === 'group' ? Math.max(2, Math.min(200, quantity)) : 1,
        potMaterial,
        potSize,
        baseWaterDays,
        latestLux,
        avgLux,
        luxSource,
        lastLuxAt: initialPlant?.lastLuxAt ?? new Date().toISOString(),
        lastWateredAt: wateredIso,
        notes: notes.trim(),
        photoDataUrl,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save plant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plant-form-title"
      >
        <div className="w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E4E6DF] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E6DF] shrink-0">
            <h2 id="plant-form-title" className="text-lg font-semibold text-[#18221D]">
              {initialPlant ? 'Edit Plant or Group' : 'Add Plant or Species Group'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close form"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#4B5850] hover:bg-[#F0F1EC]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                {error}
              </div>
            )}

            {/* Photo Capture + Automatic Online Lookup Strip */}
            <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E4E6DF] space-y-3">
              <div className="flex items-center gap-4">
                {photoDataUrl ? (
                  <img
                    src={photoDataUrl}
                    alt={name || 'Plant preview'}
                    className="w-20 h-20 rounded-2xl object-cover border border-[#E4E6DF] shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-[#EEF4F0] text-[#1F513B] flex items-center justify-center shrink-0">
                    <Leaf className="w-7 h-7" />
                  </div>
                )}
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-[#173E2D]"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{photoDataUrl ? 'Retake Photo' : 'Take Photo & Look Up'}</span>
                    </button>

                    {photoDataUrl && (
                      <button
                        type="button"
                        disabled={lookingUp}
                        onClick={() => void runOnlineLookup(photoDataUrl)}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#F0F1EC] disabled:opacity-60"
                      >
                        {lookingUp ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-[#1F513B]" />
                        )}
                        <span>{lookingUp ? 'Looking up...' : 'Re-run Lookup'}</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[#4B5850]">
                    Taking a photo automatically searches online for the plant&apos;s name,
                    botanical species, light range, and care guide.
                  </p>
                </div>
              </div>

              {lookingUp && (
                <div className="flex items-center gap-2 text-xs font-medium text-[#1F513B]">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{lookupStatus}</span>
                </div>
              )}

              {!lookingUp && lookupStatus && (
                <div className="text-xs text-[#1F513B] font-medium flex flex-wrap items-center gap-2">
                  <span>{lookupStatus}</span>
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline text-[#18221D]"
                    >
                      <span>{sourceTitle || 'Web source'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {lookupError && (
                <p className="text-xs text-[#B45309]">
                  {lookupError} You can still fill or pick the species manually below.
                </p>
              )}
            </div>

            {/* Individual vs Group Toggle */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-[#4B5850]">Tracking Mode</span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#EAECE5]">
                <button
                  type="button"
                  onClick={() => {
                    setEntryType('individual');
                    setQuantity(1);
                  }}
                  className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors ${
                    entryType === 'individual'
                      ? 'bg-white text-[#18221D] shadow-xs'
                      : 'text-[#4B5850] hover:text-[#18221D]'
                  }`}
                >
                  Individual Plant
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryType('group');
                    setQuantity((q) => Math.max(2, q));
                  }}
                  className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors ${
                    entryType === 'group'
                      ? 'bg-white text-[#18221D] shadow-xs'
                      : 'text-[#4B5850] hover:text-[#18221D]'
                  }`}
                >
                  Same-Species Group
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="plant-name"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  {entryType === 'group' ? 'Group Name' : 'Plant Name'}
                </label>
                <input
                  id="plant-name"
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    entryType === 'group' ? 'e.g. Shelf Pothos Trio' : 'e.g. North Sill Monstera'
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D] focus:outline-2 focus:outline-[#1F513B]"
                />
              </div>

              {entryType === 'group' && (
                <div>
                  <label
                    htmlFor="plant-qty"
                    className="block text-xs font-medium text-[#4B5850] mb-1.5"
                  >
                    Plants in Group
                  </label>
                  <input
                    id="plant-qty"
                    type="number"
                    min={2}
                    max={200}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(2, Number(e.target.value) || 2))}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm font-mono tabular-nums text-[#18221D] focus:outline-2 focus:outline-[#1F513B]"
                  />
                </div>
              )}
            </div>

            {/* Species & Botanical Name */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="species-select"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Library Preset
                </label>
                <select
                  id="species-select"
                  value={speciesId}
                  onChange={(e) => handleSpeciesChange(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
                >
                  {NORTH_WINDOW_SPECIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.commonName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="species-custom-name"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Common Species
                </label>
                <input
                  id="species-custom-name"
                  type="text"
                  required
                  maxLength={80}
                  value={speciesName}
                  onChange={(e) => setSpeciesName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
                />
              </div>

              <div>
                <label
                  htmlFor="botanical-name"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Botanical Name
                </label>
                <input
                  id="botanical-name"
                  type="text"
                  maxLength={100}
                  value={botanicalName}
                  onChange={(e) => setBotanicalName(e.target.value)}
                  placeholder="e.g. Monstera deliciosa"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm font-serif italic text-[#18221D]"
                />
              </div>
            </div>

            {/* Care Details Saved to Database */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="care-details" className="block text-xs font-medium text-[#4B5850]">
                  Plant Care Details (saved in your database)
                </label>
                <span className="text-[11px] font-mono tabular-nums text-[#4B5850]">
                  Ideal {idealLuxMin}–{idealLuxMax} lx
                </span>
              </div>
              <textarea
                id="care-details"
                rows={3}
                maxLength={800}
                value={careDetails}
                onChange={(e) => setCareDetails(e.target.value)}
                placeholder={selectedPreset?.careTip}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D] focus:outline-2 focus:outline-[#1F513B]"
              />
            </div>

            {/* Light Level & Watering Anchor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="plant-avg-lux"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Average Daylight (lux)
                </label>
                <input
                  id="plant-avg-lux"
                  type="number"
                  min={0}
                  max={150000}
                  value={avgLux}
                  onChange={(e) => {
                    setAvgLux(Math.max(0, Number(e.target.value) || 0));
                    setAvgLuxEdited(true);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm font-mono tabular-nums text-[#18221D]"
                />
              </div>

              <div>
                <label
                  htmlFor="plant-lux"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Latest Light Reading (lux)
                </label>
                <input
                  id="plant-lux"
                  type="number"
                  min={0}
                  max={150000}
                  value={latestLux}
                  onChange={(e) => {
                    const nextVal = Math.max(0, Number(e.target.value) || 0);
                    setLatestLux(nextVal);
                    if (!avgLuxEdited && !initialPlant) {
                      setAvgLux(nextVal);
                    }
                    setLuxSource('manual');
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm font-mono tabular-nums text-[#18221D]"
                />
              </div>

              <div>
                <label
                  htmlFor="base-days"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Base Interval (days)
                </label>
                <input
                  id="base-days"
                  type="number"
                  min={1}
                  max={90}
                  step="0.5"
                  value={baseWaterDays}
                  onChange={(e) => setBaseWaterDays(Math.max(1, Number(e.target.value) || 7))}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm font-mono tabular-nums text-[#18221D]"
                />
              </div>

              <div>
                <label
                  htmlFor="last-watered"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Last Watered
                </label>
                <input
                  id="last-watered"
                  type="date"
                  value={lastWateredDate}
                  onChange={(e) => setLastWateredDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
                />
              </div>
            </div>

            {/* Quick North-Window Lux Presets */}
            <div className="space-y-1.5">
              <span className="block text-xs text-[#4B5850]">
                Quick north-window lux presets (sets both latest &amp; average daylight):
              </span>
              <div className="flex flex-wrap gap-2">
                {LUX_REFERENCE_ZONES.map((zone) => (
                  <button
                    key={zone.label}
                    type="button"
                    onClick={() => {
                      setLatestLux(zone.presetLux);
                      setAvgLux(zone.presetLux);
                      setAvgLuxEdited(true);
                      setLuxSource('manual');
                    }}
                    className={`px-3 py-1.5 min-h-[36px] rounded-xl border text-xs transition-colors ${
                      avgLux === zone.presetLux
                        ? 'border-[#1F513B] bg-[#EEF4F0] text-[#1F513B] font-medium'
                        : 'border-[#E4E6DF] bg-[#FAFBF8] text-[#4B5850] hover:text-[#18221D]'
                    }`}
                  >
                    {zone.label} · {zone.range}
                  </button>
                ))}
              </div>
            </div>

            {/* Pot Material & Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pot-material"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Pot Material
                </label>
                <select
                  id="pot-material"
                  value={potMaterial}
                  onChange={(e) => setPotMaterial(e.target.value as PotMaterial)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
                >
                  <option value="terracotta">Terracotta (breathes &amp; dries faster)</option>
                  <option value="ceramic">Glazed Ceramic (balanced)</option>
                  <option value="plastic">Plastic / Nursery Pot (retains moisture)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pot-size"
                  className="block text-xs font-medium text-[#4B5850] mb-1.5"
                >
                  Pot Size
                </label>
                <select
                  id="pot-size"
                  value={potSize}
                  onChange={(e) => setPotSize(e.target.value as PotSize)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
                >
                  <option value="small">Small (up to 12 cm)</option>
                  <option value="medium">Medium (13–22 cm)</option>
                  <option value="large">Large (23 cm+)</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="plant-notes"
                className="block text-xs font-medium text-[#4B5850] mb-1.5"
              >
                Personal Placement Notes (optional)
              </label>
              <textarea
                id="plant-notes"
                rows={2}
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Right next to inner courtyard window, soil mix with perlite"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#EEF0EA]">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D4D8CE] text-sm font-medium text-[#18221D] hover:bg-[#F0F1EC]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || lookingUp}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium hover:bg-[#173E2D] disabled:opacity-60"
              >
                {saving ? 'Saving...' : initialPlant ? 'Save Changes' : 'Save to My Plants'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCaptured}
        title={name ? `Photo of ${name}` : 'Photograph Plant'}
      />
    </>
  );
};
