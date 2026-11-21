package com.nordflora.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PlantWidgetPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
