import SwiftUI

/// Floating rest countdown pinned above the set list during a workout.
struct RestTimerBar: View {
    @Environment(RestTimer.self) private var timer

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .stroke(.quaternary, lineWidth: 4)
                Circle()
                    .trim(from: 0, to: timer.progress)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.2), value: timer.progress)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 1) {
                Text("Rest")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(Format.duration(timer.remaining))
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
            }

            Spacer()

            Button("+30s") { timer.add(seconds: 30) }
                .buttonStyle(.bordered)
                .controlSize(.small)

            Button {
                timer.stop()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityLabel("Skip rest")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.quaternary))
        .padding(.horizontal)
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
