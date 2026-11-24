import React, {useEffect, useState} from 'react';
import {Check, Thermometer} from 'lucide-react';
import {
  BARCELONA_MONTHLY_BASELINE,
  formatMonthLabel,
  getCurrentMonthKey,
} from '../lib/botanicalEngine';
import {SaveMonthlyTempInput} from '../lib/firestoreService';
import {HeatingOrAc, MonthlyTemp} from '../types';

interface ClimateViewProps {
  monthlyTemps: MonthlyTemp[];
  onSaveMonthlyTemp: (input: SaveMonthlyTempInput, existsAlready: boolean) => Promise<void>;
}

export const ClimateView: React.FC<ClimateViewProps> = ({
  monthlyTemps,
  onSaveMonthlyTemp,
}) => {
  const now = new Date();
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(getCurrentMonthKey(now));

  const monthNum = Number(selectedMonthKey.split('-')[1]) || 1;
  const baseline = BARCELONA_MONTHLY_BASELINE[monthNum];
  const existingRecord = monthlyTemps.find((m) => m.monthKey === selectedMonthKey);

  const [avgTempC, setAvgTempC] = useState<number>(
    existingRecord?.avgTempC ?? baseline.avgIndoorTempC,
  );
  const [minTempC, setMinTempC] = useState<number>(
    existingRecord?.minTempC ?? Number((baseline.avgIndoorTempC - 2).toFixed(1)),
  );
  const [maxTempC, setMaxTempC] = useState<number>(
    existingRecord?.maxTempC ?? Number((baseline.avgIndoorTempC + 2).toFixed(1)),
  );
  const [humidityPct, setHumidityPct] = useState<number>(
    existingRecord?.humidityPct ?? baseline.avgHumidityPct,
  );
  const [daylightHours, setDaylightHours] = useState<number>(
    existingRecord?.daylightHours ?? baseline.daylightHours,
  );
  const [heatingOrAc, setHeatingOrAc] = useState<HeatingOrAc>(
    existingRecord?.heatingOrAc ?? 'natural_vent',
  );
  const [note, setNote] = useState<string>(existingRecord?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    const mNum = Number(selectedMonthKey.split('-')[1]) || 1;
    const base = BARCELONA_MONTHLY_BASELINE[mNum];
    const rec = monthlyTemps.find((m) => m.monthKey === selectedMonthKey);
    setAvgTempC(rec?.avgTempC ?? base.avgIndoorTempC);
    setMinTempC(rec?.minTempC ?? Number((base.avgIndoorTempC - 2).toFixed(1)));
    setMaxTempC(rec?.maxTempC ?? Number((base.avgIndoorTempC + 2).toFixed(1)));
    setHumidityPct(rec?.humidityPct ?? base.avgHumidityPct);
    setDaylightHours(rec?.daylightHours ?? base.daylightHours);
    setHeatingOrAc(rec?.heatingOrAc ?? 'natural_vent');
    setNote(rec?.note ?? '');
    setSavedMsg(null);
  }, [selectedMonthKey, monthlyTemps]);

  const currentYear = now.getFullYear();
  const yearMonths = Array.from({length: 12}, (_, idx) => {
    const m = String(idx + 1).padStart(2, '0');
    return `${currentYear}-${m}`;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      await onSaveMonthlyTemp(
        {
          monthKey: selectedMonthKey,
          avgTempC,
          minTempC,
          maxTempC,
          humidityPct,
          heatingOrAc,
          daylightHours,
          note,
        },
        Boolean(existingRecord),
      );
      setSavedMsg(
        `Saved ${formatMonthLabel(selectedMonthKey)} (${avgTempC.toFixed(1)}°C · ${daylightHours.toFixed(1)}h)`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#18221D]">
          Monthly Room Temp, Humidity &amp; Daylight
        </h1>
        <p className="text-sm text-[#4B5850] mt-1">
          Record and edit your monthly indoor temperature (°C), air humidity (% RH), and average
          daylight hours so watering intervals match your exact window conditions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form */}
        <section className="lg:col-span-5 rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#18221D]">
              Record Month ({formatMonthLabel(selectedMonthKey)})
            </h2>
            <Thermometer className="w-5 h-5 text-[#1F513B]" />
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="month-picker" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                Select Month
              </label>
              <input
                id="month-picker"
                type="month"
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value || getCurrentMonthKey(now))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm font-mono text-[#18221D]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="avg-temp" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                  Avg (°C)
                </label>
                <input
                  id="avg-temp"
                  type="number"
                  step="0.5"
                  min={5}
                  max={42}
                  value={avgTempC}
                  onChange={(e) => setAvgTempC(Number(e.target.value) || 20)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="min-temp" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                  Night (°C)
                </label>
                <input
                  id="min-temp"
                  type="number"
                  step="0.5"
                  min={0}
                  max={40}
                  value={minTempC}
                  onChange={(e) => setMinTempC(Number(e.target.value) || 18)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="max-temp" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                  Day (°C)
                </label>
                <input
                  id="max-temp"
                  type="number"
                  step="0.5"
                  min={5}
                  max={45}
                  value={maxTempC}
                  onChange={(e) => setMaxTempC(Number(e.target.value) || 22)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="humidity-pct" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                  Room Humidity (%)
                </label>
                <input
                  id="humidity-pct"
                  type="number"
                  min={15}
                  max={95}
                  value={humidityPct}
                  onChange={(e) => setHumidityPct(Number(e.target.value) || 60)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="daylight-hours" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                  Avg Daylight (hrs/day)
                </label>
                <input
                  id="daylight-hours"
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={18}
                  value={daylightHours}
                  onChange={(e) =>
                    setDaylightHours(Math.max(0.5, Math.min(18, Number(e.target.value) || baseline.daylightHours)))
                  }
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label htmlFor="hvac-mode" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                Heating / Ventilation
              </label>
              <select
                id="hvac-mode"
                value={heatingOrAc}
                onChange={(e) => setHeatingOrAc(e.target.value as HeatingOrAc)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm"
              >
                <option value="natural_vent">Window / Natural Vent</option>
                <option value="heating">Radiator / Heating On</option>
                <option value="ac">Air Conditioning</option>
                <option value="none">Unconditioned</option>
              </select>
            </div>

            <div>
              <label htmlFor="climate-note" className="block text-xs font-medium text-[#4B5850] mb-1.5">
                Notes (optional)
              </label>
              <input
                id="climate-note"
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Radiators off, north window cracked midday"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              {savedMsg ? (
                <span className="text-xs font-medium text-[#1F513B] inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  {savedMsg}
                </span>
              ) : (
                <span className="text-xs text-[#4B5850]">
                  BCN baseline: {baseline.avgIndoorTempC}°C · {baseline.avgHumidityPct}% · {baseline.daylightHours}h
                </span>
              )}

              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium hover:bg-[#173E2D] disabled:opacity-60 whitespace-nowrap"
              >
                {saving ? 'Saving...' : existingRecord ? 'Update Month' : 'Save Month'}
              </button>
            </div>
          </form>
        </section>

        {/* Annual 12-Month Barcelona Grid & Trend */}
        <section className="lg:col-span-7 rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#18221D]">
              {currentYear} Monthly Log &amp; Daylight
            </h2>
            <span className="text-xs text-[#4B5850]">
              Tap any month to edit temp, humidity &amp; daylight hours
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {yearMonths.map((mk) => {
              const mNum = Number(mk.slice(5));
              const base = BARCELONA_MONTHLY_BASELINE[mNum];
              const rec = monthlyTemps.find((t) => t.monthKey === mk);
              const isSelected = mk === selectedMonthKey;
              const tempDisplay = rec ? rec.avgTempC : base.avgIndoorTempC;
              const daylightDisplay = rec?.daylightHours ?? base.daylightHours;

              return (
                <button
                  key={mk}
                  type="button"
                  onClick={() => setSelectedMonthKey(mk)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-[#1F513B] bg-[#EEF4F0]'
                      : 'border-[#E4E6DF] bg-[#FAFBF8] hover:border-[#B6BEB3]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#18221D]">{base.shortName}</span>
                    <span className="text-[11px] text-[#4B5850] font-mono tabular-nums">
                      {daylightDisplay.toFixed(1)}h
                    </span>
                  </div>
                  <p className="text-lg font-semibold font-mono tabular-nums text-[#18221D] mt-1">
                    {tempDisplay.toFixed(1)}°C
                  </p>
                  <p className="text-[11px] text-[#4B5850]">
                    {rec ? `Recorded · ${rec.humidityPct}% RH` : 'BCN baseline'}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
