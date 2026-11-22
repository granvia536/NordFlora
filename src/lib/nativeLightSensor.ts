import {Capacitor, PluginListenerHandle, registerPlugin} from '@capacitor/core';

export interface NativeLuxReading {
  lux: number;
  rawLux?: number;
  accuracy?: number;
  sensorName?: string;
}

interface LightSensorAvailability {
  available: boolean;
  sensorName?: string;
  maxRange?: number;
}

interface StartListeningResult {
  started: boolean;
  sensorName?: string;
  maxRange?: number;
  lux?: number;
  rawLux?: number;
}

interface NativeLightSensorPlugin {
  isAvailable(): Promise<LightSensorAvailability>;
  startListening(): Promise<StartListeningResult>;
  stopListening(): Promise<{stopped: boolean}>;
  addListener(
    eventName: 'luxReading',
    listenerFunc: (reading: NativeLuxReading) => void,
  ): Promise<PluginListenerHandle>;
}

const LightSensor = registerPlugin<NativeLightSensorPlugin>('LightSensor');

export function hasNativeLightSensorBridge(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LightSensor');
}

export async function startNativeLightSensor(
  onReading: (reading: NativeLuxReading) => void,
): Promise<{
  sensorName?: string;
  initialLux?: number;
  stop: () => Promise<void>;
}> {
  const availability = await LightSensor.isAvailable();
  if (!availability.available) {
    throw new Error('This Android device does not have a hardware ambient light sensor.');
  }

  let listenerHandle: PluginListenerHandle | null = await LightSensor.addListener(
    'luxReading',
    onReading,
  );

  try {
    const startResult = await LightSensor.startListening();
    if (typeof startResult.lux === 'number') {
      onReading({
        lux: startResult.lux,
        rawLux: startResult.rawLux,
        sensorName: startResult.sensorName,
      });
    }

    return {
      sensorName: startResult.sensorName ?? availability.sensorName,
      initialLux: startResult.lux,
      stop: async () => {
        if (listenerHandle) {
          await listenerHandle.remove().catch(() => {});
          listenerHandle = null;
        }
        await LightSensor.stopListening().catch(() => {});
      },
    };
  } catch (err) {
    if (listenerHandle) {
      await listenerHandle.remove().catch(() => {});
      listenerHandle = null;
    }
    throw err;
  }
}
