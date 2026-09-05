import SwiftUI
import SwiftData

/// The movement library, grouped by muscle so it stays scannable as it grows.
struct ExerciseLibraryView: View {
    @Environment(\.modelContext) private var context

    @Query(filter: #Predicate<Exercise> { !$0.isArchived }, sort: \Exercise.name)
    private var exercises: [Exercise]

    @State private var search = ""
    @State private var showingEditor = false

    private var grouped: [(group: MuscleGroup, exercises: [Exercise])] {
        let matching = exercises.filter {
            search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)
        }
        return MuscleGroup.allCases.compactMap { group in
            let items = matching.filter { $0.muscleGroup == group }
            return items.isEmpty ? nil : (group, items)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(grouped, id: \.group) { section in
                    Section(section.group.label) {
                        ForEach(section.exercises) { exercise in
                            NavigationLink {
                                ExerciseDetailView(exercise: exercise)
                            } label: {
                                ExerciseRow(exercise: exercise)
                            }
                        }
                        .onDelete { offsets in
                            archive(offsets, in: section.exercises)
                        }
                    }
                }

                if grouped.isEmpty {
                    EmptyStateView(
                        systemImage: "list.bullet",
                        title: search.isEmpty ? "No exercises" : "No matches",
                        message: search.isEmpty
                            ? "Add the movements you train."
                            : "Nothing matches “\(search)”.",
                        actionTitle: "New Exercise",
                        action: { showingEditor = true }
                    )
                    .listRowSeparator(.hidden)
                }
            }
            .searchable(text: $search, prompt: "Search exercises")
            .navigationTitle("Exercises")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingEditor = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New exercise")
                }
            }
            .sheet(isPresented: $showingEditor) {
                ExerciseEditorView(exercise: nil)
            }
        }
    }

    /// Archive rather than delete: past workouts reference these, and a hard
    /// delete would leave history rows reading "Deleted exercise".
    private func archive(_ offsets: IndexSet, in list: [Exercise]) {
        for index in offsets {
            list[index].isArchived = true
        }
    }
}
