import SwiftUI
import SwiftData

/// Every finished session, newest first, bucketed by month.
struct HistoryView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings

    @Query(filter: #Predicate<Workout> { $0.endedAt != nil },
           sort: \Workout.startedAt, order: .reverse)
    private var workouts: [Workout]

    private var months: [(title: String, workouts: [Workout])] {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"

        var order: [String] = []
        var buckets: [String: [Workout]] = [:]
        for workout in workouts {
            let key = formatter.string(from: workout.startedAt)
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: []].append(workout)
        }
        return order.map { ($0, buckets[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if workouts.isEmpty {
                    EmptyStateView(
                        systemImage: "clock.arrow.circlepath",
                        title: "No workouts yet",
                        message: "Finished sessions show up here with their volume and sets."
                    )
                } else {
                    List {
                        ForEach(months, id: \.title) { month in
                            Section(month.title) {
                                ForEach(month.workouts) { workout in
                                    NavigationLink {
                                        WorkoutDetailView(workout: workout)
                                    } label: {
                                        row(workout)
                                    }
                                }
                                .onDelete { offsets in
                                    delete(offsets, in: month.workouts)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("History")
        }
    }

    private func row(_ workout: Workout) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(workout.name)
                    .font(.body.weight(.medium))
                Spacer()
                Text(workout.startedAt, format: .dateTime.month(.abbreviated).day())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text("\(workout.entries.count) exercises · \(workout.completedSetCount) sets · \(Format.volume(workout.totalVolumeKg, unit: settings.unit)) · \(Format.shortDuration(workout.duration))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func delete(_ offsets: IndexSet, in list: [Workout]) {
        for index in offsets {
            context.delete(list[index])
        }
    }
}
