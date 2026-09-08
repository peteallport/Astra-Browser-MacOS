#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="AstraBrowse"
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# This checkout may be in a File Provider folder. Build outside it so Finder
# metadata cannot make codesigning reject the generated app bundle.
BUILD_DIR="${ASTRABROWSE_BUILD_DIR:-${TMPDIR:-/tmp}/AstraBrowse-$UID/DerivedData}"
APP_BUNDLE="$BUILD_DIR/Build/Products/Debug/$APP_NAME.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

case "$MODE" in
  run|--build-only|--debug|--logs|--telemetry|--verify) ;;
  *)
    echo "usage: $0 [--build-only|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac

if [ "$MODE" != "--build-only" ]; then
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
fi

# Use local ad-hoc signing; no developer account or distribution certificate is required.
xcodebuild -project "$TASK_ROOT/AstraBrowse.xcodeproj" \
  -scheme "$APP_NAME" \
  -configuration Debug \
  -destination 'platform=macOS' \
  -derivedDataPath "$BUILD_DIR" \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= \
  build

case "$MODE" in
  --build-only)
    echo "Built $APP_BUNDLE"
    ;;
  --debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs)
    /usr/bin/open -n "$APP_BUNDLE"
    /usr/bin/log stream --info --style compact --predicate 'process == "AstraBrowse"'
    ;;
  --telemetry)
    /usr/bin/open -n "$APP_BUNDLE"
    /usr/bin/log stream --info --style compact --predicate 'subsystem == "org.astrabrowse.app"'
    ;;
  --verify)
    /usr/bin/open -n "$APP_BUNDLE"
    sleep 1
    pgrep -x "$APP_NAME" >/dev/null
    echo "AstraBrowse is running."
    ;;
  run)
    /usr/bin/open -n "$APP_BUNDLE"
    ;;
esac
