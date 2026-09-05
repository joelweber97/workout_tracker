import Foundation
import SwiftData

/// A movement in the user's library. Distinct from a logged set: an `Exercise`
/// is the definition, `WorkoutEntry` is one appearance of it inside a session.
@Model
final class Exercise {
    var name: String = ""
    var muscleGroupRaw: String = MuscleGroup.fullBody.rawValue
    var equipmentRaw: String = Equipment.other.rawValue
    /// True for anything the user added themselves, so the seeded library can be
    /// refreshed later without clobbering their own movements.
    var isCustom: Bool = false
    var notes: String = ""
    var isArchived: Bool = false
    var createdAt: Date = Date()

    init(
        name: String,
        muscleGroup: MuscleGroup,
        equipment: Equipment,
        isCustom: Bool = false,
        notes: String = ""
    ) {
        self.name = name
        self.muscleGroupRaw = muscleGroup.rawValue
        self.equipmentRaw = equipment.rawValue
        self.isCustom = isCustom
        self.notes = notes
        self.createdAt = Date()
    }

    var muscleGroup: MuscleGroup {
        get { MuscleGroup(rawValue: muscleGroupRaw) ?? .fullBody }
        set { muscleGroupRaw = newValue.rawValue }
    }

    var equipment: Equipment {
        get { Equipment(rawValue: equipmentRaw) ?? .other }
        set { equipmentRaw = newValue.rawValue }
    }
}
