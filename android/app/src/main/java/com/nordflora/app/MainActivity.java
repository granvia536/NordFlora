package com.nordflora.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Capacitor 8 automatically loads FirebaseAuthentication from
    // assets/capacitor.plugins.json during super.onCreate().
    // Only the app's custom plugins need explicit registration.
    registerPlugin(PlantWidgetPlugin.class);
    registerPlugin(LightSensorPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
