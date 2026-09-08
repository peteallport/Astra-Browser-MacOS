import Foundation

struct BrowserTab: Identifiable {
    let id = UUID()
    var title: String
    var url: URL?

    static let examples = [
        BrowserTab(title: "Hacker News", url: URL(string: "https://news.ycombinator.com")),
        BrowserTab(title: "Wikipedia", url: URL(string: "https://en.wikipedia.org/wiki/Web_browser"))
    ]
}
