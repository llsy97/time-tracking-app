package app.moa.timetracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONException;

/** No activity, WebView or long-running timer service is launched here. */
public class TrackerActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String key = TrackerWidget.prefs(context).getString("actionKey", null);
        if (key == null || !key.equals(intent.getStringExtra("moaActionKey"))) return;
        try {
            if (!TrackerStore.act(context, intent.getStringExtra("moaAction"), intent.getStringExtra("moaOwner"),
                intent.getStringExtra("moaEntryId"), intent.getLongExtra("moaRevision", -1))) return;
            TrackerWidget.updateAll(context);
            MoaTrackerPlugin.updateNotification(context);
            context.sendBroadcast(new Intent(TrackerStore.CHANGED).setPackage(context.getPackageName()));
        } catch (JSONException | RuntimeException error) {
            // Preserve the last persisted state if storage is unavailable.
            android.util.Log.e("MoaTracker", "Could not save widget action", error);
        }
    }
}
