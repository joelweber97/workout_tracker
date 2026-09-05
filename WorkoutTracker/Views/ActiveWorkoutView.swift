import SwiftUI
import SwiftData
import Combine
import UIKit

/// The logging screen. Everything here writes straight through to SwiftData, so
/// a crash or a force-quit mid-session loses nothing.
struct ActiveWorkoutView: View {
    @Bindable var workout: Workout

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    @Environment(RestTimer.self) private var restTimer

    @State private var showingExercisePicker = false
    @State private var showingFinishConfirmation = false
    /// Last-session numbers per exercise, resolved once rather than on every
    /// row render — each lookup is a fetch.
    @State private var previousSummaries: [PersistentIdentifier: String] = [:]
    @State private var elapsed: TimeInterval = 0

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                List {
                    summarySection

                    ForEach(workout.orderedEntries) { entry in
                        entrySection(entry)
                    }

                    Section {
                        Button {
                            showingExercisePicker = true
                        } label: {
                            Label("Add Exercise", systemImage: "plus.circle.fill")
                        }
                    }

                    Section("Notes") {
                        TextField("How did it feel?", text: $workout.notes, axis: .vertical)
                            .lineLimit(2...5)
                    }
                }
                .listStyle(.insetGrouped)
                .scrollDismissesKeyboard(.interactively)

                if restTimer.isRunning {
                    RestTimerBar()
                        .padding(.bottom, 8)
                }
            }
            .animation(.snappy, value: restTimer.isRunning)
            .navigationTitle($workout.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Finish") { showingFinishConfirmation = true }
                        .font(.body.weight(.semibold))
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { hideKeyboard() }
                }
            }
            .sheet(isPresented: $showingExercisePicker) {
                ExercisePickerView { exercise in
                    WorkoutFactory.addExercise(exercise, to: workout, in: context)
                    refreshPreviousSummary(for: exercise)
                }
            }
            .confirmationDialog(
                "Finish this workout?",
                isPresented: $showingFinishConfirmation,
                titleVisibility: .visible
            ) {
                Button("Finish") { finish() }
                Button("Discard Workout", role: .destructive) { discard() }
                Button("Keep Going", role: .cancel) {}
            } message: {
                Text("Sets you haven't checked off won't be saved.")
            }
            .task {
                elapsed = workout.duration
                await loadPreviousSummaries()
            }
            .onReceive(ticker) { _ in elapsed = workout.duration }
        }
        .interactiveDismissDisabled()
    }

    private var summarySection: some View {
        Section {
            HStack(spacing: 10) {
                StatTile(
                    title: "Elapsed",
                    value: Format.duration(elapsed),
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
    }

    private func entrySection(_ entry: WorkoutEntry) -> some View {
        Section {
            columnHeader

            ForEach(entry.orderedSets) { set in
                SetRowView(
                    set: set,
                    unit: settings.unit,
                    previousSummary: previousSummary(for: entry),
                    onComplete: { completed in
                        if completed { startRest() }
                    }
                )
            }
            .onDelete { offsets in delete(offsets, from: entry) }

            Button {
                WorkoutFactory.addSet(to: entry, in: context)
            } label: {
                Label("Add Set", systemImage: "plus")
                    .font(.subheadline)
            }
        } header: {
            HStack {
                Text(entry.displayName)
                Spacer()
                Menu {
                    Button {
                        let set = WorkoutFactory.addSet(to: entry, in: context)
                        set.isWarmup = true
                    } label: {
                        Label("Add Warm-up Set", systemImage: "flame")
                    }
                    Button(role: .destructive) {
                        context.delete(entry)
                    } label: {
                        Label("Remove Exercise", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Options for \(entry.displayName)")
            }
        }
    }

    private var columnHeader: some View {
        HStack(spacing: 10) {
            Text("Set").frame(width: 24)
            Text("Prev").frame(width: 68, alignment: .leading)
            Text(settings.unit.label.uppercased()).frame(maxWidth: .infinity)
            Text("REPS").frame(maxWidth: .infinity)
            Color.clear.frame(width: 22)
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.tertiary)
        .listRowBackground(Color.clear)
    }

    // MARK: - Actions

    private func startRest() {
        guard settings.defaultRestSeconds > 0 else { return }
        restTimer.hapticsEnabled = settings.hapticsEnabled
        restTimer.start(seconds: settings.defaultRestSeconds)
        if settings.hapticsEnabled {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private func delete(_ offsets: IndexSet, from entry: WorkoutEntry) {
        let ordered = entry.orderedSets
        for index in offsets {
            context.delete(ordered[index])
        }
        // Renumber so the remaining sets read 1, 2, 3 rather than skipping one.
        for (index, set) in ordered.enumerated() where !offsets.contains(index) {
            set.order = index
        }
    }

    private func finish() {
        restTimer.stop()
        WorkoutFactory.finish(workout, in: context)
        dismiss()
    }

    private func discard() {
        restTimer.stop()
        context.delete(workout)
        dismiss()
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil
        )
    }

    // MARK: - Previous performance

    private func previousSummary(for entry: WorkoutEntry) -> String? {
        guard let id = entry.exercise?.persistentModelID else { return nil }
        return previousSummaries[id]
    }

    private func loadPreviousSummaries() async {
        for entry in workout.entries {
            guard let exercise = entry.exercise else { continue }
            refreshPreviousSummary(for: exercise)
        }
    }

    private func refreshPreviousSummary(for exercise: Exercise) {
        guard let set = WorkoutFactory.lastPerformance(of: exercise, before: workout, in: context) else { return }
        let weight = Format.weightValue(set.weightKg, unit: settings.unit)
        previousSummaries[exercise.persistentModelID] = "\(weight) × \(set.reps)"
    }
}
