import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss

    private let restOptions = [0, 60, 90, 120, 150, 180, 240, 300]

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            Form {
                Section("Units") {
                    Picker("Weight", selection: $settings.unit) {
                        ForEach(WeightUnit.allCases) { unit in
                            Text(unit == .pounds ? "Pounds (lb)" : "Kilograms (kg)").tag(unit)
                        }
                    }
                } footer: {
                    Text("Weights are stored in kilograms and converted for display, so switching units never changes what you logged.")
                }

                Section("Rest timer") {
                    Picker("Default rest", selection: $settings.defaultRestSeconds) {
                        ForEach(restOptions, id: \.self) { seconds in
                            Text(seconds == 0 ? "Off" : Format.duration(TimeInterval(seconds)))
                                .tag(seconds)
                        }
                    }
                    Toggle("Haptic feedback", isOn: $settings.hapticsEnabled)
                } footer: {
                    Text("Starts automatically when you check off a set.")
                }

                Section("About") {
                    LabeledContent("Version", value: appVersion)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? "—"
        return "\(version) (\(build))"
    }
}
