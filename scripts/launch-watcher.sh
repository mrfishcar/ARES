#!/bin/bash
#
# 🤖 ARES AI Collaboration Watcher Launcher
# Single-click script to start the automated handoff system
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════╗"
echo "║   🤖 ARES Watcher Launcher 🤖            ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# Change to ARES directory
cd "$(dirname "$0")/.." || exit 1
ARES_ROOT=$(pwd)

echo -e "${BLUE}📁 ARES Root: ${ARES_ROOT}${NC}\n"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "Please install Node.js first"
    exit 1
fi

echo -e "${GREEN}✅ Node.js found: $(node --version)${NC}"

# Check if TypeScript is available
if ! command -v ts-node &> /dev/null; then
    echo -e "${YELLOW}⚠️  ts-node not found, installing...${NC}"
    npm install -g ts-node
fi

echo -e "${GREEN}✅ ts-node found${NC}"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Check for chokidar
if ! npm list chokidar &> /dev/null; then
    echo -e "${YELLOW}📦 Installing chokidar...${NC}"
    npm install --save-dev chokidar @types/node
fi

echo -e "${GREEN}✅ Dependencies ready${NC}\n"

# Create handoff document if it doesn't exist
HANDOFF_FILE="$ARES_ROOT/docs/AI_HANDOFF.md"
if [ ! -f "$HANDOFF_FILE" ]; then
    echo -e "${YELLOW}📝 Creating AI_HANDOFF.md...${NC}"
    mkdir -p "$ARES_ROOT/docs"
    cat > "$HANDOFF_FILE" << 'EOF'
# AI Handoff Document

**Status**: WAITING_FOR_CLAUDE
**Updated**: $(date)
**Iteration**: 0

## Current Task
Initial setup - system ready for collaboration

## Context
ARES watcher system initialized and ready

## Instructions for Claude
Review current Phase 2 progress and provide next steps for Codex

## Instructions for Codex
Awaiting instructions from Claude on coordination relation extraction

## NEXT: Claude
EOF
    echo -e "${GREEN}✅ Created AI_HANDOFF.md${NC}\n"
fi

# Launch the watcher
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🚀 Starting ARES Watcher...${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Make the watcher executable
chmod +x "$ARES_ROOT/scripts/watch-ares.ts"

# Run the watcher
exec npx ts-node "$ARES_ROOT/scripts/watch-ares.ts"
