import SwiftUI
import SwiftData

/// Read-only view of a finished session.
struct WorkoutDetailView: View {
    let workout: Workout

    @Environment(AppSettings.self) private var settings

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    StatTile(
                        title: "Duration",
                        value: Format.shortDuration(workout.duration),
                        systemImage: "timer"
                    )
                    StatTile(
                        title: "Volume",
                        value: Format.volume(workout.totalVolumeKg, unit: settings.unit),
                        systemImage: "scalemass"
                    )
                    StatTile(
                        title: "Sets",
                        value: "\(workout.completedSetCount)",
                        systemImage: "checkmark.circle"
                    )
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowBackground(Color.clear)
            }

            ForEach(workout.orderedEntries) { entry in
                Section(entry.displayName) {
                    ForEach(entry.orderedSets) { set in
                        HStack {
                            Text(set.isWarmup ? "Warm-up" : "Set \(set.order + 1)")
                                .font(.subheadline)
                                .foregroundStyle(set.isWarmup ? .orange : .secondary)
                            Spacer()
                            Text("\(Format.weight(set.weightKg, unit: settings.unit)) × \(set.reps)")
                                .font(.subheadline.weight(.medium))
                                .monospacedDigit()
                        }
                    }
                    if let best = entry.bestEstimatedOneRepMaxKg {
                        LabeledContent(
                            "Est. 1RM",
                            value: Format.weight(best, unit: settings.unit)
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
            }

            if !workout.notes.isEmpty {
                Section("Notes") {
                    Text(workout.notes)
                }
            }
        }
        .navigationTitle(workout.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
