import SwiftUI

struct PlaceholderPageView: View {
    let tab: BrowserTab?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Label("NOT CONNECTED", systemImage: "circle.dashed")
                    .font(.caption.weight(.semibold))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 16) {
                    Image(systemName: "square.stack.3d.up")
                        .font(.system(size: 40, weight: .light))
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)

                    Text(tab?.url == nil ? "A new view of the web." : "Ready for a native view.")
                        .font(.largeTitle.weight(.semibold))
                        .accessibilityAddTraits(.isHeader)

                    Text(tab?.url == nil
                         ? "Your websites, reimagined for your Mac."
                         : (tab?.url?.host ?? "Website"))
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Label("This is the native browser shell", systemImage: "macwindow")
                        .font(.headline)
                    Text("Create tabs, enter a URL, and switch between them. Website acquisition and native content rendering are not connected yet.")
                        .foregroundStyle(.secondary)
                    if let url = tab?.url {
                        Text(url.absoluteString)
                            .font(.callout.monospaced())
                            .textSelection(.enabled)
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))

                Text("No website has been loaded. These tabs are local placeholders and reset when the window closes.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: 640, alignment: .leading)
            .padding(40)
            .frame(maxWidth: .infinity, alignment: .center)
        }
    }
}
