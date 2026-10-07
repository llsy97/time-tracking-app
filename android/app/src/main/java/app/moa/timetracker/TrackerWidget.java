package app.moa.timetracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.util.Locale;
import org.json.JSONObject;

public class TrackerWidget extends AppWidgetProvider {
    static final String PREFS="moa_tracker_widget";
    static SharedPreferences prefs(Context context){return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static PendingIntent action(Context context,String action,String entryId){
        String key=prefs(context).getString("actionKey",null);
        if(key==null){key=java.util.UUID.randomUUID().toString();prefs(context).edit().putString("actionKey",key).apply();}
        Intent intent=new Intent(context,"open".equals(action) ? MainActivity.class : TrackerActionReceiver.class).setAction("app.moa.timetracker."+action)
            .putExtra("moaAction",action).putExtra("moaEntryId",entryId)
            .putExtra("moaActionKey",key)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if("open".equals(action))return PendingIntent.getActivity(context,action.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        try {
            JSONObject snapshot=TrackerStore.snapshot(context);
            intent.putExtra("moaOwner",snapshot.optString("owner","guest")).putExtra("moaRevision",snapshot.optLong("revision",-1));
        } catch(Exception error){intent.putExtra("moaRevision",-1L);}
        intent.setFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        return PendingIntent.getBroadcast(context,action.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static long elapsed(SharedPreferences prefs){
        long duration=prefs.getLong("elapsedMs",0);
        if("running".equals(prefs.getString("status","idle")))duration+=Math.max(0,System.currentTimeMillis()-prefs.getLong("snapshotAt",System.currentTimeMillis()));
        return duration;
    }
    static String duration(long ms){long seconds=ms/1000;return String.format(Locale.US,"%02d:%02d:%02d",seconds/3600,(seconds/60)%60,seconds%60);}
    @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){updateAll(context);}
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options){updateAll(context);}
    static void updateAll(Context context){
        AppWidgetManager manager=AppWidgetManager.getInstance(context);
        SharedPreferences p=prefs(context);
        String status=p.getString("status","idle"),entry=p.getString("entryId","");
        boolean running="running".equals(status),active=!"idle".equals(status);
        boolean ready=false;
        try {ready=TrackerStore.snapshot(context).optBoolean("enabled");} catch(Exception ignored){}
        for(Class<?> provider : new Class<?>[]{TrackerWidget.class,TrackerWidgetTall.class}){
          for(int id:manager.getAppWidgetIds(new ComponentName(context,provider))){
            RemoteViews views=new RemoteViews(context.getPackageName(),provider==TrackerWidgetTall.class ? R.layout.tracker_widget_tall : R.layout.tracker_widget);
            views.setTextViewText(R.id.widget_pause,running||!active?"Pause":"Resume");
            views.setOnClickPendingIntent(R.id.widget_start,action(context,"start",entry));
            views.setOnClickPendingIntent(R.id.widget_pause,action(context,running?"pause":"resume",entry));
            views.setOnClickPendingIntent(R.id.widget_stop,action(context,"stop",entry));
            views.setBoolean(R.id.widget_start,"setEnabled",ready&&!active);
            views.setBoolean(R.id.widget_pause,"setEnabled",ready&&active);
            views.setBoolean(R.id.widget_stop,"setEnabled",ready&&active);
            views.setFloat(R.id.widget_start,"setAlpha",ready&&!active?1f:0.25f);
            views.setFloat(R.id.widget_pause,"setAlpha",ready&&active?1f:0.25f);
            views.setFloat(R.id.widget_stop,"setAlpha",ready&&active?1f:0.25f);
            manager.updateAppWidget(id,views);
          }
        }
    }
}
