import SwiftUI
import SwiftData
import Charts

/// Per-exercise progress: current bests, estimated 1RM trend, and every session
/// the movement appeared in.
struct ExerciseDetailView: View {
    let exercise: Exercise

    @Environment(AppSettings.self) private var settings

    @Query(sort: \Workout.startedAt, order: .reverse)
    private var workouts: [Workout]

    @State private var showingEditor = false

    private var history: [(date: Date, valueKg: Double)] {
        Stats.oneRepMaxHistory(for: exercise, in: workouts)
    }

    private var record: Stats.PersonalRecord? {
        Stats.personalRecord(for: exercise, in: workouts)
    }

    /// Sessions containing this exercise, newest first.
    private var appearances: [(workout: Workout, entry: WorkoutEntry)] {
        workouts.compactMap { workout in
            guard !workout.isActive,
                  let entry = workout.entries.first(where: {
                      $0.exercise?.persistentModelID == exercise.persistentModelID
                  }),
                  !entry.completedSets.isEmpty
            else { return nil }
            return (workout, entry)
        }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    StatTile(
                        title: "Est. 1RM",
                        value: record.map { Format.weight($0.bestOneRepMaxKg, unit: settings.unit) } ?? "—",
                        caption: "best",
                        systemImage: "trophy"
                    )
                    StatTile(
                        title: "Top Set",
                        value: record.map {
                            "\(Format.weight($0.bestSetWeightKg, unit: settings.unit)) × \($0.bestSetReps)"
                        } ?? "—",
                        caption: "heaviest",
                        systemImage: "scalemass"
                    )
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowBackground(Color.clear)
            }

            if history.count >= 2 {
                Section("Estimated 1RM") {
                    Chart(history, id: \.date) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("1RM", settings.unit.fromKilograms(point.valueKg))
                        )
                        .interpolationMethod(.monotone)
                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("1RM", settings.unit.fromKilograms(point.valueKg))
                        )
                        .symbolSize(24)
                    }
                    .chartYAxisLabel(settings.unit.label)
                    .frame(height: 180)
                    .padding(.vertical, 6)
                }
            }

            Section("Details") {
                LabeledContent("Muscle group", value: exercise.muscleGroup.label)
                LabeledContent("Equipment", value: exercise.equipment.label)
                if !exercise.notes.isEmpty {
                    Text(exercise.notes)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Section("History") {
                if appearances.isEmpty {
                    Text("No logged sets yet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(appearances, id: \.workout.persistentModelID) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.workout.startedAt, format: .dateTime.month().day().year())
                                .font(.subheadline.weight(.medium))
                            Text(setSummary(for: item.entry))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { showingEditor = true }
            }
        }
        .sheet(isPresented: $showingEditor) {
            ExerciseEditorView(exercise: exercise)
        }
    }

    private func setSummary(for entry: WorkoutEntry) -> String {
        entry.completedSets
            .map { "\(Format.weightValue($0.weightKg, unit: settings.unit))×\($0.reps)" }
            .joined(separator: "  ")
    }
}
