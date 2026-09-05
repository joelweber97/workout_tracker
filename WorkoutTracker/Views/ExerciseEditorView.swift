import SwiftUI
import SwiftData

/// Creates a new exercise or edits an existing one. `onSave` lets the picker
/// immediately use whatever was just created.
struct ExerciseEditorView: View {
    let exercise: Exercise?
    var initialName: String = ""
    var onSave: ((Exercise) -> Void)?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var muscleGroup: MuscleGroup = .chest
    @State private var equipment: Equipment = .barbell
    @State private var notes = ""

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    Picker("Muscle group", selection: $muscleGroup) {
                        ForEach(MuscleGroup.allCases) { group in
                            Text(group.label).tag(group)
                        }
                    }
                    Picker("Equipment", selection: $equipment) {
                        ForEach(Equipment.allCases) { item in
                            Text(item.label).tag(item)
                        }
                    }
                }

                Section("Notes") {
                    TextField("Cues, setup, anything worth remembering", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle(exercise == nil ? "New Exercise" : "Edit Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { save() }
                        .disabled(!isValid)
                }
            }
            .onAppear(perform: loadInitialValues)
        }
    }

    private func loadInitialValues() {
        if let exercise {
            name = exercise.name
            muscleGroup = exercise.muscleGroup
            equipment = exercise.equipment
            notes = exercise.notes
        } else if name.isEmpty {
            name = initialName
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let target: Exercise

        if let exercise {
            exercise.name = trimmed
            exercise.muscleGroup = muscleGroup
            exercise.equipment = equipment
            exercise.notes = notes
            target = exercise
        } else {
            let created = Exercise(
                name: trimmed,
                muscleGroup: muscleGroup,
                equipment: equipment,
                isCustom: true,
                notes: notes
            )
            context.insert(created)
            target = created
        }

        onSave?(target)
        dismiss()
    }
}
