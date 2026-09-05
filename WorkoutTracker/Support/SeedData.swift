import Foundation
import SwiftData

/// Ships a starter exercise library so the app is usable on first launch
/// instead of presenting an empty picker.
enum SeedData {

    static let starterExercises: [(String, MuscleGroup, Equipment)] = [
        // Chest
        ("Barbell Bench Press", .chest, .barbell),
        ("Incline Dumbbell Press", .chest, .dumbbell),
        ("Cable Fly", .chest, .cable),
        ("Push-Up", .chest, .bodyweight),
        // Back
        ("Deadlift", .back, .barbell),
        ("Barbell Row", .back, .barbell),
        ("Lat Pulldown", .back, .cable),
        ("Pull-Up", .back, .bodyweight),
        ("Seated Cable Row", .back, .cable),
        // Shoulders
        ("Overhead Press", .shoulders, .barbell),
        ("Dumbbell Lateral Raise", .shoulders, .dumbbell),
        ("Face Pull", .shoulders, .cable),
        // Arms
        ("Barbell Curl", .biceps, .barbell),
        ("Dumbbell Hammer Curl", .biceps, .dumbbell),
        ("Triceps Pushdown", .triceps, .cable),
        ("Skull Crusher", .triceps, .barbell),
        // Legs
        ("Back Squat", .quads, .barbell),
        ("Front Squat", .quads, .barbell),
        ("Leg Press", .quads, .machine),
        ("Romanian Deadlift", .hamstrings, .barbell),
        ("Leg Curl", .hamstrings, .machine),
        ("Hip Thrust", .glutes, .barbell),
        ("Walking Lunge", .glutes, .dumbbell),
        ("Standing Calf Raise", .calves, .machine),
        // Core & conditioning
        ("Plank", .core, .bodyweight),
        ("Hanging Leg Raise", .core, .bodyweight),
        ("Cable Crunch", .core, .cable),
        ("Kettlebell Swing", .fullBody, .kettlebell),
        ("Rowing Machine", .cardio, .machine),
    ]

    static let starterRoutines: [(name: String, exercises: [(String, Int, Int)])] = [
        ("Push Day", [
            ("Barbell Bench Press", 4, 6),
            ("Overhead Press", 3, 8),
            ("Incline Dumbbell Press", 3, 10),
            ("Dumbbell Lateral Raise", 3, 15),
            ("Triceps Pushdown", 3, 12),
        ]),
        ("Pull Day", [
            ("Deadlift", 3, 5),
            ("Pull-Up", 4, 8),
            ("Barbell Row", 3, 8),
            ("Face Pull", 3, 15),
            ("Barbell Curl", 3, 10),
        ]),
        ("Leg Day", [
            ("Back Squat", 4, 6),
            ("Romanian Deadlift", 3, 8),
            ("Leg Press", 3, 12),
            ("Leg Curl", 3, 12),
            ("Standing Calf Raise", 4, 15),
        ]),
    ]

    /// Runs once per install. Guarded by a flag rather than a count check so a
    /// user who deletes every seeded exercise doesn't get them back.
    @MainActor
    static func seedIfNeeded(in context: ModelContext) {
        guard !AppSettings.libraryHasBeenSeeded else { return }

        var byName: [String: Exercise] = [:]
        for (name, group, equipment) in starterExercises {
            let exercise = Exercise(name: name, muscleGroup: group, equipment: equipment)
            context.insert(exercise)
            byName[name] = exercise
        }

        for (name, items) in starterRoutines {
            let routine = Routine(name: name)
            context.insert(routine)
            for (index, item) in items.enumerated() {
                let (exerciseName, sets, reps) = item
                let routineItem = RoutineItem(
                    exercise: byName[exerciseName],
                    order: index,
                    targetSets: sets,
                    targetReps: reps
                )
                context.insert(routineItem)
                routineItem.routine = routine
            }
        }

        do {
            try context.save()
            AppSettings.libraryHasBeenSeeded = true
        } catch {
            // Leave the flag unset so seeding is retried on the next launch.
            assertionFailure("Failed to seed starter library: \(error)")
        }
    }
}
