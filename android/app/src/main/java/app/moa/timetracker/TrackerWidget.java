package app.moa.timetracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class TrackerWidget extends AppWidgetProvider {
    static final String PREFS="moa_tracker_widget";
    static SharedPreferences prefs(Context context){return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static PendingIntent action(Context context,String action,String entryId){
        String key=prefs(context).getString("actionKey",null);
        if(key==null){key=java.util.UUID.randomUUID().toString();prefs(context).edit().putString("actionKey",key).apply();}
        Intent intent=new Intent(context,MainActivity.class).setAction("app.moa.timetracker."+action)
            .putExtra("moaAction",action).putExtra("moaEntryId",entryId)
            .putExtra("moaActionKey",key)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context,action.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
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
        int[] ids=manager.getAppWidgetIds(new ComponentName(context,TrackerWidget.class));
        SharedPreferences p=prefs(context);
        String status=p.getString("status","idle"),entry=p.getString("entryId",""),title=p.getString("title","Ready for your next task");
        boolean running="running".equals(status),active=!"idle".equals(status);
        for(int id:ids){
            Bundle options = manager.getAppWidgetOptions(id);
            boolean compact = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 150) < 220
                || options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180) < 240;
            RemoteViews views=new RemoteViews(context.getPackageName(),compact ? R.layout.tracker_widget_compact : R.layout.tracker_widget);
            views.setTextViewText(R.id.widget_date,new SimpleDateFormat("EEE, MMM d",Locale.US).format(new Date()).toUpperCase(Locale.US));
            views.setTextViewText(R.id.widget_title,title);
            views.setTextViewText(R.id.widget_status,running?"RECORDING":"paused".equals(status)?"PAUSED · BREAK TIME EXCLUDED":"GATHER YOUR TIME");
            views.setChronometer(R.id.widget_timer,SystemClock.elapsedRealtime()-elapsed(p),null,running);
            views.setViewVisibility(R.id.widget_timer,running?View.VISIBLE:View.GONE);
            views.setViewVisibility(R.id.widget_static_timer,running?View.GONE:View.VISIBLE);
            views.setTextViewText(R.id.widget_static_timer,duration(elapsed(p)));
            String next=running?"pause":active?"resume":"start";
            views.setTextViewText(R.id.widget_toggle,running?"Pause":active?"Resume":"Start tracking");
            views.setOnClickPendingIntent(R.id.widget_toggle,action(context,next,entry));
            views.setViewVisibility(R.id.widget_stop,active?View.VISIBLE:View.GONE);
            views.setOnClickPendingIntent(R.id.widget_stop,action(context,"stop",entry));
            views.setOnClickPendingIntent(R.id.widget_root,action(context,"open",entry));
            manager.updateAppWidget(id,views);
        }
    }
}
