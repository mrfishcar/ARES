#!/bin/sh
set -e

echo "=== Starting ARES Services on Railway ==="

# Build the Node.js server first
echo "Building Node.js server..."
npm run build

# Start the Python spaCy parser service in background
echo "Starting Python parser service on port 8000..."
cd app/services
uvicorn parser:app --host 0.0.0.0 --port 8000 &
PARSER_PID=$!
cd ../..

# Wait for parser to be ready
echo "Waiting for parser service to start..."
sleep 5

# Check if parser started successfully
if ! kill -0 $PARSER_PID 2>/dev/null; then
  echo "ERROR: Parser service failed to start"
  exit 1
fi

echo "✓ Parser service running (PID: $PARSER_PID)"

# Start the Node.js GraphQL API server (foreground)
echo "Starting GraphQL API server..."
exec node dist/start-server-and-worker.js
