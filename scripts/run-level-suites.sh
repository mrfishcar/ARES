#!/usr/bin/env bash
set -euo pipefail

# always run from repo root
cd "$(dirname "$0")/.."

# tell the app where your parser lives (base URL, no trailing path)
export PARSER_URL="${PARSER_URL:-http://127.0.0.1:8000}"
export L3_REL_TRACE=1

echo "Using PARSER_URL=$PARSER_URL"
[ -d tmp ] || mkdir -p tmp

# Level 1
TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register ./node_modules/.bin/vitest run --no-cache tests/ladder/level-1-simple.spec.ts

# Level 2
TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register ./node_modules/.bin/vitest run --no-cache tests/ladder/level-2-multi.spec.ts

# Level 3
TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register ./node_modules/.bin/vitest run --no-cache tests/ladder/level-3-complex.spec.ts

# Show recent relation trace lines (if any)
if [ -f tmp/relation-trace.log ]; then
  echo
  echo "── relation trace (last 120 lines) ──"
  tail -n 120 tmp/relation-trace.log
else
  echo "no relation trace found"
fi
