import SwiftUI
import SwiftData

/// Home screen: resume or start a session, and a glance at the week so far.
struct TodayView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings

    @Query(filter: #Predicate<Workout> { $0.endedAt == nil })
    private var activeWorkouts: [Workout]

    @Query(sort: \Workout.startedAt, order: .reverse)
    private var allWorkouts: [Workout]

    @Query(sort: \Routine.name)
    private var routines: [Routine]

    @State private var presentedWorkout: Workout?
    @State private var showingSettings = false
    @State private var editingRoutine: Routine?

    private var activeWorkout: Workout? { activeWorkouts.first }

    var body: some View {
        NavigationStack {
            List {
                Section { weekSummary.listRowInsets(EdgeInsets()) }
                    .listRowBackground(Color.clear)

                if let activeWorkout {
                    Section { resumeCard(for: activeWorkout) }
                } else {
                    Section {
                        Button {
                            let workout = WorkoutFactory.startEmpty(in: context)
                            presentedWorkout = workout
                        } label: {
                            Label("Start Empty Workout", systemImage: "plus.circle.fill")
                                .font(.headline)
                        }
                    }
                }

                Section {
                    if routines.isEmpty {
                        Text("No routines yet. Create one to start a session with your exercises already laid out.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(routines) { routine in
                            routineRow(routine)
                        }
                        .onDelete(perform: deleteRoutines)
                    }
                } header: {
                    HStack {
                        Text("Routines")
                        Spacer()
                        Button {
                            let routine = Routine(name: "New Routine")
                            context.insert(routine)
                            editingRoutine = routine
                        } label: {
                            Label("New routine", systemImage: "plus")
                                .labelStyle(.iconOnly)
                        }
                    }
                }
            }
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Settings")
                }
            }
            .fullScreenCover(item: $presentedWorkout) { workout in
                ActiveWorkoutView(workout: workout)
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
            .sheet(item: $editingRoutine) { routine in
                RoutineEditorView(routine: routine)
            }
        }
    }

    private var weekSummary: some View {
        let calendar = Calendar.current
        let weekStart = calendar.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        let thisWeek = allWorkouts.filter { !$0.isActive && $0.startedAt >= weekStart }
        let volume = thisWeek.reduce(0) { $0 + $1.totalVolumeKg }

        return HStack(spacing: 10) {
            StatTile(
                title: "Sessions",
                value: "\(thisWeek.count)",
                caption: "this week",
                systemImage: "calendar"
            )
            StatTile(
                title: "Volume",
                value: Format.volume(volume, unit: settings.unit),
                caption: "this week",
                systemImage: "scalemass"
            )
            StatTile(
                title: "Streak",
                value: "\(Stats.weeklyStreak(for: allWorkouts))",
                caption: "weeks",
                systemImage: "flame",
                tint: .orange
            )
        }
        .padding(.horizontal)
        .padding(.vertical, 4)
    }

    private func resumeCard(for workout: Workout) -> some View {
        Button {
            presentedWorkout = workout
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("In progress")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                    Text(workout.name)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text("\(workout.completedSetCount) sets · started \(workout.startedAt, style: .relative) ago")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func routineRow(_ routine: Routine) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(routine.name)
                    .font(.body.weight(.medium))
                Text(routine.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button("Start") {
                let workout = WorkoutFactory.start(from: routine, in: context)
                presentedWorkout = workout
            }
            // An explicit style keeps this button tappable on its own inside a
            // row that also has a tap gesture.
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .contentShape(Rectangle())
        .onTapGesture { editingRoutine = routine }
        .disabled(activeWorkout != nil)
    }

    private func deleteRoutines(at offsets: IndexSet) {
        for index in offsets {
            context.delete(routines[index])
        }
    }
}
