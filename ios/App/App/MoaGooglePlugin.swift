import Capacitor
import GoogleSignIn

@objc(MoaGooglePlugin)
public class MoaGooglePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MoaGooglePlugin"
    public let jsName = "MoaGoogle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]
    private var signingIn = false
    @objc func signIn(_ call: CAPPluginCall) {
        guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String, clientID.hasSuffix(".apps.googleusercontent.com") else {
            call.reject("Google sign-in for iPhone is awaiting an iOS OAuth client. Email sign-in is available."); return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let controller = self.bridge?.viewController else { call.reject("Could not open sign-in."); return }
            guard !self.signingIn else { call.reject("Sign-in is already in progress."); return }
            self.signingIn = true
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID, serverClientID: call.getString("clientId"))
            GIDSignIn.sharedInstance.signIn(withPresenting: controller) { [weak self] result, error in
                self?.signingIn = false
                if let error = error { call.reject(error.localizedDescription, "GOOGLE_SIGN_IN_FAILED", error); return }
                guard let token = result?.user.idToken?.tokenString else { call.reject("Google did not return an identity token."); return }
                call.resolve(["idToken": token])
            }
        }
    }
    @objc func signOut(_ call: CAPPluginCall) {
        DispatchQueue.main.async { GIDSignIn.sharedInstance.signOut(); call.resolve() }
    }
}
