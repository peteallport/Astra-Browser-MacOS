import Foundation

@main
struct VerifySSE {
    static func main() throws {
        for newline in ["\n", "\r\n", "\r"] {
            let input = [": heartbeat", "event: status", "data: {\"message\":\"Café…\"}", "", "event: ready", "data: {", "data: \"done\":true}", ""].joined(separator: newline) + newline
            var parser = SSEParser()
            var events: [(String, Data)] = []
            for byte in input.utf8 { if let event = try parser.push(byte) { events.append(event) } }
            if let event = try parser.finish() { events.append(event) }
            precondition(events.count == 2 && events[0].0 == "status" && events[1].0 == "ready")
            for event in events { _ = try JSONSerialization.jsonObject(with: event.1) }
        }
        print("SSE byte framing passed: LF, CRLF, CR, UTF-8, blank boundaries, comments, multiline data.")
    }
}
