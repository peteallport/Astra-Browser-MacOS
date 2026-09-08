import Foundation
import Observation

/// Window-owned shell state. These tabs are placeholders; no source pages are loaded.
@MainActor
@Observable
final class BrowserStore {
    var tabs = BrowserTab.examples
    var selectedTabID: BrowserTab.ID?
    var address = ""
    var addressError: String?

    var selectedTab: BrowserTab? {
        tabs.first { $0.id == selectedTabID }
    }

    func newTab() {
        let tab = BrowserTab(title: "New Tab")
        tabs.append(tab)
        selectedTabID = tab.id
        address = ""
        addressError = nil
    }

    func syncAddressWithSelection() {
        address = selectedTab?.url?.absoluteString ?? ""
        addressError = nil
    }

    func prepareAddress() {
        let input = address.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidate = input.contains("://") ? input : "https://" + input
        guard !input.isEmpty,
              !input.contains(where: { $0.isWhitespace }),
              let url = URL(string: candidate),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              let host = url.host,
              !host.isEmpty,
              url.user == nil, url.password == nil else {
            addressError = "Enter a website address, such as example.com."
            return
        }

        if let index = tabs.firstIndex(where: { $0.id == selectedTabID }) {
            tabs[index].title = host
            tabs[index].url = url
        } else {
            let tab = BrowserTab(title: host, url: url)
            tabs.append(tab)
            selectedTabID = tab.id
        }
        address = url.absoluteString
        addressError = nil
    }

    func closeTab(_ id: BrowserTab.ID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        tabs.remove(at: index)
        if selectedTabID == id {
            selectedTabID = tabs.isEmpty ? nil : tabs[min(index, tabs.count - 1)].id
            syncAddressWithSelection()
        }
    }
}
