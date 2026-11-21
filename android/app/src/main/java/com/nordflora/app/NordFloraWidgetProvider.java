package com.nordflora.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

public class NordFloraWidgetProvider extends AppWidgetProvider {
  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    SharedPreferences prefs = context.getSharedPreferences("NordFloraWidget", Context.MODE_PRIVATE);
    String raw = prefs.getString("widget_data", "{}");
    JSONObject data;
    try {
      data = new JSONObject(raw);
    } catch (Exception ignored) {
      data = new JSONObject();
    }

    String headline = data.optString("headline", "Open NordFlora to sync");
    String detail = data.optString("detail", "Your watering schedule");
    JSONArray lines = data.optJSONArray("lines");

    for (int id : appWidgetIds) {
      RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_nordflora);
      views.setTextViewText(R.id.widget_title, "NordFlora");
      views.setTextViewText(R.id.widget_headline, headline);
      views.setTextViewText(R.id.widget_detail, detail);
      views.setTextViewText(
        R.id.widget_line_1,
        lines != null && lines.length() > 0 ? lines.optString(0) : "Tap to open your plants"
      );
      views.setTextViewText(
        R.id.widget_line_2,
        lines != null && lines.length() > 1 ? lines.optString(1) : ""
      );
      views.setTextViewText(
        R.id.widget_line_3,
        lines != null && lines.length() > 2 ? lines.optString(2) : ""
      );

      Intent launch = new Intent(context, MainActivity.class);
      PendingIntent pending = PendingIntent.getActivity(
        context,
        0,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      views.setOnClickPendingIntent(R.id.widget_root, pending);
      manager.updateAppWidget(id, views);
    }
  }
}
