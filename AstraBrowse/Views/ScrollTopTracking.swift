import AppKit
import SwiftUI

extension View {
    @ViewBuilder
    func trackScrollPosition(_ changed: @escaping @MainActor (CGFloat) -> Void) -> some View {
        if #available(macOS 15.0, *) {
            self.onScrollGeometryChange(for: CGFloat.self) { geometry in
                geometry.contentOffset.y - geometry.contentInsets.top
            } action: { _, offset in
                changed(offset)
            }
        } else {
            self
        }
    }
}

/// Restores one native scroll view; no source WebKit view is retained for inactive tabs.
struct ScrollTopMarker: NSViewRepresentable {
    let initialOffset: Double
    let changed: @MainActor (CGFloat) -> Void
    let restored: @MainActor (CGFloat) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(initialOffset: initialOffset, changed: changed, restored: restored) }
    func makeNSView(context: Context) -> ProbeView {
        let view = ProbeView()
        view.attach = { [weak coordinator = context.coordinator] scroll in coordinator?.observe(scroll) }
        return view
    }
    func updateNSView(_ view: ProbeView, context: Context) {
        context.coordinator.changed = changed
        context.coordinator.restored = restored
    }
    static func dismantleNSView(_ view: ProbeView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor
    final class ProbeView: NSView {
        var attach: ((NSScrollView?) -> Void)?
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.attach?(self.enclosingScrollView)
            }
        }
    }

    @MainActor
    final class Coordinator {
        let initialOffset: Double
        var changed: @MainActor (CGFloat) -> Void
        var restored: @MainActor (CGFloat) -> Void
        private weak var scroll: NSScrollView?
        private var observer: NSObjectProtocol?
        private var restoring = true
        init(initialOffset: Double, changed: @escaping @MainActor (CGFloat) -> Void, restored: @escaping @MainActor (CGFloat) -> Void) {
            self.initialOffset = initialOffset; self.changed = changed; self.restored = restored
        }
        func observe(_ scroll: NSScrollView?) {
            guard self.scroll !== scroll else { return }
            stop()
            self.scroll = scroll
            guard let scroll else { return }
            restoring = true
            if #available(macOS 15.0, *) { } else {
                scroll.contentView.postsBoundsChangedNotifications = true
                observer = NotificationCenter.default.addObserver(forName: NSView.boundsDidChangeNotification, object: scroll.contentView, queue: .main) { [weak self] _ in
                    MainActor.assumeIsolated { self?.report() }
                }
            }
            DispatchQueue.main.async { [weak self] in self?.restore() }
        }
        func stop() {
            if let observer { NotificationCenter.default.removeObserver(observer) }
            observer = nil; scroll = nil
        }
        private func restore() {
            guard let scroll, let document = scroll.documentView else { return }
            let clip = scroll.contentView
            let maximum = max(0, document.bounds.height - clip.bounds.height)
            let target = min(CGFloat(initialOffset), maximum)
            let y = document.isFlipped ? document.bounds.minY + target : document.bounds.maxY - clip.bounds.height - target
            clip.scroll(to: NSPoint(x: clip.bounds.minX, y: y))
            scroll.reflectScrolledClipView(clip)
            restoring = false
            restored(offset())
        }
        private func offset() -> CGFloat {
            guard let scroll, let document = scroll.documentView else { return 0 }
            let viewport = scroll.contentView.bounds
            return max(0, document.isFlipped ? viewport.minY - document.bounds.minY : document.bounds.maxY - viewport.maxY)
        }
        private func report() {
            guard !restoring else { return }
            changed(offset())
        }
    }
}
