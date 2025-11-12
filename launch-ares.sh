#!/bin/bash

# ARES Local Launcher
# Starts both backend and frontend services

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║   🚀 ARES - Advanced Relation         ║"
echo "║      Extraction System                ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}📍 Working directory: $SCRIPT_DIR${NC}\n"

# Check if Python parser service is needed
echo -e "${GREEN}🐍 Checking Python parser service...${NC}"
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r scripts/requirements.txt
else
    source .venv/bin/activate
fi

# Start Python parser service in background
echo -e "${GREEN}🔧 Starting Python parser service...${NC}"
cd scripts
python3 -m uvicorn parser_service:app --host 127.0.0.1 --port 8000 &
PARSER_PID=$!
cd ..

# Wait for parser to be ready
sleep 2

# Build and start Node.js backend
echo -e "${GREEN}⚙️  Building backend (ignoring type errors)...${NC}"
npx tsc || true

# Copy GraphQL schema (tsc doesn't copy non-TS files)
cp app/api/schema.graphql dist/app/api/schema.graphql 2>/dev/null || true

echo -e "${GREEN}🚀 Starting Node.js backend (GraphQL + ARES engine)...${NC}"
node dist/app/api/graphql.js &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start frontend
echo -e "${GREEN}🎨 Starting React frontend...${NC}"
cd app/ui/console
npm run dev &
FRONTEND_PID=$!

cd "$SCRIPT_DIR"

echo -e "\n${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ ARES is running!                  ║${NC}"
echo -e "${BLUE}╠═══════════════════════════════════════╣${NC}"
echo -e "${BLUE}║  🌐 Frontend: http://localhost:3001  ║${NC}"
echo -e "${BLUE}║  🔌 Backend:  http://localhost:4000  ║${NC}"
echo -e "${BLUE}║  📊 GraphQL:  http://localhost:4000/graphql${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo -e "\n${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Trap Ctrl+C and clean up
trap "echo -e '\n${YELLOW}🛑 Stopping ARES services...${NC}'; kill $PARSER_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Wait for user to press Ctrl+C
wait
