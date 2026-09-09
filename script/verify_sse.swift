import Foundation

@main
struct VerifySSE {
    static func parse(_ input: String) throws -> [(String, Data)] {
        var parser = SSEParser()
        var events: [(String, Data)] = []
        for byte in input.utf8 {
            if let event = try parser.push(byte) { events.append(event) }
        }
        if let event = try parser.finish() { events.append(event) }
        return events
    }

    static func main() throws {
        for newline in ["\n", "\r\n", "\r"] {
            let input = [": heartbeat", "event: status", "data: {\"message\":\"Café…\"}", "", "event: ready", "data: {", "data: \"done\":true}", ""].joined(separator: newline) + newline
            let events = try parse(input)
            precondition(events.count == 2 && events[0].0 == "status" && events[1].0 == "ready")
            for event in events { _ = try JSONSerialization.jsonObject(with: event.1) }
        }

        // A complete terminal payload must survive a peer closing without an extra blank line.
        for ending in ["", "\n", "\r", "\r\n", "\n\n"] {
            let events = try parse("event: ready\ndata: {\"done\":true}" + ending)
            precondition(events.count == 1 && events[0].0 == "ready")
            _ = try JSONSerialization.jsonObject(with: events[0].1)
        }

        // A server failure remains an error event, never a synthesized success or an EOF.
        let failure = try parse("event: error\ndata: {\"code\":\"SOURCE_BLOCKED\",\"message\":\"Site denied access.\"}\n\n")
        precondition(failure.count == 1 && failure[0].0 == "error")
        let failureJSON = try JSONSerialization.jsonObject(with: failure[0].1) as? [String: String]
        precondition(failureJSON?["code"] == "SOURCE_BLOCKED")

        // A status-only response really is missing its result. Framing must not invent one.
        let incomplete = try parse("event: status\ndata: {\"stage\":\"capture\"}\n\n: keepalive\n\n")
        precondition(incomplete.count == 1 && incomplete[0].0 == "status")
        let empty = try parse("")
        precondition(empty.isEmpty)

        // Preserve a truncated ready payload so the JSON decoder reports corruption explicitly.
        let truncated = try parse("event: ready\ndata: {\"manifest\":")
        precondition(truncated.count == 1 && truncated[0].0 == "ready")
        precondition((try? JSONSerialization.jsonObject(with: truncated[0].1)) == nil)

        print("SSE checks passed: newline/UTF-8 framing, final-event EOF, server errors, status-only EOF, empty streams, and truncated JSON.")
    }
}
