import Foundation
import Observation
import A2UISwiftCore

@MainActor
@Observable
final class BrowserStore {
    static let defaultBackendAddress = "https://astrabrowse-backend.quirk.workers.dev"
    var tabs: [BrowserTab] = []
    var selectedTabID: BrowserTab.ID?
    var address = ""
    var addressError: String?
    var isActive = true
    var backendAddress: String
    @ObservationIgnored private let cache = PageCache()
    @ObservationIgnored private var tasks: [UUID: Task<Void, Never>] = [:]

    init() {
        backendAddress = ProcessInfo.processInfo.environment["ASTRABROWSE_BACKEND_URL"]
            ?? UserDefaults.standard.string(forKey: "backendAddress") ?? Self.defaultBackendAddress
        for saved in cache.loadTabs().prefix(20) {
            let tab = BrowserTab(id: saved.id, title: saved.title, url: saved.url)
            tab.scrollOffset = max(0, saved.scrollOffset ?? 0)
            tab.isAtTop = tab.scrollOffset <= 2
            if let url = tab.url, let bundle = cache.load(sourceURL: url),
               let page = try? NativePage(bundle: bundle) {
                tab.page = page; tab.fromCache = true
            }
            tabs.append(tab)
        }
        selectedTabID = tabs.first?.id
        syncAddressWithSelection()
    }

    var selectedTab: BrowserTab? { tabs.first { $0.id == selectedTabID } }

    func newTab() {
        let tab = BrowserTab()
        tabs.append(tab); selectedTabID = tab.id
        address = ""; addressError = nil
        saveTabs()
    }

    func syncAddressWithSelection() {
        address = selectedTab?.url?.absoluteString ?? ""
        addressError = nil
        if let tab = selectedTab { applyPendingIfReady(tab) }
        saveTabs()
    }

    func prepareAddress() {
        guard let url = Self.websiteURL(address) else {
            addressError = "Enter a website address, such as example.com."
            return
        }
        if selectedTab == nil { newTab() }
        guard let tab = selectedTab else { return }
        navigate(url, in: tab)
    }

    func open(_ string: String) {
        address = string
        prepareAddress()
    }

    func navigate(_ url: URL, in tab: BrowserTab) {
        tasks[tab.id]?.cancel()
        tab.navigationID = UUID()
        tab.documentID = UUID()
        tab.url = url; tab.title = url.host ?? "Website"
        tab.page = nil; tab.pending = nil; tab.error = nil; tab.refreshWarning = nil; tab.filter = ""
        tab.showsOriginal = false; tab.isAtTop = true; tab.scrollOffset = 0; tab.fromCache = false
        tab.etag = nil; tab.liveViewURL = nil
        if let bundle = cache.load(sourceURL: url), let page = try? NativePage(bundle: bundle) {
            tab.page = page; tab.title = bundle.title; tab.fromCache = true
        }
        if selectedTabID == tab.id { address = url.absoluteString; addressError = nil }
        saveTabs()
        resolve(tab)
    }

    func retry(_ tab: BrowserTab) { resolve(tab) }

    func showOriginal(_ tab: BrowserTab) {
        tasks[tab.id]?.cancel()
        tab.navigationID = UUID()
        tab.isLoading = false; tab.liveViewURL = nil; tab.showsOriginal = true
    }

    func showNative(_ tab: BrowserTab) {
        tab.showsOriginal = false
        if tab.page == nil { resolve(tab) }
    }

    func originalNavigated(_ url: URL, in tab: BrowserTab) {
        guard tab.showsOriginal, Self.websiteURL(url.absoluteString) != nil else { return }
        if tab.url != url {
            tab.url = url; tab.title = url.host ?? "Website"
            tab.page = nil; tab.pending = nil; tab.etag = nil
            if selectedTabID == tab.id { address = url.absoluteString }
            saveTabs()
        }
    }

    func handle(_ action: ResolvedAction, in tab: BrowserTab) {
        guard action.name == "openURL", let value = action.context["url"],
              let data = try? JSONEncoder().encode(value),
              let text = try? JSONDecoder().decode(String.self, from: data),
              let url = URL(string: text, relativeTo: tab.url)?.absoluteURL,
              ["http", "https"].contains(url.scheme ?? ""), url.user == nil, url.password == nil else { return }
        navigate(url, in: tab)
    }

    func setScrollOffset(_ offset: CGFloat, for tab: BrowserTab) {
        tab.scrollOffset = max(0, Double(offset))
        setAtTop(tab.scrollOffset <= 2, for: tab)
    }

    func setAtTop(_ atTop: Bool, for tab: BrowserTab) {
        if tab.isAtTop != atTop { tab.isAtTop = atTop }
        applyPendingIfReady(tab)
    }

    func filter(_ tab: BrowserTab) {
        do { try tab.page?.applyFilter(tab.filter) }
        catch { tab.error = "The local filter could not be applied." }
    }

    func saveBackend(_ address: String) throws {
        _ = try BackendClient(address: address)
        for task in tasks.values { task.cancel() }
        for tab in tabs {
            tab.navigationID = UUID(); tab.isLoading = false; tab.liveViewURL = nil
            tab.etag = nil; tab.lastRevalidation = .distantPast; tab.refreshWarning = nil
        }
        backendAddress = address
        UserDefaults.standard.set(address, forKey: "backendAddress")
    }

    func closeTab(_ id: BrowserTab.ID) {
        tasks.removeValue(forKey: id)?.cancel()
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        tabs.remove(at: index)
        if selectedTabID == id {
            selectedTabID = tabs.isEmpty ? nil : tabs[min(index, tabs.count - 1)].id
            syncAddressWithSelection()
        }
        saveTabs()
    }

    func maintain() async {
        while !Task.isCancelled {
            do { try await Task.sleep(for: .seconds(15)) } catch { return }
            guard isActive else { continue }
            let ordered = tabs.sorted { $0.id == selectedTabID && $1.id != selectedTabID }
            for tab in ordered.prefix(8) where tab.page != nil && !tab.isLoading && !tab.showsOriginal {
                guard isActive, !Task.isCancelled else { break }
                await checkManifest(tab)
            }
            guard isActive, !Task.isCancelled else { continue }
            if let tab = ordered.first(where: { $0.page != nil && !$0.isLoading && !$0.showsOriginal && Date().timeIntervalSince($0.lastRevalidation) >= 60 }) {
                await revalidate(tab)
            }
        }
    }

    private func resolve(_ tab: BrowserTab) {
        guard let url = tab.url else { return }
        tasks[tab.id]?.cancel()
        let token = UUID(); tab.navigationID = token
        tab.isLoading = true; tab.error = nil; tab.refreshWarning = nil; tab.stage = "Connecting to conversion service…"
        let backend = backendAddress
        tasks[tab.id] = Task { [weak self, weak tab] in
            guard let self, let tab else { return }
            defer {
                if tab.navigationID == token { tab.isLoading = false; tab.liveViewURL = nil }
            }
            do {
                let client = try BackendClient(address: backend)
                try await client.events(path: "/resolve", body: ["url": url.absoluteString]) { [weak self, weak tab] name, data in
                    guard let self, let tab, tab.navigationID == token, !Task.isCancelled else { throw CancellationError() }
                    switch name {
                    case "status":
                        let status = try decodeWire(StatusEvent.self, from: data, context: "Progress event")
                        tab.stage = status.message
                        if ["captured", "compile", "compiling"].contains(status.stage) { tab.liveViewURL = nil }
                    case "liveView":
                        let event = try JSONDecoder().decode(LiveViewEvent.self, from: data)
                        if let live = URL(string: event.url), live.scheme == "https", live.user == nil, live.password == nil {
                            tab.liveViewURL = live
                        }
                    case "ready":
                        let ready = try decodeWire(ReadyEvent.self, from: data, context: "Ready event")
                        let bundle: PageBundle
                        if let inline = ready.bundle { bundle = inline }
                        else { bundle = try await client.bundle(at: ready.manifest.bundleURL) }
                        guard tab.navigationID == token, !Task.isCancelled else { throw CancellationError() }
                        try self.accept(bundle, manifest: ready.manifest, for: tab)
                        tab.stage = "Native page ready"; tab.lastRevalidation = Date(); tab.error = nil
                    case "error": throw BackendFailure(message: try decodeWire(ServerFailure.self, from: data, context: "Error event").message)
                    default: break
                    }
                }
            } catch is CancellationError { }
            catch {
                if tab.navigationID == token {
                    tab.error = error.localizedDescription
                    tab.stage = tab.page == nil ? "Conversion unavailable" : "Showing saved content"
                }
            }
        }
    }

    private func checkManifest(_ tab: BrowserTab) async {
        guard let page = tab.page else { return }
        let token = tab.navigationID
        do {
            let client = try BackendClient(address: backendAddress)
            let (manifest, etag) = try await client.manifest(pageKey: page.bundle.pageKey, etag: tab.etag)
            guard token == tab.navigationID, !Task.isCancelled else { return }
            if let manifest {
                try await receive(manifest, client: client, for: tab, token: token)
                tab.etag = etag
            }
            if token == tab.navigationID { tab.refreshWarning = nil }
        } catch {
            if token == tab.navigationID { tab.refreshWarning = "Update check unavailable. Showing saved content." }
        }
    }

    private func revalidate(_ tab: BrowserTab) async {
        guard let page = tab.page else { return }
        let token = tab.navigationID
        tab.lastRevalidation = Date()
        do {
            let client = try BackendClient(address: backendAddress)
            let result = try await client.revalidate(pageKey: page.bundle.pageKey)
            guard token == tab.navigationID, !Task.isCancelled else { return }
            try await receive(result.manifest, client: client, for: tab, token: token)
            if token == tab.navigationID { tab.refreshWarning = nil }
        } catch {
            if token == tab.navigationID { tab.refreshWarning = "Source check unavailable. Showing saved content." }
        }
    }

    private func receive(_ manifest: PageManifest, client: BackendClient, for tab: BrowserTab, token: UUID) async throws {
        guard manifest.protocolVersion == 1, manifest.pageKey == tab.page?.bundle.pageKey else {
            throw BackendFailure(message: "The update manifest does not match this page.")
        }
        let existing = tab.pending?.bundle ?? tab.page?.bundle
        guard manifest.specRevision != existing?.specRevision || manifest.recipeRevision != existing?.recipeRevision || manifest.contentRevision != existing?.contentRevision else { return }
        let bundle = try await client.bundle(at: manifest.bundleURL)
        guard token == tab.navigationID, !Task.isCancelled else { return }
        try accept(bundle, manifest: manifest, for: tab)
    }

    private func accept(_ bundle: PageBundle, manifest: PageManifest, for tab: BrowserTab) throws {
        guard let requested = tab.url,
              let source = URL(string: bundle.sourceURL),
              PageCache.canonicalURL(source) == PageCache.canonicalURL(requested),
              manifest.protocolVersion == 1, bundle.pageKey == manifest.pageKey,
              bundle.sourceURL == manifest.sourceURL, bundle.specRevision == manifest.specRevision,
              bundle.recipeRevision == manifest.recipeRevision, bundle.contentRevision == manifest.contentRevision else {
            throw BackendFailure(message: "The downloaded page does not match its manifest.")
        }
        let page = try NativePage(bundle: bundle)
        try cache.save(bundle)
        tab.title = bundle.title
        if tab.page == nil {
            tab.page = page; tab.fromCache = false
        } else {
            tab.pending = page
            applyPendingIfReady(tab)
        }
        saveTabs()
    }

    private func applyPendingIfReady(_ tab: BrowserTab) {
        guard isActive, selectedTabID == tab.id, tab.isAtTop, !tab.showsOriginal, let pending = tab.pending else { return }
        do {
            if let page = tab.page, page.bundle.specRevision == pending.bundle.specRevision {
                try page.updateContent(from: pending.bundle, filter: tab.filter)
            } else {
                try pending.applyFilter(tab.filter)
                tab.page = pending
            }
            tab.pending = nil; tab.fromCache = false
        } catch { tab.error = "The new content could not be applied. Your current page is preserved." }
    }

    private func saveTabs() { cache.saveTabs(tabs.map { PersistedTab(id: $0.id, title: $0.title, url: $0.url, scrollOffset: $0.scrollOffset) }) }

    static func websiteURL(_ text: String) -> URL? {
        let input = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidate = input.contains("://") ? input : "https://" + input
        guard !input.isEmpty, !input.contains(where: { $0.isWhitespace }),
              let url = URL(string: candidate), let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme), let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil else { return nil }
        return url
    }
}
