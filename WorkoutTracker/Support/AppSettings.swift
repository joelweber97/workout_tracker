import SwiftUI

/// Display and behaviour preferences. No training data lives here — these are
/// the knobs, not the record — so `UserDefaults` is the right home for them.
///
/// Each setting is a computed property over an observed backing store rather
/// than a stored property with `didSet`: the `@Observable` macro rewrites stored
/// properties into accessors, which leaves no place for a property observer.
@Observable
final class AppSettings {
    private var unitRaw: String
    private var restSeconds: Int
    private var haptics: Bool

    var unit: WeightUnit {
        get { WeightUnit(rawValue: unitRaw) ?? .pounds }
        set {
            unitRaw = newValue.rawValue
            UserDefaults.standard.set(newValue.rawValue, forKey: Keys.unit)
        }
    }

    /// Seconds of rest started when a set is checked off. Zero disables it.
    var defaultRestSeconds: Int {
        get { restSeconds }
        set {
            restSeconds = newValue
            UserDefaults.standard.set(newValue, forKey: Keys.rest)
        }
    }

    var hapticsEnabled: Bool {
        get { haptics }
        set {
            haptics = newValue
            UserDefaults.standard.set(newValue, forKey: Keys.haptics)
        }
    }

    init() {
        let defaults = UserDefaults.standard
        self.unitRaw = defaults.string(forKey: Keys.unit) ?? WeightUnit.pounds.rawValue
        // `object(forKey:)` distinguishes "never set" from a deliberate 0/false.
        self.restSeconds = defaults.object(forKey: Keys.rest) as? Int ?? 90
        self.haptics = defaults.object(forKey: Keys.haptics) as? Bool ?? true
    }

    private enum Keys {
        static let unit = "settings.unit"
        static let rest = "settings.defaultRestSeconds"
        static let haptics = "settings.hapticsEnabled"
        static let seeded = "settings.libraryHasBeenSeeded"
    }

    static var libraryHasBeenSeeded: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.seeded) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.seeded) }
    }
}
