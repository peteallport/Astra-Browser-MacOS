import CryptoKit
import Foundation

struct PageCache {
    private let directory: URL
    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        directory = support.appendingPathComponent("AstraBrowse", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    func load(sourceURL: URL) -> PageBundle? {
        let file = location(sourceURL)
        guard let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 5 * 1024 * 1024,
              let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(PageBundle.self, from: data)
    }
    func save(_ bundle: PageBundle) throws {
        guard let url = URL(string: bundle.sourceURL) else { return }
        let data = try JSONEncoder().encode(bundle)
        guard data.count <= 5 * 1024 * 1024 else { return }
        try data.write(to: location(url), options: .atomic)
        let entries = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        let bundles = entries.filter { $0.lastPathComponent.hasPrefix("page-") }.sorted {
            ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) >
            ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
        }
        for old in bundles.dropFirst(20) { try? FileManager.default.removeItem(at: old) }
    }
    func loadTabs() -> [PersistedTab] {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent("tabs.json")) else { return [] }
        return (try? JSONDecoder().decode([PersistedTab].self, from: data)) ?? []
    }
    func saveTabs(_ tabs: [PersistedTab]) {
        guard let data = try? JSONEncoder().encode(tabs) else { return }
        try? data.write(to: directory.appendingPathComponent("tabs.json"), options: .atomic)
    }
    static func canonicalURL(_ url: URL) -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        components.fragment = nil
        components.scheme = components.scheme?.lowercased()
        components.host = components.host?.lowercased()
        if components.path.isEmpty { components.path = "/" }
        if (components.scheme == "https" && components.port == 443) || (components.scheme == "http" && components.port == 80) { components.port = nil }
        return components.url ?? url
    }
    private func location(_ url: URL) -> URL {
        let key = SHA256.hash(data: Data(Self.canonicalURL(url).absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent("page-\(key).json")
    }
}
