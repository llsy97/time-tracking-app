package app.moa.timetracker;

import android.os.CancellationSignal;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.CustomCredential;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.core.content.ContextCompat;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MoaGoogle")
public class MoaGooglePlugin extends Plugin {
    private CancellationSignal pending;

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || !clientId.endsWith(".apps.googleusercontent.com")) {
            call.reject("Google sign-in is not configured.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (pending != null) { call.reject("A Google sign-in is already in progress."); return; }
            pending = new CancellationSignal();
            GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
            CredentialManager.create(getContext()).getCredentialAsync(getActivity(), request, pending,
                ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        pending = null;
                        try {
                            if (!(response.getCredential() instanceof CustomCredential) ||
                                !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(response.getCredential().getType())) {
                                call.reject("Google returned an unsupported credential."); return;
                            }
                            GoogleIdTokenCredential credential = GoogleIdTokenCredential.createFrom(response.getCredential().getData());
                            JSObject result = new JSObject();
                            result.put("idToken", credential.getIdToken());
                            // The web SDK exchanges this credential with Identity Platform;
                            // the app never trusts a decoded token as a login on its own.
                            call.resolve(result);
                        } catch (Exception error) { call.reject("Google sign-in could not be completed."); }
                    }
                    @Override
                    public void onError(GetCredentialException error) {
                        pending = null;
                        call.reject("Google sign-in was cancelled or unavailable. Check your Google account and try again.");
                    }
                });
        });
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(), null,
            ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override public void onResult(Void result) { call.resolve(); }
                @Override public void onError(ClearCredentialException error) { call.reject("Could not clear Google account selection."); }
            });
    }

    @Override
    protected void handleOnDestroy() {
        if (pending != null) pending.cancel();
        pending = null;
    }
}
