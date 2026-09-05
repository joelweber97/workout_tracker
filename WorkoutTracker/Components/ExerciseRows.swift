import SwiftUI

/// Pill toggle used for the muscle-group filter strip.
struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    isSelected ? Color.accentColor : Color.secondary.opacity(0.15),
                    in: Capsule()
                )
                .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

/// Standard exercise line: equipment glyph tinted by muscle group, name, and
/// the group/equipment pair beneath it. Shared by the library and the picker.
struct ExerciseRow: View {
    let exercise: Exercise

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: exercise.equipment.symbolName)
                .font(.footnote)
                .foregroundStyle(exercise.muscleGroup.tint)
                .frame(width: 28, height: 28)
                .background(exercise.muscleGroup.tint.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name)
                Text("\(exercise.muscleGroup.label) · \(exercise.equipment.label)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .contentShape(Rectangle())
    }
}
