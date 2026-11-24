import React, {useState} from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Clock,
  Droplets,
  Leaf,
  Plus,
  Sprout,
  Sun,
  Thermometer,
} from 'lucide-react';
import {
  BARCELONA_MONTHLY_BASELINE,
  calculateWateringSchedule,
  formatDueSummary,
  getBarcelonaPeakWindow,
  getCurrentMonthKey,
  getPlantAverageLuxStats,
} from '../lib/botanicalEngine';
import {MonthlyTemp, PlantRecord, WateringCalculation} from '../types';
import {PWAInstallButton} from './PWAInstallButton';

interface PlantWithCalc {
  plant: PlantRecord;
  calc: WateringCalculation;
}

interface WidgetHomeViewProps {
  plants: PlantRecord[];
  monthlyTemps: MonthlyTemp[];
  onOpenFullSchedule: (filter?: 'all' | 'due') => void;
  onSelectPlant: (plant: PlantRecord) => void;
  onWaterPlant: (plant: PlantRecord) => Promise<void>;
  onSnoozeDamp: (plant: PlantRecord) => Promise<void>;
  onAddPlant: () => void;
  onOpenClimate: () => void;
  onOpenLux: (targetPlantId?: string) => void;
}

export const WidgetHomeView: React.FC<WidgetHomeViewProps> = ({
  plants,
  monthlyTemps,
  onOpenFullSchedule,
  onSelectPlant,
  onWaterPlant,
  onSnoozeDamp,
  onAddPlant,
  onOpenClimate,
  onOpenLux,
}) => {
  const [widgetSize, setWidgetSize] = useState<'compact' | 'detailed'>('detailed');
  const [wateringId, setWateringId] = useState<string | null>(null);
  const [snoozingId, setSnoozingId] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );

  const now = new Date();
  const currentMonthKey = getCurrentMonthKey(now);
  const monthBaseline = BARCELONA_MONTHLY_BASELINE[now.getMonth() + 1];
  const recordedTemp = monthlyTemps.find((m) => m.monthKey === currentMonthKey);
  const displayTempC = recordedTemp?.avgTempC ?? monthBaseline.avgIndoorTempC;
  const displayHumidityPct = recordedTemp?.humidityPct ?? monthBaseline.avgHumidityPct;
  const displayDaylightHours = recordedTemp?.daylightHours ?? monthBaseline.daylightHours;

  const calculated: PlantWithCalc[] = plants
    .map((plant) => ({
      plant,
      calc: calculateWateringSchedule(plant, monthlyTemps, now),
    }))
    .sort((a, b) => a.calc.daysUntilWater - b.calc.daysUntilWater);

  const dueTodayOrOverdue = calculated.filter((item) => item.calc.daysUntilWater <= 0);
  const nextUpcoming = calculated.find((item) => item.calc.daysUntilWater > 0);
  const totalPlantUnits = plants.reduce((acc, p) => acc + p.quantity, 0);
  const peakWindow = getBarcelonaPeakWindow(now);
  const dueLuxPlants = plants.filter(
    (p) => getPlantAverageLuxStats(p, undefined, now).dueForMonthlyLux,
  );
  const collectionAvgLux =
    plants.length > 0
      ? Math.round(
          plants.reduce((sum, p) => sum + (p.avgLux ?? p.latestLux), 0) / plants.length,
        )
      : 0;

  const todayFormatted = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const handleQuickWater = async (e: React.MouseEvent, plant: PlantRecord) => {
    e.stopPropagation();
    setWateringId(plant.id);
    try {
      await onWaterPlant(plant);
    } finally {
      setWateringId(null);
    }
  };

  const handleQuickSnooze = async (e: React.MouseEvent, plant: PlantRecord) => {
    e.stopPropagation();
    setSnoozingId(plant.id);
    try {
      await onSnoozeDamp(plant);
    } finally {
      setSnoozingId(null);
    }
  };

  const handleRequestNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted' && dueTodayOrOverdue.length > 0) {
      new Notification('NordFlora Watering Today', {
        body: `${dueTodayOrOverdue.length} ${dueTodayOrOverdue.length === 1 ? 'plant needs' : 'plants need'} water today: ${dueTodayOrOverdue
          .slice(0, 3)
          .map((d) => d.plant.name)
          .join(', ')}`,
        icon: '/pwa-192x192.png',
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Primary Focal Anchor: The Android Home-Screen Widget */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#18221D] text-balance">
                Today&apos;s Watering Widget
              </h1>
              <p className="text-sm text-[#4B5850] mt-1">
                Tap the widget to open all plants, photos, lux readings, and watering schedules.
              </p>
            </div>

            <div className="inline-flex items-center p-1 rounded-xl bg-[#EAECE5] shrink-0">
              <button
                type="button"
                onClick={() => setWidgetSize('compact')}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  widgetSize === 'compact'
                    ? 'bg-white text-[#18221D] shadow-xs'
                    : 'text-[#4B5850] hover:text-[#18221D]'
                }`}
              >
                4×2 Compact
              </button>
              <button
                type="button"
                onClick={() => setWidgetSize('detailed')}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  widgetSize === 'detailed'
                    ? 'bg-white text-[#18221D] shadow-xs'
                    : 'text-[#4B5850] hover:text-[#18221D]'
                }`}
              >
                4×4 Full Widget
              </button>
            </div>
          </div>

          {/* Interactive Android Widget Surface */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenFullSchedule(dueTodayOrOverdue.length > 0 ? 'all' : 'all')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenFullSchedule('all');
              }
            }}
            aria-label="Open full plant collection and watering schedules"
            className="group w-full text-left rounded-3xl bg-white border border-[#DCE0D5] shadow-sm hover:border-[#1F513B]/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F513B] transition-all cursor-pointer overflow-hidden"
          >
            {/* Widget Top Header */}
            <div className="px-5 pt-5 pb-4 border-b border-[#EEF0EA] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-[#1F513B] text-white flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[#4B5850]">
                    <span>{todayFormatted}</span>
                    <span aria-hidden="true">·</span>
                    <span>Barcelona North</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {displayTempC.toFixed(1)}°C · {Math.round(displayHumidityPct)}% RH
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-[#18221D] truncate">
                    {plants.length === 0
                      ? 'No plants added yet'
                      : dueTodayOrOverdue.length > 0
                        ? `Water ${dueTodayOrOverdue.length} ${
                            dueTodayOrOverdue.length === 1 ? 'plant' : 'plants'
                          } today`
                        : 'All plants watered'}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-medium text-[#1F513B] group-hover:translate-x-0.5 transition-transform shrink-0 whitespace-nowrap">
                <span>All Plants</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Widget Body: Strictly shows what needs watering today */}
            {plants.length === 0 ? (
              <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#18221D]">
                    Add your first plant or species group
                  </p>
                  <p className="text-xs text-[#4B5850]">
                    Snap a photo and log its north-window lux to start daily watering alerts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddPlant();
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#173E2D] whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Plant</span>
                </button>
              </div>
            ) : dueTodayOrOverdue.length === 0 ? (
              <div className="px-5 py-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-[#EEF4F0] text-[#1F513B] flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#18221D]">
                      Nothing needs water today
                    </p>
                    <p className="text-xs text-[#4B5850] mt-0.5 truncate">
                      {nextUpcoming
                        ? `Next due: ${nextUpcoming.plant.name} ${formatDueSummary(
                            nextUpcoming.calc.daysUntilWater,
                          ).toLowerCase()} · Tap to view all ${plants.length}`
                        : `Tracking ${plants.length} entries · Tap to open full schedules`}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#EEF0EA]">
                {(widgetSize === 'compact'
                  ? dueTodayOrOverdue.slice(0, 3)
                  : dueTodayOrOverdue
                ).map(({plant, calc}) => (
                  <div
                    key={plant.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAFBF8] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {plant.photoDataUrl ? (
                        <img
                          src={plant.photoDataUrl}
                          alt={plant.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-2xl object-cover border border-[#E4E6DF] shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-[#EEF4F0] text-[#1F513B] flex items-center justify-center shrink-0">
                          <Leaf className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#18221D] truncate">
                          {plant.entryType === 'group'
                            ? `${plant.quantity}× ${plant.name}`
                            : plant.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[#4B5850] mt-0.5 truncate">
                          <span
                            className={`font-medium ${
                              calc.status === 'overdue' ? 'text-[#B91C1C]' : 'text-[#B45309]'
                            }`}
                          >
                            {formatDueSummary(calc.daysUntilWater)}
                          </span>
                          {widgetSize === 'detailed' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{plant.speciesName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums shrink-0">
                                {Math.round(plant.avgLux ?? plant.latestLux)} lx avg
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 sm:justify-end">
                      <button
                        type="button"
                        disabled={wateringId === plant.id || snoozingId === plant.id}
                        onClick={(e) => void handleQuickSnooze(e, plant)}
                        className="flex-1 sm:flex-none min-h-[44px] px-3 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#4B5850] hover:text-[#18221D] hover:bg-[#F0F1EC] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{snoozingId === plant.id ? 'Snoozing...' : 'Damp +2d'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={wateringId === plant.id || snoozingId === plant.id}
                        onClick={(e) => void handleQuickWater(e, plant)}
                        className="flex-1 sm:flex-none min-h-[44px] px-3.5 py-2 rounded-xl bg-[#EEF4F0] text-[#1F513B] hover:bg-[#1F513B] hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Droplets className="w-3.5 h-3.5" />
                        <span>{wateringId === plant.id ? 'Saving...' : 'Watered'}</span>
                      </button>
                    </div>
                  </div>
                ))}

                {widgetSize === 'compact' && dueTodayOrOverdue.length > 3 && (
                  <div className="px-5 py-3 text-xs font-medium text-[#1F513B] bg-[#FAFBF8]">
                    + {dueTodayOrOverdue.length - 3} more due today · Tap widget to open full list
                  </div>
                )}
              </div>
            )}

            {/* Quiet Widget Footer */}
            <div className="px-5 py-3 bg-[#FAFBF8] border-t border-[#EEF0EA] flex items-center justify-between gap-4 text-xs text-[#4B5850]">
              <span>
                {plants.length} {plants.length === 1 ? 'entry' : 'entries'} ({totalPlantUnits}{' '}
                {totalPlantUnits === 1 ? 'plant' : 'plants'})
              </span>
              <span className="font-medium text-[#18221D]">
                Tap anywhere on widget for full schedule
              </span>
            </div>
          </div>
        </section>

        {/* Secondary Column: Android Pinning, Barcelona Climate Snapshot & Upcoming Preview */}
        <aside className="lg:col-span-5 space-y-5">
          {/* Android Home Screen & Reminder Card */}
          <div className="rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#18221D]">
                  Android Phone Setup
                </h2>
                <p className="text-xs text-[#4B5850] mt-1 leading-relaxed">
                  Install NordFlora to your Android home screen so it launches straight into this
                  watering widget, even offline.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <PWAInstallButton />
              {notifStatus !== 'unsupported' && notifStatus !== 'granted' && (
                <button
                  type="button"
                  onClick={() => void handleRequestNotifications()}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-xs font-medium inline-flex items-center gap-2 hover:bg-[#F0F1EC] whitespace-nowrap"
                >
                  <Bell className="w-4 h-4 text-[#1F513B]" />
                  <span>Enable Watering Alerts</span>
                </button>
              )}
              {notifStatus === 'granted' && (
                <span className="text-xs text-[#1F513B] font-medium inline-flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5" />
                  Alerts enabled
                </span>
              )}
            </div>
          </div>

          {/* Barcelona North-Window Context Card */}
          <div className="rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#18221D]">
                  Barcelona North Window
                </h2>
                <p className="text-xs text-[#4B5850] mt-0.5">
                  41.39°N · {monthBaseline.monthName} daylight {displayDaylightHours.toFixed(1)}h
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenClimate}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#D4D8CE] text-xs font-medium text-[#18221D] hover:bg-[#F0F1EC] whitespace-nowrap"
              >
                Log Temp &amp; RH
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenClimate}
                className="text-left p-3.5 rounded-xl bg-[#F7F7F4] hover:bg-[#EFF1EA] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs text-[#4B5850]">
                  <Thermometer className="w-3.5 h-3.5 text-[#1F513B]" />
                  <span>Temp &amp; Humidity</span>
                </div>
                <p className="text-lg sm:text-xl font-semibold font-mono tabular-nums text-[#18221D] mt-1">
                  {displayTempC.toFixed(1)}°C · {Math.round(displayHumidityPct)}%
                </p>
                <p className="text-[11px] text-[#4B5850] mt-0.5">
                  {recordedTemp ? 'Your recorded month' : 'Barcelona baseline'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => onOpenLux(dueLuxPlants[0]?.id)}
                className="text-left p-3.5 rounded-xl bg-[#F7F7F4] hover:bg-[#EFF1EA] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs text-[#4B5850]">
                  <Sun className="w-3.5 h-3.5 text-[#B45309]" />
                  <span>Avg Daylight Lux</span>
                </div>
                <p className="text-xl font-semibold font-mono tabular-nums text-[#18221D] mt-1">
                  {collectionAvgLux} lx
                </p>
                <p className="text-[11px] text-[#4B5850] mt-0.5">
                  Peak {peakWindow.peakTimeLabel}
                </p>
              </button>
            </div>

            {plants.length > 0 && (
              <div className="pt-3 border-t border-[#EEF0EA] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#18221D]">
                    {dueLuxPlants.length > 0
                      ? `${dueLuxPlants.length} ${
                          dueLuxPlants.length === 1 ? 'plant due' : 'plants due'
                        } for ${peakWindow.monthName} lux check`
                      : `All plants measured in ${peakWindow.monthName}`}
                  </p>
                  <p className="text-[11px] text-[#4B5850]">
                    Strongest Barcelona light: {peakWindow.timeRangeLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenLux(dueLuxPlants[0]?.id)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#EEF4F0] text-[#1F513B] hover:bg-[#1F513B] hover:text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  {dueLuxPlants.length > 0 ? 'Log Peak Lux' : 'Lux Log'}
                </button>
              </div>
            )}
          </div>

          {/* Quick Upcoming Preview */}
          {calculated.length > 0 && (
            <div className="rounded-2xl bg-white border border-[#E4E6DF] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[#18221D]">Next Up After Today</h2>
                <button
                  type="button"
                  onClick={() => onOpenFullSchedule('all')}
                  className="text-xs font-medium text-[#1F513B] hover:underline"
                >
                  View all {plants.length}
                </button>
              </div>
              <div className="divide-y divide-[#EEF0EA]">
                {calculated
                  .filter((c) => c.calc.daysUntilWater > 0)
                  .slice(0, 3)
                  .map(({plant, calc}) => (
                    <button
                      key={plant.id}
                      type="button"
                      onClick={() => onSelectPlant(plant)}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[#FAFBF8] rounded-lg px-1 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Sprout className="w-4 h-4 text-[#1F513B] shrink-0" />
                        <span className="text-sm text-[#18221D] truncate">
                          {plant.entryType === 'group'
                            ? `${plant.quantity}× ${plant.name}`
                            : plant.name}
                        </span>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-[#4B5850] shrink-0">
                        {calc.isSnoozed ? 'Snoozed · ' : ''}
                        {formatDueSummary(calc.daysUntilWater)}
                      </span>
                    </button>
                  ))}
                {calculated.filter((c) => c.calc.daysUntilWater > 0).length === 0 && (
                  <p className="text-xs text-[#4B5850] py-1">
                    All your tracked plants are listed in Today&apos;s Watering Widget above.
                  </p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
