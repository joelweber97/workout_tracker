import Foundation

/// Derived training numbers. Kept free of SwiftData queries so it can be
/// exercised directly against arrays of models.
enum Stats {

    struct WeeklyVolume: Identifiable {
        let weekStart: Date
        let volumeKg: Double
        var id: Date { weekStart }
    }

    struct PersonalRecord {
        let bestOneRepMaxKg: Double
        let bestSetWeightKg: Double
        let bestSetReps: Int
        let achievedAt: Date
    }

    /// Volume per calendar week, oldest first, with empty weeks filled in so the
    /// chart shows a gap rather than silently closing it.
    static func weeklyVolume(
        for workouts: [Workout],
        weeks: Int,
        calendar: Calendar = .current,
        now: Date = Date()
    ) -> [WeeklyVolume] {
        guard weeks > 0 else { return [] }
        guard let thisWeek = calendar.dateInterval(of: .weekOfYear, for: now)?.start else { return [] }

        var buckets: [Date: Double] = [:]
        for offset in 0..<weeks {
            guard let start = calendar.date(byAdding: .weekOfYear, value: -offset, to: thisWeek) else { continue }
            buckets[start] = 0
        }

        for workout in workouts where !workout.isActive {
            guard let start = calendar.dateInterval(of: .weekOfYear, for: workout.startedAt)?.start,
                  buckets[start] != nil else { continue }
            buckets[start, default: 0] += workout.totalVolumeKg
        }

        return buckets
            .map { WeeklyVolume(weekStart: $0.key, volumeKg: $0.value) }
            .sorted { $0.weekStart < $1.weekStart }
    }

    /// Best estimated 1RM per session for one exercise, oldest first.
    static func oneRepMaxHistory(for exercise: Exercise, in workouts: [Workout]) -> [(date: Date, valueKg: Double)] {
        workouts
            .filter { !$0.isActive }
            .compactMap { workout -> (Date, Double)? in
                let best = workout.entries
                    .filter { $0.exercise?.persistentModelID == exercise.persistentModelID }
                    .compactMap(\.bestEstimatedOneRepMaxKg)
                    .max()
                guard let best else { return nil }
                return (workout.startedAt, best)
            }
            .sorted { $0.0 < $1.0 }
            .map { (date: $0.0, valueKg: $0.1) }
    }

    static func personalRecord(for exercise: Exercise, in workouts: [Workout]) -> PersonalRecord? {
        var bestOneRM: Double = 0
        var bestSet: (weight: Double, reps: Int)?
        var achievedAt: Date?

        for workout in workouts where !workout.isActive {
            for entry in workout.entries
            where entry.exercise?.persistentModelID == exercise.persistentModelID {
                for set in entry.completedSets {
                    if let oneRM = set.estimatedOneRepMaxKg, oneRM > bestOneRM {
                        bestOneRM = oneRM
                        achievedAt = workout.startedAt
                    }
                    // Heaviest single set, tie-broken by reps at the same weight.
                    if let current = bestSet {
                        if set.weightKg > current.weight
                            || (set.weightKg == current.weight && set.reps > current.reps) {
                            bestSet = (set.weightKg, set.reps)
                        }
                    } else if set.weightKg > 0 {
                        bestSet = (set.weightKg, set.reps)
                    }
                }
            }
        }

        guard bestOneRM > 0, let bestSet, let achievedAt else { return nil }
        return PersonalRecord(
            bestOneRepMaxKg: bestOneRM,
            bestSetWeightKg: bestSet.weight,
            bestSetReps: bestSet.reps,
            achievedAt: achievedAt
        )
    }

    /// Volume split by muscle region over the given window, for the stats donut.
    static func volumeByRegion(
        for workouts: [Workout],
        since: Date
    ) -> [(region: String, volumeKg: Double)] {
        var totals: [String: Double] = [:]
        for workout in workouts where !workout.isActive && workout.startedAt >= since {
            for entry in workout.entries {
                guard let group = entry.exercise?.muscleGroup else { continue }
                totals[group.region, default: 0] += entry.volumeKg
            }
        }
        return totals
            .filter { $0.value > 0 }
            .map { (region: $0.key, volumeKg: $0.value) }
            .sorted { $0.volumeKg > $1.volumeKg }
    }

    /// Consecutive weeks, counting back from this one, containing a workout.
    static func weeklyStreak(
        for workouts: [Workout],
        calendar: Calendar = .current,
        now: Date = Date()
    ) -> Int {
        let trained = Set(workouts.filter { !$0.isActive }.compactMap {
            calendar.dateInterval(of: .weekOfYear, for: $0.startedAt)?.start
        })
        guard var cursor = calendar.dateInterval(of: .weekOfYear, for: now)?.start else { return 0 }

        // This week not being logged yet shouldn't break a streak mid-week.
        if !trained.contains(cursor) {
            guard let previous = calendar.date(byAdding: .weekOfYear, value: -1, to: cursor) else { return 0 }
            cursor = previous
        }

        var streak = 0
        while trained.contains(cursor) {
            streak += 1
            guard let previous = calendar.date(byAdding: .weekOfYear, value: -1, to: cursor) else { break }
            cursor = previous
        }
        return streak
    }
}
