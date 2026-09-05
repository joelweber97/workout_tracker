import SwiftUI

/// Primary muscle a movement trains. Stored as a raw string on the model so it
/// stays queryable in `#Predicate`, which can't reach through a computed enum.
enum MuscleGroup: String, CaseIterable, Codable, Identifiable {
    case chest, back, shoulders, biceps, triceps
    case quads, hamstrings, glutes, calves, core
    case fullBody, cardio

    var id: String { rawValue }

    var label: String {
        switch self {
        case .fullBody: return "Full Body"
        default: return rawValue.capitalized
        }
    }

    /// Coarse grouping used by the weekly volume chart.
    var region: String {
        switch self {
        case .chest, .back, .shoulders, .biceps, .triceps: return "Upper"
        case .quads, .hamstrings, .glutes, .calves: return "Lower"
        case .core, .fullBody, .cardio: return "Other"
        }
    }

    var tint: Color {
        switch region {
        case "Upper": return .blue
        case "Lower": return .orange
        default: return .purple
        }
    }
}

enum Equipment: String, CaseIterable, Codable, Identifiable {
    case barbell, dumbbell, machine, cable, bodyweight, kettlebell, band, other

    var id: String { rawValue }
    var label: String { rawValue.capitalized }

    var symbolName: String {
        switch self {
        case .barbell, .dumbbell, .kettlebell: return "dumbbell.fill"
        case .machine, .cable: return "gearshape.fill"
        case .bodyweight: return "figure.strengthtraining.functional"
        case .band: return "line.diagonal"
        case .other: return "square.grid.2x2"
        }
    }
}

enum WeightUnit: String, CaseIterable, Codable, Identifiable {
    case pounds, kilograms

    var id: String { rawValue }
    var label: String { self == .pounds ? "lb" : "kg" }

    /// All weights are persisted in kilograms; this converts for display.
    func fromKilograms(_ kg: Double) -> Double {
        self == .kilograms ? kg : kg * 2.20462262
    }

    func toKilograms(_ value: Double) -> Double {
        self == .kilograms ? value : value / 2.20462262
    }

    /// Smallest sensible increment when stepping a weight field.
    var step: Double { self == .kilograms ? 2.5 : 5 }
}
