import SwiftUI

struct SidebarView: View {
    @Bindable var browser: BrowserStore
    let newTab: () -> Void
    let settings: () -> Void

    var body: some View {
        List(selection: $browser.selectedTabID) {
            Button(action: newTab) {
                Label("New Tab", systemImage: "plus")
                    .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain).padding(.vertical, 5)
            Section("Tabs") {
                ForEach(browser.tabs) { tab in
                    HStack(spacing: 8) {
                        Image(systemName: tab.url == nil ? "square" : (tab.showsOriginal ? "globe" : "square.stack.3d.up"))
                            .foregroundStyle(.secondary)
                        Text(tab.title).lineLimit(1)
                        Spacer(minLength: 2)
                        if tab.hasUnreadContent {
                            Circle().fill(.tint).frame(width: 7, height: 7)
                                .accessibilityLabel("New content available")
                                .help("New content is ready. Scroll to the top to apply it.")
                        } else if tab.isLoading {
                            ProgressView().controlSize(.mini)
                        }
                    }
                    .tag(tab.id)
                    .contextMenu { Button("Close Tab") { browser.closeTab(tab.id) } }
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom) {
            Button(action: settings) {
                Label("Backend Settings", systemImage: "gearshape")
                    .font(.caption).frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain).foregroundStyle(.secondary).padding(16)
        }
    }
}
