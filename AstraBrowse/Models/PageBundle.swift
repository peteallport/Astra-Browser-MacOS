import Foundation

indirect enum JSONValue: Codable, Sendable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    var object: [String: JSONValue]? { if case .object(let v) = self { v } else { nil } }
    var string: String? { if case .string(let v) = self { v } else { nil } }
}

struct PageBundle: Codable, Sendable {
    let protocolVersion: Int
    let pageKey: String
    let sourceURL: String
    let title: String
    let capturedAt: String
    let specRevision: String
    let recipeRevision: String
    let contentRevision: String
    let spec: Specification
    let recipe: JSONValue
    let content: JSONValue
    let generation: Generation
    struct Specification: Codable, Sendable {
        let catalogId: String
        let messages: [JSONValue]
    }
    struct Generation: Codable, Sendable {
        let model: String
        let generatedAt: String
        let promptVersion: String
    }
}

struct PageManifest: Codable, Sendable {
    let protocolVersion: Int
    let pageKey: String
    let bundleRevision: String
    let bundleURL: String
    let sourceURL: String
    let title: String
    let specRevision: String
    let recipeRevision: String
    let contentRevision: String
    let capturedAt: String
    let sourceCheckedAt: String
}

struct ReadyEvent: Decodable, Sendable {
    let manifest: PageManifest
    let bundle: PageBundle?
}
struct StatusEvent: Decodable, Sendable { let stage: String; let message: String }
struct LiveViewEvent: Decodable, Sendable { let url: String }
struct ServerFailure: Decodable, Sendable { let code: String; let message: String }
struct PersistedTab: Codable { let id: UUID; let title: String; let url: URL?; let scrollOffset: Double? }
