import SwiftUI

@main
struct AstraBrowseApp: App {
    var body: some Scene {
        WindowGroup("AstraBrowse") {
            ContentView()
        }
        .defaultSize(width: 1120, height: 760)
        .commands {
            BrowserCommands()
        }
    }
}
