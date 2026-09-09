import SwiftUI

struct ContentView: View {
    @State private var browser = BrowserStore()
    @State private var showsSettings = false
    @FocusState private var addressFocused: Bool
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationSplitView {
            SidebarView(browser: browser, newTab: newTab, settings: { showsSettings = true })
                .navigationSplitViewColumnWidth(min: 190, ideal: 230, max: 300)
        } detail: {
            VStack(spacing: 0) {
                addressBar
                Divider()
                if !browser.isBackendConfigured { backendSetupPrompt }
                if let tab = browser.selectedTab, tab.url != nil {
                    BrowserPageView(browser: browser, tab: tab).id(tab.id)
                } else {
                    PlaceholderPageView { website in
                        browser.address = website
                        prepareAddress()
                    }
                }
            }
        }
        .navigationTitle("AstraBrowse")
        .frame(minWidth: 760, minHeight: 520)
        .focusedSceneValue(\.browserNewTab, newTab)
        .focusedSceneValue(\.browserFocusAddress, { addressFocused = true })
        .onChange(of: browser.selectedTabID) { browser.syncAddressWithSelection() }
        .onChange(of: scenePhase) {
            browser.isActive = scenePhase == .active
            browser.syncAddressWithSelection()
        }
        .sheet(isPresented: $showsSettings) { BackendSettingsView(browser: browser) }
        .onAppear { if !browser.isBackendConfigured { showsSettings = true } }
        .task { await browser.maintain() }
    }

    private var backendSetupPrompt: some View {
        HStack(spacing: 12) {
            Image(systemName: "network").foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 3) {
                Text("Connect your backend").font(.headline)
                Text("Add your AstraBrowse service URL to create native views and receive updates.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Configure Backend") { showsSettings = true }
        }
        .padding(.horizontal, 24).padding(.vertical, 14)
        .background(.quaternary.opacity(0.5))
    }

    private var addressBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: browser.selectedTab?.showsOriginal == true ? "globe" : "square.stack.3d.up")
                    .foregroundStyle(.secondary).accessibilityHidden(true)
                TextField("Enter a website address", text: $browser.address)
                    .textFieldStyle(.plain).focused($addressFocused)
                    .accessibilityLabel("Website address").onSubmit(prepareAddress)
                Button(action: prepareAddress) { Image(systemName: "arrow.right") }
                    .buttonStyle(.borderless).help("Open native website")
                    .accessibilityLabel("Open website")
                    .disabled(browser.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 9))
            if let error = browser.addressError {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 14)
    }

    private func newTab() { browser.newTab(); addressFocused = true }
    private func prepareAddress() {
        guard browser.isBackendConfigured else { showsSettings = true; return }
        browser.prepareAddress()
        if browser.addressError == nil { addressFocused = false }
    }
}
