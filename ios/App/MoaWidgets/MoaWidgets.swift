import SwiftUI
import WidgetKit
import AppIntents

@available(iOS 17.0, *)
struct MoaControlIntent: AppIntent {
    static var title: LocalizedStringResource = "Control moa timer"
    static var openAppWhenRun: Bool = false
    @Parameter(title: "Action") var action: String
    @Parameter(title: "Workspace") var owner: String
    @Parameter(title: "Block") var entryId: String
    @Parameter(title: "Revision") var revision: Int
    init() {}
    init(action: String, owner: String, entryId: String, revision: Int) {
        self.action = action; self.owner = owner; self.entryId = entryId; self.revision = revision
    }
    func perform() async throws -> some IntentResult {
        try TrackerJournal.act(action, owner: owner, entryId: entryId, revision: revision)
        WidgetCenter.shared.reloadTimelines(ofKind: "MoaTimer")
        return .result()
    }
}
struct MoaEntry: TimelineEntry {
    let date: Date
    let snapshot: TrackerSnapshot
    var owner: String = "guest"
    var revision: Int = -1
    var enabled: Bool = false
    static func read() -> MoaEntry {
        let journal = (try? TrackerJournal.read()) ?? [:]
        return MoaEntry(date: Date(), snapshot: TrackerJournal.timer(journal), owner: journal["owner"] as? String ?? "guest",
            revision: journal["revision"] as? Int ?? -1, enabled: journal["enabled"] as? Bool ?? false)
    }
}
struct MoaProvider: TimelineProvider {
    func placeholder(in context: Context) -> MoaEntry { MoaEntry(date: Date(), snapshot: .empty) }
    func getSnapshot(in context: Context, completion: @escaping (MoaEntry) -> Void) { completion(.read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MoaEntry>) -> Void) {
        completion(Timeline(entries: [.read()], policy: .after(Date().addingTimeInterval(1800))))
    }
}
struct MoaLogo: View {
    var body: some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 3).stroke(lineWidth: 5).frame(width: 19, height: 19).padding(2)
            ZStack {
                Circle().fill(Color(red: 1, green: 91/255, blue: 36/255))
                Path { path in path.move(to: CGPoint(x: 12,y: 6)); path.addLine(to: CGPoint(x: 12,y: 15)); path.addLine(to: CGPoint(x: 17,y: 12)) }
                    .stroke(Color(red: 244/255, green: 241/255, blue: 234/255), style: StrokeStyle(lineWidth: 3, lineCap: .round))
            }.frame(width: 26,height: 26)
        }.accessibilityLabel("moa")
    }
}
struct MoaWidgetView: View {
    let entry: MoaEntry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var scheme
    private let orange = Color(red: 1, green: 93/255, blue: 34/255)
    private var paper: Color { scheme == .dark ? Color(red: 34/255, green: 37/255, blue: 31/255) : Color(red: 244/255, green: 241/255, blue: 234/255) }
    @ViewBuilder private func control(_ title: String, action: String, enabled: Bool) -> some View {
        if #available(iOS 17.0, *) {
            Button(intent: MoaControlIntent(action: action, owner: entry.owner, entryId: entry.snapshot.entryId, revision: entry.revision)) {
                Text(title).font(.system(size: 12, weight: .semibold)).frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(action == "start" ? orange : Color.primary.opacity(0.07)).cornerRadius(12)
                    .foregroundColor(action == "start" ? .black : .primary)
            }.buttonStyle(.plain).disabled(!enabled || !entry.enabled).opacity(enabled && entry.enabled ? 1 : 0.25)
        } else { Text(title).font(.caption).foregroundColor(.secondary) }
    }
    private var controls: some View {
        HStack(spacing: 6) {
            control("Start", action: "start", enabled: !entry.snapshot.active)
            control(entry.snapshot.status == "paused" ? "Resume" : "Pause", action: entry.snapshot.status == "paused" ? "resume" : "pause", enabled: entry.snapshot.active)
            control("Stop", action: "stop", enabled: entry.snapshot.active)
        }
    }
    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryInline:
            Text("moa · \(entry.snapshot.active ? entry.snapshot.status.capitalized : "Ready")")
        case .accessoryCircular:
            if #available(iOS 17.0, *) {
                Button(intent: MoaControlIntent(action: entry.snapshot.running ? "pause" : entry.snapshot.active ? "resume" : "start",
                    owner: entry.owner, entryId: entry.snapshot.entryId, revision: entry.revision)) {
                    VStack(spacing: 4) { Text("moa").font(.caption.bold()); Image(systemName: entry.snapshot.running ? "pause.fill" : "play.fill") }
                }.buttonStyle(.plain).disabled(!entry.enabled)
            } else { Text("moa") }
        case .accessoryRectangular:
            VStack(alignment: .leading,spacing: 2) { Text("moa").font(.caption.bold()); controls }
        default:
            VStack(alignment: .leading,spacing: 10) {
                HStack { MoaLogo(); if family == .systemMedium { Text("moa").font(.system(size: 24,weight: .bold,design: .rounded)) }; Spacer() }
                Spacer(minLength: 0); controls
                if #unavailable(iOS 17.0) { Text("Controls require iOS 17+").font(.caption2).foregroundColor(.secondary) }
            }.padding(14)
        }
    }
    var body: some View {
        Group {
            if #available(iOS 17.0, *) { content.containerBackground(for: .widget) { paper } }
            else { content.background(family == .systemSmall || family == .systemMedium ? paper : Color.clear) }
        }
    }
}
struct MoaTimerWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoaTimer", provider: MoaProvider()) { MoaWidgetView(entry: $0) }
            .configurationDisplayName("moa controls")
            .description("Start, pause and stop without opening moa. Add task details later in the app.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline, .accessoryCircular, .accessoryRectangular])
            .contentMarginsDisabled()
    }
}
@main struct MoaWidgets: WidgetBundle {
    var body: some Widget { MoaTimerWidget() }
}
