#!/usr/bin/env bash
set -euo pipefail

# Prebuild script: Copy engine IR module into console app
# This allows the console to bundle IR code even when engine/ is not accessible

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSOLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_IR_SRC="$CONSOLE_ROOT/../../engine/ir"
ENGINE_IR_DEST="$CONSOLE_ROOT/src/engine-vendor/ir"

echo "=== Copying engine IR module to console app ==="
echo "Console root: $CONSOLE_ROOT"
echo "Source: $ENGINE_IR_SRC"
echo "Destination: $ENGINE_IR_DEST"

# Verify source exists
if [ ! -d "$ENGINE_IR_SRC" ]; then
  echo "ERROR: Source directory not found: $ENGINE_IR_SRC"
  echo "Tried to find: $CONSOLE_ROOT/../../engine/ir"
  ls -la "$CONSOLE_ROOT/../../" || true
  exit 1
fi

# Create destination directory
mkdir -p "$ENGINE_IR_DEST"

# Copy all TypeScript files from IR module
echo "Copying TypeScript files..."
# Use find to avoid glob expansion issues with relative paths
find "$ENGINE_IR_SRC" -maxdepth 1 -name "*.ts" -type f -exec cp {} "$ENGINE_IR_DEST/" \; || {
  echo "ERROR: Failed to copy TypeScript files"
  exit 1
}

# Count files copied
FILE_COUNT=$(ls -1 "$ENGINE_IR_DEST"/*.ts 2>/dev/null | wc -l)
echo "✓ Copied $FILE_COUNT TypeScript files to $ENGINE_IR_DEST"

# Copy schema.ts if needed (for types)
if [ -f "$CONSOLE_ROOT/../../engine/schema.ts" ]; then
  mkdir -p "$CONSOLE_ROOT/src/engine-vendor"
  cp "$CONSOLE_ROOT/../../engine/schema.ts" "$CONSOLE_ROOT/src/engine-vendor/"
  echo "✓ Copied schema.ts"
fi

echo "✓ Engine IR module vendored successfully"
