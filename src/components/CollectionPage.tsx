import React, {useMemo, useState} from 'react';
import {
  ArrowLeft,
  Camera,
  Droplets,
  Leaf,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import {
  BARCELONA_MONTHLY_BASELINE,
  calculateWateringSchedule,
  formatDueSummary,
  getCurrentMonthKey,
  getPlantAverageLuxStats,
} from '../lib/botanicalEngine';
import {MonthlyTemp, PlantRecord} from '../types';

interface CollectionPageProps {
  plants: PlantRecord[];
  monthlyTemps: MonthlyTemp[];
  initialFilter?: 'all' | 'due';
  onBackToWidget: () => void;
  onSelectPlant: (plant: PlantRecord) => void;
  onWaterPlant: (plant: PlantRecord) => Promise<void>;
  onAddPlant: () => void;
  onOpenLuxForPlant: (plant: PlantRecord) => void;
}

export const CollectionPage: React.FC<CollectionPageProps> = ({
  plants,
  monthlyTemps,
  initialFilter = 'all',
  onBackToWidget,
  onSelectPlant,
  onWaterPlant,
  onAddPlant,
  onOpenLuxForPlant,
}) => {
  const [filter, setFilter] = useState<'all' | 'due' | 'group' | 'individual'>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [wateringId, setWateringId] = useState<string | null>(null);

  const now = new Date();
  const monthBaseline = BARCELONA_MONTHLY_BASELINE[now.getMonth() + 1];
  const recordedMonth = monthlyTemps.find((m) => m.monthKey === getCurrentMonthKey(now));
  const activeTemp = recordedMonth?.avgTempC ?? monthBaseline.avgIndoorTempC;

  const items = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plants
      .map((plant) => ({
        plant,
        calc: calculateWateringSchedule(plant, monthlyTemps, now),
      }))
      .filter(({plant, calc}) => {
        if (filter === 'due' && calc.daysUntilWater > 0) return false;
        if (filter === 'group' && plant.entryType !== 'group') return false;
        if (filter === 'individual' && plant.entryType !== 'individual') return false;
        if (q) {
          return (
            plant.name.toLowerCase().includes(q) ||
            plant.speciesName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.calc.daysUntilWater - b.calc.daysUntilWater);
  }, [plants, monthlyTemps, filter, searchQuery, now]);

  const dueCount = useMemo(
    () =>
      plants.filter((p) => calculateWateringSchedule(p, monthlyTemps, now).daysUntilWater <= 0)
        .length,
    [plants, monthlyTemps, now],
  );

  const handleWater = async (e: React.MouseEvent, plant: PlantRecord) => {
    e.stopPropagation();
    setWateringId(plant.id);
    try {
      await onWaterPlant(plant);
    } finally {
      setWateringId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBackToWidget}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1F513B] hover:underline min-h-[32px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Today&apos;s Widget</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#18221D] text-balance">
            All Plants &amp; Watering Schedules
          </h1>
          <p className="text-sm text-[#4B5850]">
            Barcelona north-facing window · {monthBaseline.monthName} {activeTemp.toFixed(1)}°C ·{' '}
            {monthBaseline.daylightHours}h daylight · {dueCount} due today
          </p>
        </div>

        <button
          type="button"
          onClick={onAddPlant}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#173E2D] whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Plant or Group</span>
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-xl bg-[#EAECE5] overflow-x-auto">
          {(
            [
              {id: 'all', label: `All (${plants.length})`},
              {id: 'due', label: `Due Now (${dueCount})`},
              {id: 'group', label: 'Species Groups'},
              {id: 'individual', label: 'Individual'},
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white text-[#18221D] shadow-xs'
                  : 'text-[#4B5850] hover:text-[#18221D]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#4B5850] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plant or species..."
            className="w-full min-h-[44px] pl-9 pr-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-sm text-[#18221D] focus:outline-2 focus:outline-[#1F513B]"
          />
        </div>
      </div>

      {/* Grid of Plants & Species Groups */}
      {items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#E4E6DF] p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#EEF4F0] text-[#1F513B] flex items-center justify-center mx-auto">
            <Leaf className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-[#18221D]">
            {plants.length === 0 ? 'Your collection is empty' : 'No plants match this filter'}
          </h2>
          <p className="text-sm text-[#4B5850] max-w-md mx-auto">
            {plants.length === 0
              ? 'Take a photo of your first plant or same-species group and record its north-window lux level.'
              : 'Try switching back to All or clearing your search.'}
          </p>
          {plants.length === 0 && (
            <button
              type="button"
              onClick={onAddPlant}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-[#173E2D]"
            >
              <Camera className="w-4 h-4" />
              <span>Add First Plant</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(({plant, calc}) => {
            const nextDateStr = calc.nextWaterDate.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            });
            const statusColor =
              calc.status === 'overdue'
                ? 'text-[#B91C1C]'
                : calc.status === 'today'
                  ? 'text-[#B45309]'
                  : 'text-[#1F513B]';

            return (
              <article
                key={plant.id}
                onClick={() => onSelectPlant(plant)}
                className="rounded-2xl bg-white border border-[#E4E6DF] hover:border-[#1F513B]/45 transition-colors overflow-hidden flex flex-col cursor-pointer"
              >
                <div className="relative aspect-[4/3] bg-[#EEF4F0] overflow-hidden">
                  {plant.photoDataUrl ? (
                    <img
                      src={plant.photoDataUrl}
                      alt={plant.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[#1F513B]/70 gap-1.5">
                      <Leaf className="w-8 h-8" />
                      <span className="text-xs font-medium">Tap to add photo</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
                  <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between text-white text-xs">
                    <span className="font-mono tabular-nums font-medium">
                      {Math.round(plant.avgLux ?? plant.latestLux)} lux avg · {calc.lightAssessment}
                    </span>
                    {plant.entryType === 'group' && (
                      <span className="font-medium">Group of {plant.quantity}</span>
                    )}
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-[#18221D] truncate">
                      {plant.entryType === 'group'
                        ? `${plant.quantity}× ${plant.name}`
                        : plant.name}
                    </h2>
                    <p className="text-xs font-serif italic text-[#4B5850] truncate">
                      {plant.speciesName}
                      {plant.botanicalName && plant.botanicalName !== plant.speciesName
                        ? ` · ${plant.botanicalName}`
                        : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#4B5850] pt-1">
                      <span className="capitalize">{plant.potSize} {plant.potMaterial}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Every {calc.adjustedIntervalDays}d
                      </span>
                      {getPlantAverageLuxStats(plant, undefined, now).dueForMonthlyLux && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#B45309] font-medium">
                            Monthly lux due
                          </span>
                        </>
                      )}
                    </div>
                    {plant.careDetails && (
                      <p className="text-xs text-[#4B5850] line-clamp-2 pt-1.5 leading-relaxed">
                        {plant.careDetails}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#EEF0EA] flex items-center justify-between gap-2">
                    <div>
                      <span className={`text-sm font-semibold block ${statusColor}`}>
                        {formatDueSummary(calc.daysUntilWater)}
                      </span>
                      <span className="text-[11px] text-[#4B5850] font-mono tabular-nums">
                        Next: {nextDateStr}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Measure lux for ${plant.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLuxForPlant(plant);
                        }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#D4D8CE] text-[#4B5850] hover:text-[#18221D] hover:bg-[#F0F1EC]"
                      >
                        <Sun className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={wateringId === plant.id}
                        onClick={(e) => void handleWater(e, plant)}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#EEF4F0] text-[#1F513B] hover:bg-[#1F513B] hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Droplets className="w-3.5 h-3.5" />
                        <span>{wateringId === plant.id ? 'Saving...' : 'Water'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
