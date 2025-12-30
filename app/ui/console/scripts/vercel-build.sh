#!/usr/bin/env bash
set -euo pipefail

# Move to the console app root
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Check if engine directory is accessible (needed for @engine imports)
ENGINE_DIR="$(cd ../../engine 2>/dev/null && pwd || echo "")"
if [ -z "$ENGINE_DIR" ] || [ ! -d "$ENGINE_DIR/ir" ]; then
  echo "ERROR: Engine directory not found at expected location"
  echo "Current directory: $(pwd)"
  echo "Looking for engine at: ../../engine"
  echo "This build requires access to the engine/ir module"
  echo "Make sure the full repository is available during build."
  exit 1
fi

echo "✓ Found engine directory: $ENGINE_DIR"

# Clear any proxy configuration that might break registry access
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
unset NPM_CONFIG_PROXY NPM_CONFIG_HTTPS_PROXY NPM_CONFIG_HTTP_PROXY NPM_CONFIG_NOPROXY NPM_CONFIG_NO_PROXY
unset npm_config_proxy npm_config_https_proxy npm_config_http_proxy npm_config_noproxy npm_config_no_proxy

# Force the public npm registry and tighten install behavior
export npm_config_registry="https://registry.npmjs.org/"
export npm_config_strict_ssl="true"
export npm_config_fund="false"
export npm_config_audit="false"
export npm_config_progress="false"

echo "=== npm diagnostics ==="
echo "npm version: $(npm -v)"
echo "node version: $(node -v)"
echo "npm registry: $(npm config get registry)"
echo "npm userconfig: $(npm config get userconfig)"
echo "npm globalconfig: $(npm config get globalconfig)"

# Install dependencies with retries. Skip npm ci to avoid lockfile drift errors in this environment.
set -x
npm cache clean --force || true
rm -f package-lock.json
npm install --legacy-peer-deps --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=20000 --registry="https://registry.npmjs.org/"
set +x

# Vendor engine IR files into console app (for bundling)
echo "=== Running prebuild to vendor engine files ==="
bash scripts/prebuild.sh

# Build the console
npm run build
