import SwiftUI
import WebKit

/// WebKit exists only for the selected original website or an ephemeral remote Live View.
struct WebPageView: NSViewRepresentable {
    let url: URL
    let watchOnly: Bool
    let onNavigation: @MainActor (URL) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(watchOnly: watchOnly, onNavigation: onNavigation) }

    func makeNSView(context: Context) -> RestrictedWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let view = RestrictedWebView(frame: .zero, configuration: configuration)
        view.watchOnly = watchOnly
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = !watchOnly
        view.load(URLRequest(url: url))
        context.coordinator.requestedURL = url
        return view
    }

    func updateNSView(_ view: RestrictedWebView, context: Context) {
        context.coordinator.onNavigation = onNavigation
        guard context.coordinator.requestedURL != url else { return }
        context.coordinator.requestedURL = url
        if view.url != url { view.load(URLRequest(url: url)) }
    }

    static func dismantleNSView(_ view: RestrictedWebView, coordinator: Coordinator) {
        view.stopLoading()
        view.navigationDelegate = nil
        view.uiDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let watchOnly: Bool
        var requestedURL: URL?
        var onNavigation: @MainActor (URL) -> Void
        init(watchOnly: Bool, onNavigation: @escaping @MainActor (URL) -> Void) {
            self.watchOnly = watchOnly; self.onNavigation = onNavigation
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if !watchOnly, let url = webView.url { requestedURL = url; onNavigation(url) }
        }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url, ["https", "http", "about"].contains(url.scheme ?? "") else { return .cancel }
            if watchOnly && action.navigationType == .linkActivated { return .cancel }
            return .allow
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if !watchOnly, let url = action.request.url, ["https", "http"].contains(url.scheme ?? "") {
                webView.load(URLRequest(url: url))
            }
            return nil
        }
    }
}

final class RestrictedWebView: WKWebView {
    var watchOnly = false
    override var acceptsFirstResponder: Bool { !watchOnly && super.acceptsFirstResponder }
    override func hitTest(_ point: NSPoint) -> NSView? { watchOnly ? nil : super.hitTest(point) }
}
