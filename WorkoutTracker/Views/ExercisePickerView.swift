import SwiftUI
import SwiftData

/// Modal exercise chooser used when adding a movement to a workout or routine.
struct ExercisePickerView: View {
    let onSelect: (Exercise) -> Void

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @Query(filter: #Predicate<Exercise> { !$0.isArchived }, sort: \Exercise.name)
    private var exercises: [Exercise]

    @State private var search = ""
    @State private var groupFilter: MuscleGroup?
    @State private var showingEditor = false

    private var filtered: [Exercise] {
        exercises.filter { exercise in
            let matchesGroup = groupFilter == nil || exercise.muscleGroup == groupFilter
            let matchesSearch = search.isEmpty
                || exercise.name.localizedCaseInsensitiveContains(search)
            return matchesGroup && matchesSearch
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                filterStrip

                List {
                    ForEach(filtered) { exercise in
                        Button {
                            onSelect(exercise)
                            dismiss()
                        } label: {
                            ExerciseRow(exercise: exercise)
                        }
                        .buttonStyle(.plain)
                    }

                    if filtered.isEmpty {
                        EmptyStateView(
                            systemImage: "magnifyingglass",
                            title: "No matches",
                            message: search.isEmpty
                                ? "Nothing in this category yet."
                                : "No exercise named “\(search)”.",
                            actionTitle: "Create Exercise",
                            action: { showingEditor = true }
                        )
                        .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
            }
            .searchable(text: $search, prompt: "Search exercises")
            .navigationTitle("Add Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
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
                ExerciseEditorView(exercise: nil, initialName: search) { created in
                    onSelect(created)
                    dismiss()
                }
            }
        }
    }

    private var filterStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(title: "All", isSelected: groupFilter == nil) {
                    groupFilter = nil
                }
                ForEach(MuscleGroup.allCases) { group in
                    FilterChip(title: group.label, isSelected: groupFilter == group) {
                        groupFilter = groupFilter == group ? nil : group
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(.bar)
    }
}

