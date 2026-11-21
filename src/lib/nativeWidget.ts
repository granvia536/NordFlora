import {Capacitor, registerPlugin} from '@capacitor/core';
import {calculateWateringSchedule, formatDueSummary} from './botanicalEngine';
import type {MonthlyTemp, PlantRecord} from '../types';

const PlantWidget = registerPlugin<{
  sync(options: {data: string}): Promise<void>;
}>('PlantWidget');

export async function syncNordFloraWidget(
  plants: PlantRecord[],
  monthlyTemps: MonthlyTemp[],
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const scheduled = plants
    .map((plant) => ({
      plant,
      calc: calculateWateringSchedule(plant, monthlyTemps),
    }))
    .sort((a, b) => a.calc.daysUntilWater - b.calc.daysUntilWater);

  const due = scheduled.filter(({calc}) => calc.daysUntilWater <= 0);
  const next = scheduled.find(({calc}) => calc.daysUntilWater > 0);

  const headline =
    plants.length === 0
      ? 'No plants added yet'
      : due.length > 0
        ? `Water ${due.length} ${due.length === 1 ? 'plant' : 'plants'}`
        : 'Nothing needs water today';

  const lines = due.slice(0, 3).map(
    ({plant, calc}) =>
      `${plant.entryType === 'group' ? `${plant.quantity}× ` : ''}${plant.name} · ${formatDueSummary(calc.daysUntilWater)}`,
  );

  if (due.length === 0 && next) {
    lines.push(`Next: ${next.plant.name} · ${formatDueSummary(next.calc.daysUntilWater)}`);
  } else if (due.length > 3) {
    lines.push(`+${due.length - 3} more`);
  }

  const payload = {
    headline,
    detail: `${plants.length} ${plants.length === 1 ? 'entry' : 'entries'} · ${new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})}`,
    lines,
  };

  try {
    await PlantWidget.sync({data: JSON.stringify(payload)});
  } catch (error) {
    console.warn('Could not update the Android watering widget:', error);
  }
}
