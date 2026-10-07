package app.moa.timetracker;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MoaGooglePlugin.class);
        registerPlugin(MoaTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
