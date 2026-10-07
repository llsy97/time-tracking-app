package app.moa.timetracker;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;

final class TrackerStore {
    static final String CHANGED = "app.moa.timetracker.TRACKER_CHANGED";
    private static final String KEY = "journal";
    private static TrackerJournal load(Context context) throws JSONException { return new TrackerJournal(TrackerWidget.prefs(context).getString(KEY, null)); }
    static synchronized JSONObject snapshot(Context context) throws JSONException { return load(context).snapshot(); }
    static synchronized JSONObject synchronize(Context context, JSONObject payload) throws JSONException {
        TrackerJournal journal = load(context);
        boolean accepted = journal.synchronize(payload);
        if (accepted) save(context, journal, payload.optString("theme", "light"));
        return journal.snapshot().put("accepted", accepted);
    }
    static synchronized boolean act(Context context, String action, String owner, String entryId, long revision) throws JSONException {
        TrackerJournal journal = load(context);
        if (!journal.act(action, owner, entryId, revision, System.currentTimeMillis())) return false;
        save(context, journal, null);
        return true;
    }
    private static void save(Context context, TrackerJournal journal, String theme) throws JSONException {
        JSONObject entry = journal.snapshot().optJSONObject("entry");
        long now = System.currentTimeMillis();
        SharedPreferences.Editor editor = TrackerWidget.prefs(context).edit().putString(KEY, journal.encode())
            .putString("title", entry == null ? "moa" : entry.optString("title", "Untitled task"))
            .putString("entryId", entry == null ? "" : entry.optString("id"))
            .putString("status", entry == null ? "idle" : TrackerJournal.paused(entry) ? "paused" : "running")
            .putLong("elapsedMs", TrackerJournal.elapsed(entry, now)).putLong("snapshotAt", now);
        if (theme != null) editor.putString("theme", theme);
        if (!editor.commit()) throw new JSONException("Could not save widget records");
    }
}
