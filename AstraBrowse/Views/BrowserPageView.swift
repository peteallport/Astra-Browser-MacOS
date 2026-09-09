import SwiftUI
import A2UISwiftUI

struct BrowserPageView: View {
    let browser: BrowserStore
    @Bindable var tab: BrowserTab
    @State private var restoringScroll = true

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Label(tab.showsOriginal ? "Original website" : "Native view", systemImage: tab.showsOriginal ? "globe" : "square.stack.3d.up")
                    .font(.caption.weight(.medium)).foregroundStyle(.secondary)
                Spacer()
                if tab.showsOriginal {
                    Button("Native View") { restoringScroll = true; browser.showNative(tab) }.controlSize(.small)
                } else {
                    Button("Original Website") { browser.showOriginal(tab) }.controlSize(.small)
                }
            }.padding(.horizontal, 24).padding(.vertical, 9)
            Divider()
            if tab.showsOriginal, let url = tab.url {
                WebPageView(url: url, watchOnly: false) { browser.originalNavigated($0, in: tab) }
                    .id(tab.id)
            } else if let page = tab.page {
                nativePage(page).id(tab.documentID)
            } else {
                conversionProgress
            }
        }
    }

    private func nativePage(_ page: NativePage) -> some View {
        VStack(spacing: 0) {
            if tab.isLoading {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(tab.stage).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                }.padding(.horizontal, 28).padding(.vertical, 8)
            }
            if let error = tab.error ?? tab.refreshWarning {
                HStack {
                    Image(systemName: "wifi.exclamationmark")
                    Text(error).lineLimit(2)
                    Spacer()
                    Button("Try Again") { browser.retry(tab) }
                }.font(.caption).foregroundStyle(.secondary).padding(.horizontal, 28).padding(.vertical, 8)
            }
            if page.bundle.content.object?["lists"]?.object?.isEmpty == false {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Filter this page", text: $tab.filter).textFieldStyle(.plain)
                        .onChange(of: tab.filter) { browser.filter(tab) }
                    if !tab.filter.isEmpty {
                        Button { tab.filter = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain).accessibilityLabel("Clear filter")
                    }
                }.padding(10).background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                    .padding(.horizontal, 28).padding(.top, 12)
            }
            ScrollViewReader { proxy in
                VStack(spacing: 0) {
                    if tab.hasUnreadContent {
                        Button {
                            withAnimation { proxy.scrollTo("page-top", anchor: .top) }
                        } label: {
                            Label("New content is ready. Return to the top", systemImage: "arrow.up.circle.fill")
                                .font(.caption).frame(maxWidth: .infinity).padding(8)
                        }.buttonStyle(.plain).foregroundStyle(.tint)
                    }
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            ScrollTopMarker(initialOffset: tab.scrollOffset) { offset in
                                if !restoringScroll { browser.setScrollOffset(offset, for: tab) }
                            } restored: { offset in
                                restoringScroll = false
                                browser.setScrollOffset(offset, for: tab)
                            }.frame(height: 0)
                            HStack(spacing: 5) {
                                Text(page.bundle.generation.model.contains("fixture") ? "Local protocol fixture" : "Astra generated")
                                Text("·")
                                Text(tab.fromCache ? "Saved on this Mac" : "Native content")
                                Spacer()
                                Text(capturedTime(page.bundle.capturedAt))
                            }.font(.caption).foregroundStyle(.tertiary)
                            A2UISurfaceView(viewModel: page.viewModel, scrolls: false) { action in
                                Task { @MainActor in browser.handle(action, in: tab) }
                            }
                            .textSelection(.enabled)
                            .environment(\.openURL, OpenURLAction { url in
                                guard ["http", "https"].contains(url.scheme ?? ""), url.user == nil, url.password == nil else { return .discarded }
                                browser.navigate(url, in: tab)
                                return .handled
                            })
                        }
                        .padding(.horizontal, 28).padding(.vertical, 16)
                        .frame(maxWidth: 1000, alignment: .leading).frame(maxWidth: .infinity)
                        .id("page-top")
                    }
                    .trackScrollPosition { offset in
                        if !restoringScroll { browser.setScrollOffset(offset, for: tab) }
                    }
                }
            }
        }
    }

    private var conversionProgress: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 16) {
                    if tab.isLoading { ProgressView().controlSize(.large) }
                    else { Image(systemName: "globe.badge.chevron.backward").font(.largeTitle).foregroundStyle(.secondary) }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(tab.isLoading ? "Creating your native view" : "Couldn't create a native view")
                            .font(.title2.weight(.semibold))
                        Text(tab.stage).foregroundStyle(.secondary)
                    }
                }
                if let error = tab.error {
                    Text(error).foregroundStyle(.secondary).textSelection(.enabled)
                    HStack {
                        Button("Try Again") { browser.retry(tab) }
                        Button("Open Original Website") { browser.showOriginal(tab) }
                    }
                }
                if let liveURL = tab.liveViewURL {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Live View · watch only", systemImage: "eye").font(.caption.weight(.medium))
                        WebPageView(url: liveURL, watchOnly: true, onNavigation: { _ in })
                            .frame(height: 350).clipShape(RoundedRectangle(cornerRadius: 12))
                            .accessibilityHidden(true)
                    }
                }
                Text("The service reads the page and creates a native layout. You can switch tabs while it works.")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(40).frame(maxWidth: 850, alignment: .leading).frame(maxWidth: .infinity)
        }
    }

    private func capturedTime(_ string: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: string) ?? ISO8601DateFormatter().date(from: string) else { return "" }
        return "Captured " + date.formatted(date: .omitted, time: .shortened)
    }
}
