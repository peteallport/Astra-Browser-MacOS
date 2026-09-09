import Foundation

/// Byte-level SSE framing preserves blank lines; AsyncBytes.lines does not.
struct SSEParser {
    private var line = Data()
    private var eventName = "message"
    private var dataLines: [String] = []
    private var skipLF = false

    mutating func push(_ byte: UInt8) throws -> (String, Data)? {
        if byte == 10, skipLF { skipLF = false; return nil }
        if byte == 10 || byte == 13 {
            skipLF = byte == 13
            return try completeLine()
        }
        skipLF = false
        line.append(byte)
        return nil
    }

    mutating func finish() throws -> (String, Data)? {
        if !line.isEmpty, let event = try completeLine() { return event }
        return completeEvent()
    }

    private mutating func completeLine() throws -> (String, Data)? {
        guard let text = String(data: line, encoding: .utf8) else {
            throw SSEParsingError.invalidUTF8
        }
        line.removeAll(keepingCapacity: true)
        if text.isEmpty { return completeEvent() }
        if text.hasPrefix(":") { return nil }
        let parts = text.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
        let field = String(parts[0])
        var value = parts.count > 1 ? String(parts[1]) : ""
        if value.hasPrefix(" ") { value.removeFirst() }
        if field == "event" { eventName = value }
        if field == "data" { dataLines.append(value) }
        return nil
    }

    private mutating func completeEvent() -> (String, Data)? {
        defer { eventName = "message"; dataLines.removeAll(keepingCapacity: true) }
        guard !dataLines.isEmpty else { return nil }
        return (eventName, Data(dataLines.joined(separator: "\n").utf8))
    }
}

enum SSEParsingError: Error { case invalidUTF8 }
