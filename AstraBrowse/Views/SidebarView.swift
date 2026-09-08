import SwiftUI

struct SidebarView: View {
    @Bindable var browser: BrowserStore
    let newTab: () -> Void

    var body: some View {
        List(selection: $browser.selectedTabID) {
            Button(action: newTab) {
                Label("New Tab", systemImage: "plus")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, 5)

            Section("Tabs") {
                ForEach(browser.tabs) { tab in
                    Label(tab.title, systemImage: tab.url == nil ? "square" : "globe")
                        .lineLimit(1)
                        .tag(tab.id)
                        .contextMenu {
                            Button("Close Tab") {
                                browser.closeTab(tab.id)
                            }
                        }
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom) {
            Label("Scaffold preview", systemImage: "hammer")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
        }
    }
}
