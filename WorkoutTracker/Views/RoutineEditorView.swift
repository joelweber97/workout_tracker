import SwiftUI
import SwiftData

/// Builds a reusable session template: which exercises, in what order, with
/// target sets and reps.
struct RoutineEditorView: View {
    @Bindable var routine: Routine

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var showingPicker = false
    @State private var showingDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $routine.name)
                    TextField("Notes", text: $routine.notes, axis: .vertical)
                        .lineLimit(1...4)
                }

                Section("Exercises") {
                    ForEach(routine.orderedItems) { item in
                        itemRow(item)
                    }
                    .onDelete(perform: deleteItems)
                    .onMove(perform: moveItems)

                    Button {
                        showingPicker = true
                    } label: {
                        Label("Add Exercise", systemImage: "plus")
                    }
                }

                Section {
                    Button("Delete Routine", role: .destructive) {
                        showingDeleteConfirmation = true
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Routine")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.body.weight(.semibold))
                }
            }
            .sheet(isPresented: $showingPicker) {
                ExercisePickerView { exercise in
                    let nextOrder = (routine.items.map(\.order).max() ?? -1) + 1
                    let item = RoutineItem(exercise: exercise, order: nextOrder)
                    context.insert(item)
                    item.routine = routine
                }
            }
            .confirmationDialog(
                "Delete “\(routine.name)”?",
                isPresented: $showingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    context.delete(routine)
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Workouts already logged from this routine are kept.")
            }
        }
    }

    private func itemRow(_ item: RoutineItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(item.displayName)
                .font(.body.weight(.medium))
            HStack(spacing: 16) {
                Stepper(
                    "\(item.targetSets) sets",
                    value: Binding(
                        get: { item.targetSets },
                        set: { item.targetSets = $0 }
                    ),
                    in: 1...12
                )
                .font(.caption)

                Stepper(
                    "\(item.targetReps) reps",
                    value: Binding(
                        get: { item.targetReps },
                        set: { item.targetReps = $0 }
                    ),
                    in: 1...50
                )
                .font(.caption)
            }
        }
        .padding(.vertical, 2)
    }

    private func deleteItems(at offsets: IndexSet) {
        let ordered = routine.orderedItems
        for index in offsets {
            context.delete(ordered[index])
        }
        // Close the gap so `order` stays contiguous.
        for (index, item) in ordered.enumerated() where !offsets.contains(index) {
            item.order = index
        }
    }

    private func moveItems(from source: IndexSet, to destination: Int) {
        var ordered = routine.orderedItems
        ordered.move(fromOffsets: source, toOffset: destination)
        for (index, item) in ordered.enumerated() {
            item.order = index
        }
    }
}
