import SwiftUI

private struct NewTabActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

private struct FocusAddressActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

extension FocusedValues {
    var browserNewTab: (() -> Void)? {
        get { self[NewTabActionKey.self] }
        set { self[NewTabActionKey.self] = newValue }
    }

    var browserFocusAddress: (() -> Void)? {
        get { self[FocusAddressActionKey.self] }
        set { self[FocusAddressActionKey.self] = newValue }
    }
}

struct BrowserCommands: Commands {
    @FocusedValue(\.browserNewTab) private var newTab
    @FocusedValue(\.browserFocusAddress) private var focusAddress

    var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("New Tab") { newTab?() }
                .keyboardShortcut("t", modifiers: .command)
                .disabled(newTab == nil)
        }
        CommandMenu("Browse") {
            Button("Focus Address Bar") { focusAddress?() }
                .keyboardShortcut("l", modifiers: .command)
                .disabled(focusAddress == nil)
        }
    }
}
