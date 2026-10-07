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
        guard let shared = TrackerSnapshot.defaults else { call.reject("Enable the moa App Group on both app and widget targets."); return }
        let snapshot = TrackerSnapshot(title: call.getString("title") ?? TrackerSnapshot.empty.title,
            entryId: call.getString("entryId") ?? "", status: call.getString("status") ?? "idle",
            elapsedMs: call.getDouble("elapsedMs") ?? 0, snapshotAt: call.getDouble("snapshotAt") ?? Date().timeIntervalSince1970 * 1000)
        guard let data = try? JSONEncoder().encode(snapshot) else { call.reject("Could not save widget state."); return }
        shared.set(data, forKey: TrackerSnapshot.storageKey)
        WidgetCenter.shared.reloadTimelines(ofKind: "MoaTimer")
        DispatchQueue.main.async { [weak self] in
            (self?.bridge?.viewController as? MoaViewController)?.applyAppearance(dark: call.getString("theme") == "dark")
        }
        call.resolve()
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
