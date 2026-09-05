import Foundation

enum Format {
    /// "1:05:12" past an hour, "5:12" below it — matches how a rest timer reads.
    static func duration(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%d:%02d", minutes, seconds)
    }

    /// Compact duration for list rows: "48m", "1h 12m".
    static func shortDuration(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }

    /// The number alone, for tables and inline summaries where a unit on every
    /// value is noise. Drops the decimal on whole numbers so "100" doesn't read
    /// as "100.0".
    static func weightValue(_ value: Double, unit: WeightUnit) -> String {
        let converted = unit.fromKilograms(value)
        let rounded = (converted * 10).rounded() / 10
        return rounded == rounded.rounded()
            ? String(Int(rounded))
            : String(format: "%.1f", rounded)
    }

    static func weight(_ value: Double, unit: WeightUnit) -> String {
        "\(weightValue(value, unit: unit)) \(unit.label)"
    }

    static func volume(_ kg: Double, unit: WeightUnit) -> String {
        let converted = unit.fromKilograms(kg)
        if converted >= 10_000 {
            return String(format: "%.1fk %@", converted / 1000, unit.label)
        }
        return "\(Int(converted.rounded())) \(unit.label)"
    }

    static let dayAndMonth: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }()
}
