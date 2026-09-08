import Foundation

@main
struct VerifyProtocol {
    static func main() throws {
        let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        func data(_ name: String) throws -> Data { try Data(contentsOf: directory.appendingPathComponent(name)) }
        let decoder = JSONDecoder()
        let manifest = try decoder.decode(PageManifest.self, from: data("manifest.json"))
        let bundle = try decoder.decode(PageBundle.self, from: data("bundle.json"))
        let refresh = try decoder.decode(BackendClient.Revalidation.self, from: data("revalidation.json"))
        var parser = SSEParser()
        var ready: ReadyEvent?
        var statusCount = 0
        func receive(_ event: (String, Data)) throws {
            switch event.0 {
            case "status":
                let status = try decoder.decode(StatusEvent.self, from: event.1)
                precondition(!status.stage.isEmpty && !status.message.isEmpty)
                statusCount += 1
            case "ready":
                precondition(ready == nil, "Duplicate terminal event")
                ready = try decoder.decode(ReadyEvent.self, from: event.1)
            default:
                preconditionFailure("Unexpected event in a successful fixture: \(event.0)")
            }
        }
        for byte in try data("ready.sse") {
            if let event = try parser.push(byte) { try receive(event) }
        }
        if let event = try parser.finish() { try receive(event) }
        precondition(statusCount > 0 && ready != nil)
        precondition(ready?.manifest.bundleRevision == manifest.bundleRevision)
        precondition(manifest.protocolVersion == 1 && bundle.protocolVersion == 1)
        precondition(manifest.pageKey == bundle.pageKey && manifest.sourceURL == bundle.sourceURL)
        precondition(manifest.specRevision == bundle.specRevision)
        precondition(manifest.recipeRevision == bundle.recipeRevision)
        precondition(manifest.contentRevision == bundle.contentRevision)
        precondition(bundle.spec.catalogId == "https://a2ui.org/specification/v0_9/basic_catalog.json")
        precondition(!bundle.spec.messages.isEmpty && bundle.content.object != nil)
        precondition(bundle.generation.model == "local-test-fixture-no-model")
        if let inline = ready?.bundle { precondition(inline.contentRevision == bundle.contentRevision) }
        precondition(refresh.changed && refresh.manifest.pageKey == manifest.pageKey)
        precondition(refresh.manifest.specRevision == manifest.specRevision)
        precondition(refresh.manifest.recipeRevision == manifest.recipeRevision)
        precondition(refresh.manifest.contentRevision != manifest.contentRevision)
        print("Protocol passed: real TypeScript SSE, manifest, bundle, and content-only refresh decode in the Swift client models.")
    }
}
