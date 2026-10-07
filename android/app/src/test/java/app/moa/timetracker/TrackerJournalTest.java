package app.moa.timetracker;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class TrackerJournalTest {
    private JSONObject payload(long revision, String owner, JSONObject entry) throws Exception {
        return new JSONObject().put("revision",revision).put("owner",owner).put("entry",entry==null?JSONObject.NULL:entry)
            .put("draft",new JSONObject().put("title","").put("description",""));
    }
    private boolean act(TrackerJournal journal,String action,long now) throws Exception {
        JSONObject state=journal.snapshot(),entry=state.optJSONObject("entry");
        return journal.act(action,state.getString("owner"),entry==null?"":entry.getString("id"),state.getLong("revision"),now);
    }
    @Test public void tracksAndExcludesBreaksAcrossProcessRestart() throws Exception {
        TrackerJournal journal=new TrackerJournal(null);
        assertTrue(journal.synchronize(payload(-1,"guest",null)));
        assertTrue(act(journal,"start",0));
        assertEquals("Untitled task",journal.snapshot().getJSONObject("entry").getString("title"));
        assertTrue(act(journal,"pause",420000));
        journal=new TrackerJournal(journal.encode());
        assertEquals(420000,TrackerJournal.elapsed(journal.snapshot().getJSONObject("entry"),420000+3600000));
        assertTrue(act(journal,"resume",420000+3600000));
        assertTrue(act(journal,"stop",840000+3600000));
        assertTrue(journal.snapshot().isNull("entry"));
        JSONObject saved=journal.snapshot().getJSONArray("pending").getJSONObject(3).getJSONObject("entry");
        assertEquals(840000,TrackerJournal.elapsed(saved,99999999));
    }
    @Test public void staleSnapshotCannotDiscardUnacknowledgedRecords() throws Exception {
        TrackerJournal journal=new TrackerJournal(null);
        journal.synchronize(payload(-1,"guest",null));
        long revision=journal.snapshot().getLong("revision");
        act(journal,"start",1000);act(journal,"stop",2000);
        assertFalse(journal.synchronize(payload(revision,"guest",null)));
        assertEquals(2,journal.snapshot().getJSONArray("pending").length());
        // Once the app has saved those records, its acknowledgement may clear them.
        assertTrue(journal.synchronize(payload(journal.snapshot().getLong("revision"),"guest",null)));
        assertEquals(0,journal.snapshot().getJSONArray("pending").length());
    }
    @Test public void repeatedAndOldAccountControlsAreIgnored() throws Exception {
        TrackerJournal journal=new TrackerJournal(null);
        journal.synchronize(payload(-1,"account-a",null));
        long revision=journal.snapshot().getLong("revision");
        assertFalse(journal.act("start","account-b","",revision,1000));
        assertTrue(journal.act("start","account-a","",revision,1000));
        assertFalse(journal.act("start","account-a","",revision,1001));
        assertFalse(journal.act("stop","account-a","old-id",journal.snapshot().getLong("revision"),2000));
        assertFalse(act(journal,"resume",2000));
        assertEquals(1,journal.snapshot().getJSONArray("pending").length());
    }
    @Test public void stopWhilePausedClosesTheBreakWithoutCountingIt() throws Exception {
        TrackerJournal journal=new TrackerJournal(null);journal.synchronize(payload(-1,"guest",null));
        act(journal,"start",0);act(journal,"pause",60000);act(journal,"stop",3600000);
        JSONObject entry=journal.snapshot().getJSONArray("pending").getJSONObject(2).getJSONObject("entry");
        assertEquals(60000,TrackerJournal.elapsed(entry,3600000));
        assertFalse(entry.getJSONArray("pauses").getJSONObject(0).isNull("endedAt"));
    }
    @Test public void severalBlocksRemainInOrderUntilAppAcknowledgesThem() throws Exception {
        TrackerJournal journal=new TrackerJournal(null);journal.synchronize(payload(-1,"guest",null));
        act(journal,"start",0);act(journal,"stop",60000);act(journal,"start",120000);act(journal,"stop",180000);
        assertEquals(4,journal.snapshot().getJSONArray("pending").length());
        assertNotEquals(journal.snapshot().getJSONArray("pending").getJSONObject(0).getJSONObject("entry").getString("id"),
            journal.snapshot().getJSONArray("pending").getJSONObject(2).getJSONObject("entry").getString("id"));
    }
    @Test public void uninitializedWidgetCannotStartBeforeWorkspaceMigration() throws Exception {
        TrackerJournal journal=new TrackerJournal(null);
        assertFalse(journal.act("start","guest","",0,1000));
    }
    @Test public void importedOverlappingBreaksCountOnceRegardlessOfOrder() throws Exception {
        JSONObject entry=new JSONObject("{\"startedAt\":\"1970-01-01T00:00:00Z\",\"endedAt\":\"1970-01-01T01:00:00Z\",\"pauses\":[{\"startedAt\":\"1970-01-01T00:30:00Z\",\"endedAt\":\"1970-01-01T00:40:00Z\"},{\"startedAt\":\"1970-01-01T00:10:00Z\",\"endedAt\":\"1970-01-01T00:20:00Z\"},{\"startedAt\":\"1970-01-01T00:15:00Z\",\"endedAt\":\"1970-01-01T00:35:00Z\"}]}");
        assertEquals(1800000,TrackerJournal.elapsed(entry,3600000));
    }
}
