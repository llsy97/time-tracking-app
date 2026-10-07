package app.moa.timetracker;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.time.Instant;
import java.util.UUID;
import java.util.ArrayList;
import java.util.Comparator;

/** Durable widget changes, acknowledged only after the WebView has saved them. */
public final class TrackerJournal {
    private final JSONObject data;
    public TrackerJournal(String saved) throws JSONException {
        data = saved == null ? new JSONObject() : new JSONObject(saved);
        if (!data.has("revision")) data.put("revision", 0L);
        if (!data.has("pending")) data.put("pending", new JSONArray());
    }
    public String encode() { return data.toString(); }
    public JSONObject snapshot() throws JSONException { return new JSONObject(data.toString()); }
    public boolean synchronize(JSONObject payload) throws JSONException {
        if (data.getJSONArray("pending").length() > 0 && payload.optLong("revision", -1) != data.getLong("revision")) return false;
        JSONObject entry = payload.optJSONObject("entry"), draft = payload.optJSONObject("draft");
        String owner = payload.optString("owner", "guest");
        boolean changed = !owner.equals(data.optString("owner"))
            || !String.valueOf(entry).equals(String.valueOf(data.optJSONObject("entry")))
            || !String.valueOf(draft).equals(String.valueOf(data.optJSONObject("draft")));
        data.put("owner", owner).put("entry", entry == null ? JSONObject.NULL : entry)
            .put("draft", draft == null ? new JSONObject() : draft).put("enabled", true)
            .put("pending", new JSONArray());
        if (changed) data.put("revision", data.getLong("revision") + 1);
        return true;
    }
    public boolean act(String action, String owner, String entryId, long revision, long now) throws JSONException {
        if (!data.optBoolean("enabled") || !owner.equals(data.optString("owner")) || revision != data.getLong("revision")) return false;
        JSONObject entry = data.optJSONObject("entry");
        if ("start".equals(action)) {
            if (entry != null || !entryId.isEmpty()) return false;
            JSONObject draft = data.optJSONObject("draft");
            String title = draft == null ? "" : draft.optString("title").trim();
            entry = new JSONObject().put("id", UUID.randomUUID().toString()).put("title", title.isEmpty() ? "Untitled task" : title)
                .put("description", draft == null ? "" : draft.optString("description").trim())
                .put("startedAt", Instant.ofEpochMilli(now).toString()).put("endedAt", JSONObject.NULL);
        } else {
            if (entry == null || !entryId.equals(entry.optString("id"))) return false;
            now = Math.max(now, Instant.parse(entry.getString("startedAt")).toEpochMilli());
            JSONArray pauses = entry.optJSONArray("pauses");
            if (pauses == null) pauses = new JSONArray();
            JSONObject pendingPause = null;
            for (int i = 0; i < pauses.length(); i++) if (pauses.getJSONObject(i).isNull("endedAt")) pendingPause = pauses.getJSONObject(i);
            if ("pause".equals(action)) {
                if (pendingPause != null) return false;
                pauses.put(new JSONObject().put("startedAt", Instant.ofEpochMilli(now).toString()).put("endedAt", JSONObject.NULL));
            } else if ("resume".equals(action) || "stop".equals(action)) {
                if ("resume".equals(action) && pendingPause == null) return false;
                if (pendingPause != null) pendingPause.put("endedAt", Instant.ofEpochMilli(Math.max(now, Instant.parse(pendingPause.getString("startedAt")).toEpochMilli())).toString());
                if ("stop".equals(action)) entry.put("endedAt", Instant.ofEpochMilli(now).toString());
            } else return false;
            entry.put("pauses", pauses);
        }
        data.put("revision", data.getLong("revision") + 1);
        JSONObject change = new JSONObject().put("owner", owner).put("entry", new JSONObject(entry.toString()));
        if ("stop".equals(action)) {
            JSONObject draft = new JSONObject().put("title", "").put("description", "");
            data.put("draft", draft); change.put("draft", draft);
        }
        data.getJSONArray("pending").put(change);
        data.put("entry", "stop".equals(action) ? JSONObject.NULL : entry);
        return true;
    }
    public static long elapsed(JSONObject entry, long now) throws JSONException {
        if (entry == null) return 0;
        long start = Instant.parse(entry.getString("startedAt")).toEpochMilli();
        long end = entry.isNull("endedAt") ? now : Instant.parse(entry.getString("endedAt")).toEpochMilli();
        long duration = Math.max(0, end - start), cursor = start;
        JSONArray pauses = entry.optJSONArray("pauses");
        ArrayList<JSONObject> ordered = new ArrayList<>();
        if (pauses != null) for (int i = 0; i < pauses.length(); i++) ordered.add(pauses.getJSONObject(i));
        ordered.sort(Comparator.comparingLong(pause -> Instant.parse(pause.optString("startedAt")).toEpochMilli()));
        for (JSONObject pause : ordered) {
            long lo = Math.max(cursor, Math.max(start, Instant.parse(pause.getString("startedAt")).toEpochMilli()));
            long hi = Math.min(end, pause.isNull("endedAt") ? end : Instant.parse(pause.getString("endedAt")).toEpochMilli());
            if (hi > lo) duration -= hi - lo;
            cursor = Math.max(cursor, hi);
        }
        return Math.max(0, duration);
    }
    public static boolean paused(JSONObject entry) throws JSONException {
        if (entry == null) return false;
        JSONArray pauses = entry.optJSONArray("pauses");
        if (pauses != null) for (int i = 0; i < pauses.length(); i++) if (pauses.getJSONObject(i).isNull("endedAt")) return true;
        return false;
    }
}
