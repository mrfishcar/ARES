# BookNLP Quick Test Setup

## What this is
- A standalone BookNLP runner (no ARES extraction) exposed at `POST /booknlp`.
- A Python FastAPI service in `scripts/booknlp_service.py` that wraps BookNLP and returns raw JSON/TSV outputs.
- A UI page at `/booknlp` with a textarea, Run button, JSON panel, and Copy JSON action.

## Local setup (recommended)
1. Install Java (BookNLP requires Java 11+ on your PATH).
2. Create/activate a Python 3.11+ env.
3. Install dependencies:
   ```bash
   pip install -r scripts/requirements.txt
   ```
   This includes `booknlp==0.3.0`.
4. (One-time) Download the English model if you don't already have it:
   ```bash
   python - <<'PY'
   from booknlp.booknlp import BookNLP
   BookNLP("en")
   print("Downloaded/validated BookNLP en model.")
   PY
   ```
5. Start the BookNLP service (port 8100 by default):
   ```bash
   cd scripts
   uvicorn booknlp_service:app --host 0.0.0.0 --port 8100
   ```
6. Start the Node backend (so it can proxy `/booknlp`):
   ```bash
   npm install
   npm run start
   # or: npx ts-node app/ui/server.ts if you have that dev flow
   ```
   Make sure `BOOKNLP_SERVICE_URL` is set if your BookNLP service is not at `http://localhost:8100`.
7. Start the UI:
   ```bash
   cd app/ui/console
   npm install
   npm run dev
   ```
   Set `VITE_API_URL=http://localhost:4000` so the UI hits the Node proxy.

## Backend deployment notes
- Vercel serves only static assets; BookNLP must run on the backend container (Railway/Render/Fly, etc.).
- Ensure the backend image has:
  - Java installed
  - Python deps (`scripts/requirements.txt`)
  - BookNLP English model available (can be pulled at container build time)
- Set `BOOKNLP_SERVICE_URL` for the Node server to reach the Python service, and expose port 8100 internally.

## API contract
- `POST /booknlp` body: `{ "text": "..." }`
- Limits: max chars default 50,000 (configurable via `BOOKNLP_MAX_CHARS` / `BOOKNLP_MAX_TEXT_LENGTH` on services).
- Response shape:
  ```json
  {
    "timestamp": "...",
    "textLength": 123,
    "durationSeconds": 1.234,
    "booknlp": {
      "files": {
        "book.entities": [ { ... } ],
        "book.tokens": [ { ... } ],
        "coref/book.coref": [ { ... } ],
        "...": "raw text if not TSV/JSON"
      }
    }
  }
  ```
  TSV outputs are parsed into arrays of objects using header row; JSON files are parsed; everything else is returned as text.

## Manual test (local)
1. With backend + BookNLP service running, open `http://localhost:5173/booknlp`.
2. Paste a short paragraph, click **Run**, wait for JSON to appear.
3. Click **Copy JSON** and confirm clipboard contains the JSON.
