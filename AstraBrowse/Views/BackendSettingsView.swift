import SwiftUI

struct BackendSettingsView: View {
    let browser: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Backend Settings").font(.title2.weight(.semibold))
            Text("Connect to your self-hosted AstraBrowse service.").foregroundStyle(.secondary)
            TextField("http://localhost:8787", text: $address).textFieldStyle(.roundedBorder)
                .accessibilityLabel("Backend URL")
            Text("Use HTTPS for a hosted service, or HTTP localhost for local development.")
                .font(.caption).foregroundStyle(.secondary)
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Save") {
                    do { try browser.saveBackend(address.trimmingCharacters(in: .whitespacesAndNewlines)); dismiss() }
                    catch { self.error = error.localizedDescription }
                }.keyboardShortcut(.defaultAction)
            }
        }
        .padding(24).frame(width: 460)
        .onAppear { address = browser.backendAddress }
    }
}
