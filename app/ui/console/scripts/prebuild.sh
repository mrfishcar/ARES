#!/usr/bin/env bash
set -euo pipefail

# Prebuild script: Copy engine IR module into console app
# This allows the console to bundle IR code even when engine/ is not accessible

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSOLE_ROOT="$SCRIPT_DIR/.."
ENGINE_IR_SRC="$CONSOLE_ROOT/../../engine/ir"
ENGINE_IR_DEST="$CONSOLE_ROOT/src/engine-vendor/ir"

echo "=== Copying engine IR module to console app ==="
echo "Source: $ENGINE_IR_SRC"
echo "Destination: $ENGINE_IR_DEST"

# Create destination directory
mkdir -p "$ENGINE_IR_DEST"

# Copy IR TypeScript files
cp -r "$ENGINE_IR_SRC"/*.ts "$ENGINE_IR_DEST/" 2>/dev/null || true
cp -r "$ENGINE_IR_SRC"/types.ts "$ENGINE_IR_DEST/" 2>/dev/null || true

# Copy package dependencies if needed
if [ -f "$CONSOLE_ROOT/../../engine/schema.ts" ]; then
  mkdir -p "$CONSOLE_ROOT/src/engine-vendor"
  cp "$CONSOLE_ROOT/../../engine/schema.ts" "$CONSOLE_ROOT/src/engine-vendor/"
fi

echo "✓ Engine IR module copied successfully"
