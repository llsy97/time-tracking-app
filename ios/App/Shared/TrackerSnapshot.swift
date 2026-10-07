import Foundation
import Darwin

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
        if let journal = try? TrackerJournal.read(), journal["enabled"] as? Bool == true { return TrackerJournal.timer(journal) }
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

/// A file lock serializes the app and WidgetKit extension. Pending changes are
/// kept until the WebView acknowledges that it has saved them locally.
enum TrackerJournal {
    enum Failure: Error { case unavailable, invalidTime }
    static func locked<T>(_ operation: (inout [String: Any]) throws -> T) throws -> T {
        guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: TrackerSnapshot.group) else { throw Failure.unavailable }
        let descriptor = open(directory.appendingPathComponent("tracker.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw Failure.unavailable }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw Failure.unavailable }
        defer { flock(descriptor, LOCK_UN) }
        let file = directory.appendingPathComponent("tracker-journal.json")
        var journal: [String: Any]
        if FileManager.default.fileExists(atPath: file.path) {
            guard let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any] else { throw Failure.unavailable }
            journal = saved
        } else { journal = ["revision": 0, "pending": []] }
        let original = try JSONSerialization.data(withJSONObject: journal, options: .sortedKeys)
        let result = try operation(&journal)
        let changed = try JSONSerialization.data(withJSONObject: journal, options: .sortedKeys)
        if changed != original { try changed.write(to: file, options: .atomic) }
        return result
    }
    static func read() throws -> [String: Any] { try locked { $0 } }
    static func synchronize(_ payload: [String: Any]) throws -> [String: Any] {
        try locked { journal in
            let revision = journal["revision"] as? Int ?? 0
            if !(journal["pending"] as? [[String: Any]] ?? []).isEmpty && payload["revision"] as? Int != revision {
                return journal.merging(["accepted": false]) { _, new in new }
            }
            let owner = payload["owner"] as? String ?? "guest"
            let entry = payload["entry"] as? [String: Any]
            let draft = payload["draft"] as? [String: Any] ?? [:]
            let changed = owner != journal["owner"] as? String
                || !NSDictionary(dictionary: entry ?? [:]).isEqual(to: journal["entry"] as? [String: Any] ?? [:])
                || !NSDictionary(dictionary: draft).isEqual(to: journal["draft"] as? [String: Any] ?? [:])
            journal["owner"] = owner; journal["entry"] = entry.map { $0 as Any } ?? NSNull(); journal["draft"] = draft
            journal["enabled"] = true; journal["pending"] = []; journal["revision"] = revision + (changed ? 1 : 0)
            return journal.merging(["accepted": true, "changed": changed]) { _, new in new }
        }
    }
    static func milliseconds(_ value: Any?) throws -> Double {
        guard let text = value as? String else { throw Failure.invalidTime }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date.timeIntervalSince1970 * 1000 }
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: text) else { throw Failure.invalidTime }
        return date.timeIntervalSince1970 * 1000
    }
    static func stamp(_ milliseconds: Double) -> String {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000))
    }
    static func paused(_ entry: [String: Any]) -> Bool { (entry["pauses"] as? [[String: Any]] ?? []).contains { $0["endedAt"] is NSNull || $0["endedAt"] == nil } }
    @discardableResult static func act(_ action: String, owner: String, entryId: String, revision: Int, now: Double = Date().timeIntervalSince1970 * 1000) throws -> Bool {
        try locked { journal in
            guard journal["enabled"] as? Bool == true, owner == journal["owner"] as? String, revision == journal["revision"] as? Int else { return false }
            var entry = journal["entry"] as? [String: Any]
            if action == "start" {
                guard entry == nil, entryId.isEmpty else { return false }
                let draft = journal["draft"] as? [String: Any] ?? [:]
                let title = (draft["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                entry = ["id": UUID().uuidString, "title": title.isEmpty ? "Untitled task" : title,
                    "description": (draft["description"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                    "startedAt": stamp(now), "endedAt": NSNull()]
            } else {
                guard var current = entry, entryId == current["id"] as? String else { return false }
                let end = max(now, try milliseconds(current["startedAt"]))
                var pauses = current["pauses"] as? [[String: Any]] ?? []
                let index = pauses.firstIndex { $0["endedAt"] is NSNull || $0["endedAt"] == nil }
                if action == "pause" {
                    guard index == nil else { return false }; pauses.append(["startedAt": stamp(end), "endedAt": NSNull()])
                } else if action == "resume" || action == "stop" {
                    if action == "resume" && index == nil { return false }
                    if let index { pauses[index]["endedAt"] = stamp(max(end, try milliseconds(pauses[index]["startedAt"]))) }
                    if action == "stop" { current["endedAt"] = stamp(end) }
                } else { return false }
                current["pauses"] = pauses; entry = current
            }
            guard let entry else { return false }
            var change: [String: Any] = ["owner": owner, "entry": entry]
            if action == "stop" {
                let draft = ["title": "", "description": ""]; journal["draft"] = draft; change["draft"] = draft
            }
            var pending = journal["pending"] as? [[String: Any]] ?? []; pending.append(change)
            journal["pending"] = pending; journal["revision"] = revision + 1
            journal["entry"] = action == "stop" ? NSNull() as Any : entry as Any
            return true
        }
    }
    static func timer(_ journal: [String: Any]) -> TrackerSnapshot {
        let now = Date().timeIntervalSince1970 * 1000
        guard let entry = journal["entry"] as? [String: Any], let start = try? milliseconds(entry["startedAt"]) else { return .empty }
        var elapsed = max(0, now - start), cursor = start
        let pauses = (entry["pauses"] as? [[String: Any]] ?? []).sorted { ((try? milliseconds($0["startedAt"])) ?? 0) < ((try? milliseconds($1["startedAt"])) ?? 0) }
        for pause in pauses {
            guard let began = try? milliseconds(pause["startedAt"]) else { continue }
            let lo = max(cursor, max(start, began)), hi = min(now, (try? milliseconds(pause["endedAt"])) ?? now)
            if hi > lo { elapsed -= hi - lo }; cursor = max(cursor, hi)
        }
        return TrackerSnapshot(title: entry["title"] as? String ?? "Untitled task", entryId: entry["id"] as? String ?? "",
            status: paused(entry) ? "paused" : "running", elapsedMs: max(0, elapsed), snapshotAt: now)
    }
}
