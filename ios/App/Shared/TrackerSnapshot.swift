import Foundation

struct TrackerSnapshot: Codable {
    static let group = "group.app.moa.timetracker"
    static let storageKey = "moa.tracker.snapshot"
    static let empty = TrackerSnapshot(title: "Ready for your next task", entryId: "", status: "idle", elapsedMs: 0, snapshotAt: 0)
    let title: String
    let entryId: String
    let status: String
    let elapsedMs: Double
    let snapshotAt: Double

    var active: Bool { status != "idle" }
    var running: Bool { status == "running" }
    func elapsed(at date: Date = Date()) -> TimeInterval {
        max(0, elapsedMs / 1000 + (running ? max(0, date.timeIntervalSince1970 - snapshotAt / 1000) : 0))
    }
    var duration: String {
        let seconds = Int(elapsed())
        return String(format: "%02d:%02d:%02d", seconds / 3600, (seconds / 60) % 60, seconds % 60)
    }
    static var defaults: UserDefaults? { UserDefaults(suiteName: group) }
    static func read() -> TrackerSnapshot {
        guard let data = defaults?.data(forKey: storageKey), let snapshot = try? JSONDecoder().decode(Self.self, from: data) else { return .empty }
        return snapshot
    }
    func actionURL(_ action: String = "open") -> URL {
        var url = URLComponents()
        url.scheme = "moa"
        url.host = "tracker"
        url.queryItems = [URLQueryItem(name: "action", value: action), URLQueryItem(name: "entryId", value: entryId), URLQueryItem(name: "key", value: Self.defaults?.string(forKey: "actionKey") ?? "")]
        return url.url!
    }
}
