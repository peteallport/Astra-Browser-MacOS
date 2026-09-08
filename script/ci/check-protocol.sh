#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/astrabrowse-protocol.XXXXXX")"
trap 'rm -rf "$CHECK_DIR"' EXIT
cd "$TASK_ROOT"

node --experimental-strip-types script/ci/generate-protocol-fixture.mts "$CHECK_DIR"
xcrun swiftc -swift-version 6 -parse-as-library \
  -module-cache-path "$CHECK_DIR/module-cache" \
  AstraBrowse/Services/SSEParser.swift script/verify_sse.swift \
  -o "$CHECK_DIR/verify-sse"
"$CHECK_DIR/verify-sse"
xcrun swiftc -swift-version 6 -parse-as-library \
  -module-cache-path "$CHECK_DIR/module-cache" \
  AstraBrowse/Models/PageBundle.swift AstraBrowse/Services/SSEParser.swift \
  AstraBrowse/Services/BackendClient.swift script/ci/verify-protocol.swift \
  -o "$CHECK_DIR/verify-protocol"
"$CHECK_DIR/verify-protocol" "$CHECK_DIR"
