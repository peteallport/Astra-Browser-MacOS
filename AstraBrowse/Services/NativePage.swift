import A2UISwiftCore
import A2UISwiftUI
import Foundation
import Observation

@MainActor
@Observable
final class NativePage {
    private(set) var bundle: PageBundle
    let viewModel: SurfaceViewModel
    static let catalogID = "https://a2ui.org/specification/v0_9/basic_catalog.json"
    private static let allowed = Set(["Column", "Row", "Text", "Image", "Divider", "Card", "Button", "List"])

    init(bundle: PageBundle) throws {
        guard bundle.protocolVersion == 1, bundle.spec.catalogId == Self.catalogID,
              !bundle.spec.messages.isEmpty, bundle.spec.messages.count <= 8 else {
            throw BackendFailure(message: "This page uses an unsupported native specification.")
        }
        let data = try JSONEncoder().encode(bundle.spec.messages)
        let messages = try decodeWire([A2uiMessage].self, from: data, context: "A2UI specification")
        var created = false
        var componentCount = 0
        for message in messages {
            switch message {
            case .createSurface(let payload):
                guard !created, payload.surfaceId == "page", payload.catalogId == Self.catalogID else {
                    throw BackendFailure(message: "The page surface or catalog does not match this client.")
                }
                created = true
            case .updateComponents(let payload):
                guard created, payload.surfaceId == "page" else { throw BackendFailure(message: "Invalid page message order.") }
                componentCount += payload.components.count
                guard componentCount <= 200 else { throw BackendFailure(message: "The generated page has too many components.") }
                for component in payload.components {
                    guard Self.allowed.contains(component.component) else { throw BackendFailure(message: "Unsupported native component: \(component.component)") }
                }
            default: throw BackendFailure(message: "Content must be separate from the UI specification.")
            }
        }
        guard created else { throw BackendFailure(message: "The native page did not define a surface.") }
        self.bundle = bundle
        viewModel = SurfaceViewModel(surface: SurfaceModel(id: "page", catalog: basicCatalog))
        let errors = viewModel.processMessages(messages)
        guard errors.isEmpty else { throw BackendFailure(message: "The native specification could not be rendered.") }
        try installContent(bundle.content)
        guard viewModel.componentTree != nil else { throw BackendFailure(message: "The native page has no root component.") }
    }

    func updateContent(from bundle: PageBundle, filter: String) throws {
        // Derive and validate the replacement before publishing its metadata.
        try installContent(filteredContent(bundle.content, query: filter))
        self.bundle = bundle
    }

    func applyFilter(_ query: String) throws {
        try installContent(filteredContent(bundle.content, query: query))
    }

    private func filteredContent(_ content: JSONValue, query: String) -> JSONValue {
        guard !query.isEmpty, var object = content.object,
              let lists = object["lists"]?.object else { return content }
        var filtered: [String: JSONValue] = [:]
        for (key, value) in lists {
            if case .array(let rows) = value {
                filtered[key] = .array(rows.filter { searchableText($0).localizedCaseInsensitiveContains(query) })
            } else { filtered[key] = value }
        }
        object["lists"] = .object(filtered)
        return .object(object)
    }

    private func searchableText(_ value: JSONValue) -> String {
        switch value {
        case .string(let text): return text
        case .object(let entries): return entries.values.map(searchableText).joined(separator: " ")
        case .array(let entries): return entries.map(searchableText).joined(separator: " ")
        default: return ""
        }
    }

    private func installContent(_ value: JSONValue) throws {
        let content = try JSONDecoder().decode(AnyCodable.self, from: JSONEncoder().encode(value))
        try viewModel.processMessage(.updateDataModel(UpdateDataModelPayload(surfaceId: "page", path: "/content", value: content)))
    }
}
