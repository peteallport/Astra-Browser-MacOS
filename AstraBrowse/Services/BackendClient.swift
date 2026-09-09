import Foundation

struct BackendFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct BackendClient: Sendable {
    let baseURL: URL
    private let maximumBytes = 5 * 1024 * 1024

    init(address: String) throws {
        guard let url = URL(string: address), let scheme = url.scheme, let host = url.host, !host.isEmpty,
              scheme == "https" || (scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "")),
              url.user == nil, url.password == nil else {
            throw BackendFailure(message: "Use an HTTPS backend URL or HTTP localhost for development.")
        }
        baseURL = url
    }

    func events(path: String, body: [String: String], onEvent: @escaping @MainActor @Sendable (String, Data) async throws -> Void) async throws {
        var request = URLRequest(url: try endpoint(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 100
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        try validate(response)
        guard (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")?.contains("text/event-stream") == true else {
            throw BackendFailure(message: "Backend did not return a progress stream.")
        }
        var parser = SSEParser()
        var total = 0
        var terminal = false
        for try await byte in bytes {
            try Task.checkCancellation()
            total += 1
            guard total <= maximumBytes else { throw BackendFailure(message: "The response exceeded the client size limit.") }
            if let (name, eventData) = try parser.push(byte) {
                try await onEvent(name, eventData)
                if name == "ready" || name == "error" { terminal = true; break }
            }
        }
        if !terminal, let (name, data) = try parser.finish() {
            try await onEvent(name, data)
            terminal = name == "ready" || name == "error"
        }
        guard terminal else { throw BackendFailure(message: "The conversion stream ended before a result arrived.") }
    }

    func manifest(pageKey: String, etag: String?) async throws -> (PageManifest?, String?) {
        let safeKey = pageKey.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        var request = URLRequest(url: try endpoint("/pages/\(safeKey)/manifest"))
        request.timeoutInterval = 12
        if let etag { request.setValue(etag, forHTTPHeaderField: "If-None-Match") }
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = response as? HTTPURLResponse
        if http?.statusCode == 304 { return (nil, etag) }
        try validate(response)
        guard data.count <= maximumBytes else { throw BackendFailure(message: "Manifest exceeds the client size limit.") }
        return (try decodeWire(PageManifest.self, from: data, context: "Page manifest"), http?.value(forHTTPHeaderField: "ETag"))
    }

    struct Revalidation: Decodable, Sendable { let manifest: PageManifest; let changed: Bool }

    func revalidate(pageKey: String) async throws -> Revalidation {
        let safeKey = pageKey.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        var request = URLRequest(url: try endpoint("/pages/\(safeKey)/revalidate"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data("{}".utf8)
        request.timeoutInterval = 100
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        guard data.count <= maximumBytes else { throw BackendFailure(message: "Revalidation response exceeds the size limit.") }
        return try decodeWire(Revalidation.self, from: data, context: "Source revalidation")
    }

    func bundle(at path: String) async throws -> PageBundle {
        var request = URLRequest(url: try endpoint(path))
        request.timeoutInterval = 20
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        try validate(response)
        var data = Data()
        for try await byte in bytes {
            guard data.count < maximumBytes else { throw BackendFailure(message: "Page bundle exceeds the client size limit.") }
            data.append(byte)
        }
        return try decodeWire(PageBundle.self, from: data, context: "Page bundle")
    }

    private func endpoint(_ path: String) throws -> URL {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.scheme == baseURL.scheme, url.host == baseURL.host,
              url.port == baseURL.port, url.user == nil, url.password == nil else {
            throw BackendFailure(message: "The backend returned an unexpected artifact origin.")
        }
        return url
    }
    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw BackendFailure(message: "Backend request failed (HTTP \(code)). Check the backend address and service.")
        }
    }
}

func decodeWire<T: Decodable>(_ type: T.Type, from data: Data, context: String) throws -> T {
    do { return try JSONDecoder().decode(type, from: data) }
    catch DecodingError.keyNotFound(let key, let details) {
        throw BackendFailure(message: "\(context): missing \(key.stringValue) at \(details.codingPath.map(\.stringValue).joined(separator: ".")).")
    } catch DecodingError.typeMismatch(_, let details) {
        throw BackendFailure(message: "\(context): unexpected value type at \(details.codingPath.map(\.stringValue).joined(separator: ".")).")
    } catch DecodingError.dataCorrupted(let details) {
        throw BackendFailure(message: "\(context): invalid JSON at \(details.codingPath.map(\.stringValue).joined(separator: ".")).")
    } catch { throw BackendFailure(message: "\(context): \(error.localizedDescription)") }
}
