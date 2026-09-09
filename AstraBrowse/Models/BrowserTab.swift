import Foundation
import Observation

@MainActor
@Observable
final class BrowserTab: Identifiable {
    let id: UUID
    var title: String
    var url: URL?
    var page: NativePage?
    var pending: NativePage?
    var isLoading = false
    var stage = ""
    var error: String?
    var refreshWarning: String?
    var liveViewURL: URL?
    var showsOriginal = false
    var isAtTop = true
    @ObservationIgnored var scrollOffset: Double = 0
    var filter = ""
    var fromCache = false
    var etag: String?
    var lastRevalidation = Date.distantPast
    var navigationID = UUID()
    var documentID = UUID()
    var hasUnreadContent: Bool {
        guard let pending else { return false }
        return page?.bundle.contentRevision != pending.bundle.contentRevision
    }
    init(id: UUID = UUID(), title: String = "New Tab", url: URL? = nil) {
        self.id = id; self.title = title; self.url = url
    }
}
