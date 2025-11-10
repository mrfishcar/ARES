# ARES Parser Service

## CRITICAL: Parser Service Must Be Running

The ARES extraction pipeline requires a spaCy parser service running on port 8000.

**Without the parser service:**
- All verbs tagged as NOUN
- All dependencies labeled as generic "dep"
- No relation patterns match
- Entity boundaries incorrectly detected

## How to Start the Parser Service

```bash
# Start the parser service (runs in background)
python3 -m uvicorn scripts.parser_service:app --host 127.0.0.1 --port 8000 &

# Verify it's running
curl http://127.0.0.1:8000/health
# Should return: {"status":"ok"}
```

## How to Stop the Parser Service

```bash
# Find the process
ps aux | grep uvicorn | grep parser_service

# Kill it
kill <PID>
```

## Troubleshooting

If extraction produces 0 relations or garbage entities, check if parser is running:
```bash
curl http://127.0.0.1:8000/health
```

If connection fails, the parser is not running.

## Technical Details

- **Service**: FastAPI with spaCy en_core_web_sm model
- **Endpoints**:
  - `GET /health` - Health check
  - `POST /parse` - Parse text and return dependency tree
- **Port**: 8000 (hardcoded in app/engine/extract/entities.ts)
