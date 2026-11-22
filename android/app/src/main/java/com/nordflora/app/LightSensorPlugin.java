package com.nordflora.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LightSensor")
public class LightSensorPlugin extends Plugin implements SensorEventListener {
  private SensorManager sensorManager;
  private Sensor lightSensor;
  private boolean listening = false;
  private long lastEmitElapsedMs = 0L;
  private Float lastLuxValue = null;

  @Override
  public void load() {
    Context context = getContext();
    if (context != null) {
      sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
      if (sensorManager != null) {
        lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT);
      }
    }
  }

  @PluginMethod
  public void isAvailable(PluginCall call) {
    ensureSensorInitialized();
    JSObject result = new JSObject();
    boolean available = lightSensor != null;
    result.put("available", available);
    if (available) {
      result.put("sensorName", lightSensor.getName());
      result.put("maxRange", lightSensor.getMaximumRange());
    }
    call.resolve(result);
  }

  @PluginMethod
  public void startListening(PluginCall call) {
    ensureSensorInitialized();
    if (sensorManager == null || lightSensor == null) {
      call.reject("This device does not expose an ambient light sensor.");
      return;
    }

    if (!listening) {
      lastEmitElapsedMs = 0L;
      boolean registered = sensorManager.registerListener(
        this,
        lightSensor,
        SensorManager.SENSOR_DELAY_UI
      );
      if (!registered) {
        call.reject("Could not register Android ambient light sensor listener.");
        return;
      }
      listening = true;
    }

    JSObject result = new JSObject();
    result.put("started", true);
    result.put("sensorName", lightSensor.getName());
    result.put("maxRange", lightSensor.getMaximumRange());
    if (lastLuxValue != null) {
      result.put("lux", Math.round(lastLuxValue));
      result.put("rawLux", lastLuxValue);
    }
    call.resolve(result);
  }

  @PluginMethod
  public void stopListening(PluginCall call) {
    stopSensorListener();
    listening = false;
    JSObject result = new JSObject();
    result.put("stopped", true);
    call.resolve(result);
  }

  @Override
  public void onSensorChanged(SensorEvent event) {
    if (event == null || event.sensor == null || event.sensor.getType() != Sensor.TYPE_LIGHT) {
      return;
    }
    if (event.values == null || event.values.length == 0) {
      return;
    }

    float rawLux = Math.max(0f, event.values[0]);
    lastLuxValue = rawLux;

    long now = SystemClock.elapsedRealtime();
    if (lastEmitElapsedMs != 0L && (now - lastEmitElapsedMs) < 180L) {
      return;
    }
    lastEmitElapsedMs = now;

    JSObject payload = new JSObject();
    payload.put("lux", Math.round(rawLux));
    payload.put("rawLux", Math.round(rawLux * 10f) / 10f);
    payload.put("accuracy", event.accuracy);
    if (lightSensor != null) {
      payload.put("sensorName", lightSensor.getName());
    }
    notifyListeners("luxReading", payload);
  }

  @Override
  public void onAccuracyChanged(Sensor sensor, int accuracy) {
    // No action needed; accuracy is included with sensor readings.
  }

  @Override
  protected void handleOnPause() {
    super.handleOnPause();
    stopSensorListener();
  }

  @Override
  protected void handleOnResume() {
    super.handleOnResume();
    if (listening && sensorManager != null && lightSensor != null) {
      lastEmitElapsedMs = 0L;
      sensorManager.registerListener(this, lightSensor, SensorManager.SENSOR_DELAY_UI);
    }
  }

  @Override
  protected void handleOnDestroy() {
    listening = false;
    stopSensorListener();
    super.handleOnDestroy();
  }

  private void ensureSensorInitialized() {
    if (sensorManager == null && getContext() != null) {
      sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
    }
    if (lightSensor == null && sensorManager != null) {
      lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT);
    }
  }

  private void stopSensorListener() {
    if (sensorManager != null) {
      sensorManager.unregisterListener(this);
    }
  }
}
