# 🚀 ARES Local Setup Guide

## Quick Start

### Option 1: Desktop Launcher (Easiest!)
1. **Double-click** the `ARES.app` on your Desktop
2. A Terminal window will open and start all services
3. Open http://localhost:3001 in your browser
4. Press `Ctrl+C` in the Terminal when you want to stop

### Option 2: Command Line
```bash
cd /Users/corygilford/ares
./launch-ares.sh
```

## What Gets Started

The launcher automatically starts 3 services:

1. **🐍 Python Parser Service** (port 8000)
   - Handles spaCy NLP parsing
   - Required for entity extraction

2. **⚙️ Node.js Backend** (port 4000)
   - GraphQL API at http://localhost:4000/graphql
   - ARES engine endpoints
   - Entity extraction at http://localhost:4000/extract-entities

3. **🎨 React Frontend** (port 3001)
   - Main UI at http://localhost:3001
   - Extraction Lab (home page)
   - Entity/relation viewers

## URLs

- **Frontend**: http://localhost:3001
- **GraphQL**: http://localhost:4000/graphql
- **API**: http://localhost:4000
- **Parser**: http://localhost:8000

## Troubleshooting

### Services won't start
```bash
# Kill any existing processes
pkill -f uvicorn
pkill -f node
pkill -f vite

# Try again
./launch-ares.sh
```

### Port already in use
```bash
# Find what's using the port (example for port 4000)
lsof -ti:4000

# Kill it
kill -9 $(lsof -ti:4000)
```

### Python dependencies missing
```bash
# Recreate Python environment
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

### Node dependencies out of date
```bash
# Root
npm install

# Frontend
cd app/ui/console && npm install
```

## Development Tips

- **Frontend only**: `cd app/ui/console && npm run dev`
- **Backend only**: `npx tsc && node dist/app/api/graphql.js`
- **Tests**: `npm test`
- **Build**: `npx tsc && cd app/ui/console && npm run build`

## Files

- `launch-ares.sh` - Main launcher script
- `~/Desktop/ARES.app` - Desktop application
- This guide: `LOCAL-SETUP.md`
