import Foundation
import SwiftData

/// A reusable session template — "Push Day", "5x5 A" — that seeds a new workout
/// with its exercises and target sets already laid out.
@Model
final class Routine {
    var name: String = ""
    var notes: String = ""
    var createdAt: Date = Date()
    var lastUsedAt: Date?

    @Relationship(deleteRule: .cascade, inverse: \RoutineItem.routine)
    var items: [RoutineItem] = []

    init(name: String, notes: String = "") {
        self.name = name
        self.notes = notes
        self.createdAt = Date()
    }

    var orderedItems: [RoutineItem] {
        items.sorted { $0.order < $1.order }
    }

    var summary: String {
        let names = orderedItems.prefix(3).map(\.displayName)
        guard !names.isEmpty else { return "No exercises yet" }
        let extra = orderedItems.count - names.count
        return extra > 0 ? names.joined(separator: ", ") + " +\(extra)" : names.joined(separator: ", ")
    }
}

@Model
final class RoutineItem {
    var order: Int = 0
    var targetSets: Int = 3
    var targetReps: Int = 8
    var exercise: Exercise?
    var routine: Routine?

    init(exercise: Exercise?, order: Int, targetSets: Int = 3, targetReps: Int = 8) {
        self.exercise = exercise
        self.order = order
        self.targetSets = targetSets
        self.targetReps = targetReps
    }

    var displayName: String { exercise?.name ?? "Deleted exercise" }
}
