import Foundation
import SwiftData

/// Creation logic shared by the several places a workout can be started from.
/// Lives outside the views so "start a workout" means one thing everywhere.
enum WorkoutFactory {

    @discardableResult
    static func startEmpty(in context: ModelContext, name: String = "Workout") -> Workout {
        let workout = Workout(name: name)
        context.insert(workout)
        return workout
    }

    /// Builds a session pre-populated with the routine's exercises and the right
    /// number of blank sets, so the user only has to fill in weight and reps.
    @discardableResult
    static func start(from routine: Routine, in context: ModelContext) -> Workout {
        let workout = Workout(name: routine.name)
        context.insert(workout)

        for item in routine.orderedItems {
            let entry = WorkoutEntry(exercise: item.exercise, order: item.order)
            context.insert(entry)
            entry.workout = workout

            for index in 0..<max(1, item.targetSets) {
                let set = SetEntry(order: index, reps: item.targetReps)
                context.insert(set)
                set.entry = entry
            }
        }

        routine.lastUsedAt = Date()
        return workout
    }

    @discardableResult
    static func addExercise(_ exercise: Exercise, to workout: Workout, in context: ModelContext) -> WorkoutEntry {
        let nextOrder = (workout.entries.map(\.order).max() ?? -1) + 1
        let entry = WorkoutEntry(exercise: exercise, order: nextOrder)
        context.insert(entry)
        entry.workout = workout

        // Seed one set carrying the last weight/reps used for this movement, so
        // repeating a session is a matter of ticking boxes.
        let previous = lastPerformance(of: exercise, before: workout, in: context)
        let set = SetEntry(order: 0, reps: previous?.reps ?? 0, weightKg: previous?.weightKg ?? 0)
        context.insert(set)
        set.entry = entry
        return entry
    }

    /// Appends a set, copying the previous set's numbers as the starting point.
    @discardableResult
    static func addSet(to entry: WorkoutEntry, in context: ModelContext) -> SetEntry {
        let ordered = entry.orderedSets
        let nextOrder = (ordered.map(\.order).max() ?? -1) + 1
        let template = ordered.last(where: { !$0.isWarmup }) ?? ordered.last
        let set = SetEntry(
            order: nextOrder,
            reps: template?.reps ?? 0,
            weightKg: template?.weightKg ?? 0
        )
        context.insert(set)
        set.entry = entry
        return set
    }

    /// The most recent completed working set for an exercise, ignoring the
    /// session currently in progress.
    static func lastPerformance(
        of exercise: Exercise,
        before workout: Workout?,
        in context: ModelContext
    ) -> SetEntry? {
        var descriptor = FetchDescriptor<Workout>(
            sortBy: [SortDescriptor(\.startedAt, order: .reverse)]
        )
        descriptor.fetchLimit = 40

        guard let workouts = try? context.fetch(descriptor) else { return nil }
        for candidate in workouts {
            if candidate.persistentModelID == workout?.persistentModelID { continue }
            guard candidate.endedAt != nil else { continue }
            let sets = candidate.entries
                .filter { $0.exercise?.persistentModelID == exercise.persistentModelID }
                .flatMap(\.completedSets)
            if let best = sets.max(by: { $0.weightKg < $1.weightKg }) {
                return best
            }
        }
        return nil
    }

    /// Ends a session, discarding it entirely if nothing was actually logged —
    /// an empty shell in the history list is just noise.
    static func finish(_ workout: Workout, in context: ModelContext) {
        // Decide everything up front: deleting out of a relationship while also
        // reading through it makes the result depend on when SwiftData
        // propagates the change.
        let loggedSetCount = workout.completedSetCount
        let abandonedSets = workout.entries.flatMap(\.sets).filter { !$0.isCompleted }
        let emptyEntries = workout.entries.filter { $0.completedSets.isEmpty }

        if loggedSetCount == 0 {
            // The cascade delete rules take the entries and sets with it.
            context.delete(workout)
            return
        }

        // Sets that were planned but never performed shouldn't enter history.
        for set in abandonedSets { context.delete(set) }
        for entry in emptyEntries { context.delete(entry) }
        workout.endedAt = Date()
    }
}
