import SwiftUI

/// One editable set inside the active workout: weight, reps, and the tick that
/// marks it done and kicks off the rest timer.
struct SetRowView: View {
    @Bindable var set: SetEntry
    let unit: WeightUnit
    let previousSummary: String?
    let onComplete: (Bool) -> Void

    @FocusState private var focus: Field?

    private enum Field { case weight, reps }

    var body: some View {
        HStack(spacing: 10) {
            Text(set.isWarmup ? "W" : "\(set.order + 1)")
                .font(.subheadline.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(set.isWarmup ? .orange : .secondary)
                .frame(width: 24)

            Text(previousSummary ?? "—")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
                .frame(width: 68, alignment: .leading)

            TextField("0", value: displayWeight, format: .number.precision(.fractionLength(0...1)))
                .keyboardType(.decimalPad)
                .focused($focus, equals: .weight)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Weight in \(unit.label)")

            TextField("0", value: $set.reps, format: .number)
                .keyboardType(.numberPad)
                .focused($focus, equals: .reps)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Reps")

            Button {
                focus = nil
                set.isCompleted.toggle()
                set.completedAt = set.isCompleted ? Date() : nil
                onComplete(set.isCompleted)
            } label: {
                Image(systemName: set.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(set.isCompleted ? Color.green : Color.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(set.isCompleted ? "Mark set incomplete" : "Mark set complete")
        }
        .padding(.vertical, 2)
        .listRowBackground(set.isCompleted ? Color.green.opacity(0.08) : Color.clear)
    }

    /// Weights persist in kilograms; the field edits whatever unit is on screen.
    private var displayWeight: Binding<Double> {
        Binding(
            get: { unit.fromKilograms(set.weightKg) },
            set: { set.weightKg = unit.toKilograms($0) }
        )
    }
}
