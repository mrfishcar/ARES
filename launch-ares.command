#!/bin/bash

# ARES Desktop Launcher
# Double-click this file to start ARES!

# Change to the ARES directory
cd "$(dirname "$0")"

# Colors for pretty output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Cute ASCII art
clear
echo -e "${CYAN}"
cat << "EOF"
    ___    ____  ___________
   /   |  / __ \/ ____/ ___/
  / /| | / /_/ / __/  \__ \
 / ___ |/ _, _/ /___ ___/ /
/_/  |_/_/ |_/_____//____/

Knowledge Graph System
Sprint R7: Prompt-First Home, Notes & Seeds
EOF
echo -e "${NC}"

# Function to check if a port is in use
port_in_use() {
    lsof -i :$1 &>/dev/null
}

# Function to check if parser service is responding
check_parser() {
    curl -s http://127.0.0.1:8000/health &>/dev/null
}

# Function to start a service in a new terminal tab
start_service() {
    local title=$1
    local command=$2

    osascript <<EOF
tell application "Terminal"
    activate
    set newTab to do script "cd \"$PWD\" && echo '${title}' && ${command}"
    set custom title of newTab to "${title}"
end tell
EOF
}

# Check and start services
echo -e "${YELLOW}🔍 Checking services...${NC}"
echo ""

# Check Parser Service (port 8000)
if check_parser; then
    echo -e "${GREEN}✓ Parser service is running${NC}"
else
    echo -e "${YELLOW}⚡ Starting Parser service...${NC}"
    start_service "ARES Parser (port 8000)" ". .venv/bin/activate && cd scripts && uvicorn parser_service:app --host 127.0.0.1 --port 8000"
    sleep 3
fi

# Check GraphQL Server (port 4000)
if port_in_use 4000; then
    echo -e "${GREEN}✓ GraphQL server is running${NC}"
else
    echo -e "${YELLOW}⚡ Starting GraphQL server...${NC}"
    start_service "ARES GraphQL (port 4000)" "make ui-console"
    sleep 2
fi

# Check Console UI (port 3001)
if port_in_use 3001; then
    echo -e "${GREEN}✓ Console UI is running${NC}"
else
    echo -e "${YELLOW}⚡ Starting Console UI...${NC}"
    start_service "ARES Console UI (port 3001)" "make ui-console-dev"
    sleep 5
fi

echo ""
echo -e "${PURPLE}════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ ARES is ready!${NC}"
echo -e "${PURPLE}════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}📱 Console UI:${NC}    http://localhost:3001"
echo -e "${CYAN}🔧 GraphQL API:${NC}   http://localhost:4000"
echo -e "${CYAN}📊 Metrics:${NC}       http://localhost:4100/metrics"
echo ""
echo -e "${BLUE}Quick Access:${NC}"
echo -e "  ${GREEN}Home Page:${NC}      http://localhost:3001/home"
echo -e "  ${GREEN}Notes:${NC}          http://localhost:3001/notes"
echo -e "  ${GREEN}Entities:${NC}       http://localhost:3001/entities"
echo -e "  ${GREEN}Graph Viz:${NC}      http://localhost:3001/graph"
echo ""
echo -e "${YELLOW}Keyboard shortcuts: Press 'g' then:${NC}"
echo -e "  h = Home  |  n = Notes  |  e = Entities  |  g = Graph"
echo ""
echo -e "${PURPLE}════════════════════════════════════════${NC}"
echo ""

# Wait a moment then open browser
echo -e "${CYAN}🌐 Opening browser...${NC}"
sleep 2
open http://localhost:3001/home

echo ""
echo -e "${GREEN}✓ Launch complete!${NC}"
echo -e "${YELLOW}💡 Tip: Keep this window open. Close it to see running services.${NC}"
echo ""
echo -e "${CYAN}Press any key to exit launcher...${NC}"
read -n 1 -s

echo ""
echo -e "${GREEN}👋 Thanks for using ARES!${NC}"
echo ""
