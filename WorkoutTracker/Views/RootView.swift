import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("Today", systemImage: "figure.strengthtraining.traditional") }

            HistoryView()
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }

            ExerciseLibraryView()
                .tabItem { Label("Exercises", systemImage: "list.bullet") }

            StatsView()
                .tabItem { Label("Stats", systemImage: "chart.xyaxis.line") }
        }
    }
}
