#!/bin/bash
# Install Chrome native messaging host manifest for Niavi Companion (macOS)

HOST_NAME="com.niavi.companion"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$MANIFEST_DIR"
cp "$SCRIPT_DIR/$HOST_NAME.json" "$MANIFEST_DIR/"

echo "Native messaging host installed to: $MANIFEST_DIR/$HOST_NAME.json"
