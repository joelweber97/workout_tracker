import Foundation
import SwiftData

/// One training session. A workout with `endedAt == nil` is the session
/// currently in progress; the app allows only one at a time.
@Model
final class Workout {
    var name: String = ""
    var startedAt: Date = Date()
    var endedAt: Date?
    var notes: String = ""

    @Relationship(deleteRule: .cascade, inverse: \WorkoutEntry.workout)
    var entries: [WorkoutEntry] = []

    init(name: String = "Workout", startedAt: Date = Date(), notes: String = "") {
        self.name = name
        self.startedAt = startedAt
        self.notes = notes
    }

    var isActive: Bool { endedAt == nil }

    var duration: TimeInterval {
        (endedAt ?? Date()).timeIntervalSince(startedAt)
    }

    /// Entries in the order the user arranged them, not SwiftData's arbitrary order.
    var orderedEntries: [WorkoutEntry] {
        entries.sorted { $0.order < $1.order }
    }

    /// Sum of reps x weight over completed working sets, in kilograms.
    var totalVolumeKg: Double {
        entries.reduce(0) { $0 + $1.volumeKg }
    }

    var completedSetCount: Int {
        entries.reduce(0) { $0 + $1.completedSets.count }
    }
}

/// One exercise as it appears inside a single workout, holding that session's sets.
@Model
final class WorkoutEntry {
    var order: Int = 0
    var notes: String = ""
    var exercise: Exercise?
    var workout: Workout?

    @Relationship(deleteRule: .cascade, inverse: \SetEntry.entry)
    var sets: [SetEntry] = []

    init(exercise: Exercise?, order: Int) {
        self.exercise = exercise
        self.order = order
    }

    var displayName: String { exercise?.name ?? "Deleted exercise" }

    var orderedSets: [SetEntry] {
        sets.sorted { $0.order < $1.order }
    }

    /// Warm-up sets are logged but excluded from volume and PR math.
    var workingSets: [SetEntry] {
        orderedSets.filter { !$0.isWarmup }
    }

    var completedSets: [SetEntry] {
        orderedSets.filter { $0.isCompleted && !$0.isWarmup }
    }

    var volumeKg: Double {
        completedSets.reduce(0) { $0 + $1.volumeKg }
    }

    /// Best estimated one-rep max across this entry's completed sets.
    var bestEstimatedOneRepMaxKg: Double? {
        completedSets.compactMap(\.estimatedOneRepMaxKg).max()
    }
}

/// A single set. `weightKg` is canonical; the UI converts to the user's unit.
@Model
final class SetEntry {
    var order: Int = 0
    var reps: Int = 0
    var weightKg: Double = 0
    var isCompleted: Bool = false
    var isWarmup: Bool = false
    /// Rate of perceived exertion, 6...10 in half steps. Optional — plenty of
    /// people never log it.
    var rpe: Double?
    var completedAt: Date?
    var entry: WorkoutEntry?

    init(order: Int, reps: Int = 0, weightKg: Double = 0, isWarmup: Bool = false) {
        self.order = order
        self.reps = reps
        self.weightKg = weightKg
        self.isWarmup = isWarmup
    }

    var volumeKg: Double { Double(reps) * weightKg }

    /// Epley estimate. Undefined for zero reps, and a single rep is already a max.
    var estimatedOneRepMaxKg: Double? {
        guard reps > 0, weightKg > 0 else { return nil }
        if reps == 1 { return weightKg }
        return weightKg * (1 + Double(reps) / 30.0)
    }
}
