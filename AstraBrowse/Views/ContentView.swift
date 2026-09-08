import SwiftUI

struct ContentView: View {
    @State private var browser = BrowserStore()
    @FocusState private var addressFocused: Bool

    var body: some View {
        NavigationSplitView {
            SidebarView(browser: browser, newTab: newTab)
                .navigationSplitViewColumnWidth(min: 190, ideal: 230, max: 300)
        } detail: {
            VStack(spacing: 0) {
                addressBar
                Divider()
                PlaceholderPageView(tab: browser.selectedTab)
            }
        }
        .navigationTitle("AstraBrowse")
        .frame(minWidth: 760, minHeight: 520)
        .focusedSceneValue(\.browserNewTab, newTab)
        .focusedSceneValue(\.browserFocusAddress, { addressFocused = true })
        .onChange(of: browser.selectedTabID) {
            browser.syncAddressWithSelection()
        }
    }

    private var addressBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "globe")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)

                TextField("Enter a website address", text: $browser.address)
                    .textFieldStyle(.plain)
                    .focused($addressFocused)
                    .accessibilityLabel("Website address")
                    .onSubmit(prepareAddress)

                Button(action: prepareAddress) {
                    Image(systemName: "arrow.right")
                }
                .buttonStyle(.borderless)
                .help("Prepare this website tab")
                .accessibilityLabel("Prepare website tab")
                .disabled(browser.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 9))

            if let error = browser.addressError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityLabel("Address error: \(error)")
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
    }

    private func newTab() {
        browser.newTab()
        addressFocused = true
    }

    private func prepareAddress() {
        browser.prepareAddress()
        if browser.addressError == nil {
            addressFocused = false
        }
    }
}
