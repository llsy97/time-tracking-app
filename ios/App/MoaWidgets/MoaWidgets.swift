import SwiftUI
import WidgetKit

struct MoaEntry: TimelineEntry {
    let date: Date
    let snapshot: TrackerSnapshot
}
struct MoaProvider: TimelineProvider {
    func placeholder(in context: Context) -> MoaEntry { MoaEntry(date: Date(), snapshot: .empty) }
    func getSnapshot(in context: Context, completion: @escaping (MoaEntry) -> Void) { completion(MoaEntry(date: Date(), snapshot: .read())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MoaEntry>) -> Void) {
        // The OS draws the running timer. Timeline refreshes are only needed
        // for task/state changes, not for each elapsed second.
        completion(Timeline(entries: [MoaEntry(date: Date(), snapshot: .read())], policy: .after(Date().addingTimeInterval(1800))))
    }
}
struct MoaWidgetView: View {
    let entry: MoaEntry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var scheme
    private let orange = Color(red: 1, green: 93/255, blue: 34/255)
    private var paper: Color { scheme == .dark ? Color(red: 34/255, green: 37/255, blue: 31/255) : Color(red: 244/255, green: 241/255, blue: 234/255) }
    @ViewBuilder private var timer: some View {
        if entry.snapshot.running {
            Text(timerInterval: Date().addingTimeInterval(-entry.snapshot.elapsed())...Date.distantFuture, countsDown: false).monospacedDigit()
        } else { Text(entry.snapshot.duration).monospacedDigit() }
    }
    private var nextAction: String { entry.snapshot.running ? "pause" : entry.snapshot.active ? "resume" : "start" }
    private var nextLabel: String { entry.snapshot.running ? "Pause" : entry.snapshot.active ? "Resume" : "Start" }
    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryInline:
            HStack { Image(systemName: entry.snapshot.running ? "timer" : "pause.circle"); timer }
        case .accessoryCircular:
            VStack(spacing: 2) { Image(systemName: entry.snapshot.running ? "timer" : "pause.circle"); timer.font(.caption2).minimumScaleFactor(0.6) }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 3) { Text(entry.snapshot.title).font(.caption).lineLimit(1).privacySensitive(); timer.font(.title3.weight(.semibold)) }
        default:
            VStack(alignment: .leading, spacing: 8) {
                HStack { Text("moa").font(.system(size: 25, weight: .bold, design: .rounded)); Spacer(); Image(systemName: entry.snapshot.running ? "record.circle" : "timer").foregroundColor(orange) }
                Text(entry.snapshot.title).font(.caption).lineLimit(1).privacySensitive()
                timer.font(.system(size: family == .systemSmall ? 24 : 34, weight: .semibold, design: .monospaced)).minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                if family == .systemMedium {
                    HStack {
                        Link(destination: entry.snapshot.actionURL(nextAction)) { Text(nextLabel).font(.caption.weight(.bold)).frame(maxWidth: .infinity).padding(9).background(orange).foregroundColor(.black).cornerRadius(12) }
                        if entry.snapshot.active { Link("Stop", destination: entry.snapshot.actionURL("stop")).font(.caption.weight(.semibold)).padding(9) }
                    }
                } else { Text(entry.snapshot.status == "paused" ? "Paused · Tap to open" : "Tap to open").font(.caption2).foregroundColor(.secondary) }
            }.padding(14)
        }
    }
    var body: some View {
        Group {
            if #available(iOS 17.0, *) { content.containerBackground(for: .widget) { paper } }
            else { content.background(family == .systemSmall || family == .systemMedium ? paper : Color.clear) }
        }.widgetURL(entry.snapshot.actionURL())
    }
}
struct MoaTimerWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoaTimer", provider: MoaProvider()) { MoaWidgetView(entry: $0) }
            .configurationDisplayName("moa timer")
            .description("See your task and timer. Open moa to start, pause or finish a block.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline, .accessoryCircular, .accessoryRectangular])
            .contentMarginsDisabled()
    }
}
@main struct MoaWidgets: WidgetBundle {
    var body: some Widget { MoaTimerWidget() }
}
