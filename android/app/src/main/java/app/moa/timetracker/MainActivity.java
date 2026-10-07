package app.moa.timetracker;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.View;
import android.content.res.Configuration;
import android.graphics.Color;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MoaGooglePlugin.class);
        registerPlugin(MoaTrackerPlugin.class);
        super.onCreate(savedInstanceState);
        // Keep the entire WebView inside the usable screen, including during
        // scrolling, rotation, folding and keyboard transitions. CSS header
        // padding alone lets scrolled content pass behind the system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View root = findViewById(R.id.moa_screen);
        if (root != null) {
            ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                        | WindowInsetsCompat.Type.ime(), Insets.NONE).build();
            });
            ViewCompat.requestApplyInsets(root);
        }
        if (bridge != null) bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        applyTrackerAppearance();
    }

    void applyTrackerAppearance() {
        if (bridge == null) return;
        boolean dark = "dark".equals(TrackerWidget.prefs(this).getString("theme", "light"));
        int background = Color.parseColor(dark ? "#0E0E0C" : "#F4F1EA");
        View root = findViewById(R.id.moa_screen);
        if (root != null) root.setBackgroundColor(background);
        bridge.getWebView().setBackgroundColor(background);
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        applyTrackerAppearance();
        View root = findViewById(R.id.moa_screen);
        if (root != null) ViewCompat.requestApplyInsets(root);
    }

    @Override public void onResume() {
        super.onResume();
        applyTrackerAppearance();
    }
}
