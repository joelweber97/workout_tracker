import SwiftUI
import SwiftData
import Charts

/// Training trends. Each chart answers one question and carries one series, so
/// nothing here needs a second y-scale or a colour key to decode.
struct StatsView: View {
    @Environment(AppSettings.self) private var settings

    @Query(filter: #Predicate<Workout> { $0.endedAt != nil },
           sort: \Workout.startedAt, order: .reverse)
    private var workouts: [Workout]

    @State private var window: Window = .twelveWeeks

    enum Window: Int, CaseIterable, Identifiable {
        case eightWeeks = 8
        case twelveWeeks = 12
        case sixMonths = 26

        var id: Int { rawValue }
        var label: String { self == .sixMonths ? "6 mo" : "\(rawValue) wk" }
        var weeks: Int { rawValue }
    }

    private var weekly: [Stats.WeeklyVolume] {
        Stats.weeklyVolume(for: workouts, weeks: window.weeks)
    }

    private var windowStart: Date {
        Calendar.current.date(byAdding: .weekOfYear, value: -window.weeks, to: Date()) ?? .distantPast
    }

    private var sessionsInWindow: [Workout] {
        workouts.filter { $0.startedAt >= windowStart }
    }

    var body: some View {
        NavigationStack {
            Group {
                if workouts.isEmpty {
                    EmptyStateView(
                        systemImage: "chart.xyaxis.line",
                        title: "Nothing to chart yet",
                        message: "Finish a workout or two and your trends will show up here."
                    )
                } else {
                    List {
                        Section {
                            Picker("Range", selection: $window) {
                                ForEach(Window.allCases) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .pickerStyle(.segmented)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                        }

                        Section { summaryTiles }
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0))

                        Section("Volume per week") { volumeChart }
                        Section("Where the volume went") { regionChart }
                        Section("Most trained") { topExercises }
                    }
                }
            }
            .navigationTitle("Stats")
        }
    }

    private var summaryTiles: some View {
        let volume = sessionsInWindow.reduce(0) { $0 + $1.totalVolumeKg }
        let average = sessionsInWindow.isEmpty ? 0 : volume / Double(sessionsInWindow.count)

        return VStack(spacing: 10) {
            HStack(spacing: 10) {
                StatTile(
                    title: "Sessions",
                    value: "\(sessionsInWindow.count)",
                    caption: "last \(window.label)",
                    systemImage: "calendar"
                )
                StatTile(
                    title: "Total volume",
                    value: Format.volume(volume, unit: settings.unit),
                    caption: "last \(window.label)",
                    systemImage: "scalemass"
                )
            }
            HStack(spacing: 10) {
                StatTile(
                    title: "Per session",
                    value: Format.volume(average, unit: settings.unit),
                    caption: "average",
                    systemImage: "chart.bar"
                )
                StatTile(
                    title: "Streak",
                    value: "\(Stats.weeklyStreak(for: workouts))",
                    caption: "weeks running",
                    systemImage: "flame",
                    tint: .orange
                )
            }
        }
        .padding(.vertical, 2)
    }

    /// One measure, one series — the title names it, so no legend.
    private var volumeChart: some View {
        Chart(weekly) { week in
            BarMark(
                x: .value("Week", week.weekStart, unit: .weekOfYear),
                y: .value("Volume", settings.unit.fromKilograms(week.volumeKg))
            )
            .foregroundStyle(Color.accentColor)
            .cornerRadius(4)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(.quaternary)
                AxisValueLabel {
                    if let raw = value.as(Double.self) {
                        Text(compact(raw))
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .weekOfYear, count: max(1, window.weeks / 4))) { value in
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
            }
        }
        .chartYAxisLabel(settings.unit.label)
        .frame(height: 200)
        .padding(.vertical, 8)
    }

    /// Three fixed categories, each direct-labelled — identity never rests on
    /// colour alone, so this needs no legend either.
    private var regionChart: some View {
        let split = Stats.volumeByRegion(for: workouts, since: windowStart)

        return Group {
            if split.isEmpty {
                Text("No completed sets in this range.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Chart(split, id: \.region) { item in
                    BarMark(
                        x: .value("Volume", settings.unit.fromKilograms(item.volumeKg)),
                        y: .value("Region", item.region)
                    )
                    .foregroundStyle(color(for: item.region))
                    .cornerRadius(4)
                    .annotation(position: .trailing) {
                        Text(Format.volume(item.volumeKg, unit: settings.unit))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .chartXAxis(.hidden)
                .frame(height: CGFloat(split.count) * 44)
                .padding(.vertical, 8)
                .padding(.trailing, 44)
            }
        }
    }

    private var topExercises: some View {
        let ranked = rankExercises()

        return Group {
            if ranked.isEmpty {
                Text("No completed sets in this range.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(ranked.prefix(5), id: \.name) { item in
                    HStack {
                        Text(item.name)
                            .lineLimit(1)
                        Spacer()
                        Text("\(item.sets) sets")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(Format.volume(item.volumeKg, unit: settings.unit))
                            .font(.subheadline.weight(.medium))
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    private func rankExercises() -> [(name: String, volumeKg: Double, sets: Int)] {
        var totals: [String: (volume: Double, sets: Int)] = [:]
        for workout in sessionsInWindow {
            for entry in workout.entries {
                guard let name = entry.exercise?.name else { continue }
                let current = totals[name] ?? (0, 0)
                totals[name] = (current.volume + entry.volumeKg, current.sets + entry.completedSets.count)
            }
        }
        return totals
            .map { (name: $0.key, volumeKg: $0.value.volume, sets: $0.value.sets) }
            .sorted { $0.volumeKg > $1.volumeKg }
    }

    private func color(for region: String) -> Color {
        switch region {
        case "Upper": return .blue
        case "Lower": return .orange
        default: return .purple
        }
    }

    /// Axis labels get thousands-abbreviated; full numbers are in the tiles.
    private func compact(_ value: Double) -> String {
        value >= 1000 ? String(format: "%.0fk", value / 1000) : String(Int(value))
    }
}
