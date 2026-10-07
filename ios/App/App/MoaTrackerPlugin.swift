import Capacitor
import WidgetKit
import UIKit

enum MoaWidgetRouter {
    static var pending: [String: String]?
    static let received = Notification.Name("moa.widget.action")
    @discardableResult static func handle(_ url: URL) -> Bool {
        guard url.scheme == "moa", url.host == "tracker", let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let items = parts.queryItems ?? []
        let key = items.first(where: { $0.name == "key" })?.value ?? ""
        guard !key.isEmpty, key == TrackerSnapshot.defaults?.string(forKey: "actionKey") else { return true }
        let action = items.first(where: { $0.name == "action" })?.value ?? "open"
        guard ["open", "start", "pause", "resume", "stop"].contains(action) else { return true }
        pending = ["action": action, "entryId": items.first(where: { $0.name == "entryId" })?.value ?? ""]
        NotificationCenter.default.post(name: received, object: nil)
        return true
    }
}

@objc(MoaTrackerPlugin)
public class MoaTrackerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MoaTrackerPlugin"
    public let jsName = "MoaTracker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pinWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeAction", returnType: CAPPluginReturnPromise)
    ]
    private var observer: NSObjectProtocol?
    public override func load() {
        if TrackerSnapshot.defaults?.string(forKey: "actionKey") == nil {
            TrackerSnapshot.defaults?.set(UUID().uuidString, forKey: "actionKey")
        }
        observer = NotificationCenter.default.addObserver(forName: MoaWidgetRouter.received, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("widgetAction", data: [:])
        }
    }
    deinit { if let observer = observer { NotificationCenter.default.removeObserver(observer) } }
    @objc func update(_ call: CAPPluginCall) {
        do {
            let result = try TrackerJournal.synchronize(call.jsObjectRepresentation)
            if result["accepted"] as? Bool == true {
                WidgetCenter.shared.reloadTimelines(ofKind: "MoaTimer")
                DispatchQueue.main.async { [weak self] in
                    (self?.bridge?.viewController as? MoaViewController)?.applyAppearance(dark: call.getString("theme") == "dark")
                }
            }
            call.resolve(result)
        } catch { call.reject("Could not save widget records. Check App Group provisioning.", nil, error) }
    }
    @objc func getSnapshot(_ call: CAPPluginCall) {
        do { call.resolve(try TrackerJournal.read()) }
        catch { call.reject("Could not read widget records. Check App Group provisioning.", nil, error) }
    }
    @objc func getSettings(_ call: CAPPluginCall) { call.resolve(["notifications": false, "lockScreenWidgets": true]) }
    @objc func pinWidget(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
    @objc func consumeAction(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let action = MoaWidgetRouter.pending ?? [:]
            MoaWidgetRouter.pending = nil
            call.resolve(action)
        }
    }
}
