package app.moa.timetracker;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name="MoaTracker",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class MoaTrackerPlugin extends Plugin {
    private JSObject pendingAction;
    private static final int NOTIFICATION_ID=2701;
    @PluginMethod public void update(PluginCall call){
        SharedPreferences p=TrackerWidget.prefs(getContext());
        p.edit().putString("title",call.getString("title","Ready for your next task"))
            .putString("entryId",call.getString("entryId",""))
            .putString("status",call.getString("status","idle"))
            .putString("theme",call.getString("theme","light"))
            .putLong("elapsedMs",call.getLong("elapsedMs",0L)).putLong("snapshotAt",call.getLong("snapshotAt",System.currentTimeMillis())).apply();
        TrackerWidget.updateAll(getContext());updateNotification();call.resolve();
        getActivity().runOnUiThread(() -> ((MainActivity)getActivity()).applyTrackerAppearance());
    }
    @PluginMethod public void getSettings(PluginCall call){JSObject result=new JSObject();result.put("notifications",TrackerWidget.prefs(getContext()).getBoolean("notifications",false));call.resolve(result);}
    @PluginMethod public void pinWidget(PluginCall call){
        AppWidgetManager manager=AppWidgetManager.getInstance(getContext());
        boolean supported=Build.VERSION.SDK_INT>=26&&manager.isRequestPinAppWidgetSupported();
        if(supported)manager.requestPinAppWidget(new ComponentName(getContext(),TrackerWidget.class),null,null);
        JSObject result=new JSObject();result.put("supported",supported);call.resolve(result);
    }
    @PluginMethod public void setNotifications(PluginCall call){
        if(call.getBoolean("enabled",false)&&Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"notificationPermission");return;}
        applyNotificationSetting(call);
    }
    @PermissionCallback private void notificationPermission(PluginCall call){applyNotificationSetting(call);}
    private void applyNotificationSetting(PluginCall call){
        boolean allowed=Build.VERSION.SDK_INT<33||getPermissionState("notifications")==PermissionState.GRANTED;
        boolean enabled=call.getBoolean("enabled",false)&&allowed;
        TrackerWidget.prefs(getContext()).edit().putBoolean("notifications",enabled).apply();updateNotification();
        JSObject result=new JSObject();result.put("enabled",enabled);result.put("denied",!allowed);call.resolve(result);
    }
    private void updateNotification(){
        NotificationManager manager=getContext().getSystemService(NotificationManager.class);
        SharedPreferences p=TrackerWidget.prefs(getContext());String status=p.getString("status","idle"),entry=p.getString("entryId","");
        if(!p.getBoolean("notifications",false)||"idle".equals(status)){manager.cancel(NOTIFICATION_ID);return;}
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED)return;
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("moa_timer","Active timer",NotificationManager.IMPORTANCE_LOW));
        boolean running="running".equals(status);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(getContext(),"moa_timer")
            .setSmallIcon(R.drawable.ic_timer_notification).setContentTitle(p.getString("title","moa"))
            .setContentText(running?"Recording · tap to open moa":"Paused · "+TrackerWidget.duration(TrackerWidget.elapsed(p)))
            .setContentIntent(TrackerWidget.action(getContext(),"open",entry)).setOngoing(true).setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setShowWhen(running).setWhen(System.currentTimeMillis()-TrackerWidget.elapsed(p)).setUsesChronometer(running)
            .addAction(0,running?"Pause":"Resume",TrackerWidget.action(getContext(),running?"pause":"resume",entry))
            .addAction(0,"Stop",TrackerWidget.action(getContext(),"stop",entry));
        manager.notify(NOTIFICATION_ID,builder.build());
    }
    private JSObject readAction(Intent intent){
        if(intent==null||!intent.hasExtra("moaAction"))return new JSObject();
        String key=TrackerWidget.prefs(getContext()).getString("actionKey",null);
        if(key==null||!key.equals(intent.getStringExtra("moaActionKey")))return new JSObject();
        JSObject result=new JSObject();result.put("action",intent.getStringExtra("moaAction"));result.put("entryId",intent.getStringExtra("moaEntryId"));
        intent.removeExtra("moaAction");intent.removeExtra("moaEntryId");intent.removeExtra("moaActionKey");return result;
    }
    @Override protected void handleOnNewIntent(Intent intent){pendingAction=readAction(intent);notifyListeners("widgetAction",new JSObject(),true);}
    @PluginMethod public void consumeAction(PluginCall call){JSObject result=pendingAction!=null?pendingAction:readAction(getActivity().getIntent());pendingAction=null;call.resolve(result);}
}
