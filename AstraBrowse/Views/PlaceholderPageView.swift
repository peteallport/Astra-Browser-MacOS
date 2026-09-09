import SwiftUI

struct PlaceholderPageView: View {
    let open: (String) -> Void
    private let examples = [
        ("Hacker News", "Technology & ideas", "https://news.ycombinator.com/", "newspaper"),
        ("Wikipedia", "Explore the open encyclopedia", "https://en.wikipedia.org/wiki/Web_browser", "book"),
        ("Astra", "Meet the model behind AstraBrowse", "https://openai.com/index/gpt-6-astra/", "sparkles")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Image(systemName: "square.stack.3d.up")
                    .font(.system(size: 44, weight: .light)).foregroundStyle(.tint).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 12) {
                    Text("A new view of the web.").font(.largeTitle.weight(.semibold))
                        .accessibilityAddTraits(.isHeader)
                    Text("Your websites, reimagined for your Mac.").font(.title3).foregroundStyle(.secondary)
                }
                Text("Enter a public website above. Astra turns its structure into native views, while content stays fresh in the background.")
                    .foregroundStyle(.secondary)
                VStack(spacing: 0) {
                    ForEach(examples, id: \.0) { item in
                        Button { open(item.2) } label: {
                            HStack(spacing: 16) {
                                Image(systemName: item.3).font(.title2).frame(width: 30)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.0).font(.headline)
                                    Text(item.1).font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "arrow.up.right").foregroundStyle(.secondary)
                            }
                            .padding(20).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        if item.0 != "Astra" { Divider().padding(.leading, 66) }
                    }
                }
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
                Text("Native views are saved on this Mac. Original websites remain available when you need them.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: 640, alignment: .leading).padding(40)
            .frame(maxWidth: .infinity)
        }
    }
}
