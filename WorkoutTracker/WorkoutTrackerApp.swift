import SwiftUI
import SwiftData

@main
struct WorkoutTrackerApp: App {
    @State private var settings = AppSettings()
    @State private var restTimer = RestTimer()

    private let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(
                for: Exercise.self, Workout.self, WorkoutEntry.self,
                SetEntry.self, Routine.self, RoutineItem.self
            )
        } catch {
            fatalError("Could not create the model container: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(restTimer)
                .task { SeedData.seedIfNeeded(in: container.mainContext) }
        }
        .modelContainer(container)
    }
}
