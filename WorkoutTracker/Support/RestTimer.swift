import SwiftUI
import Combine
import UIKit

/// Countdown between sets. Deliberately wall-clock based rather than tick-based:
/// the timer keeps correct time if the app is backgrounded mid-rest.
@Observable
final class RestTimer {
    private(set) var endDate: Date?
    private(set) var totalSeconds: Int = 0
    private(set) var now: Date = Date()

    /// Set by the caller so the timer honours the user's haptics preference.
    var hapticsEnabled = true

    @ObservationIgnored private var ticker: AnyCancellable?

    var isRunning: Bool { endDate != nil }

    var remaining: TimeInterval {
        guard let endDate else { return 0 }
        return max(0, endDate.timeIntervalSince(now))
    }

    var progress: Double {
        guard totalSeconds > 0 else { return 0 }
        return 1 - (remaining / Double(totalSeconds))
    }

    var isFinished: Bool { isRunning && remaining <= 0 }

    func start(seconds: Int) {
        guard seconds > 0 else { return }
        totalSeconds = seconds
        now = Date()
        endDate = now.addingTimeInterval(TimeInterval(seconds))
        ticker = Timer.publish(every: 0.2, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] date in
                guard let self else { return }
                self.now = date
                if self.remaining <= 0 { self.finish() }
            }
    }

    func add(seconds: Int) {
        guard let endDate else { return }
        totalSeconds += seconds
        self.endDate = endDate.addingTimeInterval(TimeInterval(seconds))
    }

    func stop() {
        ticker?.cancel()
        ticker = nil
        endDate = nil
        totalSeconds = 0
    }

    private func finish() {
        ticker?.cancel()
        ticker = nil
        if hapticsEnabled {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
        stop()
    }
}
