"""
Lightweight BookNLP runner exposed over HTTP.

This intentionally keeps scope narrow:
- Accepts raw text
- Runs BookNLP in a temp directory
- Returns parsed TSV/JSON outputs plus summary metadata
"""

import os
import tempfile
import time
import uuid
import json
from pathlib import Path
from typing import Dict, Any, List

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    # BookNLP requires Java on PATH; we assume it's installed per setup docs
    from booknlp.booknlp import BookNLP  # type: ignore
except Exception as exc:  # pragma: no cover - import side effects
    raise RuntimeError(
        "BookNLP is not installed. Install with `pip install booknlp` and ensure Java is on PATH."
    ) from exc

MAX_TEXT_LENGTH = int(os.environ.get("BOOKNLP_MAX_TEXT_LENGTH", "50000"))

# Configure BookNLP model path; default to English small model
BOOKNLP_MODEL = os.environ.get("BOOKNLP_MODEL", "en")
MODEL_PARAMS = {
    "pipeline": "entity,quote,coref,ner,parser",
    "model": BOOKNLP_MODEL,
}

app = FastAPI(title="BookNLP Service", version="0.1.0")


class BookNLPRequest(BaseModel):
    text: str = Field(..., description="Raw text to process")


def parse_tsv(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    content = path.read_text(encoding="utf-8").splitlines()
    if not content:
        return rows
    headers = content[0].split("\t")
    for line in content[1:]:
        parts = line.split("\t")
        row = {headers[i]: parts[i] if i < len(parts) else "" for i in range(len(headers))}
        rows.append(row)
    return rows


def collect_outputs(out_dir: Path) -> Dict[str, Any]:
    outputs: Dict[str, Any] = {"files": {}}
    for file_path in out_dir.rglob("*"):
        if file_path.is_dir():
            continue
        rel = file_path.relative_to(out_dir).as_posix()
        try:
            if file_path.suffix.lower() == ".tsv":
                outputs["files"][rel] = parse_tsv(file_path)
            elif file_path.suffix.lower() == ".json":
                outputs["files"][rel] = json.loads(file_path.read_text(encoding="utf-8"))
            else:
                # Fallback: return raw text content
                outputs["files"][rel] = file_path.read_text(encoding="utf-8")
        except Exception as exc:  # pragma: no cover - defensive
            outputs["files"][rel] = {"error": f"Failed to read file: {exc}"}
    return outputs


# Initialize BookNLP once; subsequent requests reuse it
booknlp = BookNLP(BOOKNLP_MODEL, model_params=MODEL_PARAMS)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/booknlp")
def run_booknlp(req: BookNLPRequest) -> Dict[str, Any]:
    text = req.text or ""
    if len(text) == 0:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=f"text too long; limit is {MAX_TEXT_LENGTH} characters",
        )

    job_id = str(uuid.uuid4())
    with tempfile.TemporaryDirectory(prefix="booknlp_") as tmpdir:
        tmp_path = Path(tmpdir)
        input_path = tmp_path / f"{job_id}.txt"
        input_path.write_text(text, encoding="utf-8")

        output_dir = tmp_path / "out"
        output_dir.mkdir(parents=True, exist_ok=True)

        started = time.time()
        try:
            booknlp.process(str(input_path), job_id, str(output_dir))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"BookNLP failed: {exc}") from exc
        elapsed = time.time() - started

        outputs = collect_outputs(output_dir)

    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "textLength": len(text),
        "durationSeconds": round(elapsed, 3),
        "booknlp": outputs,
    }


def main():
    host = os.environ.get("BOOKNLP_HOST", "0.0.0.0")
    port = int(os.environ.get("BOOKNLP_PORT", "8100"))
    uvicorn.run("booknlp_service:app", host=host, port=port, reload=False, workers=1)


if __name__ == "__main__":
    main()
