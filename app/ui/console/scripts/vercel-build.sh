#!/usr/bin/env bash
set -euo pipefail

# Move to the console app root
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

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

# Add a few retries to handle transient network hiccups
set -x
if ! npm ci --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=20000 --registry="https://registry.npmjs.org/" ; then
  echo "npm ci failed; retrying with fresh cache and legacy peer deps as a fallback (will regenerate lock locally if needed)"
  npm cache clean --force || true
  # If the lockfile is out of sync, let npm recreate it in the build environment.
  rm -f package-lock.json
  npm install --legacy-peer-deps --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=20000 --registry="https://registry.npmjs.org/"
fi
set +x

# Build the console
npm run build
