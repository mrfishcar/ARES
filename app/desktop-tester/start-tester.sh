#!/bin/bash

# Ares Desktop Tester Launcher
# Simple script to start the testing application

echo ""
echo "🏺 Ares Desktop Tester"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if node_modules exists
if [ ! -d "$DIR/node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd "$DIR" && npm install
  echo ""
fi

# Start the server
echo "🚀 Starting server..."
echo ""
echo "✓ Backend: http://localhost:3000"
echo "✓ Output: ~/Desktop/test_wikis/"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd "$DIR" && npm start
