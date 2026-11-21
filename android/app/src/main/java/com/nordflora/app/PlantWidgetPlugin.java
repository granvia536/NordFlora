package com.nordflora.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PlantWidget")
public class PlantWidgetPlugin extends Plugin {
  @PluginMethod
  public void sync(PluginCall call) {
    String data = call.getString("data", "{}");
    Context context = getContext();
    SharedPreferences prefs = context.getSharedPreferences("NordFloraWidget", Context.MODE_PRIVATE);
    prefs.edit().putString("widget_data", data).apply();

    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, NordFloraWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    if (ids != null && ids.length > 0) {
      new NordFloraWidgetProvider().onUpdate(context, manager, ids);
    }

    JSObject result = new JSObject();
    result.put("updated", true);
    call.resolve(result);
  }
}
